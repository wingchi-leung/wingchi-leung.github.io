
title: "深入浅出langgraph（一）"
date: "2026-02-26"
tags: ["AI", "LangGraph"]
 

## 一、LangGraph 是什么？为什么你需要它？

### 1.1 传统 LLM 应用的痛点

想象你在构建一个智能客服系统：

```python
# 传统链式写法 - 简单但脆弱
def handle_query(query):
    intent = detect_intent(query)
    if intent == "price":
        response = get_pricing(query)
    elif intent == "order":
        response = check_order(query)
    # ... 无尽的 if-else
    
    return response
```

**问题：**
- ❌ 难以表达复杂的循环逻辑
- ❌ 状态管理混乱，出错后无法恢复
- ❌ 多步骤协作困难
- ❌ 调试和维护噩梦



### 1.2 LangGraph 的解决方案

**LangGraph** 用**图结构**来建模 agent 工作流：

```
用户输入 → [意图识别] → [路由决策]
                          ↙        ↘
                    [查价格]   [查订单]   [其他]
                        ↓         ↓
                   [格式化回复] ← ──────┘
                          ↓
                     [保存记录]
```

**核心好处：**

| 特性 | 说明 |
|||
| **持久化执行** | 失败后从断点恢复，支持长时间运行的任务 |
| **人机协作** | 在任何点暂停，让人审查/修改，然后继续 |
| **全栈记忆** | 短期工作记忆 + 长期跨会话记忆 |
| **可视化调试** | 追踪执行路径，捕获状态转换 |
| **生产级部署** | 为有状态工作流设计的可扩展基础设施 |


**LangGraph** 把多步、有状态、可能分支的 LLM 流程抽象成一张**图（Graph）**：

- **节点（Node）**：一步逻辑，比如调用 LLM调用搜索工具写数据库。
- **边（Edge）**：节点之间怎么连——可以是固定的（A 完了一定到 B），也可以是**条件边**（根据上一步结果决定去 B 还是 C）。
- **状态（State）**：在图里流转的上下文，所有节点读、写同一份状态（例如消息列表、工具调用结果）。

这样你只需要：**定义节点、连边、定义状态**，剩下的按图执行、状态传递、流式/非流式交给 LangGraph 统一处理。

一句话：**LangGraph 解决的是把多步、有状态的 LLM 工作流画成图、跑起来、并且能流式/可观测的问题。**



## 二、LangGraph 是怎么设计的？

### 2.1 核心概念：一起来认识 LangGraph 的图

想象你和同事在实现一个多步骤的智能 Agent。你会遇到这些问题：

- 这一步我是要决策分支，还是要让 LLM 生成文本？
- 某次失败后，能不能从中间节点重新继续？
- 多个步骤之间需要怎么传递上下文？
- 是不是每个节点都能方便地插入人工干预或外部信息？

你们边讨论，边总结出几类“组件”。这些，正是 LangGraph 的核心构成：

- 有个状态在整个流程里不断变化、被不同环节读取和修改
- 每个环节是一个独立的“节点”，只负责处理自己的任务
- 节点之间可以直连，也可以根据数据分支流转
- 整个流程像一张图一样串起来，有明确的开始和（可选的）结束

LangGraph 的几个核心组件如下：

- **State**：全局共享的上下文结构（如 `messages`、`current_step`），所有节点都可以读取与选择性写入。
- **Node**：处理某一步逻辑的函数，输入当前 state，完成自己的任务（如调用 LLM 或工具），返回对 state 的增量修改。
- **Edge**：连接各节点的数据流，既可以是固定顺序，也可以按 state 条件分支到不同节点。
- **Graph**：用 Edge 将多个 Node 串成有向图，定义明确的开始节点和可选的结束节点，实现灵活的多步流程。


### 2.2 State（状态）

**State** 是在节点之间传递的数据结构：每个节点读入当前 state，返回自己对 state 的更新；LangGraph 会把所有节点的更新按规则合并成下一轮 state。

#### 基本定义

 
```python
from typing import Annotated
from operator import add

class MyState(TypedDict):
    messages: list  # 普通字段（方式1）
    stream: Annotated[list, add]  # Annotated字段（方式2）

def fn1(state: MyState):
    return {"messages": [4]}

def fn2(state: MyState):
    return {"stream": [4]}

# 方式1
r = graph.invoke({"messages": [1, 2, 3]})
# 结果是 {"messages": [4]} 而不是 [1,2,3,4]

# 方式2
r2 = graph.invoke({"stream": [1, 2, 3]})
# 假设节点 fn2 返回 {"stream": [4]}，则最终结果是 {"stream": [1, 2, 3, 4]}
```

- **方式 1**：普通字段没有 `Annotated`，节点返回的字典会被**覆盖**
- **方式 2**：用了 `Annotated[类型, reducer]` 的字段，节点返回的值不会直接覆盖，而是和上一轮 state 里的旧值一起交给 **Reducer** 做合并，合并结果再写回 state。



#### Annotated 是啥意思？

`Annotated[T, x]` 是 Python 语言里的**类型注解**语法，表示类型是 `T`，同时附带元数据 `x`。它并不是 LangGraph 专有，而是 Python 的 typing 模块自 3.9/3.10 起引入的功能，允许你在类型注解里携带一些额外信息用于工具/框架后台的处理。

举个和 LangGraph 无关的例子：

```python
from typing import Annotated

def foo(x: Annotated[int, "要是正整数"]):
    pass
```

这里类型检查工具或 IDE 可以读取 `"要是正整数"` 这个提示，但对 Python 运行没有影响。

在 LangGraph 里，它们底层做了设计，第二个参数如果是**可调用对象（函数）**，就会当作 Reducer 来用。

- 比如写 `Annotated[list[str], add]`：类型（T）是字符串列表，元数据（x）是 `add`。
- LangGraph 发现 `add` 是函数，就约定此字段合并时用 `add(旧值, 新值)` 计算（而不是简单覆盖新值）。

所以：**在这里 Annotated =这个字段的类型 + 合并用的规则（Reducer）**。

#### 归纳函数（Reducer）

**归纳函数** 是 LangGraph 里专门服务于 **State 更新** 的一种设计：当某个 state 字段声明了 Reducer 时，节点返回的新值不会直接覆盖该字段，而是和上一轮 state 里的旧值一起，交给这个函数做**归纳（合并）**，得到的结果再写回 state。

也就是说：**Reducer 定义了如何把节点输出的增量合并进当前 state**。签名是：`(旧值, 新值) -> 合并结果`。


### 2.3 Node（节点）

**Node** 就是图里的一步逻辑：一个函数，接收当前 state（以及可选的 config），干一件事（例如调 LLM、调工具），然后**返回对 state 的更新**（只返回要改的字段即可，不必返回完整 state）。

```python
# 同步节点：接收 state，返回 state 的更新（字典）
def my_node(state: MyState) -> dict:
    # 只返回本节点要写入/合并进 state 的字段
    return {"response": "某结果", "counter": state.get("counter", 0) + 1}

# 异步节点：适合内部有 await（如调 LLM、网络请求）
async def my_async_node(state: MyState) -> dict:
    result = await some_async_call(state["user_input"])
    return {"response": result}

# 带 config 的节点：LangGraph 会把 config 作为第二个参数传入
async def node_with_config(state: MyState, config: RunnableConfig) -> dict:
    # 把 config 传给 LLM，才能在图层面实现逐 token 流式
    response = await llm.ainvoke(state["messages"], config)
    return {"messages": [response]}
```

- **输入**：当前 `state`（以及可选 `config`）。  
- **输出**：一个字典，键是 state 里的字段名，值是本节点要写的更新；LangGraph 会按 state 里定义的规则（覆盖或 Reducer）合并到下一轮 state。  
- **约定**：节点应该是**无副作用的纯函数**（给定相同 state 得到相同更新），这样图才可重放、可调试；真要写库、发请求，就在节点里做，但逻辑上视为读 state → 算更新 → 返回。


### 2.4 Edge（边）

**Edge** 定义节点之间的流转关系：当前节点跑完后，下一步去哪个节点（或结束）。分两类：**固定边**和**条件边**。

#### 固定边（add_edge）

从 A 到 B 的**固定连线**：A 执行完一定进入 B。

```python
from langgraph.graph import StateGraph

graph = StateGraph(MyState)

graph.add_node("agent", agent_node)
graph.add_node("tools", tools_node)
graph.add_edge("agent", "tools")   # agent 结束后一定进入 tools
graph.add_edge("tools", "agent")   # tools 结束后再回 agent（例如多轮工具调用）
```

#### 条件边（add_conditional_edges）

下一个节点**由当前 state 决定**：通过一个路由函数根据 state 返回下一个节点的名字（或 END）。

```python
def route_after_agent(state: MyState) -> str:
    # 根据 state 决定下一步去哪个节点
    if state.get("need_tool"):
        return "tools"
    return "end"  # 或 "__end__" 表示结束

graph.add_conditional_edges("agent", route_after_agent, {
    "tools": "tools",
    "end": END
})
```


#### 入口（set_entry_point）

指定图从哪个节点开始。

```python
graph.set_entry_point("agent")  # 图从 "agent" 节点开始
```


### 2.5 Graph（图）
**Graph** 就是把 State、Node、Edge 拼在一起得到的可执行图：先定义状态和节点，再连边，最后 **compile()** 得到可调用对象（`invoke` / `stream`）。

#### 基本流程

```python
from typing import Annotated, TypedDict
from operator import add
from langgraph.graph import StateGraph, END

class MyState(TypedDict):
    messages: Annotated[list, add]
    next_step: str

# 2. 定义节点
def agent_node(state: MyState):
    """模拟 Agent 节点，生成一条消息，并标记下一步"""
    msgs = state.get("messages", [])
    # 简单模拟决策
    if not msgs or "价格" in msgs[-1]:
        return {"messages": ["这里是价格信息"], "next_step": "tools"}
    else:
        return {"messages": ["这里是订单信息"], "next_step": "end"}

def tools_node(state: MyState):
    """模拟工具调用节点"""
    msgs = state.get("messages", [])
    return {"messages": ["工具节点已调用"], "next_step": "agent"}

# 路由函数
def route_fn(state: MyState):
    # 根据 next_step 字段路由到下一个节点
    step = state.get("next_step")
    if step == "tools":
        return "tools"
    return "end"

# 3. 建图并加节点
graph_builder = StateGraph(MyState)
graph_builder.add_node("agent", agent_node)
graph_builder.add_node("tools", tools_node)

# 4. 连边
graph_builder.set_entry_point("agent")
graph_builder.add_conditional_edges("agent", route_fn, {"tools": "tools", "end": END})
graph_builder.add_edge("tools", "agent")

# 5. 编译成可执行的图
app = graph_builder.compile()

# 6. 展示图结构（可视化，保存为文件）
try:
    import graphviz
    app.get_graph().draw("my_langgraph.png", prog="dot")  # 需安装graphviz
    print("图结构已导出为 my_langgraph.png")
except Exception as e:
    print("可视化失败：", e)

if __name__ == "__main__":
    # 初始消息列表
    state = {"messages": ["用户：查一下价格"], "next_step": ""}
    final_state = app.invoke(state)
    print("最终 State：", final_state)
```

#### 如何实际运行 LangGraph 流程？

`invoke`、`ainvoke`、`astream`， `stream`，就是执行我们刚刚编译好的 LangGraph 图的几种常用方式：

```python
# 1. 同步：一次性执行完图，直接拿到最终 state
final_state = app.invoke({"messages": [("user", "你好")]})

# 2. 异步：适合在异步框架下调用
final_state = await app.ainvoke({"messages": [("user", "你好")]})

# 3. 流式：图执行过程中，边执行边推送中间过程/消息
# 3.1 异步流式
async for event in app.astream(initial_state, stream_mode=["updates", "messages"]):

# 3.2 同步流式（stream）
for event in app.stream(initial_state, stream_mode=["updates", "messages"]):
```

简单来说，这几种用法分别对应一次性拿全部结果、异步执行、边执行边流式推送中间进展，让你可以灵活适配自己的前后端需求。

 
## 四、LangGraph 的流式是怎么实现的？有哪几种模式？

### 模式

LangGraph 的流式是**分层**的：既可以在图的层面流式（哪个节点开始了、结束了、状态变成啥样），也可以在某个节点里的 LLM层面流式（逐 token）。

**`stream_mode` 是在选你希望流式收到哪一类数据**。图跑起来的方式是一样的（还是按消息传递、节点依次执行）；区别只在于每次有进展时，往你的 `async for ... in astream(...)` 里推什么。


- 选 **values**：每次推当前完整 state这一份数据。
- 选 **updates**：每次推这一步对 state 的增量这一份数据。
- 选 **messages**：每次推和消息类型字段相关的变更（包括 LLM 逐 token 的那条），适合做聊天/打字机。
- 选 **custom**：推的是节点里用 `StreamWriter` 自己写的内容。

所以：**一个模式= 一种你要观察的数据视角**；可以只选一种，也可以选多种（如 `["messages", "updates"]`），图会同时按这些视角往外推。下面按每种视角具体说明。


| 模式 | 含义 | 典型用途 |
|||-|
| **`"values"`** | 每步结束后，把**当前完整 state** 推一次 | 看整图执行到哪了、state 长什么样 |
| **`"updates"`** | 每步结束后，只推**这一步对 state 的增量（delta）** | 只要这一步改了什么，节省带宽 |
| **`"messages"`** | 和消息相关的变化会按**消息维度**推，且若底层 LLM 支持，可以**按 token** 推 | 做聊天界面、打字机效果，从某节点拿正在生成的那条消息的 token 流 |
| **`"custom"`** | 节点里自己用 **StreamWriter** 写出去的内容 | 完全自定义（例如只推某几个字段、或自己定义的进度事件） |

常见组合：**`stream_mode=["messages", "updates"]`**  
- `messages`：给前端当前正在生成的那条回复的逐 token 或逐条消息。  
- `updates`：给前端每一步节点对状态的更新（例如刚执行完搜索、刚写完某段），便于做步骤 UI 或引用信息。

### 4.2 一个实际坑：为什么用了流式 API却变成最后一次性打字机？

有同学会这样写生成节点：

```python
async for chunk in llm.astream(messages):
    full_content += chunk.content
return {"messages": [HumanMessage(content=full_content)], ...}  # 最后才 return 一次
```

这里虽然用了 **astream**，但：

- 所有 token 都在**节点内部**被拼成 `full_content`；
- 节点**只在最后** return 一次；
- LangGraph 的 `stream_mode="messages"` 只能看到**节点返回时**写进 state 的那一条完整消息，看不到中间的 token。

所以 API 层只会在**该节点完全跑完**时收到一大条 message，前端就变成先等很久，再一次性打字机输出——流式断在了节点内部。

### 4.3 正确姿势一：让 LangGraph 自己流式 LLM（invoke + config）

思路：**不要在节点里用 astream 拼字符串再 return**，而是：

1. 生成节点里用 **ainvoke**，并且把 LangGraph 传入的 **config** 传给 LLM：  
   `response = await llm.ainvoke(messages, config)`
2. 节点只负责拿最终完整消息并写回 state：  
   `return { "messages": [response], "final_output": response.content }`
3. **流式发生在图和LLM之间**：LangGraph 通过 config 里的回调监听 LLM 内部的 token 流，再通过 `stream_mode="messages"` 按 token 推给上层（你的 API 和前端）。

这样：**节点代码仍然是一次性拿整段**，但**整段到达之前**，外层已经按 token 流式输出了。

### 4.4 正确姿势二：用 custom 流在节点里手动推 token

不想依赖invoke + config时，可以：

1. 在节点里拿到 **StreamWriter**（例如通过 `get_stream_writer()` 或框架注入）；
2. 继续用 `async for chunk in llm.astream(messages):`，但每收到一个 chunk 就 `writer.write({"content": chunk.content})`；
3. API 层用 **`stream_mode=["updates", "custom"]`**，对 `mode == "custom"` 的数据解析出 `content`，用 SSE 推给前端。

这样流式完全由你在节点里显式推送，不依赖 LangGraph 对 LLM 的劫持。

## 五、图的 config 详解

### 5.1 config 是什么？

**config** 是 LangGraph（以及底层 LangChain）在**执行图或调用可运行对象时**使用的一个**配置字典**，类型上对应 **RunnableConfig**（在 `langchain_core.runnables.config` 里定义）。

>主要用于在**运行时**向图（Graph）注入**不变**的配置信息，比如用户ID、API密钥、线程ID等 


- **传递静态数据**：存放用户ID、组织ID这类在运行中不会改变的值 。可以在节点里通过`config["configurable"]`读取，比如`user_id = config["configurable"]["user_id"]` 。
    
- **控制执行行为**：内置参数能直接控制运行方式。例如用`thread_id`区分不同对话实现记忆 ，或用`recursion_limit`限制递归步数防止死循环 。
    
- **多租户与权限**：在SaaS应用中，可以基于config里的用户信息动态调整逻辑或权限 例如`organization_id`不同就调用不同的图逻辑 。


### 5.2 config 的结构与常用字段（对照官方文档）

config 是一个符合 **RunnableConfig** 约定的字典。官方里所有字段都是**可选的**（TypedDict 用 `total=False`），所以你可以只传需要的键，其余由框架补全或合并。常见字段如下：

- **`run_id`**:  
  UUID，本次运行的唯一标识。如果不传，框架会自动生成；用于日志关联、追踪、去重。

- **`run_name`**:  
  str，这次运行在 tracer 里的名字。默认多为类名；在 LangSmith 里显示。

- **`tags`**:  
  List[str]，字符串列表，给这次运行打标签。在 LangSmith 里可以按标签过滤、分组。

- **`metadata`**:  
  Dict[str, Any]，键值对（值需 JSON 可序列化）。可用于传递 user_id、session_id、环境等业务信息；会传给 handle\*Start 类回调。

- **`callbacks`**:  
  回调列表或 CallbackManager。本调用及所有子调用（如 Chain 调用 LLM）的回调集合。**流式、tracing、日志都靠它**。LangGraph 在 astream 时会注入自己的回调，LLM 每出一个 token 会调用 `on_llm_new_token`。

- **`configurable`**:  
  Dict[str, Any]，运行时可配置项。给用 `.configurable_fields()` 等声明过的属性传值，便于运行时换模型、换 key。

- **`recursion_limit`**:  
  int，最大递归/步数深度。默认 25；防止图死循环或运行过长。

- **`max_concurrency`**:  
  int，最大并发数。限制并行的子调用数量。


### 5.3  怎么用 

LangGraph 调用你定义的节点时，会**自动**把当前这次运行的 config 作为第二个参数传入（第一个是 state）。所以你只要在节点函数上声明第二个参数即可：

```python
from langgraph.types import RunnableConfig

async def my_node(state: MyState, config: RunnableConfig) -> dict:
    # config 就是本次 invoke/astream 传入的 config， 框架自动补全的
    run_id = config.get("run_id")
    # 把 config 传给 LLM，才能让 LangGraph 收到 LLM 的逐 token 事件
    response = await llm.ainvoke(state["messages"], config=config)
    return {"messages": [response]}
```

- **不在节点里用 config**：节点照样能跑，但 LLM 的流式事件不会被图听到，图层面就做不了逐 token 流式。  
- **在节点里把 config 传给 LLM（或 Tool）**：LangChain 会在 config 里挂上回调；LLM 每出一个 token 就调一次这些回调，LangGraph 再把这些事件通过 `stream_mode="messages"` 推出去。

所以：**节点里透传 config是图层面能流式 LLM 的关键一步。**

####  其他用法

除了把 config 原样传给 LLM，节点里还可以从 config 里取运行时才确定的值，例如：

- **`config["configurable"]`**：运行时可配置项。例如图里用 `.configurable_fields()` 声明了用哪个模型、哪个 API key，调用时通过 `config={"configurable": {"model": "gpt-4", "api_key": "xxx"}}` 传入，节点里从 `config["configurable"]` 读出来再创建 LLM，这样不用在代码里写死。
- **`config["metadata"]`**：业务上的 user_id、session_id 等，节点里可以读出来做鉴权、日志、多租户等。
- **`config["run_id"]`**：本次运行的唯一 ID，用于日志关联或去重。

LangGraph 官方文档里还提到 **`config["context"]`**（用户提供的上下文）、**`config["store"]`**（持久化键值存储）等，用于更复杂的运行时注入。 



### 5.4 config 与流式的关系：为什么传给 LLM 就能逐 token？

当你写：

```python
response = await llm.ainvoke(messages, config=config)  # 把 config 传给 LLM
```

会发生两件事：

1. **LLM 内部**：仍然是一边生成一边产生 token/事件。
2. **LangChain 的 LLM 实现**：会看 config 里有没有监听器（callbacks 等），有的话就**每产生一个 token 就调一次这些监听器**，把当前 chunk 传出去。

也就是说：

- **你的节点**：只关心最后那一整条，用 `ainvoke` 拿 `response`，没问题。
- **LangGraph**：在调用图时已经在 config 里注入了自己的回调；当你把**同一份 config** 传给 LLM 时，LLM 的逐 token 事件就会进到这些回调里，LangGraph 再通过 `stream_mode="messages"` 把这些 chunk **实时推给** 你的 `async for ... in app.astream(..., stream_mode=["messages", ...])`。

所以：**config 的作用 = 让 LangGraph 能旁听LLM 的逐 token 输出，从而在图层面做流式；对节点来说，ainvoke 仍然是一次性整段，但整段到达之前，外层已经按 token 流式了。**

#### 技术细节：callbacks 和逐 token是怎么接上的？

在 LangChain 里，流式是靠 **回调（callbacks）** 实现的。`RunnableConfig` 里有一个字段 **`callbacks`**，类型是一组 **BaseCallbackHandler**。当 LLM 在生成时，每产生一个新 token，会调用回调的 **`on_llm_new_token(token, **kwargs)`** 方法。

- 你在最外层调 `app.astream(..., stream_mode=["messages"])` 时，LangGraph 会在传入（或合并进）的 config 里**注入自己的回调**，这些回调负责把新 token事件转成 `stream_mode="messages"` 的 chunk 推给你的 `async for` 循环。
- 节点里写 `llm.ainvoke(messages, config=config)` 时，传进去的 config 里就带着这份图注入的回调。LLM 内部每出一个 token，就会调这些回调，于是 LangGraph 能收到、再推出去。

所以：**config 里的 callbacks = 图与 LLM 之间的监听器；透传 config = 让 LLM 有机会在每 token 时通知图。** 若你想自己写一个每 token 打印到控制台的 handler，可以实现一个 `BaseCallbackHandler` 并重写 `on_llm_new_token`，然后把该 handler 放进 `config["callbacks"]` 再传给图或 LLM。详见 LangChain 文档：[Callbacks](https://python.langchain.com/docs/concepts/callbacks/)。



### 5.5 在 invoke / astream 时如何传入 config？

你在**最外层**调用图时传入的 config，会一路透传到每个节点、以及节点内部调用的 LLM/Tool：

```python
# 同步
result = app.invoke(initial_state, config={"run_id": "abc", "tags": ["demo"]})

# 异步
result = await app.ainvoke(initial_state, config={"run_id": "abc"})

# 流式：config 同样会传进每个节点；节点里把 config 传给 LLM 后，才能按 token 收
async for event in app.astream(initial_state, config=config, stream_mode=["messages", "updates"]):
    ...
```

不传 config 时传 `None` 或不写，框架会使用默认 config（通常仍会生成 `run_id` 等）。
 
