---
title: "深入浅出Python 异步与协程"
date: "2026-02-28"
tags: ["Python", "Async"]
 
--- 


## Python异步编程

如果你从 Java 过来，你应该长期都在用操作系统线程处理高并发，他是真的内核线程，很重但是稳如老狗。 

在 Python 里，因为GIL的原因，导致多线程无法并行执行CPU任务，所以被迫大量使用协程（async/await)来高并发处理I/O

### 1.1 简单对比 

在 Java 里，每个线程同样有独立的内存栈和上下文，但只要你的机器是多核 CPU，Java 线程可以真的由操作系统分配到不同的核心上“同时”跑，实现真正的多核并行计算。这是 Java 多线程高性能的关键。

但 Python（CPython）的多线程由于 GIL 限制，始终只能有一个线程在执行 Python 字节码，所以没法像 Java 那样并行利用多核资源。即：

- **线程属于重量级资源**：每个线程都需要独立的内存栈和上下文切换，成千上万个线程时，系统调度成本和内存消耗非常高

- **GIL（全局解释器锁）限制**：Python 的 CPython 实现里，GIL 导致即使多线程也无法实现真正的多核并行。线程只能轮流占用解释器，CPU 密集型任务效率并不高。


|          | Java 多线程                         | Python 协程 (asyncio)          |
| -------- | ------------------------------------ | ---------------------------- |
| **调度者**  | **操作系统内核** (Linux内核的CFS调度器)          | **Python事件循环** (运行在用户态)      |
| **切换时机** | 时间片用完 / 线程主动阻塞                       | `await` 一个I/O操作 (主动让出)       |
| **切换成本** | **高** (需要陷入内核态、保存/恢复大量寄存器、CPU缓存可能失效) | **极低** (只在用户态保存少量上下文，类似函数调用) |
| **数量级**  | 数千个线程就会导致系统崩溃 (内存~1MB/线程)            | 轻松数十万协程 (内存~几KB/协程)          |
 
  

### Python 协程 

为了解决“高并发 I/O”场景下的大量连接和阻塞等待，**协程被引入**。协程是轻量级的“用户态线程”，由解释器或事件循环在应用层调度执行，不需要依赖操作系统，实现快速切换、非常低的资源开销。Python 早期有 `yield`、`greenlet` 等自制协程方案，后来标准化为 `asyncio` + `async/await` 语法。

总结一下： 协程和线程的区别

| 维度    | 线程                | 协程           |
| ----- | ----------------- | ------------ |
| 谁调度   | 操作系统              | 事件循环（你的程序）   |
| 栈/上下文 | 每个线程独立栈，占用多       | 协程轻量，数量可以很多  |
| 切换    | 内核态切换，代价大         | 用户态切换，代价小    |
| 并行    | 多核时可真并行（受 GIL 影响） | 单线程内并发，不真并行  |
| 典型用法  | I/O 并发、调用阻塞 API   | I/O 并发、高并发连接 |


选型建议：

- 高并发 I/O（如爬虫、网关、RPC）→ **协程**，单机可支撑海量连接，资源占用低。

- 需调用阻塞式同步库 → **协程中通过线程池**（如 run_in_executor）隔离，避免阻塞事件循环。

- 少量并发 I/O（几十个请求以内）或旧同步库调用 → **线程/线程池**，实现直观，无需 async 语法。

-  CPU 密集型计算 → **多进程**，绕过 GIL，真正利用多核。


 
## 协程：async / await 与事件循环


**协程**

```python
import asyncio

async def say_hello():
    print("Hello")
    await asyncio.sleep(0)
    print("World")

async def main():
    co = say_hello()
    print(type(co))   # <class 'coroutine'>
    await co

if __name__ == "__main__":
    asyncio.run(main())
```
不写 `async def` 的话，调用就会立刻执行；写成 `async def` 后，调用得到的是一个「协程对象」，要交给 `asyncio.run()` 或在里面 `await` 才会真正执行。`asyncio.run(main())` 会帮你把事件循环拉起来、把 `main()` 跑完、再关掉循环。


**并发执行多个协程**

```python
import asyncio

async def fetch(name, sec):
    print(f"  [{name}] 开始，等 {sec}s")
    await asyncio.sleep(sec)
    print(f"  [{name}] 结束")
    return name

async def main():
    t1 = asyncio.create_task(fetch("A", 2))
    t2 = asyncio.create_task(fetch("B", 1))
    t3 = asyncio.create_task(fetch("C", 3))
    results = await asyncio.gather(t1, t2, t3)
    print("结果:", results)

if __name__ == "__main__":
    asyncio.run(main())
```

这里 A、B、C 三个「任务」是同时挂到事件循环上的。你会看到 B 先结束（1 秒），再 A（2 秒），再 C（3 秒），总耗时约 3 秒而不是 6 秒。`create_task` 把协程交给事件循环去调度，立刻返回；`gather` 等这几个任务都跑完，把结果收成一个列表。


**asyncio 是什么**
Python 标准库的异步 I/O 框架，提供三个东西：

- 事件循环：单线程调度器，轮转执行就绪协程。

- async/await 语法：描述异步任务。

- 异步 API：如 asyncio.sleep()、异步网络/文件操作。


**async**  
用 `async def` 定义的函数叫协程函数。调用它的时候，函数体不会马上执行，而是返回一个协程对象。你可以把它想成「一张任务单」：只有有人（事件循环）去执行这张单子，里面的代码才会跑。
 

**await 的工作机制**
- 执行异步操作（如网络请求、定时器）。

- 挂起当前协程，不阻塞线程。

- 事件循环切换执行其他就绪协程。

- 操作完成后恢复该协程，继续执行后续代码。

**事件循环**  
事件循环就是一个在单线程里不断转的循环：看看有没有协程可以跑、有没有 I/O 或定时器已经就绪，有就执行或恢复对应的协程，执行到它再次 `await` 或结束，再去看下一批。 


**事件循环底层**  
Python 的 asyncio 用的是标准库里的 `selectors` 做 I/O 多路复用。

在不同系统上会自动选不同的实现：
Linux 上一般是 `epoll`，
macOS/BSD 上是 `kqueue`，
Windows 上是 `select` 或 IOCP。

简单说就是：一个线程通过一次系统调用同时盯着很多个文件描述符（比如网络连接），哪个有数据了或超时了，就通知事件循环，事件循环再去恢复对应的协程。这样单线程就能同时推进大量 I/O 任务，而不需要开很多线程。
 

### 举例

异步编程常见的错误有

一、以为是并行的串行写法；
``` python

# ❌ 错误：虽然是异步函数，但串行执行
async def process(applicants):
    results = []
    for a in applicants:
        score = await fetch_score(a)  # 逐个等待
        results.append(score)
    return results

# ✅ 正确：真正并发
async def process(applicants):
    tasks = [fetch_score(a) for a in applicants]
    results = await asyncio.gather(*tasks)  # 同时执行
    return results

```

二、忘记await

``` python
# ❌ 错误
async def get_user():
    result = session.execute(select(User))  # 返回协程对象，不是结果
    return result

# ✅ 正确
async def get_user():
    result = await session.execute(select(User))  # 必须 await
    return result
```

三、在异步函数中调用同步代码

``` python
# ❌ 错误：time.sleep 会阻塞事件循环
async def bad():
    time.sleep(1)  # 阻塞整个事件循环
    return "done"

# ✅ 正确：用 asyncio.sleep
async def good():
    await asyncio.sleep(1)  # 让出控制权
    return "done"

```

四、在普通函数中使用async with
```python
# ❌ 错误
def get_user():
    async with AsyncSessionLocal() as session:  # 语法错误
        return await session.execute(...)

# ✅ 正确：必须用 async def
async def get_user():
    async with AsyncSessionLocal() as session:
        return await session.execute(...)

```

五、在析构、构造函数中使用asyncio.run()

```python
# ❌ 错误：在析构函数中运行异步代码
def __del__(self):
    asyncio.run(self.close())  # RuntimeError!

# ✅ 正确：使用异步上下文管理器
async def __aenter__(self):
    return self

async def __aexit__(self, *args):
    await self.close()

```
`__init__` 不能用异步

、 `__del__` 函数 在垃圾回收时调用，什么时候回收不确定：
1. 可能程序已经要退出了
2. 可能事件循环已经关闭了
3. 可能在任意线程中调用
asyncio.run() 必须在主线程中运行，不确定的环境里运行 asyncio.run() 会导致各种奇怪错误


总结一下，其实异步编程就几件事：
1. async def 声明（是协程函数）
2. await 标记等待（让出控制权）
3. asyncio.run() 启动（跑起事件循环）

## FastAPI


FastAPI是完全构建在 ASGI（异步服务网关接口） 之上，而不是传统的WSGI，ASGI是WSGI的异步版本。允许FastAPI使用异步事件循环来处理网络请求，一个请求就能并发处理成千上万的连接，而无需为每个请求创建新线程。 

fastapi和spring的比较
https://pingcode.com/academy/cz80z3gpwbrz4gldd8h0pt89

https://developer.aliyun.com/article/1262059 


### 依赖注入

依赖注入是一种设计模式，让你可以将通用的逻辑（如数据库连接、身份验证、参数校验等）提取成可以复用的组件。

FastAPI 的依赖注入机制通过Depends实现

![[Pasted image 20260803164349.png]]


## SQLAlchemy

SQLAlchemy 是Python中 常用的ORM，SQLAlchemy分成三个部分：
- ORM，就是用类表达数据库schema的部分
- SQLAlchemy Core 就是一些基础的操作，例如update，insert等 
- DBAPI，数据库驱动

三者关系如下： 
![[Pasted image 20260803131800.png]] 
概念和数据类型


| 概念      | 对应数据库  | 说明     |
| ------- | ------ | ------ |
| Engine  | 连接     | 驱动引擎   |
| Session | 连接池，事务 | 由此开始查询 |
| Model   | 表      | 类定义    |
| Column  | 列      |        |
| Query   | 若干行    |        |




## SSE 

https://zhuanlan.zhihu.com/p/2049523167903983347

传输协议SSE，全称服务端事件推送（Server-Sent Events），它是浏览器原生支持的W3C标准协议，也是目前所有大模型流式接口默认标配协议。

SSE基于HTTP长连接+纯文本协议，服务器可以单向，低延迟，自动重连低往浏览器推无限行文本。 不需要额外升级协议，浏览器原生自带短线自动重连能力，代码极简，维护成本低 。

http协议是无法做到服务器主动推送信息，但是有一种变通方法，就是服务器向客户端声明，接下来要发送的是流信息 

SSE本质就是客户端发起一个get请求，服务器在接收到请求后，返回200ok，同时附带一下的headers： 
```text
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

- SSE 的MIME Type规定为text/event-stream
- SSE 不允许缓存
- SSE是一个一直打开的TCP连接，所以Connection为Keep-Alive

### fastapi集成sse

使用fastapi.responses.StreamingResponse类提供流式相应的能力（fastapi本身没有内建专门SSE类）

首先是编写一个生成器，编写async def 异步生成器函数，生成的数据也必须是符合SSE规范的文本格式 ，
``` python
(event: <type>\n data:<data>\n\n)
```
用双换行符分割事件 


对比WebSocket：WebSocket是双向全双工通信协议，客户端和服务端可以随时互相发送消息，需要额外进行HTTP协议握手升级，开发复杂度高，适合实时聊天室、在线协同编辑、联机游戏这类双向交互场景。但大模型对话本身是单向场景：用户发一次提问，后端持续推送回答，前端只收消息、不需要向后端回传实时数据。 

再说说SSE标准报文格式，这也是流式对接最容易踩坑的地方。

标准SSE报文以固定key:value格式编写，日常开发只需要关注四个核心字段：

- data用来存放真实业务数据流
- event用来自定义事件类型，多用于标记报错、结束等特殊状态；
- id用于标记每条消息唯一编号，支撑网络断线之后精准续连；
- retry可以自定义前端自动重连的毫秒间隔。

其中有一个绝对不能忽略的硬性规范：==每一条独立的SSE数据包，结尾必须携带两个连续换行符\n\n，用来标识当前数据包传输完毕。如果少写一个换行符，前端流解析直接错乱，这也是后端开发最常犯的低级错误。==

我们平时对接大模型接口看到的结束标记data: [DONE]，属于行业通用约定，不属于协议原生字段。后端在所有文本推送完成之后，需要单独发送这一行内容，告知前端本次对话流已经正常结束，前端即可关闭监听通道，避免页面一直处于加载等待状态。
