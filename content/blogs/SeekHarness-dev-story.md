---
title: "从0做一个CodingAgent（极简复刻CC）"
date: "2026-06-16"
tags: ["AI", "Agent"]
---
### 长长的前言

Claude Code 源码泄露后，一堆开发者都在分析它的架构，我也是其中之一——工作上在做 agent，发现有些地方设计得不够好，就想看看 CC 是怎么处理的。后来看到这篇文章 [解剖 agent loop，](https://stevekinney.com/writing/agent-loops)说一个 100 行的 SWE-agent 已经能达到 80.9% 的性能水平。所以我决定自己动手做一个，看看极简实现到底能走多远。

所以这个项目叫 **seekHarness，**1500 行 TypeScript，一个干活的agent CLI。模型接入的只有一个：deepseek V4 flash。 几天，烧了我整整10块钱。😂 （github链接在文末） 

![seekharness](/blog_asset/seekharness.png)


 我一开始以为会很难，但是没想到让我意外的是，我仅仅完成了一个很简单的脚手架，很薄的壳，agent就直接跑起来，并且还参与改进了自己的代码，反而让我做得更多的是用户体验，比如cli的输入框，ctrl+c不要直接退出，保存用户对话等等。。。 这也某种程度从感性地角度验证了文章的正确性。

当然，功夫都在戏外，在构建这个项目之前，我在25年就参加了openmanus黑客松的比赛， 最近研究的claude code代码也大概知道优秀的设计是怎么样的。有了这些背景，让我在搭建这个agent的时候少走了一些以前踩过的弯路

 

## Agent Loop

### loop 不要使用递归

> 有很多原因，本来 agent loop 用递归就很反直觉，但我第一版让 cursor 写的时候，它给的就是递归。。所以才出来了这一节。

**一、栈溢出**

Agentic loop 可能跑几十甚至上百个 turn（复杂任务、长对话等）。递归每 turn 消耗一帧调用栈，JavaScript/Node 的默认栈深度有限（~10k 帧），长任务直接崩。

`while` 循环是 O(1) 栈空间，不需要担心这些。

**二、状态传递更清晰**

递归方案里，"下一轮的状态"要么通过参数传递（函数签名越来越长），要么靠闭包捕获（隐式、难追踪）。

`while` 方案用显式的 `State` 对象 + `state = next` 赋值：

`const next: State = {   messages: [...messagesForQuery, ...assistantMessages, ...toolResults],   turnCount: nextTurnCount, } state = next continue  // 进入下一轮，所有状态一目了然`

状态流转完全可见，哪里 continue、带着什么数据，一眼就能看出来。

**三、错误恢复路径更简单**

agent 代码里有大量恢复逻辑（重试、loop 检测、上下文压缩触发等），每条路径都是 `state = {...}; continue，`统一跳回循环顶部。

如果是递归，这些恢复路径要么尾递归，要么 `return yield* retry()，`逻辑分散且难以理解。

---

## Tool System

工具系统的设计原则之一： 只读工具并行，写操作串行。

`// 先并行跑所有只读工具（read/glob/grep） await Promise.all(readOnlyCalls.map(exec))  // 再串行跑写操作（write/edit/bash） for (const call of writeCalls) await exec(call)`

为什么这么分？

读操作没有副作用，并行跑可以大幅缩短探索阶段的时间——agent 经常一次发出 3-4 个 `read` 请求，串行的话等待时间是叠加的。

写操作有顺序依赖（比如 `write` 某个文件再 `edit` 它），必须串行。

**工具安全性**

`write` 工具加了一个约束：必须先 `read` 过文件才能覆写它。这个设计来自 Claude Code——防止 agent 在没有读过文件的情况下直接覆盖，导致意外丢失数据。

`bash` 工具加了黑名单检测：`rm -rf /、``mkfs、`fork bomb、`curl | sh` 等都会被拦截。这是防线，不是保险箱——agent 有了工具权限之后真的能做很多危险的事，所以要明确设立边界。

**死循环检测**

agent 有时候会陷入循环：同一组工具、同样的参数，一遍一遍调。我加了一个简单的计数器：同一个 (工具名, 参数) 组合出现超过 3 次就强制退出。

真实数据里这种情况大多发生在 `edit → bash npm test → edit → bash npm test` 循环上，计数器能及时止损。

## 上下文管理

### 问题是什么

一次 `bash npm test` 可能输出几万行。一次 `read` 大文件有几千行。这些内容都放进 `messages[]，`每轮对话都完整发给 LLM。

跑到第 30 轮的时候，`messages` 数组里可能有几百 KB 的工具输出，大部分是已经没用的旧数据。这会导致：

- Token 消耗爆炸，成本飙升
- LLM 的注意力被旧数据稀释，开始"迷糊"
- 严重的时候触达 API 的 context window 上限，请求直接报错

我在跑了一段时间seekharness后，就把19 个 trace 文件的分析拿出来看，单次 agent 执行平均产出 200-300 KB 的工具输出。 而且发现agent死循环的问题从25年做openmanus就有了，26年的今天还有。

**数据来自 19 个 trace 文件：**

|指标|值|
|---|---|
|总工具调用|~500+ 次|
|最长单轮对话|642 条 messages|
|最长执行时间|476 秒|
|工具使用分布|bash 42% > read 27% > edit 10% > write 8%|
|LLM 平均延迟|2-6 秒/次|

**发现的主要问题：**

1. **长会话退化：**20 轮正常，50 轮开始绕弯子，69 轮明显退化。最后 20 轮只有 `edit → bash` 来回切，陷入了"修改→测试→修改→测试"的死循环，直到 maxTurns 才退出。
2. **缺少 fallback：**`bash` 命令返回非零退出码之后，agent 通常读一次错误就放弃，不会尝试换命令或换方案。
3. **token 成本高：**60+ 次 LLM 调用的会话，光等 LLM 响应就花 3-5 分钟。这个问题在接入 SWE-bench 做批量评测时尤其明显。

**下一步：**建立 benchmark runner，自动跑标准场景集，与 baseline 对比，关键指标退化时报警。

### 1：工具输出截断

最简单最有效的一步：工具结果写进 `messages` 之前先截断，超过阈值的部分存到临时文件。

`tool 输出 50,000 chars     │     ▼ [前 3000 chars] ... [已截断 44,800 chars，完整输出保存至 .seekharness/output_xxx.txt] ... [后 2000 chars] [Use the read tool with the path above to see full output]`

关键设计：保留**首尾，**而不是只保留开头。

LLM 需要同时看到"我执行了什么"（开头）和"结果/报错是什么"（结尾）。中间的详细输出是按需查阅的，告诉 LLM 去 `read` 那个文件就好。

这一步单次工具结果从 50k → 5k，省了 90%。

### 防线 2：历史 Content Eviction（借鉴 Claude Code）

截断解决了新产生的大输出，但还有一个问题：历史消息积累。就算每条工具结果只有 5k，跑了 60 轮之后也有 300k 在那里。

第一反应是直接删旧消息，但删不了——OpenAI 格式的 API 要求每个 `tool_call_id` 都有对应的 `tool` 消息回应，删了结构就断了，API 会返回 400。

解法：不删消息，只清 content。

`裁剪前： [asst tool_calls:[c1..c8]] [tool c1] "npm test 的完整输出，3000 行..." [tool c2] "read 的完整输出，500 行..." ...  裁剪后（保留最近 5 条 tool 结果的 content）： [asst tool_calls:[c1..c8]]   ← 结构不动，assistant 消息完整保留 [tool c1] "[Old tool result cleared]"   ← 只清 content [tool c2] "[Old tool result cleared]" [tool c3] "[Old tool result cleared]" [tool c4] [tool c5] [tool c6] [tool c7] [tool c8]   ← 最近 5 条完整保留`

消息结构不变 → API 永远通过；content 变小 → token 大幅减少；LLM 看到 `[Old tool result cleared]` 会主动重新调工具补充数据。

这个设计来自对 Claude Code 源码的观察。他们用的是基于时间的 eviction，我这里简化成了基于位置（保留最近 N 条），少了一个时间戳依赖，会话恢复也不需要额外状态。

---

## SWE-bench 评测

做完基础功能之后，我接入了 SWE-bench 做评测。

SWE-bench 的逻辑是：给 agent 一个真实的 GitHub issue，让它 clone 对应仓库、checkout 到 bug 对应的 commit，然后尝试修复，提取出 diff，再跑官方的测试套件打分。

`# 准备工作 pip install swebench==4.1.0 npm run eval:build -- --size 20    # 生成 mini 子集  # 跑评测 npm run eval                       # agent 执行，patch 写到 outputs/patches/ npm run eval:score                 # Python 调 swebench 评分，输出 summary.json`

## 已完成的任务

这个 agent 参与了自身的建设，我还让他修改了我的博客，让他完成了这个标签系统的搭建：

- 给我的博客系统加上标签系统（代码量几千行）
- 将自己打包成全局 CLI 命令
- Review 自己的代码并提出改进建议，修复了 2 个 bug
- 添加对话恢复功能（`--resume` flag）
- 添加 Ctrl+C 中断而不是直接退出
- 上下文工程：双防线实现，并且修复设计中带来的bug
- SWE-bench 评测接入

参考文章：

[https://zhuanlan.zhihu.com/p/2022605516262614921](https://zhuanlan.zhihu.com/p/2022605516262614921) （仅它一篇就收录了很多好文章）

[https://x.com/mal_shaik/status/2038918662489510273](https://x.com/mal_shaik/status/2038918662489510273)

seekharness 地址：

[https://github.com/wingchi-leung/seekHarness](https://github.com/wingchi-leung/seekHarness)