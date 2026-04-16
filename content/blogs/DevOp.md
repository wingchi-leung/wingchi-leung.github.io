---
title: "DevOp"
date: "2026-03-11"
---
### CICD 
流水线系统（CICD）中CI代表持续集成，CD代表持续交付 Continuous Delivery/Deployment。 这个系统主要帮助开发团队高效地完成代码编写、测试、部署等一些列过程

流水线系统的组成：
- 源代码管理：如git，用来版本控制
- 自动构建工具： 如Jenkins，Gitlab CI 等
- 自动测试工具：用于执行自动化测试，包括单元测试，集成测试等
- 部署工具： 如Docker，K8S等，用于自动化部署过程
- 监控和报告： 用于监控应用性能和健康状态 



### Docker

> Docker可以让开发者打包他们的应用以及依赖包到一个轻量级，可移植的容器中，发布到任何流行的Linux服务器上，实现轻量级虚拟化


Docker本身不是容器，是创建容器的工具，是应用容器引擎。
Docker的两句口号： 
- "Build,Ship and Run"
- "Build once, Run anywhere"

所以啥是Docker 
- Docker是一个软件，可以运行在window，linux，mac等操作系统上
- Docker是一个开源的容器引擎，基于Go开发
- Docker可以让开发者打包他们的应用以及依赖包到一个轻量级，可移植的容器中，然后发布到任何的linux机器上
- 容器完全使沙箱机制，相互之间不会有任何接口，且性能开销极低。

### Docker的入门知识
我们经常说Docker的时候，他们通常是指Docker Engine，它是一个客户端-服务器应用程序 

Docker引擎包括如下主要组件：Docker Client，Docker daemon， containerd 以及 runc 

Docker用的是C/S架构，Docker daemon 作为服务器，Docker Cli和Docker daemon进行通信

![docker](/blog_asset/docker.png)

**什么是Docker容器？**
 容器的本质是一种特殊的进程。通过Linux内核的命名空间（namespace)和控制组的技术，实现了对资源的隔离和限制。

从数据上看，Docker容器是基于Docker镜像创建的运行实例，镜像是容器的模板，包含了运行应用程序所需要的文件，依赖库。 容器是镜像的运行表现形式。

Docker的技术底座是**linux的命名空间，控制组，UnionFs**
### docker 的网络类型

**bridge** 模式
docker 默认的网络配置，可以设置IP，但是要和docker host主机的虚拟网络在同一个网段

### Dockerfile中常见的指令有哪些

``` dockerfile
# 构建镜像 （基于那个镜像)
FROM 

WORKDIR  # 创建应用目录

COPY package*.json  ./ 将package.json文件复制到工作目录

COPY ..  # 赋值原文件



MAINTAINER
RUN 
CMD  # 构建镜像时运行的指令

```

