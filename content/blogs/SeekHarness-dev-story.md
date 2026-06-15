### 前言 

> Claude code源码泄露后，一堆开发爱好者都在分析它源码和架构，其中也包括我，因为工作上也在做agent，发现有些地方做的不够好的，也是在cc上看看他们怎么设计的。后来看到这篇文章 [解剖 agent loop](https://stevekinney.com/writing/agent-loops)说做一个100行的SWE-agent 已经达到了80.9%的性能水平。所以打算自己也来做一个看看是不是过真如此

## Agent loop



### loop 不要使用递归 

> 有很多原因，本来agent loop用递归就很反直觉，但是我第一天有个cursor出来的时候，发现它给我写的就是递归。。所以才出来了这一节。

一、栈溢出
Agentic loop 可能跑几十甚至上百个 turn（复杂任务、autocompact 后继续等）。递归每 turn 消耗一帧调用栈，JavaScript/Bun 的默认栈深度有限（~10k 帧），长任务直接崩。

`while` 循环是 O(1) 栈空间，不需要担心这些问题 

二、 状态传递更清晰
递归方案里，"下一轮的状态"要么通过参数传递（函数签名越来越长），要么靠闭包捕获（隐式、难追踪）。

`while` 方案用显式的 `State` 对象 + `state = next` 赋值：

```typescript
const next: State = {
  messages: [...messagesForQuery, ...assistantMessages, ...toolResults],
  turnCount: nextTurnCount,
  // ...
}
state = next
continue  // 进入下一轮，所有状态一目了然
```

状态流转完全可见，哪里 continue、带着什么数据，一眼就能看出来。

三、错误恢复路径更简单

agent代码里有大量恢复逻辑（max_output_tokens escalate、reactive compact、stop hook retry 等），每条路径都是 `state = {...}; continue`，统一跳回循环顶部重试。

如果是递归，这些恢复路径要么尾递归、要么 `return yield* retry()`，逻辑分散且难以 reason。
 
## tool design 





## 已完成的任务 

### 参与构建自己 

- [x] 给我的博客系统加上标签系统(代码量几千行)
- [x] 将自己打包成全局使用
- [x] review自己的代码并提出改进建议。修复了2个bug
- [x] 添加对话恢复功能
- [x] 添加ctrl+c 终止而不是直接退出功能
- [x] 上下文工程
- [x] 写文章 

