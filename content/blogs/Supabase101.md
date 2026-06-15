---
title: "supabase 开发"
date: "2026-05-11"
tags: ["Supabase", "Backend"]
---


### Supabase 实战开发
Supabase 是个开源的Backend As Service 后端即服务。

它将几种成熟的开源技术整合在一起
- PostgreSQL： 数据库 
- PostgREST自动API： 自动将Pgsql数据库结构映射为安全的RESTful API，开发者只需要在数据库中创建表，API就自动可用
- GoTrue （身份认证）： 基于JWT的身份认证系统，管理用户注册，登录，Token刷新等等 
- Realtime（实时订阅）：基于WebSocket，允许前端即时监听数据库变化（插入，更新，删除）
- Storage文件存储：管理用户上传的文件
- EdgeFunction（边缘函数）

### 浅谈原理
在使用Supabase时要了解到几个和后端开发不一样的点：


BaaS是将数据和接口暴露给用户(区别只是暴露给用户有可能是开发者)， 传统的开发中我们会有一层服务器来负责和数据库打交道，并在上面开发鉴权和数据访问的功能。

在BaaS中，开发者就不需要开发Server了，app直接调用BaaS提供的服务，那么BaaS就需要提供机制来让开发者能够开发出具备相同鉴权能力的。


另外一个场景是 **API鉴权的功能。** 

授权的API调用是指服务端能够识别出API调用者的身份，反之就是匿名调用

这里有一个问题就是，因为BaaS没有中间的后端服务层，API Key只能配置到前端服务商，相当于这个API Key是公开的，任何人都可以看到。 那么应该怎么设计API key的安全呢？

**区分**：要区分匿名API调用和未登录API的调用


数据层上需要考虑的问题： 
-  public 数据是否允许匿名api调用？ 是否允许未登录用户访问？ 如何鉴权？
-  BaaS服务内的数据互相访问：BaaS的Auth服务可能需要读写User表，如何保证Auth服务可以访问User表的时候，保证Auth接口不会任意篡改User表？ 


**Supabase的解决方案**

给API调用分了两种key： anon key 和 service key 

- anon key：公开的key，给app用，所有人可以拿到，所以anon key的权限是受限的。一般anon（匿名）用户拥有的是最低的数据访问权限。通常不能访问任何数据。
- service key: 使用service key 调用api可以做任何事情，不受限制，因此service key只能配置给BAAS内部服务使用，这些服务是服务商自己开发的，所以是授信的 


### 核心特性

行级安全性（Row Level Security，RLS）是PgSQL的一个原生功能，提供了基于行的安全策略，限制数据库用户查看表数据权限。

在PgsqlSQL中设置RLS策略，控制用户只能独写自己的数据，后端无需判断逻辑。RLS默认是不开启的，需要针对表执行语句来开启表的RLS功能

`ALTER TABLE <NAME> ENABLE ROW LEVEL SECURITY` 

==生产环境中的表，必须都开启RLS策略。如果没开，就相当于数据库数据对所有人都是开放的。 ==

supabase 使用了RLS的方案，同时提供了三种角色： anon、authenticated 、service role

- anon是用户未登录时使用的role。  
- authenticated是用户登录后进行数据操作时使用的role。  
- service_role是供其他服务使用的role，可以绕过RLS（ 需要在创建这个role时设置为BYPASSRLS，从而RLS对该role不起作用） 

 

### 权限体系：从三个角色到 RLS 策略

#### 三个角色的分工

前面提到 Supabase 有三种角色：`anon`、`authenticated`、`service_role`。实际开发中，这三个角色对应三种不同的调用场景：

| 角色 | 谁在用 | 典型场景 |
|------|--------|----------|
| `anon` | 未登录的访客、前端直接调用 | 公开表单提交、匿名查询 |
| `authenticated` | 已登录用户 | 用户查看自己的数据、管理后台 |
| `service_role` | 你自己写的后端服务 | 内部任务处理、绕过 RLS 的批量操作 |

关键点：`service_role` 可以绕过 RLS，所以它的 key **只能放在服务端**，绝对不能出现在前端代码或客户端环境变量里。

#### RLS 策略怎么写

开启 RLS 之后，表默认对所有角色都是"拒绝"的。你需要显式写策略来开放权限。

如果这张表存的是异步分析任务，只有管理员需要查看所有任务，普通用户不需要直接读这张表：

```sql
-- 开启 RLS
alter table public.tableA enable row level security;

-- 只允许已登录用户（管理后台）查看所有任务
create policy tableA_authenticated_select
  on public.tableA
  for select
  to authenticated
  using (true);
```

`using (true)` 表示"对该角色的所有行都放行"。如果要做行级过滤，比如用户只能看自己的数据，可以写：

```sql
-- 用户只能看自己提交的数据
create policy "users_see_own_data"
  on public.tableB'
  for select
  to authenticated
  using (auth.uid() = user_id);
```

`auth.uid()` 是 Supabase 提供的内置函数，返回当前登录用户的 UUID。这个判断发生在数据库层，后端代码完全不需要写过滤逻辑。

#### 一个常见的设计模式：写开放、读受限

`tableB` 表（客户提交的表单）用的是这个模式：

```sql
-- 任何人都可以提交（INSERT）
create policy "allow_insert"
  on public.tableB
  for insert with check (true);

-- 只有登录用户（管理员）才能查看
create policy "internal_read"
  on public.tableB
  for select
  using (auth.role() = 'authenticated');
```

这样设计的原因：表单是公开的，任何访客都可以提交；但提交的内容属于业务数据，只有内部人员才能查看。`anon` 用户提交后，自己也看不到自己提交的内容——这在 B2B 场景下很常见。

#### 容易踩的坑

**没开 RLS 就上线**：Supabase 的表默认不开 RLS，这意味着任何拿到 anon key 的人都能读写你的数据。生产环境每张表都必须执行 `ALTER TABLE <name> ENABLE ROW LEVEL SECURITY`。

**开了 RLS 但忘了写策略**：开启 RLS 后，如果没有任何策略，所有操作都会被拒绝，包括你自己的后端服务（除非用 service_role）。新建表后记得同步写策略。

**service_role key 泄露**：service_role 可以绕过所有 RLS，相当于数据库超级用户。如果这个 key 出现在前端代码里，等于把数据库完全暴露了。

---

### RPC：用存储过程替代直接操作表

#### 先从一个具体问题说起

假设你在做一个 SEO 分析工具，用户填完网址点"开始分析"，后台要跑一段时间才出结果。这个流程需要：

1. 用户（未登录）提交网址，创建一条分析任务
2. 后台 Worker 拿到任务，更新进度
3. 用户轮询查询自己那条任务的状态
4. 分析完成后，同时写入任务状态和报告内容（两张表）

用直接操作表的方式，你会遇到一个死结：

- 如果给 `anon` 开 INSERT 权限，任何人都能往任务表里乱写
- 如果给 `anon` 开 SELECT 权限，任何人都能看所有人的任务
- 如果不给 `anon` 任何权限，用户根本没法提交

RLS 的粒度是"角色 × 操作 × 行过滤"，但这里的问题是：**我们需要 anon 能做一部分受控的写入，同时完全禁止他直接读表**。RLS 做不到这种"只开一扇门"的效果。

这就是 RPC 的用武之地。

#### SECURITY DEFINER：受控的权限提升

RPC 是 Supabase 对 PostgreSQL 存储过程的封装，通过 REST API 调用。关键在于函数的执行身份：

- `SECURITY INVOKER`（默认）：以调用者身份执行，受调用者的 RLS 限制
- `SECURITY DEFINER`：以函数**创建者**（postgres 超级用户）身份执行，可以绕过 RLS

类比 Linux 的 `sudo`：普通用户不能直接写 `/etc/passwd`，但可以执行 `passwd` 命令——这个命令以 root 身份运行，但它只做改密码这一件事，不会让你做其他 root 操作。`SECURITY DEFINER` 函数就是这个 `passwd`。

```sql
create or replace function public.create_analysis_job(
  p_input jsonb,
  p_mode text default 'quick'
)
returns table(job_id uuid, status_token text)
language plpgsql
security definer          -- 以 postgres 身份执行
set search_path = public  -- 防止 search_path 注入
as $$
declare
  v_id uuid;
  v_token text;
begin
  insert into public.analysis_jobs(input, mode, status)
  values (p_input, p_mode, 'queued')
  returning id, analysis_jobs.status_token into v_id, v_token;

  return query select v_id, v_token;
end;
$$;

-- 允许 anon 调用这个函数
grant execute on function public.create_analysis_job(jsonb, text) to anon, authenticated;
```

效果：`analysis_jobs` 表的 RLS 完全锁死（anon 没有任何直接操作权限），但 anon 可以调用这个函数，函数内部以 postgres 身份写入。函数本身就是那道"受控的门"——它只做创建任务这一件事。

#### status_token：无登录状态下的行级鉴权

任务创建后，用户需要查询自己那条任务的进度。但用户没有登录，`auth.uid()` 拿不到，RLS 没法做行过滤。

解决方案：创建任务时生成一个随机 token 一并返回给客户端，后续所有查询都必须带上这个 token：

```sql
-- 表里每条任务有一个随机 token（建表时自动生成）
status_token text not null default encode(gen_random_bytes(16), 'hex')

-- 查询函数：job_id + status_token 两个都对才能返回数据
create or replace function public.get_job_status(
  p_job_id uuid,
  p_status_token text
)
returns table(status text, progress int, current_step text)
language sql
security definer
as $$
  select status, progress, current_step
  from public.analysis_jobs
  where id = p_job_id
    and status_token = p_status_token;  -- 缺一不可
$$;
```

`status_token` 是 32 位随机十六进制字符串（128 bit 熵），暴力枚举不现实。这个模式叫"能力令牌"（capability token）——持有 token 就代表有权限，不需要登录账号。

适用场景：无账号的异步任务查询、邮件里的"查看报告"链接、一次性分享链接。

#### 原子性：同时写两张表

分析完成时，需要同时更新任务状态（`analysis_jobs`）和写入报告内容（`analysis_reports`）。如果分两步做，中间如果出错，会出现"任务显示完成但报告不存在"的脏数据。

放在一个函数里，PostgreSQL 保证事务原子性：

```sql
create or replace function public.complete_job(
  p_job_id uuid,
  p_status_token text,
  p_report jsonb
)
returns boolean
language plpgsql
security definer
as $$
begin
  -- 验证 token，防止伪造
  if not exists (
    select 1 from public.analysis_jobs
    where id = p_job_id and status_token = p_status_token
  ) then
    return false;
  end if;

  -- 写报告（upsert，支持重试）
  insert into public.analysis_reports(job_id, report)
  values (p_job_id, p_report)
  on conflict (job_id) do update set report = excluded.report;

  -- 更新任务状态
  update public.analysis_jobs
  set status = 'completed', progress = 100, finished_at = now()
  where id = p_job_id and status_token = p_status_token;

  return true;
end;
$$;
```

两个写操作在同一个事务里，要么都成功，要么都回滚。

#### RPC 的调用方式

Supabase 把 RPC 暴露为 REST 端点，路径是 `/rest/v1/rpc/{函数名}`，用 POST 调用：

```typescript
async function callRpc<T>(anonKey: string, fnName: string, params: object): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });
  return res.json();
}

// 创建任务，拿到 job_id 和 status_token
const [{ job_id, status_token }] = await callRpc(
  anonKey,
  'create_analysis_job',
  { p_input: { url: 'https://example.com' }, p_mode: 'quick' }
);
```

注意用的是 `anon key`，不是 `service_role key`。权限提升由 `SECURITY DEFINER` 在数据库内部处理，调用方不需要知道细节。

#### 什么时候用 RPC

| 场景 | 推荐方式 |
|------|----------|
| 简单 CRUD，权限好控制 | 直接操作表 + RLS |
| 匿名用户需要受限写入 | RPC + SECURITY DEFINER |
| 需要同时写多张表（原子性） | RPC |
| 复杂状态机（校验当前状态再转换） | RPC |
| 需要返回聚合数据（JOIN 多表） | RPC 或视图 |

参考文章：
- [Supabase 原理与安全设计](https://zhuanlan.zhihu.com/p/654212599)
- [Row Level Security - Supabase 官方文档](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Database Functions - Supabase 官方文档](https://supabase.com/docs/guides/database/functions)
- [PostgreSQL SECURITY DEFINER](https://www.postgresql.org/docs/current/sql-createfunction.html)