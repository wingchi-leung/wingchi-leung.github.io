---
title: "深入浅出Python 异步与协程"
date: "2026-02-28"
 
--- 



## 一、Python 和 Java 的多线程：有啥不一样？

如果你从 Java 过来，会习惯「多线程 = 多核并行」。在 Python 里，多线程**语法上**很像，但**语义上**差一截，核心原因是一条：**GIL（全局解释器锁）**。

### 1.1 对比一句话
在 Java 里，多线程不仅能被操作系统调度，还能真正将任务分布到多个 CPU 核心上实现并行计算，所以多线程通常既适合 CPU 密集型任务，也适合 I/O 密集型场景，这也是 Java 多线程性能强大的原因。

而到了 Python，由于有 GIL（全局解释器锁）的限制，即便你创建了很多线程，实际上同一时刻也只有一个线程在执行 Python 代码，所以无法真正做到多核并行。


如果你需要跑 CPU 密集型代码，Python 反而更推荐用多进程（multiprocessing），这样每个进程有自己的 Python 解释器，才能利用多核优势。

对于高并发的 I/O 场景，Python 可以用多线程或者基于协程（asyncio）的方式来提升并发度，但本质上多线程在 Python 里更适合用来做 I/O 并发，而不是多核并行。


### 1.2 为啥 Python 有 GIL？

GIL 的存在和历史实现、C 扩展的线程安全有关，这里不展开。只需要记住：**想多核并行算，用 `multiprocessing`（多进程）；想高并发 I/O，用多线程或（更推荐）协程。**



## 二、线程 vs 协程：原理上的区别与典型应用场景

### 为什么 Python 要有协程？历史原因与线程的局限

Python 一开始就有线程（`threading`），配合操作系统调度，可以实现多段代码的并发执行。但随着互联网普及，服务器端对“同时响应成千上万连接”的需求日益提升，纯靠多线程会遇到非常明显的性能瓶颈：

- **线程属于重量级资源**：每个线程都需要独立的内存栈和上下文切换，成千上万个线程时，系统调度成本和内存消耗非常高

- **GIL（全局解释器锁）限制**：Python 的 CPython 实现里，GIL 导致即使多线程也无法实现真正的多核并行。线程只能轮流占用解释器，CPU 密集型任务效率并不高。

> 💡 **Tips (和 Java 的区别)**  
> 在 Java 里，每个线程同样有独立的内存栈和上下文，但只要你的机器是多核 CPU，Java 线程可以真的由操作系统分配到不同的核心上“同时”跑，实现真正的多核并行计算。这是 Java 多线程高性能的关键。但 Python（CPython）的多线程由于 GIL 限制，始终只能有一个线程在执行 Python 字节码，所以没法像 Java 那样并行利用多核资源。


为了解决“高并发 I/O”场景下的大量连接和阻塞等待，**协程被引入**。协程是轻量级的“用户态线程”，由解释器或事件循环在应用层调度执行，不需要依赖操作系统，实现快速切换、非常低的资源开销。Python 早期有 `yield`、`greenlet` 等自制协程方案，后来标准化为 `asyncio` + `async/await` 语法。

#### 线程真的不够吗？

线程**本质够用**，但在极端高并发下会受资源占用和切换速度影响。而协程能够：

- 在一个线程里、高效地“并发处理”上万个任务（如网络请求、文件操作），不占用过多内存。
- 切换速度高，适合“等待 I/O 就主动让出执行权”的场景，不浪费 CPU 时间片。
- 避免了大量线程上下文切换的系统级负担，提升整体吞吐和并发能力。

 
## 2.1 适用场景对比：什么时候该用线程，什么时候更适合协程？

### 2.1 场景对比
在实际开发过程中，应该如何选择用线程还是协程？不同场景下的推荐如下：

当你面对**高并发的 I/O 场景**，比如需要同时处理成千上万个网络连接、做大规模爬虫、实现高性能网关或 RPC 服务时，协程（如 Python 的 asyncio）是更加优选的方案。此时借助事件循环和协程调度，不仅可以让大量「任务」在一个线程中高效切换，而且单机的连接数上限可以做得很大，资源占用也非常低。


有些时候你必须调用**阻塞型的同步 API**（即有些库只能同步调用，无法异步），这时你可以在协程环境下，把这些代价高、会阻塞主线程的操作，交给线程池去执行，或者在 asyncio 里用 `run_in_executor`。这样能保证主事件循环不被阻塞，程序依然可以流畅处理其他异步任务。

如果你只是要做**少量并发 I/O**，比如偶尔发起几个到几十个并发请求，或者需要调用一些老旧的第三方同步库，这时用多线程或者线程池往往就足够了。这种方式实现起来直观、和 Java 里的习惯类似，不需要学习新的 async/await 写法。

如果你的程序以**CPU 密集型计算为主**，比如科学计算、图像处理、大规模算法推理等，需要充分利用多核，最推荐的方法是采用多进程（multiprocessing）。多进程由于每个进程都独立运行，天然绕过了 Python 的 GIL，真正实现了多核并行。

总结一下： 协程和线程的区别

| 维度 | 线程 | 协程 |
|------|------|------|
| 谁调度 | 操作系统 | 事件循环（你的程序） |
| 栈/上下文 | 每个线程独立栈，占用多 | 协程轻量，数量可以很多 |
| 切换 | 内核态切换，代价大 | 用户态切换，代价小 |
| 并行 | 多核时可真并行（受 GIL 影响） | 单线程内并发，不真并行 |
| 典型用法 | I/O 并发、调用阻塞 API | I/O 并发、高并发连接 |


## 三、线程

Python 的线程用法和 Java 类似：`threading` 是标准库，`import threading` 即可，不用 pip。下面只给一个最简例子，建立「多段代码并发跑」的直觉；**后面重点在协程**。

```python
import threading
import time

def worker():
    for i in range(3):
        print(f"  子线程: 第 {i+1} 次")
        time.sleep(0.5)

if __name__ == "__main__":
    t = threading.Thread(target=worker)
    t.start()
    print("主线程: 子线程已启动")
    t.join()
    print("主线程: 子线程已结束")
```

**GIL 小结**：同一时刻只有一个线程在执行 Python 字节码。所以 CPU 密集型多线程在 Python 里几乎占不到多核便宜；I/O 密集型多线程仍然有用（等 I/O 时释放 GIL）。下面用两个线程并发「等待」各 1 秒、2 秒，总耗时约 2 秒，说明 I/O 等待可以重叠。

```python
import threading
import time

def wait_one_sec():
    print("  线程A: 开始等 1 秒")
    time.sleep(1)
    print("  线程A: 结束")

def wait_two_sec():
    print("  线程B: 开始等 2 秒")
    time.sleep(2)
    print("  线程B: 结束")

if __name__ == "__main__":
    start = time.perf_counter()
    a = threading.Thread(target=wait_one_sec)
    b = threading.Thread(target=wait_two_sec)
    a.start()
    b.start()
    a.join()
    b.join()
    print(f"总耗时: {time.perf_counter() - start:.2f} 秒")  # 约 2 秒
```

---

## 四、线程池：需要时再用

每次 `Thread(target=...)` 都会新建线程。**线程池**（`concurrent.futures.ThreadPoolExecutor`）复用一批线程，适合「少量并发 + 有阻塞调用」的场景。知道有这回事即可，协程里也可以用 `run_in_executor` 把阻塞调用丢进线程池。

```python
from concurrent.futures import ThreadPoolExecutor
import time

def task(name, sec):
    print(f"  [{name}] 开始，等 {sec} 秒")
    time.sleep(sec)
    return f"{name} 完成"

if __name__ == "__main__":
    with ThreadPoolExecutor(max_workers=2) as pool:
        f1 = pool.submit(task, "任务1", 1)
        f2 = pool.submit(task, "任务2", 2)
        print("已提交两个任务")
        r1, r2 = f1.result(), f2.result()
    print(r1, r2)
```

 
## 五、协程：async / await 与事件循环

先看两段代码，再回头说清楚概念。

**第一段：协程长什么样、怎么跑起来**

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


**第二段：多个协程一起跑**

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


**概念稍微捋一捋**

**asyncio 是啥**  
`asyncio` 是 Python 标准库里的**异步 I/O 框架**。它提供三样东西：事件循环（单线程里调度协程）、`async`/`await` 语法、以及一堆异步版的 API（如 `asyncio.sleep`、异步网络读写等）。你写 `async def` 和 `await`，本质上就是在用 asyncio 这一套模型：用协程描述「要做什么」，用事件循环在单线程里轮流推进这些协程，适合高并发的 I/O 场景（网络、文件、定时等）。不用 pip 安装，`import asyncio` 即可。

**async**  
用 `async def` 定义的函数叫协程函数。调用它的时候，函数体不会马上执行，而是返回一个协程对象。你可以把它想成「一张任务单」：只有有人（事件循环）去执行这张单子，里面的代码才会跑。

**await：挂起是啥、为啥会去跑其他协程**  

你写 `await xxx` 时，发生的是这样几件事：

- **右边那个「异步任务」开始进行**。比如 `await asyncio.sleep(1)`，表示「等 1 秒」；比如 `await 一次网络请求`，表示「等这次请求完成」。这个任务会交给事件循环（或操作系统）去推进，不会卡住整条线程。
- **当前协程在这里挂起**。「挂起」的意思就是：执行到 `await` 这一行就停住了，后面的代码暂时不跑，等右边的任务完成再说。
- **事件循环不会闲着**。当前协程停住了，事件循环就会去跑**别的已经就绪的协程**——比如别的协程也在等 I/O，谁的 I/O 先完成，谁就先被恢复执行一段，直到再次 `await` 或结束。
- **等右边的任务完成了**，事件循环会回来把当前协程从 `await` 后面**恢复**，继续往下执行，并把结果赋给 `await` 表达式。

所以：**异步任务在跑的时候，当前协程就是挂起的；挂起期间，事件循环会去跑其他协程。** 不是「傻等」，而是「我停在这里，你去跑别人，好了再叫我」。右边可以是一个协程、`asyncio.Task`、`Future`，或任何「可等待」的对象（Awaitable）。

**事件循环是啥**  
事件循环就是一个在单线程里不断转的循环：看看有没有协程可以跑、有没有 I/O 或定时器已经就绪，有就执行或恢复对应的协程，执行到它再次 `await` 或结束，再去看下一批。协程负责「要做什么」，事件循环负责「在什么时候、跑哪一个」。没有事件循环，协程对象不会自己动；`asyncio.run()` 就是帮你把默认的事件循环建起来、把传入的协程跑完、再关掉。

**事件循环底层靠啥**  
Python 的 asyncio 用的是标准库里的 `selectors` 做 I/O 多路复用。

在不同系统上会自动选不同的实现：
Linux 上一般是 `epoll`，
macOS/BSD 上是 `kqueue`，
Windows 上是 `select` 或 IOCP。

简单说就是：一个线程通过一次系统调用同时盯着很多个「文件描述符」（比如网络连接），哪个有数据了或超时了，就通知事件循环，事件循环再去恢复对应的协程。这样单线程就能同时推进大量 I/O 任务，而不需要开很多线程。


## 六、asyncio 常用写法

从同步代码进入异步用 **`asyncio.run(协程)`**：创建默认事件循环、运行协程、结束后关闭循环，通常整个程序只调用一次。

```python
import asyncio

async def main():
    await asyncio.sleep(0.5)
    print("异步世界里的 Hello")

if __name__ == "__main__":
    asyncio.run(main())
```

并发跑多个协程：用 **`create_task`** 把协程交给事件循环，用 **`gather`** 等待全部完成。

```python
import asyncio

async def work(name, n):
    for i in range(n):
        print(f"  {name}: {i+1}/{n}")
        await asyncio.sleep(0.2)
    return name

async def main():
    tasks = [
        asyncio.create_task(work("甲", 3)),
        asyncio.create_task(work("乙", 2)),
    ]
    results = await asyncio.gather(*tasks)
    print("全部完成:", results)

if __name__ == "__main__":
    asyncio.run(main())
```

协程里不能直接调用会阻塞线程的 API（如 `time.sleep`、同步 socket），否则会卡住整个事件循环。需要把阻塞调用放到线程池：**`loop.run_in_executor(executor, func, *args)`** 或 **`asyncio.to_thread(func, *args)`**（Python 3.9+），返回的是 awaitable，用 `await` 取结果。

```python
import asyncio
import time
from concurrent.futures import ThreadPoolExecutor

def blocking_sleep(sec):
    time.sleep(sec)
    return f"睡了 {sec} 秒"

async def main():
    loop = asyncio.get_running_loop()
    with ThreadPoolExecutor(max_workers=2) as pool:
        fut1 = loop.run_in_executor(pool, blocking_sleep, 1)
        fut2 = loop.run_in_executor(pool, blocking_sleep, 2)
        r1, r2 = await fut1, await fut2
    print(r1, r2)

if __name__ == "__main__":
    asyncio.run(main())
```

```python
# Python 3.9+
import asyncio
import time

def blocking_sleep(sec):
    time.sleep(sec)
    return f"睡了 {sec} 秒"

async def main():
    r1 = await asyncio.to_thread(blocking_sleep, 1)
    r2 = await asyncio.to_thread(blocking_sleep, 2)
    print(r1, r2)

if __name__ == "__main__":
    asyncio.run(main())
```

与 `await` 配套的还有 **`async with`**、**`async for`**：异步上下文管理器和异步迭代器，用法与同步的 `with`/`for` 对应，只是进入/退出和迭代时都会 `await`。例如在协程间需要互斥时用 **`asyncio.Lock()`**，通过 `async with lock:` 在持锁期间挂起也不会阻塞事件循环。

```python
import asyncio

async def use_lock(lock, name):
    async with lock:
        print(f"  {name} 拿到锁")
        await asyncio.sleep(0.2)
    print(f"  {name} 释放锁")

async def main():
    lock = asyncio.Lock()
    await asyncio.gather(use_lock(lock, "A"), use_lock(lock, "B"))

if __name__ == "__main__":
    asyncio.run(main())
```

**常见坑**：在 `async def` 里写 **`time.sleep(1)`** 会阻塞整个事件循环，其他协程都得不到调度。应使用 **`await asyncio.sleep(1)`**，在等待期间让出控制权。下面对比错误写法（串行，约 2 秒）与正确写法（并发，约 1 秒）。

```python
import asyncio
import time

async def wrong():
    print("  错误: A 开始")
    time.sleep(1)
    print("  错误: A 结束")
    print("  错误: B 开始")
    time.sleep(1)
    print("  错误: B 结束")

async def right():
    async def a():
        print("  正确: A 开始")
        await asyncio.sleep(1)
        print("  正确: A 结束")
    async def b():
        print("  正确: B 开始")
        await asyncio.sleep(1)
        print("  正确: B 结束")
    await asyncio.gather(a(), b())

if __name__ == "__main__":
    print("=== 错误（串行）===")
    start = time.perf_counter()
    asyncio.run(wrong())
    print(f"耗时: {time.perf_counter() - start:.2f}s\n")
    print("=== 正确（并发）===")
    start = time.perf_counter()
    asyncio.run(right())
    print(f"耗时: {time.perf_counter() - start:.2f}s")
```
