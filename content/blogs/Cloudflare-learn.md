---
title: "Cloudflare 全家桶实战"
date: "2026-05-14"
---

# Cloudflare 全家桶：从懵懂到全景

 
---

## Cloudflare 是什么

大多数人知道 Cloudflare 是"CDN + 防 DDoS"，这没错，但那只是它的起点。

现在的 Cloudflare 更像是一个**遍布全球的计算网络**，它在全球 330+ 个城市有数据中心。你的代码、你的数据库、你的缓存，都可以跑在这张网络上——不是跑在某一个城市，而是同时跑在离每个用户最近的地方。

这就是"边缘计算"（Edge Computing）的核心意思：**计算不发生在遥远的某个机房，而是发生在离用户最近的节点**。

类比一下：
- 传统服务器 = 你在北京开了一家总店，全国用户都要连到北京来点餐
- Cloudflare Edge = 你在每个城市都开了分店，用户在哪，店就在哪



---

## 全景图：Cloudflare 的产品分层



```
┌─────────────────────────────────────────────────────────────┐
│                     你的域名 / HTTPS                         │
│              (DNS + SSL/TLS + CDN，Cloudflare 免费提供)       │
└────────────────────────┬────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
         ▼               ▼               ▼
   ┌──────────┐   ┌─────────────┐  ┌──────────────┐
   │  Pages   │   │   Workers   │  │  其他服务     │
   │ (前端+函数)│   │  (纯后端)   │  │ R2/D1/Queue  │
   └────┬─────┘   └──────┬──────┘  └──────────────┘
        │                │
        ▼                ▼
   ┌──────────────────────────┐
   │    存储与状态层           │
   │  KV / D1 / R2 / DO      │
   └──────────────────────────┘
```

本文涉及的产品：
- **Cloudflare Pages** — 网站本身部署在这里
- **Pages Functions** — 网站里的 `/api/*` 接口跑在这里
- **Workers** — 一个独立的后端微服务
- **KV** — 两个用途：AI 补全缓存 + 接口限流计数器
- **wrangler** — 部署和管理这一切的命令行工具

---

## 一、边缘函数是什么意思（最基础的概念）

### 传统的请求路径

你打开一个网页，点了一个按钮，它发出一个 API 请求。传统架构下：

```
你的浏览器（北京）
     │
     │  请求跨越大半个地球
     ▼
AWS us-east-1（弗吉尼亚）
     │
     │  跑完代码，结果再飞回来
     ▼
你的浏览器（北京）
```

延迟可能 300ms+，全在网络传输上。

### 边缘函数的路径

```
你的浏览器（北京）
     │
     │  就近请求，延迟极低
     ▼
Cloudflare 北京节点
     │  代码在这里直接跑
     ▼
你的浏览器（北京）
```

**代码不是跑在某个固定服务器上，而是"被复制"到离用户最近的节点上运行**。这就是边缘函数。

### Cloudflare 怎么做到的：V8 Isolate

Cloudflare Workers 用的不是传统的 Node.js，而是 **V8 Isolate**——就是 Chrome 浏览器里的那个 JS 引擎，被 Cloudflare 单独拿出来用。

两者的本质区别：

| | 传统 Serverless (AWS Lambda) | Cloudflare Workers |
|---|---|---|
| 运行环境 | 完整的 Node.js 容器 | 轻量 V8 沙盒 |
| 冷启动 | 100ms ~ 2s | ~0ms，几乎无感 |
| 内存占用 | 50MB+ | ~3MB |
| 运行位置 | 单个区域 | 全球 330+ 节点 |
| Node.js API | 完整支持 | 不支持（只有 Web API） |

代价是：你不能用 `fs`、`child_process` 这些 Node.js 专属 API，只能用 Web 标准 API（Fetch、Streams、WebCrypto 等）。

举个例子，哈希计算在 Workers 里要用 Web Crypto API：

```typescript
// ✅ 在 Pages Function / Worker 里能用（Web Crypto API）
const buf = await crypto.subtle.digest(
  'SHA-256',
  new TextEncoder().encode('some-string')
);

// ❌ 不能用（Node.js 专属）
// import crypto from 'crypto';
// crypto.createHash('sha256').update('some-string').digest('hex');
```

---

## 二、Pages 和 Workers 区别

这是最容易绕的地方。两个都用了，到底有什么区别？

### 简单来说

> **Pages = 前端托管 + 内置边缘函数；**
> **Workers = 纯后端边缘服务**

两者底层用的是**同一套运行时**（都是 V8 Isolate），但面向的场景不同。

### Cloudflare Pages

Pages 是专门为前端项目设计的部署平台，对标 Vercel / Netlify。

push 代码到 GitHub → Cloudflare 自动拉取 → 构建 → 全球部署。

它做的事情：
1. 托管你的静态文件（HTML、CSS、JS、图片）
2. 每个 PR 自动生成一个预览 URL（`xxx.your-project.pages.dev`）
3. 通过 `/functions` 目录，自动把你的 TypeScript 文件变成边缘 API

### Pages Functions 是什么

这是最容易让人困惑的地方，单独说清楚。

Next.js 本来有自己的后端方案（`app/api/` 里的 Route Handlers），但那套东西跑在 Node.js 上，Cloudflare Pages 不支持 Node.js 运行时。

所以我们主动选择了另一条路：

- 把 Next.js 配置成**纯静态导出**（`output: 'export'`）——只输出 HTML/CSS/JS，不要任何服务端逻辑
- 后端接口全部手写成 **Pages Functions**，放在 `functions/` 目录里

这是一个主动的架构选择，不是 Cloudflare 自动帮你做的。代价是不能用 Next.js 的 SSR、Server Components 这些服务端特性；换来的是部署在 Cloudflare 边缘、全球低延迟、免费额度很大。

**目录结构上，两套东西完全独立：**

```
your-project/
├── src/                        ← Next.js 前端（React 组件、页面）
│   └── app/
│       └── page.tsx
│
├── functions/                  ← Pages Functions（和 Next.js 无关）
│   └── api/
│       ├── complete.ts         ← 自动变成 /api/complete 接口
│       ├── prefill.ts          ← 自动变成 /api/prefill 接口
│       └── jobs/
│           └── start.ts        ← 自动变成 /api/jobs/start 接口
│
├── _headers                    ← CDN 层的响应头配置
└── wrangler.toml
```

文件路径就是 URL 路径，不需要配置路由。构建时两套分别处理：

```
next build  →  把 src/ 编译成静态 HTML/JS/CSS
wrangler    →  把 functions/ 里每个 .ts 文件编译成边缘函数
```

部署后都在同一个域名下：
- `your-site.com/` → 走静态文件（Next.js 构建产物）
- `your-site.com/api/*` → 走 Pages Functions

所以前端代码里写 `fetch('/api/complete', ...)` 打到的是 `functions/api/complete.ts`，和 Next.js 没有任何关系。

**一个最简单的 Pages Function：**

```typescript
// functions/api/hello.ts
// 这个文件部署后，GET /api/hello 就能用了
export const onRequestGet = async ({ request, env }) => {
  return Response.json({ message: 'hello world' });
};

// POST /api/hello
export const onRequestPost = async ({ request, env }) => {
  const body = await request.json();
  // env.AI_CACHE 是 wrangler.toml 里声明的 KV binding
  await env.AI_CACHE.put('last-request', JSON.stringify(body));
  return Response.json({ received: body });
};
```

**`_headers` 和 `_redirects` 是另一回事**

这两个文件和 Pages Functions 是不同层面的东西：

- `_headers` / `_redirects` — 在 Cloudflare 的 CDN 层处理，连代码都不跑，纯配置。适合"所有页面都加这个响应头"这种全局规则。
- Pages Functions — 在边缘节点上跑真正的代码，可以读请求体、调数据库、返回动态内容。

类比：`_headers` 像 nginx 的配置文件，Pages Functions 像 nginx 后面的应用服务器。

```
# _headers 文件——全局给所有响应加安全头，不需要写代码
/*
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
```

### Cloudflare Workers

Workers 是纯后端——没有前端，就是一个可以跑在边缘的服务端程序。

比如一个独立的 AI 推理服务（`my-worker.my-account.workers.dev`），专门做调 LLM、处理复杂逻辑这类重活，被主站的 Pages Functions 调用。

可以把它理解成一个**部署在 Cloudflare 上的微服务**。

### 关系图

```
your-site.com（Cloudflare Pages）
     │
     │  用户访问前端
     ▼
Pages Functions（/api/complete 等）
     │
     │  调用重逻辑服务
     ▼
my-worker-service（Cloudflare Worker）
     │
     │  调用 AI 模型
     ▼
OpenAI / DeepSeek API
```

**总结：Pages 管"前端 + 轻 API"，Workers 管"独立后端服务"，本质是同一种运行时，只是部署方式和职责不同。**

---

## 三、KV：为什么不直接用数据库？

KV 和关系型数据库同时存在不是竞争关系，而是各自做最擅长的事。

### KV 是什么

KV（Key-Value Store）是一个全球分布式的键值存储，你可以把它想象成一个**超级快的全球 Redis**，但有一个很重要的特性：**读极快，写慢且最终一致**。

"最终一致"的意思是：你在一个节点写入一个值，全球其他节点可能需要最多 60 秒才能看到这个新值。

### 两者的核心区别

| | Cloudflare KV | 关系型数据库（PostgreSQL 等） |
|---|---|---|
| 数据结构 | 键 → 值（字符串/二进制） | 表、行、列，支持关联查询 |
| 读速度 | 极快（就近缓存，<1ms） | 较快，但有网络往返 |
| 写一致性 | 最终一致（~60s 全球同步） | 强一致（ACID） |
| 支持复杂查询 | 不支持（只能按 key 取） | 支持（SQL、JOIN、聚合） |
| 典型用途 | 缓存、限流计数器、配置 | 业务数据、用户数据、报告 |

### 我们的实际用法

**场景一： 1：AI 补全结果缓存**

用户输入相同的内容时，不需要再调 LLM，直接从 KV 里拿上次的结果，缓存 1 小时：

```typescript
// 用输入内容的 SHA-256 作为缓存 key，保证相同输入命中同一条缓存
async function makeCacheKey(fieldName: string, prefix: string, ctxHash: string) {
  const composite = `${fieldName}${prefix}${ctxHash}`;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(composite));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Pages Function 入口，env.AI_CACHE 是 wrangler.toml 里声明的 KV binding
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = await request.json();
  const cacheKey = await makeCacheKey(body.field_name, body.prefix, body.ctx_hash);

  // 先查缓存
  const cached = await env.AI_CACHE.get(cacheKey, 'text');
  if (cached) {
    return new Response(cached, { headers: { 'Content-Type': 'application/json' } });
  }

  // 缓存未命中，调 LLM ...
  const result = await callLLM(body, env);

  // 写入缓存，1 小时后自动过期
  await env.AI_CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: 3600 });

  return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
};
```

为什么不用数据库做缓存？因为这是**纯读多写少的缓存场景**，KV 的毫秒级读速度比每次发一个 SQL 查询快得多，而且 TTL 自动过期非常方便。

**用途 2：接口限流**

限制每个 IP 每分钟最多 60 次请求、每个 session 最多 30 次：

```typescript
const IP_LIMIT = 60;
const SESSION_LIMIT = 30;
const WINDOW_SECONDS = 60;

async function increment(kv: KVNamespace, key: string, limit: number) {
  const raw = await kv.get(key);
  const count = (raw ? parseInt(raw, 10) : 0) + 1;
  // 每次自增都重置 TTL，实现滑动窗口（简单但够用）
  await kv.put(key, String(count), { expirationTtl: WINDOW_SECONDS });
  return { count, limited: count > limit };
}

export async function checkRateLimit(kv: KVNamespace, ip: string, sessionId?: string) {
  const ipResult = await increment(kv, `rl:ip:${ip}`, IP_LIMIT);
  if (ipResult.limited) return { allowed: false, reason: 'ip_limit' };

  if (sessionId) {
    const sessionResult = await increment(kv, `rl:session:${sessionId}`, SESSION_LIMIT);
    if (sessionResult.limited) return { allowed: false, reason: 'session_limit' };
  }

  return { allowed: true };
}
```

注意：KV 是最终一致的，所以这个限流是"尽力而为"，不是绝对精确的硬限制——但对于防止意外超额调用 AI API 的场景，够用了。

**为什么不用数据库做限流？** 因为限流需要在每个请求里同步读写计数器，对延迟要求极高。每次都要跨网络查数据库太慢。KV 就在边缘节点上，读写在几毫秒内完成。

### 什么时候用数据库（而不是 KV）

- 数据有结构，需要查询（比如异步任务状态、报告内容）
- 需要事务（比如用户注册、订单）
- 数据需要长期保存且不能丢（KV 的"最终一致"意味着极端情况下可能丢写入）

异步任务表（`jobs`）这类业务数据就应该放数据库——需要可查询、可关联，不是缓存。

---

## 四、Containers：在边缘跑 Docker 容器

Workers 有一个根本限制：不能用 Node.js 全量 API，不能跑需要原生二进制的包（比如 Sharp 图片处理、Puppeteer、ffmpeg），也无法运行 Python。

Cloudflare Containers（2025 年推出）填补了这个空白。它让你把一个标准 Docker 镜像部署到 Cloudflare 的边缘网络，和 Workers / Pages Functions 协作。

### 典型模式：Pages Function 作入口，Container 做重活

```
用户请求
   │
   ▼
Pages Function（鉴权、参数校验、立刻返回 202）
   │  fire-and-forget，不等结果
   ▼
Container（跑 Python / Node.js 全量 / 任意语言，3-5 分钟重计算）
   │  完成后直接写数据库
   ▼
数据库（存结果）
```

这个模式的关键是 **fire-and-forget**：Pages Function 把任务发给 Container 后立刻给用户返回 `202 Accepted`，不阻塞用户等待。Container 在后台慢慢跑，跑完自己把结果写进数据库。

实际代码长这样：

```typescript
// Pages Function: POST /api/jobs/start
export const onRequestPost: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  const { job_id } = await request.json();

  // 先把状态标记为 running，防止重复触发
  await db.patch(job_id, { status: 'running', started_at: new Date().toISOString() });

  // fire-and-forget：把 fetch 丢进 waitUntil
  // Cloudflare 会保持这个 fetch 连接直到 Container 收到请求，
  // 但不会等 Container 跑完（可能要几分钟）
  waitUntil(
    fetch(`${env.CONTAINER_URL}/run-job`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id }),
    }).catch(async (err) => {
      // Container 调用失败时回写错误状态
      await db.patch(job_id, { status: 'failed', error: err.message });
    })
  );

  // 立刻返回，用户不用等
  return Response.json({ job_id, status: 'running' }, { status: 202 });
};
```

`ctx.waitUntil` 是这里的关键 API：它告诉 Cloudflare"这个 Promise 还没完，请保持这个 Worker 实例活着"——但不会阻塞给用户的响应。没有它，Worker 在 `return` 之后就会被销毁，fetch 请求也会被中断。

### 并发控制

Container 的计算资源有限，需要在 Pages Function 层做并发门控，避免同时触发太多任务：

```typescript
const runningCount = await db.count({ status: 'running' });
const MAX_CONCURRENT = 2; // 和 Container 内部的信号量保持一致

if (runningCount >= MAX_CONCURRENT) {
  return Response.json({
    error: '队列繁忙，请稍后重试',
    retry_after_seconds: 180,
  }, { status: 503 });
}
```

这两个数字要同步改——Pages Function 这边放行了，Container 那边又拒绝，逻辑会乱。

### 和普通云服务器的区别

Container 仍然是按需启动、全球分布的，不是一台一直开着的机器。冷启动（Container 从零启动）大约需要几秒到十几秒，所以适合能接受一定延迟的异步任务，不适合要求毫秒响应的同步接口。

---

## 五、wrangler：部署这一切的工具

### wrangler 是什么

wrangler 是 Cloudflare 的官方命令行工具，类似于：
- AWS 的 `aws` CLI
- Vercel 的 `vercel` CLI
- Heroku 的 `heroku` CLI

你用它来本地开发、管理资源、和部署。

### wrangler.toml：项目的"配置说明书"

`wrangler.toml` 是项目根目录下的配置文件，告诉 Cloudflare 这个项目是什么、用了哪些资源。

```toml
name = "my-project"               # 项目名
compatibility_date = "2026-03-16"  # 锁定运行时版本，防止 CF 升级破坏你的代码

[vars]
# 明文环境变量（非敏感，可以提交到 git）
WORKER_SERVICE_URL = "https://my-worker-service.my-account.workers.dev"
DB_URL = "https://xxxxxxxxxxxxxxxxxxxx.example.com"

# 声明 KV 绑定——这告诉 CF：在代码里用 env.AI_CACHE 就能访问这个 KV
[[kv_namespaces]]
binding = "AI_CACHE"
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

[[kv_namespaces]]
binding = "RATE_LIMIT"
id = "yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy"

# 生产环境单独配置（覆盖上面的默认值）
[env.production.vars]
DB_URL = "https://zzzzzzzzzzzzzzzzzzzz.example.com"
```

**"binding"是关键概念**：你在 CF 控制台创建了一个 KV namespace，得到一个 ID，然后在 `wrangler.toml` 里给它起个绑定名（binding），代码里就用这个名字访问。就像给一个陌生人起了个你认识的名字。

```typescript
// 代码里这样用，不需要知道 KV 的真实 ID
const cached = await env.AI_CACHE.get(cacheKey);
```

### 敏感信息怎么管

`[vars]` 里的变量是明文，会进 git。API Key、数据库密码这类敏感信息不能放这里，要用：

```bash
wrangler secret put LLM_API_KEY
# 会提示你输入值，加密存储在 Cloudflare，不落 git
```

代码里访问方式一样：`env.LLM_API_KEY`

### 多环境（staging / production）

`wrangler.toml` 支持 `[env.xxx]` 分环境配置：

```bash
# 部署到 staging（默认）
wrangler pages deploy

# 部署到 production
wrangler pages deploy --env production
```

实际部署更多是通过 git push 触发 Pages 的 CI/CD，而不是手动跑 wrangler deploy——但 wrangler 在本地开发和管理资源（创建 KV、查看 log）时非常常用。

### 常用命令

```bash
# 本地开发（模拟 CF 环境，包括 KV 绑定）
wrangler dev

# 查看线上实时日志
wrangler tail

# 向 KV 里写一个值（调试用）
wrangler kv key put --binding=AI_CACHE "test-key" "test-value"

# 查看 Secrets 列表（不会显示值）
wrangler secret list

# 手动部署
wrangler pages deploy ./out
```

---

## 六、全家桶地图：其他值得知道的产品

看完前五节，再来看 Cloudflare 的其他产品，就能快速判断"这个东西是干什么的，什么时候可能会用到"。

### R2：对象存储（对标 AWS S3）

存文件用的。图片、PDF、视频、导出的报告文件。

和 S3 不同的是：**R2 不收出口流量费**（egress free）。如果你的应用需要大量读取文件，R2 比 S3 便宜很多。

典型场景：报告生成后，PDF 文件存到 R2，而不是塞进数据库字段里。

### D1：边缘 SQLite 数据库

一个跑在边缘节点上的 SQLite，支持完整 SQL 语法。

如果项目完全在 CF 生态里（不用外部数据库），D1 是不错的选择。如果已经有 PostgreSQL，混用意义不大——但纯新项目用 D1 + Pages + Workers 可以完全不依赖外部数据库。

### Durable Objects：有状态的边缘计算

普通的 Workers/Pages Functions 是无状态的——每次请求都是一个新的沙盒，请求结束后什么都不保留。Durable Objects 解决"需要在边缘维持状态"的问题，比如：
- 实时协作（多个用户同时编辑一个文档）
- WebSocket 聊天室
- 精确限流计数器（不同于 KV 的最终一致，DO 是强一致的）

用 KV 做限流是"尽力而为"。如果需要严格限流，应该用 Durable Objects。

### Queues：消息队列

处理异步任务用的。比如报告生成这种重任务——用户提交请求后立刻返回，把生成任务丢进队列，后台异步处理。

```typescript
// 换成 Queues 后：立刻返回 job_id，后台异步处理
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = await request.json();
  const jobId = crypto.randomUUID();
  await env.REPORT_QUEUE.send({ jobId, ...body }); // 丢进队列，立刻返回
  return Response.json({ jobId, status: 'queued' });
};
```

### AI Gateway：AI 调用的代理层

在你的代码和 OpenAI/Claude/DeepSeek 之间加一层 CF 代理：
- 统一记录所有 AI 调用的日志和费用
- 缓存相同的请求（省钱）
- 限流和重试

直接调外部 LLM API 的项目，调用量变大后 AI Gateway 是个很值得加的一层。

### Workers AI：在边缘跑开源模型

Cloudflare 自己提供的推理服务，可以直接在 Workers 里调用 Llama、Mistral 等开源模型，不需要外部 API。延迟极低，但模型选择少、质量不如 GPT-4 系列。适合做简单分类、摘要这类对模型能力要求不高的任务。

---

## 总结：选哪个产品用哪个

```
场景                           → 用什么
─────────────────────────────────────────────────────
部署前端网站                   → Cloudflare Pages
API 接口（跟前端在一起）        → Pages Functions
独立后端微服务                  → Workers
缓存 / 限流 / 配置              → KV
长时间重计算（Python / Docker） → Containers
文件存储（图片、PDF）           → R2
结构化业务数据                  → 关系型数据库（D1 / PostgreSQL）
实时状态 / WebSocket           → Durable Objects
异步任务队列                    → Queues
AI 调用统一代理                 → AI Gateway
边缘跑开源模型                  → Workers AI
```

典型的"Pages + Workers + KV + Containers"组合，随着业务发展，R2 和 Queues 最可能是下一个加入的。

---

*参考：[Cloudflare Pages 文档](https://developers.cloudflare.com/pages/) · [Workers 文档](https://developers.cloudflare.com/workers/) · [KV 文档](https://developers.cloudflare.com/kv/) · [Containers 文档](https://developers.cloudflare.com/containers/) · [Wrangler 文档](https://developers.cloudflare.com/workers/wrangler/)*
