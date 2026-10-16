---
title: "构建长任务Agent（一）：SSE没你想得那么简单"
date: "2025-10-16"
tags: ["AI", "Google"]
---

## 前言

开发过Agent的人应该都知道，表面简单聊天框实际上多难构建。 发送的消息莫名消失，发一条变成两条，刷新一下回来全没了，agent跑到一半失败了怎么重试，用户想要打断怎么办，想调整方向怎么办... 不仅是AI上下文的问题，还有很多工程问题等着工程师烦恼。

本系列将整理和分析AI ChatBox的工程问题：SSE，聊天UI，长任务Agent运行场景的技术选型和常见坑。希望为读者建立一个Agent技术栈和问题地图， 本文为第一篇，SSE：没你想得那么简单

这次主要围绕Python和React技术栈，不过工程原理是一致的。

## 从Agent Loop说起

首先，一开始都很美好，构建一个LLM API，一个简单的ReAct Loop

```python
async def agent_loop(messages, tools, max_steps=20):
    for _ in range(max_steps):
        response = await llm.chat(
            messages=messages,
            tools=tools
        )
        messages.append(response.message)
        if not response.tool_calls:
            return response.content
        for call in response.tool_calls:
            result = await execute_tool(
                call.name,
                call.arguments
            )
            messages.append({
                "role": "tool",
                "tool_call_id": call.id,
                "content": str(result)
            })
```

代码很简洁，LLM 负责决策，工具负责执行，循环直到模型不再调用工具。

但随着产品不断迭代，事情开始变得复杂。

**第一阶段：需要流式输出。**

用户不可能一直盯着空白聊天框，于是我们引入 SSE，把 LLM 的 Token 实时推送给前端。原本简单的 `return` 变成了 `yield`，还要处理工具调用事件、连接断开和异常。

**第二阶段：需要持久化和多轮对话。**

用户刷新页面，聊天记录不能丢。于是接入数据库，保存消息、工具调用结果和会话状态。

但新的问题出现了：前端已经乐观展示了消息，后端又通过 SSE 推送一次，同一条消息出现两遍。更糟糕的是，消息显示成功，却没有真正写入数据库。

**第三阶段：Agent 开始执行长任务。**

原本几秒钟的对话，变成需要几分钟的搜索、分析和工具调用。

HTTP 请求可能超时，SSE 可能断开，用户刷新页面后任务是否还在运行？如果在第 8 次工具调用时失败，应该从头执行还是继续执行？

**第四阶段：用户需要控制 Agent。**

用户希望随时停止生成、修改任务方向，甚至在 Agent 运行过程中发送新消息。

这时候，简单的 `asyncio.Task.cancel()` 已经不足以解决所有问题。取消的是请求、任务，还是正在执行的外部工具？已经产生的副作用又该怎么办？

**第五阶段：开始修补各种边界情况。**

于是代码里逐渐出现：

- `is_running`、`is_streaming`、`is_cancelled` 等多个状态变量。
- 前端 Zustand、聊天 UI 组件、后端数据库各自维护一套消息状态。
- SSE 断线重连、轮询兜底、任务恢复逻辑相互交织。
- 各种 `try/except`、超时处理和重试逻辑散落在不同函数里。
- 不同的Agent系统有自己不同的业务需求

最终，一个几十行的 Agent Loop，演变成了上千行充满隐式状态和边界条件的系统，还夹杂着独特的业务代码。工程问题之上，还要考虑上下文工程

构建一个Agent系统我们得考虑：

- 每次LLM请求都是无状态的，但是构建agent意味着我们要让它变得有状态，记得自己在做什么，需要完成什么目标
- 每一轮让Agent的输入输出都需要考虑实时展示，持久化，别忘了调用工具也得展示（可恢复的流对话）
- LLM的不确定性要求系统是容错，可重试
- LLM的成本不允许系统每次重来，断点需要恢复
- 如何选择合适上下文使LLM能够有足够且精准的信息完成任务
- 如何构建工具使LLM选择正确的工具完成任务
- 如何让系统可观测，失败的任务能够分析和调优（包括成本调优）

🤷‍♀️让我们一步步来吧

## 一些常见的AI Agent技术栈

1. 聊天 UI
   - Assistant UI：React 聊天组件库，提供消息渲染、工具调用展示、线程管理等能力，自定义程度高。
   - Vercel AI SDK（AI SDK UI）：不仅提供聊天状态管理，还包含流式传输、模型调用等能力，前后端集成更完整，适合 TypeScript 技术栈。

2. 流式通信
   - SSE：基于 HTTP 的单向事件流，适合 LLM Token、工具执行进度实时推送。
   - WebSocket：双向长连接，适合实时交互频繁的场景，但连接管理更复杂。
   - AG-UI：Agent 与前端通信的事件协议，规范消息、工具调用、状态更新等事件格式，可以基于 SSE 传输。
3. Python SSE 框架
   - FastAPI StreamingResponse：原生支持流式响应，适合简单场景，但事件格式、连接管理需要自己处理。
   - sse-starlette：专门实现 SSE 的 Python 库，提供 `EventSourceResponse`、心跳、断线检测等能力。

4. Agent 框架
   - LangGraph：基于状态图编排 Agent，支持 Checkpoint、中断恢复，适合复杂、多步骤任务。
   - Pydantic AI：类型安全、轻量，强调工具调用和结构化输出，适合 Python 工程项目。
   - OpenAI Agents SDK：提供 Agent Loop、工具调用、Handoff 和 Tracing，适合快速构建多 Agent 系统。
5. 后端与任务执行
   - FastAPI：Python API 框架，负责请求处理、鉴权、SSE 接口。
   - Celery / ARQ：后台任务队列，前者功能成熟，后者基于 asyncio、Redis，更轻量。
   - DBOS：持久化执行框架，提供工作流恢复、重试等能力，适合长时间运行的 Agent。

6. 状态与持久化
   - PostgreSQL：持久化会话、消息、任务与执行结果，作为系统事实来源。
   - Redis：缓存、分布式协调、任务队列；Redis Streams 也可以实现事件流的保存与消费。

7. 可观测性
   - Langfuse：开源 LLM 可观测平台，追踪 Agent 执行链路、Token 消耗、成本和评估结果。
   - LangSmith：与 LangChain / LangGraph 生态集成紧密，支持 Trace、调试和评测。
   - OpenTelemetry：通用可观测标准，用于统一采集 Trace、Metrics 等遥测数据。

## SSE

SSE（Server-Sent Events）是基于 HTTP 的服务端单向推送机制。

客户端发起 HTTP 请求，服务端返回 `Content-Type: text/event-stream`，并保持响应持续输出。

```python
HTTP/1.1 200 OK
Content-Type: text/event-stream

id: 1
event: message
data: {"content":"你好"}

id: 2
event: tool_start
data: {"tool":"search"}
```

每个事件以空行分隔。`event` 表示事件类型，`data` 是事件内容，`id` 是可用于恢复读取位置的事件标识。

SSE 基于 HTTP 长连接，但连接本身是临时且不可靠的，也不具备消息持久化能力。 在 AI Agent 长任务场景下，这些局限性会带来一系列工程问题。例如：

1. 页面刷新（Page Refresh）：浏览器刷新后，原有 SSE 连接断开。服务端可能已经完成生成，也可能仍在执行，但新连接无法直接恢复之前的响应。用户可能看到空白消息，或者 Agent 从头生成。
2. 网络断线（Network Drop）：网络中断后，客户端停止接收数据，而服务端可能无法立即感知断线，继续消耗 Token。用户看到的内容停留在中断位置，甚至丢失部分已经生成的结果。
3. 切换 Tab 或设备（Tab Switch / Device Change）：切换 Tab 不一定导致断连，但浏览器可能冻结或丢弃后台页面。更换设备则需要建立新连接，如果没有持久化的会话与事件记录，就无法接续之前的输出。
4. 服务端重启（Server Restart）：如果 Agent 直接运行在 HTTP 请求中，服务重启可能导致执行中断，内存中的消息、任务状态和未保存的结果也会丢失。
5. 重复连接（Duplicate Connection）：客户端断线重连时，如果服务端将每次请求都视为新任务，可能导致 Agent 重复执行，产生重复消息、工具调用和额外的推理成本
6. 用户主动取消（Cancellation）：关闭 SSE 连接不等于取消 Agent。尤其当 Agent 在独立后台任务中运行时，如果没有明确的取消机制，模型和工具可能继续执行。

### 常见的失败模式和解决方案

#### 1. 连接中断：心跳、断连检测与资源清理

假设 Agent 正在执行一次耗时 60 秒的搜索任务，期间没有任何 Token 输出。代理服务器可能因为连接长时间没有数据而主动断开。或者用户关闭浏览器，服务端没有及时感知断线，继续向已经失效的连接发送数据。

对应的方案包括：

- **心跳（Ping）**：定期发送 SSE 注释事件，降低空闲连接被代理关闭的概率。
- **断连检测**：感知客户端断开，及时释放 SSE 连接占用的资源。
- **发送超时**：防止客户端无法消费数据时，服务端一直阻塞在发送操作上。

在 FastAPI 中，我们可以使用原生的 `StreamingResponse`：

```python
async def stream():
    async for event in get_events():
        yield f"event: message\ndata: {event}\n\n"

return StreamingResponse(
    stream(),
    media_type="text/event-stream"
)
```

不过，`StreamingResponse` 是通用 HTTP 流式响应工具，需要自己处理 SSE 格式、心跳和发送超时等细节。

这时可以使用 [sse-starlette](https://github.com/sysid/sse-starlette)：

```
from sse_starlette import EventSourceResponse

return EventSourceResponse(
    get_events(),
    ping=15,
    send_timeout=30
)
```

它提供标准 SSE 事件编码、自动心跳、断连检测和发送超时机制，减少重复造轮子。<Cite refs={["turn802550search1","turn802550search2"]}/>

但它仍然无法解决刷新后恢复消息的问题。

#### 2. 断线恢复

假设 Agent 正在不停吐出消息，用户中途刷新页面，重新连接建立以后，应该如何拿到剩下的内容？
这里需要引入**可恢复事件流（Resumable Stream）**。
核心是两个 ID：

- **Job ID**：标识正在运行的 Agent 任务，确保重连时找到原来的任务，而不是重新执行。
- **Event ID**：标识事件位置，用来补发断线期间遗漏的事件。

```python
创建 Job #100
     |
     v
产生事件 1 → 2 → 3 → 4 → 5
                 |
              网络断开
                 |
          重新订阅 Job #100
          last_event_id = 3
                 |
                 v
             补发 4、5
```

为了实现这一点，通常需要：

1. **将任务与流连接分离，支持启动（Start）和订阅（Subscribe）。**
2. 使用数据库或 Redis Streams 保存事件。
3. 重连时携带事件游标，服务端补发遗漏事件。
4. 客户端按事件 ID 去重，并处理事件重放与实时事件之间的顺序。

这些能力无法仅靠 `StreamingResponse` 或 `sse-starlette` 实现。

**Vercel AI SDK 提供了更完整的可恢复流方案。**

官方的 `useChat({ resume: true })` 配合 `resumable-stream`、Redis 和持久化的会话记录，可以自动发现并重新连接仍在运行的流。

其典型设计包括：

- POST 接口创建新流。
- 使用Redis 保存可恢复的流数据。
- 数据库存储当前会话对应的活跃 Stream ID。
- GET 接口重新订阅已有流。

这里 Redis 承担流保存和发布订阅职责，AI SDK 负责前端重连及流协议集成。<Cite ref="turn802550search0"/>

不过，需要注意官方方案的限制：`resume: true` **与** `stop() / Abort` 取消能力不兼容 ，而且可恢复流也不等于 Agent能执行检查点恢复。

#### 3. 重复执行与任务中断

另一个常见问题是：客户端每次调用聊天接口，后端都会启动一个新的 Agent Loop。
当网络断开后，前端重新发送请求，就可能重复执行之前的工具调用，造成 Token 浪费，甚至重复写入外部系统。
更糟的是，如果 Agent 直接运行在 SSE 响应生成器内：

```python
async def stream():
    async for event in agent.run_stream():
        yield f"data: {event}\n\n"
```

客户端断开时，响应任务可能被取消，取消信号可能传播到 Agent，导致执行中断。

因此，这里需要两种机制：

- **任务幂等**：为用户请求分配稳定的请求 ID，避免重复创建 Job。
- **执行与连接解耦**：Agent 在独立任务或 Worker 中运行，SSE 只负责订阅事件。

无论是 `sse-starlette` 还是 Vercel AI SDK，都不意味着自动获得可靠的 Agent 任务执行能力。
对于长任务系统，仍需要根据需求考虑 Worker、任务状态持久化，以及 LangGraph Checkpointer、DBOS 等执行恢复机制。

#### 4. 多路事件消费冲突：为什么消息会重复或消失？

为了增强可靠性，我们可能逐渐增加多套恢复机制：

- 实时 SSE：不断追加 Token 和工具事件。
- 恢复 SSE：重连后补发遗漏事件。
- History Polling：定期从数据库获取最新消息。

问题是，如果三条路径都直接更新前端消息列表，就可能出现竞态条件。

```text
实时 SSE ───────────┐
                   |
恢复 SSE ───────────┼──> React Messages
                   |
History Polling ───┘
```

例如，SSE 已经将消息更新到了第 100 个 Token，而一个稍早发起的历史请求此时才返回，只包含前 60 个 Token。如果前端直接用历史结果覆盖当前状态，消息就会突然倒退或消失。

解决方向不是无限增加兜底逻辑，而是**建立统一的消息状态更新机制**：

- 通过 `message_id` 和 `event_id` 去重。
- 明确历史快照与实时事件的合并规则。
- 避免恢复 SSE 和实时 SSE 对同一消息产生无协调的重复更新。
- 明确前端消息状态的唯一管理者，防止多个 Store 同时维护消息副本。

Assistant UI、Vercel AI SDK UI 可以帮助管理聊天消息与工具调用的渲染状态，但它们并不会自动解决所有自定义的数据同步冲突。

这部分其实已经超出了 SSE 本身，进入了 Chat UI 的状态一致性问题。(后续会结合前端显示一起讲)

#### 5. 事件与持久化状态不一致

连接和事件都恢复了，仍然可能出现另一种问题：

- SSE 已经显示任务完成，但数据库中没有对应消息。
- 工具调用已经结束，刷新页面后却依然显示 Running。
- 前端展示了完整回答，重新加载历史记录后消息突然消失。

根本原因在于：**SSE 事件、数据库消息和 Agent Run 状态可能通过不同的代码路径更新，并不天然具有原子性。**

例如：

```text
Agent 生成结果
      |
      +--> SSE: DONE 发送成功
      |
      +--> DB: 消息写入失败
```

用户在当前页面看到了完整答案，但刷新后数据库没有记录。

工程上需要明确数据库和事件流之间的一致性规则。例如，先提交关键状态，再发布对应事件；对需要更强可靠性的场景，可以采用 Transactional Outbox，将状态变更与待发布事件写入同一事务，再异步投递。

同时，任务的 `COMPLETED` 状态应该具有明确的持久化语义，不能仅仅因为 SSE 发送了 `done` 就认为任务已经可靠完成。

`sse-starlette` 不负责这种一致性。Vercel AI SDK 提供消息持久化的集成方式，但业务侧仍然需要正确处理写入失败、并发更新和状态恢复。

#### 5. 如何选择？

总结下来，SSE 在 Agent 系统中的工程问题可以归纳为五个层次：

- 连接可靠性：解决心跳、断连检测、超时和重连问题。
- 任务可靠性：解决 Agent 执行与 SSE 连接耦合、重复启动和故障恢复问题。
- 事件可靠性：解决事件持久化、断线补发、顺序保证和去重问题。
- 状态一致性：解决 SSE 事件、数据库消息与 Agent 运行状态不同步的问题。
- 前端消费一致性：解决实时流、恢复流和历史消息等多路数据来源造成的重复、覆盖与竞态问题。

这五个层次分别对应连接管理、任务执行、事件传输、数据持久化和前端状态管理。 它们相互关联，通常需要不同的框架和解决方案，如果简单交给AI写代码，AI只会不停打补丁，最终整个agent系统就是一堆屎山代码（别问我是怎么知道的🤦‍♂️）

| 失败模式         | 核心解决机制                       | 相关技术                                          |
| ---------------- | ---------------------------------- | ------------------------------------------------- |
| 连接中断         | 心跳、断连检测、超时、重连         | `sse-starlette`、原生 SSE                         |
| 执行生命周期耦合 | Agent Job 独立执行、取消与恢复     | Worker、LangGraph、DBOS                           |
| 事件丢失与重复   | 事件持久化、游标、重放、去重       | Redis Streams、PostgreSQL、Vercel AI SDK 可恢复流 |
| 事件与状态不一致 | 数据库事务、事件发布顺序、状态协调 | PostgreSQL、Outbox                                |
| 多路消费冲突     | 统一状态管理、快照与事件合并       | Assistant UI、AI SDK UI、自定义状态层             |

总结下来，SSE 的工程问题可以归纳为三个层次：

- **连接可靠性**，解决心跳、断连和超时；
- **事件可靠性**，解决持久化、补发和去重；
- **任务可靠性**，解决独立执行、重复启动和故障恢复。
