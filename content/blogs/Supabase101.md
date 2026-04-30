### Supabase 介绍  
Supabase 是个开源的Backend As Service 后端即服务。

它将几种成熟的开源技术整合在一起
- PostgreSQL： 数据库 
- PostgREST自动API： 自动将Pgsql数据库结构映射为安全的RESTful API，开发者只需要在数据库中创建表，API就自动可用
- GoTrue （身份认证）： 基于JWT的身份认证系统，管理用户注册，登录，Token刷新等等 
- Realtime（实时订阅）：基于WebSocket，允许前端即时监听数据库变化（插入，更新，删除）
- Storage文件存储：管理用户上传的文件
- EdgeFunction（边缘函数）

### 浅谈原理
在使用Supabase时要了解到几个和后端开发不一样的点，BaaS是直接将数据和接口暴露给用户(区别只是暴露给用户有可能是开发者)， 传统的开发中我们会有一层服务器来负责和数据库打交道，并在上面开发鉴权和数据访问的功能。

在BaaS中，开发者就不需要开发Server了，app直接调用BaaS提供的服务，那么BaaS就需要提供机制来让开发者能够开发出具备相同鉴权能力的。

另外一个场景是 **API鉴权的功能。** 

授权的API调用是指服务端能够识别出API调用者的身份，反之就是匿名调用

这里有一个问题就是，因为BaaS没有中间的后端服务层，API Key只能配置到前段服务商，相当于这个API Key是公开的，任何人都可以看到。 那么应该怎么设计API key的安全呢？

**区分**：要区分匿名API调用和未登录API的调用


数据层上需要考虑的问题： 
-  public 数据是否允许匿名api调用？ 是否允许未登录用户访问？ 如何鉴权？
- BaaS服务间的数据互相访问：BaaS的Auth服务可能需要读写User表，如何保证Auth服务可以访问User表的时候，保证Auth接口不会任意篡改User表？ 


**Supabase的解决方案**

给API调用分了两种key： anon key 和 service key 

- anon key：公开的key，给app用，所有人可以拿到，所以anon key的权限是受限的
- service key: 使用service key 调用api可以做任何事情，不受限制，因此service key只能配置给BAAS内部服务使用，这些服务是服务商自己开发的，所以是授信的 

### 核心特性

行级安全性（Row Level Security，RLS）是PgSQL的一个原生功能，提供了基于行的安全策略，限制数据库用户查看表数据权限。

在PgsqlSQL中设置RLS策略，控制用户只能独写自己的数据，后端无需判断逻辑。RLS默认是不开启的，需要针对表执行语句来开启表的RLS功能

`ALTER TABLE <NAME> ENABLE ROW LEVEL SECURITY` 

==生产环境中的表，必须都开启RLS策略。如果没开，就相当于数据库数据对所有人都是开放的。 ==

supabase 使用了RLS的方案，同时提供了三种角色： anon、authenticated 、service role

- anon是用户未登录时使用的role。  
- authenticated是用户登录后进行数据操作时使用的role。  
- service_role是供其他服务使用的role，可以绕过RLS（感觉不是程序实现的，需要在创建这个role时设置为BYPASSRLS，从而RLS对该role不起作用） 



参考文章：
https://zhuanlan.zhihu.com/p/654212599