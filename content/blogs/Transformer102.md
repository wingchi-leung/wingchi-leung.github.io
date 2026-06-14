---
title: KV Cache 与 Prefill —— 大模型推理加速的核心
date: 2026-06-10
---

## 从 Decoder-only 说起

在第一篇里，我们详细拆解了原始 Transformer 的 Encoder-Decoder 架构。

但是：**今天几乎所有的主流大模型（GPT、LLaMA、Qwen、DeepSeek……）用的都是 Decoder-only 架构。**

为什么？ 因为LLM 核心场景是对话生成，所以 Decoder-only 成了主流。

> 先快速清扫一个潜在的认知盲区：很多人以为Encoder和Decoder要成对使用。但如果我们把 Decoder拆开看，会发现 Decoder 本身就包含了 Encoder 的所有核心组件。所以Decoder本身就能作为完整的、可独立运行的模型。


三个角度说明为啥是decoder：

### 角度一：信息流向的错配

**Encoder 的设计假设**：你有完整的输入，可以看全貌再下判断。  注意力机制让每个 token 都能看到所有 token。

**Decoder 的设计假设**：生成时，未来的东西还没出现。  单向注意力强制每个 token 只能看到过去和当前。

而GenAI上是一个单向往前的任务：你只能根据已生成的内容决定下一个是什么。  

Encoder 的双向注意力在这个场景下是作弊——它能看到还没生成出来的“未来”。

如果你强行用 Encoder 做生成，就需要手工构造 mask 来遮住未来 token，那它本质上还是变成Decoder。那为什么还要保留另一半？

### 角度二：计算冗余

假设你用完整的 Encoder-Decoder 做对话：

- 用户输入：“天气真好”（4 个 token）
- 模型输出：“我们出去玩吧”（7 个 token）

**Encoder**：处理 4 个 token，双向注意力，输出 4 个上下文向量。

**Decoder**：逐字生成 7 个 token。每一步都要对 Encoder 的 4 个输出做 Cross-Attention。

问题来了：**Encoder 的输出在整个生成过程中是固定的**，但 Decoder 在每步都重新“看”一遍它们。

 Decoder-only 直接砍掉了 Encoder，让模型自己管理历史和当前输入。


###  角度三：多任务统一性

GPT 系列最早证明了一件事：
一个 Decoder-only 模型，通过不同的 prompt 格式，可以同时做：**
 - 续写（左边给几个词，往右写）
 - 对话（把历史对话拼在左边，右边继续）
 - 翻译（ 请翻译成英文：你好 →  Hello       
 - 分类  (这句话的情绪是：  → 模型补出“正面” ) 
     

Encoder 做不到这一点（它需要完整的输入输出对才能训练），  
Encoder-Decoder 做多任务切换时，需要显式区分 encoder 和 decoder 的角色。

而 Decoder-only：**所有任务都变成“根据左边的 tokens 预测右边的下一个 token”**——高度统一，训练和推理逻辑一致。


## 自回归生成：一个字一个字地蹦

Decoder-only 模型生成文本的方式是**自回归（Autoregressive）** 的：

> 每生成一个 token，就把这个 token 拼到已有的序列末尾，作为下一步的输入，再生成下一个 token。

用例子来理解，假设模型要生成 "I love you"：

```
第1步: 输入 ["<sos>"]                         → 生成 "I"
第2步: 输入 ["<sos>", "I"]                     → 生成 "love"
第3步: 输入 ["<sos>", "I", "love"]             → 生成 "you"
第4步: 输入 ["<sos>", "I", "love", "you"]      → 生成 "<eos>"
```

看起来很简单，但这里面藏着一个**巨大的计算浪费**。

---

## 朴素做法：每一步都重算全部

先想一想，Transformer 的每一层在做自注意力时，是怎么算的。

假设已经生成了 3 个 token `[t1, t2, t3]`，当前层里：

1. 每个 token 都生成自己的 Q、K、V
2. 每个 token 的 Q 去和 **所有 token 的 K** 做点积，算注意力分数
3. 用分数加权 **所有 token 的 V**，更新自己

用矩阵表示，这一步的输入是一个 `[3, d]` 的矩阵（3 个 token，每个 d 维）。

> **问题是：** 到第 4 步，输入变成 `[4, d]`，模型又从头算了一遍前面 3 个 token 的 K 和 V。

### 具体浪费了多少？

我们一步步展开看看：

| 步骤 | 输入 token 数 | 需要算的 K、V |
|------|-------------|-------------|
| 第1步 | 1 | K1、V1 |
| 第2步 | 2 | **K1、V1**、K2、V2 |
| 第3步 | 3 | **K1、V1**、**K2、V2**、K3、V3 |
| 第4步 | 4 | **K1、V1**、**K2、V2**、**K3、V3**、K4、V4 |

注意看加粗的部分——**每一步都在重复计算之前已经算过的 K 和 V！**

> 如果你生成 1000 个 token，第 999 步的时候，前面 998 个 token 的 K 和 V 已经被重复算了 998 次。

这就是朴素自回归推理的计算复杂度是 **O(n²·d)** 的原因——n 是序列长度，d 是向量维度。

---

## KV Cache 的核心直觉

KV Cache 的想法简单到让人怀疑：**既然前面算过的 K 和 V 不会变，为什么不存下来直接复用？**

你回想一下第一篇的内容：

- **Q（Query）**：当前 token 发出的查询——**每一步都不一样**
- **K（Key）**：token 的"标签"，用来被匹配——**算过一次就不会变了**
- **V（Value）**：token 能贡献的内容——**算过一次也不会变了**

Q 是"我在找什么"——每生成一个新 token，它的 Q 都是新的，必须重新算。

但 K 和 V 是"我的标签"和"我的内容"——一个 token 一旦生成，它的 K 和 V 就固定了，不会因为后面来了新 token 而改变。

> 所以：**把之前所有 token 的 K、V 缓存起来，每次只算新 token 的 K、V，新 token 的 Q 去和缓存里的所有 K 做匹配。**

这就是 **KV Cache** —— 用空间（显存）换时间（计算）。

---

## 用了 KV Cache 之后的推理流程

有了 KV Cache，自回归生成变成了两个截然不同的阶段。

### Prefill（预填充）阶段

**这是第一次处理整个输入 prompt 的阶段。**

当你输入一段 prompt 给模型（比如 "请用英文翻译这句话"），模型需要先"读懂"你的输入。

在 Prefill 阶段：

1. **一次性**处理整个 prompt 的所有 token
2. 计算出每个 token 的 K 和 V
3. 把 **所有层的 K 和 V** 存到缓存里
4. 输出第一个生成 token

```
Prompt: "请用英文翻译这句话"
   ↓
一次性并行计算所有 token 的 K、V
   ↓
缓存 K1..K6, V1..V6  ← 所有 6 个 prompt token
   ↓
生成第一个 token: "Please"
```

**Prefill 的关键特性：**

- **高并行度**——所有 prompt token 一起算，充分利用 GPU
- **计算密集**——矩阵越大，GPU 利用率越高
- **只做一次**——prompt 不会变，不需要重复 prefill

> 你每次用 ChatGPT 时，那段"漫长的等待"其实就是 prefill 阶段。prompt 越长，prefill 越慢，但它只发生一次。

### Decode（解码）阶段

**这是逐个生成输出 token 的阶段。**

Decode 阶段每步只生成一个 token：

1. 当前新 token → 算它的 Q、K、V
2. **Q × 所有缓存的 K** → 算注意力分数
3. **分数 × 所有缓存的 V** → 更新当前 token
4. 把新 token 的 K、V **追加到缓存**
5. 输出下一个 token，重复

```
已缓存: [K1..K6, V1..V6]  ← 来自 prefill
                ↓
第1步: 新 token "Please" → 算 Q_new, K_new, V_new
       Q_new × [K1..K6]  → 注意力
       把 K_new, V_new 追加到缓存
                ↓
第2步: 新 token "translate" → 算 Q_new, K_new, V_new
       Q_new × [K1..K6, K_Please]  → 注意力
       把 K_new, V_new 追加到缓存
                ↓
……以此类推
```

**Decode 的关键特性：**

- **低并行度**——每步只算一个 token，GPU 利用率低
- **内存密集**——瓶颈在于读取缓存中的 K、V，而不是计算
- **每步只算一点点**——但要走很多步

> 这就是为什么你感觉 AI 回复的时候"第一个字等很久，后面字出得快"——**第一个字要等 prefill 做完，后面的字是 decode 阶段，每一步只算一个 token。**

### 两个阶段的对比

| 特性 | Prefill | Decode（每一步） |
|------|---------|----------------|
| 输入 | 整个 prompt（多个 token） | 1 个新 token |
| 计算量 | 大（~prompt长度 × d²） | 小（~1 × d²） |
| 并行度 | 高（GPU 利用率高） | 低（GPU 利用率低） |
| 是否缓存 KV | 是（首次缓存） | 是（追加到缓存） |
| 瓶颈 | 计算能力（Compute-bound） | 内存带宽（Memory-bound） |
| 用户感知 | "等了很久才出第一个字" | "一个字一个字地快速出现" |

---

## KV Cache 到底省了多少？

我们来算一笔具体的账。

假设：
- 模型有 **L = 32 层**
- 每层有 **H = 32 个注意力头**
- 每个头的维度 **d_k = 128**
- 当前已生成 **n = 1000 个 token**

### 朴素做法（无 KV Cache）

在第 1000 步时，需要：

1. 输入 `[1000, d]` 的矩阵
2. 对**所有 1000 个 token** 重新算 Q、K、V
3. 算 `Q(1000×d) × K^T(d×1000)` → 复杂度与 `n²` 成正比

**总计算量：** 每层 O(n²·d + n·d²)，其中 n=1000

### 有 KV Cache

在第 1000 步时，只需要：

1. 输入仅仅 **1 个新 token**
2. 只对这个新 token 算 Q、K、V
3. 新 token 的 Q（1×d）去和缓存的 K（n×d）做点积

**总计算量：** 每层 O(n·d + d²)，其中 n=1000

> 对比：朴素做法每步要算 1000 个 token 的注意力；KV Cache 每步只算 1 个 token 的注意力。

直观来说，**生成长文本时，KV Cache 可以让推理速度提升几十倍到上百倍。**

---

## KV Cache 的代价：显存

天下没有免费的午餐。KV Cache 虽然省了计算，但**吃了大量显存**。

### 占多少？

```
每层 KV Cache 大小 = 2（K 和 V）× n（token 数）× H（头数）× d_k（每个头的维度）

总 KV Cache = L（层数）× 上面那个
```

用数字感受一下：

以 LLaMA-70B 为例：
- L = 80 层
- H = 64 个头
- d_k = 128（每个头 128 维）
- 每个参数用 FP16（2 字节）

对于 **n = 4096** 个 token：

```
每层 = 2 × 4096 × 64 × 128 × 2 字节 = 128 MB
总  = 80 × 128 MB = 10 GB
```

对于 **n = 32768**（32K 上下文）：

```
每层 = 2 × 32768 × 64 × 128 × 2 字节 = 1 GB
总  = 80 × 1 GB = 80 GB
```

> **80GB 显存**——一块 H100 才 80GB！光 KV Cache 就占满了，模型权重还没放进去。

这就是为什么 **长上下文推理极其昂贵**——KV Cache 随着序列长度线性增长，而且每一层、每个头都要存一份。

### 上下文长度 vs KV Cache 显存

| 上下文长度 | 7B 模型 KV Cache（估算） | 70B 模型 KV Cache（估算） |
|-----------|------------------------|-------------------------|
| 4K | ~0.5 GB | ~2 GB |
| 8K | ~1 GB | ~4 GB |
| 32K | ~4 GB | ~16 GB |
| 128K | ~16 GB | ~64 GB |
| 1M | ~128 GB | ~512 GB |

这解释了为什么：
- 小模型（7B）做长上下文相对容易——模型权重小，省出显存放 KV Cache
- 大模型（70B）做长上下文很痛苦——权重就占 140GB+，哪还有空间给 KV Cache？

---

## 缓存了哪些东西？在各层的什么位置？

我们来精确地说一下 KV Cache 到底缓存在哪。

> **重要：KV Cache 是在每一层独立缓存的，不是只缓存最后一层。**

回忆一下 Transformer 的每层 Decoder：

```text
输入 (来自上一层)
    ↓
① Masked 多头注意力  ← 这里需要 K、V
    ↓ Add & Norm
② 前馈网络 FFN
    ↓ Add & Norm
    ↓
输出 (传给下一层)
```

在①多头注意力中，模型需要：
1. 把输入映射成 Q、K、V
2. Q × K^T → 注意力分数
3. 分数 × V → 输出

KV Cache 缓存的就是**每一层、每个注意力头**的 K 和 V。

```text
第1层: 缓存 [K_layer1_head1..headH, V_layer1_head1..headH]
第2层: 缓存 [K_layer2_head1..headH, V_layer2_head1..headH]
...
第L层: 缓存 [K_layerL_head1..headH, V_layerL_head1..headH]
```

每个新 token 在每一层都会：
1. 生成这层的 Q、K、V
2. 用 Q 去匹配缓存中这层的所有 K
3. 把新 token 这层的 K、V 追加到缓存

> 你可以把 KV Cache 想象成一个"L 层的书架"——每层有 H 个隔间，每个隔间里按顺序排放着所有已生成 token 的 K 和 V。

---

## GQA 和 MQA：给 KV Cache 减肥

KV Cache 太大了，怎么办？

一个直观的思路是：**让多个注意力头共享 K 和 V**。这就是 **GQA（Grouped Query Attention）** 和 **MQA（Multi-Query Attention）**。

### MQA：最早的简化方案

MQA 的想法很激进：**所有 Q 头共享同一组 K、V。**

```text
原始多头注意力 (MHA):
  查询头:  Q1  Q2  Q3  Q4  Q5  Q6  Q7  Q8
  键/值头: K1  K2  K3  K4  K5  K6  K7  K8  ← 每个 Q 头有自己的 K
  缓存:    8 组 K、V

MQA (Multi-Query Attention):
  查询头:  Q1  Q2  Q3  Q4  Q5  Q6  Q7  Q8
  键/值头:         K_all        ← 所有 Q 头共用一组 K、V
  缓存:    1 组 K、V
```

效果：KV Cache 减少到原来的 **1/H**（H 是头数）。如果原来 8 个头，MQA 就把 KV Cache 缩小了 **8 倍**。

但 MQA 有个问题：**所有头共享 K、V 太粗暴了**，模型表达能力可能会下降。

### GQA：折中方案

GQA（Grouped Query Attention）在 MHA 和 MQA 之间取了个折中：**把 Q 头分成几组，每组内共享 K、V。**

```text
GQA (Grouped Query Attention, G=2 组):
  查询头:  Q1  Q2  |  Q3  Q4  |  Q5  Q6  |  Q7  Q8
  键/值头:   K1,V1 |  K2,V2   |  K3,V3   |  K4,V4
  缓存:    4 组 K、V（比 MHA 少一半）
```

常见配置：

| 模型 | 注意力类型 | Q 头数 | K/V 头数 | KV Cache 节省 |
|------|----------|--------|---------|--------------|
| LLaMA-2-7B | MHA | 32 | 32 | 1x（不节省） |
| LLaMA-2-70B | MHA | 64 | 64 | 1x |
| **LLaMA-3-8B** | **GQA** | **32** | **8** | **4x** |
| **LLaMA-3-70B** | **GQA** | **64** | **8** | **8x** |
| PaLM | MQA | - | 1 | Hx |
| Falcon-7B | MQA | 71 | 1 | 71x |

> 注意：LLaMA-3 全系列都用 GQA！8B 模型用 8 个 K/V 头，70B 模型也才用 8 个 K/V 头。这使得 70B 模型的 KV Cache 甚至比某些 MHA 的 7B 模型还小。

### GQA 的效果

- **7B 模型**：MHA 需要 32 组 KV 缓存，GQA 只需要 8 组 → 缓存减少 4 倍
- 同样的显存，可以支持 4 倍长的上下文
- 模型质量几乎不损失（实验证明 GQA 在多数任务上和 MHA 持平）

---

## Prefill 和 Decode 在工程上的差异

写到这里，再深入一点：为什么 prefill 和 decode 的**计算特性**完全不同？

### Prefill：Compute-bound（计算瓶颈）

Prefill 阶段，一次性处理几百到几千个 token。输入矩阵很大（`[prompt_len, d]`）。

在 GPU 上，大矩阵乘法（GEMM）的**计算单元（CUDA cores / Tensor Cores）被充分利用**。

> Prefill 的速度受限于 GPU 的计算能力（FLOPS），而不是内存带宽。

**工程含义：**
- 可以进一步优化，比如用 FlashAttention 加速 prefill
- Prefill 时间 ≈ O(prompt_len² × d)，和 prompt 长度是**二次关系**
- 所以超长 prompt 的 prefill 会很慢

### Decode：Memory-bound（内存瓶颈）

Decode 阶段，每步只处理 1 个 token。输入矩阵很小（`[1, d]`）。

但注意力计算需要读取**缓存中的所有 K、V**——这涉及大量显存读取（`2 × n × H × d_k` 字节）。

GPU 计算单元在等数据从显存传过来，处于"饥饿"状态。

> Decode 的速度受限于 GPU 的内存带宽（GB/s），而不是计算能力。

**工程含义：**
- Decode 每步的耗时 ≈ 读取 KV Cache 的时间
- 序列越长，每步越慢（因为要读更多 K、V）
- 优化方向：减少 KV Cache 大小（GQA/MQA）、更好的内存管理

### 一张表看懂

| 指标 | Prefill | Decode |
|------|---------|--------|
| 瓶颈类型 | Compute-bound | Memory-bound |
| 每次输入 token 数 | N（prompt 长度） | 1 |
| GPU 利用率 | 高（~80-100%） | 低（~5-20%） |
| 耗时与序列长度关系 | O(N²) | O(N) |
| 主要优化手段 | FlashAttention, 并行计算 | KV Cache, GQA, 内存优化 |

> 这也解释了为什么现在推理引擎（如 vLLM、TensorRT-LLM）对 prefill 和 decode 分别做不同的优化策略。

---

## 总结：KV Cache 和 Prefill 是什么

回头用一句话总结：

| 概念 | 一句话 |
|------|-------|
| **KV Cache** | 把已生成 token 的 K、V 缓存起来，每步只算新 token 的注意力，避免重复计算 |
| **Prefill** | 处理输入 prompt 的阶段，一次性并行算完所有 prompt token 的 K、V，完成首次缓存 |
| **Decode** | 逐 token 生成输出，每步只算一个 token，复用 KV Cache |
| **GQA/MQA** | 让多个 Q 头共享 K、V，减少 KV Cache 大小，支持更长的上下文 |

KV Cache 是"**用显存换速度**"的经典案例——它让推理快了上百倍，代价是显存随序列长度线性增长。

而 GQA 是"**用少量质量换大量显存**"——通过让 Q 头共享 K、V，把 KV Cache 缩小了 4-8 倍，模型质量几乎不受影响。

---

## 附录：为什么 Decoder-only 不用交叉注意力？

你可能会想："第一篇讲的 Decoder 有交叉注意力（Cross Attention），为什么 GPT 类的 Decoder-only 模型没有？"

答案很简单：**因为没有 Encoder。**

- 原始 Transformer 的 Decoder 有交叉注意力，是因为它有 Encoder 输出的向量可以"查"
- Decoder-only 模型没有 Encoder，所有信息都来自**自己已经生成的 token**
- 所以 Decoder-only 只有 **Masked 自注意力**，没有交叉注意力

那 prompt 的信息怎么传进去的？

> Prompt 也是作为"已生成的 token"一起参与自注意力的。只不过它们在 prefill 阶段一次性算完并缓存了 KV。

所以 Decoder-only 的自注意力，就是**在每一步让当前 token 去看所有已生成的 token（包括 prompt 和之前生成的输出）**。KV Cache 就是这些已生成 token 的 K、V 的缓存。

---

## 附录：KV Cache 在推理引擎中的实际形态

在实际的推理引擎（如 vLLM、Hugging Face Transformers）中，KV Cache 是以 **张量（Tensor）** 的形式存在的。

```python
# 伪代码描述 KV Cache 的数据结构
# 形状: [batch_size, num_layers, 2, num_kv_heads, seq_len, head_dim]
# 2 代表 K 和 V

kv_cache = torch.zeros(
    batch_size,
    num_layers,
    2,  # 0 for K, 1 for V
    num_kv_heads,
    max_seq_len,
    head_dim,
    dtype=torch.float16,
    device="cuda"
)

# 每一步：
# 1. 计算新 token 的 K_new, V_new
# 2. 写入缓存: kv_cache[batch, layer, 0, :, step, :] = K_new
#              kv_cache[batch, layer, 1, :, step, :] = V_new
# 3. 从缓存读取所有已存 K, V 用于注意力计算
```

## 附录：为什么"第一个字等很久"？

你现在应该能完整解释这个现象了：

1. **Prefill 阶段**（等第一个字）：
   - 要一次性处理整个 prompt
   - 要算所有 prompt token 在所有层的 K、V
   - prompt 越长，这一步越慢
   
2. **Decode 阶段**（后续出现快）：
   - 每步只算一个 token
   - 利用 KV Cache，计算量极小
   - 但每步都需要读取不断增长的 KV Cache，所以随着生成变长，每步也会越来越慢

> 实际上，在主流推理框架中，prefill 通常是毫秒到秒级，decode 每步是毫秒级。
> 所以用户感觉就是"等了一会儿出第一个字，然后后面的字一个一个快速蹦出来"。
