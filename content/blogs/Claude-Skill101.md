---
title: "深入了解Claude Skills：AI技能扩展的新方式"
date: "2025-11-06"
---


### 什么是Claude Skills

Claude 最近推出的Skills在小范围内讨论热度很高，也有人夸赞他可能是比MCP还厉害。

Claude Skills说白了就是一组包含SKILL.md文件的目录，这个目录会包含一些执行任务需要的流程说明，脚本和资源。

SKILL.md 文件必须包含一些必要的元数据，元数据必须包含name和description，模型会将每个SKILL.md中的name和description预加载到系统提示中。 

一个简单的SKILL.md文件示例如下：
![[Pasted image 20251030204024.png]]


### 为什么说Claude Skills很厉害
Anthropic的介绍里提到Claude Skills能够定制模型的输出， 输出内容也上能够更稳定，并且允许用户根据自己的需求编写不同类型的Skills，让模型能够自主发现并执行。 

Skills的优点之一就是简单入门，只需要写一个文档就可以启动，相比起Toolcall和MCP这种更加轻量级，也更加适合大众使用。

Skills另外一大亮点是**卸载上下文**， Agent在运行时需要频繁调用一系列工具，并将每一次工具调用的返回结果塞到当前聊天窗口的上下文中，最终导致模型性能急剧变差。  

从工具调用到MCP，很多一线的Agent公司都在寻找更好的解决方案，例如Anthropic推出了技能

相比于之前的MCP，Skill.md文件只需要在模型启动时将元数据加载到上下文，不需要整个目录的所有资源文件就能够知道每个技能的描述，极大节省了Token。

在运行时，Claude会根据Bash工具来触发技能，读取Skills.md内容，如果目录内包含代码，Claude还会自行决定是否执行代码，因为在真实世界中，还有很多用代码执行才能够完成的任务，虽然模型也能够做到，但它的成本确实代码执行的好几倍，生成的内容也不能保证稳定。

技能在设计上也很简单，仅仅是一些文件，然而正是这些简单让它有更多的可能性，Github上有不少仓库收集了人们制作的技能，从数据分析到文档撰写再到代码开发.... 浏览他们可能会给你的工作也带来不少灵感， 例如以下就是两个不错的Github仓库：

**BehiSecc的收藏：** [github.com/BehiSecc/aw…](https://link.juejin.cn?target=https%3A%2F%2Fgithub.com%2FBehiSecc%2Fawesome-claude-skills "https://github.com/BehiSecc/awesome-claude-skills") 包括：CSV分析器、研究助手、YouTube转录提取器、EPUB解析器、git自动化等等。

**travisvn的收藏：** [github.com/travisvn/aw…](https://link.juejin.cn?target=https%3A%2F%2Fgithub.com%2Ftravisvn%2Fawesome-claude-skills "https://github.com/travisvn/awesome-claude-skills") 类似的风格，但更注重企业/工作流程。两者都在积极维护，老实说，仅仅是浏览这些就能给你灵感。

  
### 简单入门：如何写一个好的Skills

第一，不要“拍脑袋”写 Skill。先让 Claude 裸跑 10 组典型任务，记录它在哪里卡壳、哪一步 token 爆炸，再把“卡壳点”转成 Skill 的触发描述（description）。

**反例**：直接写“万能写作助手”，结果 8000 token 的 SKILL.md 一加载就把上下文挤爆，模型反而不会写。

第二，学会拆分Skills，把“确定性操作”全部写成可执行文件，让 Claude 调用脚本而不是阅读长段落。当你发现Skill.md文件变得过长冗余时，将内容拆分到不同的文件并在Skills.md里引用它们，Claude会自己去查找。 

第三，学习和Claude一起迭代Skills，观察Claude任务的执行情况，你可以直接让Claude反思它哪里做对哪里做错，形成一个小便签，几轮下来，这个便签可能就是最好的技能说明书。








