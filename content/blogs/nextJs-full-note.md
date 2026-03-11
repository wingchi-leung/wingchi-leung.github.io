---
title: "NextJS终极手册"
date: "2025-03-24"
---
### 什么是nextjs
nextjs是一个基于react的全栈开发框架，由vercel开发和维护，它在react的基础上提供了额外的功能和优化，
如服务器组件Server Components，流式渲染 Streaming ，服务器操作等 Server Actions

### nextjs有哪些主要特性，这些特性如何提升开发体验？ 
- React Server Component ： 默认使用服务器组件，减少客户端js体积，提升性能
- App Router ：基于文件夹的路由系统，支持布局，加载状态和错误处理，简化路由管理
- 服务器操作Server Actions ：直接在组建中定义服务器端逻辑，无需创建api路由
- turbopack：基于Rust的打包工具，提供更快的开发体验和热加载
- 内置优化： 自动图像，字体和脚本的优化，无需额外配置
- SEO优化：内置元数据的API和架构化数据支持
- 国际化路由：内置多语言支持，简化国际应用开发
- Middleware : 请求处理中间件，实现认证，重定向等功能

### 布局和模板
在nextjs中布局是多个路由之间共享的UI，如导航栏，布局会保持状态，保持交互性，不会重新渲染，布局还可以嵌套 

#### App Router

App Router是Next.js 13+引入的基于文件夹的路由系统，它使用约定式路由，通过文件夹结构自动创建路由：

**核心概念**: 使用app目录组织路由结构，每个路由段对应一个文件夹

**特殊文件约定:**

- page.js: 定义路由UI和公开访问点
- layout.js: 定义共享布局，可嵌套
- loading.js: 创建加载UI，自动集成Suspense
- error.js: 处理错误，自动集成Error Boundary
- not-found.js: 处理404错误

### RSC 
React Server Component是React设计的一种新架构，它对页面加载性能，包大小，以及React应用程序的编写方式产生巨大的影响

传统的React组件需要在客户端上执行js，RSC直接输出静态内容， 比如html或者jsx树，减少了bundle大小和客户端负载
为什么需要rsc？ 就以博客页面来说，文章内容从数据库拉，评论列表也是服务器取，如果全部使用客户端组件，浏览器就得下载所有代码再
fetch数据。 RSC让服务器直接处理这些，浏览器只管交互的部分。 

### SSR、SSG、ISR 
 - SSR （Server-Side Rending） 指服务端将React组件渲染成HTML字符串，并传输到浏览器展示，利用SSR可以加快首屏渲染速度，提高SEO 
 - SSG （Static Site Generation) ，构建时预渲染应用，生成静态的HTML文件，并在请求的时候直接返回文件，使用SSG可以加快页面加载速度，减轻服务器压力
 - ISR （Incremental Static Regeneration）增量静态再生：在构建时部分预渲染，同时在用户请求时动态渲染的技术，它根据一定的规则将预渲染的页面分为小块，并进行缓存。



### use Client
use Client 用于将某个nextjs组件或者页面文件标记成客户端组件
说明：
- 该页面在客户端运行，可以使用客户端的功能，如useState，useEffect
- 不能直接访问服务器端的上下文或者执行服务器端的异步操作


### generateStaticParams 
generateStaticParams是一个服务端函数，用来生成动态路由的静态函数
- 在构建时运行，用于生成动态路由的所有可能的路径。
- 只能在服务端运行，不能在客户端运行
- 通常会和静态生成SSG一起使用， 用于渲染动态路由页面



