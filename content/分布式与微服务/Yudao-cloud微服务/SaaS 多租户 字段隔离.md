---
tags:
  - Java
  - Yudao
  - 多租户
  - SaaS
  - MyBatisPlus
date: 2026-09-06
source: 芋道 ruoyi-vue-pro 开发指南 - 后端手册 - SaaS 多租户【字段隔离】
title: "SaaS 多租户【字段隔离】"
---

# SaaS 多租户【字段隔离】

> **一句话概括**：多租户 = 一套系统同时服务多家公司，各家公司的数据互相看不见。**字段隔离（COLUMN 模式）= 大家共用同一张表，靠每一行数据上的 `tenant_id` 字段来区分"这行数据是谁的"**，数据库在背后自动给你的每条 SQL 加上 `WHERE tenant_id = ?`。

**适合谁读**：要做 SaaS 系统的人、接手芋道项目被 `tenant_id` 搞晕的人、面试被问"多租户怎么实现"的人。
**怎么读**：先读「零」建立画面感，再读「一」搞懂 8 层封装，最后「三」的坑位是血泪经验。

---

## 零、先建立整体印象：一栋写字楼的三种分法

假设你有一栋写字楼，要租给很多家公司。怎么让 A 公司的人看不到 B 公司的东西？

| 隔离方案 | 写字楼类比 | 数据库做法 | 隔离度 | 成本 |
|---|---|---|---|---|
| **DATASOURCE** | 给每家公司**单独盖一栋楼** | 一个租户一个数据库 | ⭐⭐⭐ 最高 | 💰💰💰 最贵 |
| **SCHEMA** | 一栋楼里，每家公司**独占一层** | 共享数据库，一个租户一套表 | ⭐⭐ 中等 | 💰💰 中等 |
| **COLUMN**（本篇） | 一个**大开间**，每人**工牌上写公司名**，保安只放行到本公司的工位 | 共享数据库、共享表，靠 `tenant_id` 字段区分 | ⭐ 最低 | 💰 最便宜 |

**芋道的选择**：

- ✅ **支持** DATASOURCE 和 COLUMN 两种（最主流的两个）
- ❌ **不支持** SCHEMA —— 优点不明显、缺点很明显（跨租户统计难、故障恢复会牵连别人、复杂 SQL 支持差）

> 芋道官方原话：*"一般情况下，可以考虑采用 COLUMN 模式，开发、运维简单，以最少的服务器为最多的租户提供服务。"*

**本篇讲 COLUMN，[[SaaS 多租户 数据库隔离]] 讲 DATASOURCE。**

### 三种方案的优缺点，说人话版

**DATASOURCE（独立数据库）**
- 优点：隔离最彻底，某租户要定制字段随便改，出故障恢复简单（只恢复它自己的库）
- 缺点：100 个租户 = 100 个库，运维会疯，成本爆炸

**SCHEMA（独立表）**
- 优点：比共享表安全一点，一个库能塞更多租户
- 缺点：恢复数据时必然牵连其他租户；跨租户统计（比如"全平台总营收"）很痛苦

**COLUMN（共享表 + tenant_id）**
- 优点：成本最低，一个库能服务最多租户，改表结构一次全生效
- 缺点：**所有安全都押在"SQL 有没有自动拼 tenant_id"上**，一条漏网的 SQL 就串数据了；备份恢复最困难（得逐表逐行筛）

💡 **所以 COLUMN 模式的核心风险是：你必须保证 100% 的 SQL 都被自动加了租户条件。** 这就是芋道做那一整套封装的原因。

---

## 一、原理篇：芋道是怎么"偷偷"给你加 WHERE 的

### 1.1 整体架构：一个 starter，包了 8 个层面

核心组件：`yudao-spring-boot-starter-biz-tenant`

它做了**透明化**的多租户能力 —— 什么叫透明？就是**你写业务代码时基本不用管租户这回事**，框架在下面这些地方都帮你处理好了：

```
前端请求
   │ Header: tenant-id = 102
   ▼
┌─────────────────────────────────────────┐
│ ① Web 层     过滤器读出 tenant-id，放进 TenantContextHolder（ThreadLocal）
│ ② Security 层 校验"这个用户真的属于 102 号租户吗"（防越权）
│ ③ DB 层      自动给你的 SQL 拼上 WHERE tenant_id = 102
│ ④ Redis 层   自动给你的 Redis Key 加上 :t102 后缀
│ ⑤ AOP 层     @TenantIgnore 让你能"临时关掉"租户过滤
│ ⑥ Job 层     @TenantJob 让定时任务遍历所有租户各跑一遍
│ ⑦ MQ 层      发消息时带上租户号，消费时还原租户号
│ ⑧ Async 层   异步线程里租户号不丢失（TransmittableThreadLocal）
└─────────────────────────────────────────┘
```

### 1.2 租户上下文：TenantContextHolder

**租户上下文 = 一个 ThreadLocal 盒子**，里面装着"当前这个请求是哪个租户的"。

```java
// 底层就是 ThreadLocal，和 ThreadLocal = 每个线程独有的便签纸 一个道理
public class TenantContextHolder {
    private static final ThreadLocal<Long> TENANT_ID = new TransmittableThreadLocal<>();

    public static Long getTenantId() { return TENANT_ID.get(); }
    public static void setTenantId(Long tenantId) { TENANT_ID.set(tenantId); }
    public static void clear() { TENANT_ID.remove(); }
}
```

⚠️ **官方特别强调：绝大多数情况下你根本不需要手动调用它。** 框架已经全包了，你手写反而是给自己挖坑（比如在异步场景漏清理导致线程池污染）。

### 1.3 Web 层【重要】：前端每个请求必须带 tenant-id

默认情况下，前端的每个请求 Header **必须带上 `tenant-id`**，值是 `system_tenant` 表的主键编号。

```http
POST /admin-api/system/user/page HTTP/1.1
tenant-id: 102
Authorization: Bearer xxx
```

**不带会怎样？** 直接报错：*"租户的请求未传递，请进行排查"*。

如果你有某些接口不需要租户（比如登录页查询租户列表），配 `ignore-urls`：

```yaml
yudao:
  tenant:
    enable: true                    # 后端开关
    ignore-urls:                    # 这些 URL 不需要带 tenant-id 请求头
      - /admin-api/system/tenant/get-id-by-name
      - /admin-api/system/captcha/get
      - /admin-api/system/auth/login
```

### 1.4 Security 层：防越权

光有 `tenant-id: 102` 还不够 —— **万一有人手动把 header 改成 103 呢？**

所以 Security 层会校验：**当前登录的用户，是不是真的属于 102 号租户**。不属于就直接拒绝。

> 这就是"你可以随便改请求头，但你改不了服务端校验"的道理。类比：你可以在工牌上印"我是 CEO"，但门禁系统刷的是数据库里的记录。

### 1.5 DB 层【重要】：自动拼 WHERE tenant_id = ?

这是 COLUMN 模式的核心。基于 **MyBatis Plus 自带的多租户插件**实现，原理是 MyBatis 的拦截器在执行 SQL 前改写它。

**你写的 SQL**：
```sql
SELECT * FROM system_role WHERE name LIKE '%管理员%'
```

**实际执行的 SQL**：
```sql
SELECT * FROM system_role WHERE name LIKE '%管理员%' AND tenant_id = 102
--                                                    ^^^^^^^^^^^^^^^^^^^^ 框架自动加的
```

#### 用法 ①：需要租户隔离的表，加 `tenant_id` 字段

```sql
CREATE TABLE `system_role` (
  `id`         bigint      NOT NULL AUTO_INCREMENT COMMENT '角色ID',
  `name`       varchar(30) NOT NULL                COMMENT '角色名称',
  `tenant_id`  bigint      NOT NULL DEFAULT '0'    COMMENT '租户编号',
  PRIMARY KEY (`id`) USING BTREE
) ENGINE=InnoDB COMMENT='角色信息表';
```

对应的 DO **继承 `TenantBaseDO`**（而不是普通的 `BaseDO`）：

```java
@Data
@EqualsAndHashCode(callSuper = true)
@TableName("system_role")
public class RoleDO extends TenantBaseDO {   // ← 注意这里
    private Long id;
    private String name;
    // tenantId 已经在 TenantBaseDO 里了，不用自己写
}
```

`TenantBaseDO` 就是在 `BaseDO` 基础上多了一个 `tenantId` 字段。详见 [[MyBatis 数据库]]。

#### 用法 ②：不需要租户隔离的表，加到 ignore-tables

有些表是**全局共享**的，比如数据字典、菜单、定时任务 —— 它们不属于任何租户。

```yaml
yudao:
  tenant:
    ignore-tables:       # 这些表不会自动拼 tenant_id 条件
      - system_dict_data
      - system_dict_type
      - system_menu
      - system_job
      - infra_config
      - infra_file
```

❌ **不配会怎样？** MyBatis Plus 会照样给你拼 `WHERE tenant_id = ?`，而表里根本没这列 → 直接报 `Unknown column 'tenant_id'`。

> 这是新人接入多租户时**最常见的报错**，记住这句就够排查了。

### 1.6 Redis 层【重要】：Key 加 `:t{tenantId}` 后缀

Redis 没有"字段"，没法用 `WHERE tenant_id = ?` 过滤。怎么办？**在 Key 上做手脚**：

```
原本的 Key：     user:1024
租户 1 的 Key：  user:t1:1024
租户 2 的 Key：  user:t2:1024
```

**为什么必须隔离 Redis Key？**（官方给了两条理由）

1. **DATASOURCE 模式下 id 会撞车**：A 库的用户 id=1024，B 库的用户也可能 id=1024。都用 `user:1024` 就串了。
2. **所有模式下，唯一性数据会撞车**：比如按手机号缓存 `user:phone:13800138000`，两个租户各有一个 13800138000 的用户（不同公司的人可以有同号），直接冲突。

#### 方式一：Spring Cache + Redis【官方推荐 ✅】

**你什么都不用做**，加个 `@Cacheable` 就自动带租户隔离：

```java
@Cacheable(cacheNames = "users", key = "#id")
public UserDO getUser(Long id) {
    return userMapper.selectById(id);
}
// 实际写入的 Redis Key：users:t102::1024
```

原理在 `TenantRedisCacheManager`，它重写了 Key 的生成逻辑。

如果某个缓存你想**全局共享**（不隔离），加到 `ignore-cache`：

```yaml
yudao:
  tenant:
    ignore-cache:
      - oauth2_client      # OAuth2 客户端是全局的
      - system_dict_data
```

#### 方式二：RedisTemplate + 手动拼【不推荐 ❌】

```java
// 你得自己手动拼 :t{tenantId}，很容易忘
String key = String.format("user:t%d:%d", TenantContextHolder.getTenantId(), id);
```

💡 **这就是官方强烈推荐 Spring Cache 的原因 —— 方式二没有封装，全靠人肉，迟早出事。**

### 1.7 AOP 层【重要】：@TenantIgnore 与 TenantUtils

#### ① `@TenantIgnore`：临时关掉租户过滤

有时候你**就是想查所有租户的数据**。最典型：加载全量角色到本地缓存。

```java
@Service
public class RoleServiceImpl implements RoleService {

    @Resource
    @Lazy                      // 注入自己（代理对象），所以要延迟加载
    private RoleService self;

    @Override
    @PostConstruct
    @TenantIgnore              // ← 忽略多租户过滤，加载【所有】租户的角色
    public void initLocalCache() {
        // 如果不加 @TenantIgnore，会自动拼 WHERE tenant_id = ?，
        // 结果只加载了某一个租户的角色，其他租户全查不到！
    }

    @Scheduled(fixedDelay = SCHEDULER_PERIOD, initialDelay = SCHEDULER_PERIOD)
    public void schedulePeriodicRefresh() {
        self.initLocalCache();  // ← 关键：用 self 而不是 this！
    }
}
```

⚠️ **踩坑点（官方专门提醒）**：`@TenantIgnore` 是基于 **Spring AOP** 实现的，所以**方法内部调用（用 `this`）会失效**！必须用 `self.方法名()` 走代理对象。

> 这和 [[异步任务]] 里 `@Async`、[[分布式锁]] 里 `@Lock4j` 的坑是同一个：**凡是基于 AOP 的注解，`this.xxx()` 都白搭。**

#### ② `TenantUtils.execute()`：模拟某个租户执行一段逻辑

比如"创建租户"时，新租户刚建好，还没有上下文，但你要给它创建管理员和角色：

```java
@Transactional
public Long createTenant(TenantSaveReqVO reqVO) {
    // 1. 在主库创建租户记录（得到租户编号 102）
    TenantDO tenant = tenantMapper.insert(...);

    // 2. 模拟 102 号租户的身份，去创建它的管理员、角色
    TenantUtils.execute(tenant.getId(), () -> {
        userService.createUser(tenant.getUsername(), ...);  // 自动带上 tenant_id = 102
        roleService.createRole(...);                        // 自动带上 tenant_id = 102
    });

    return tenant.getId();
}
```

### 1.8 Job 层：@TenantJob

定时任务没有"当前租户"这个概念。如果你想让"每天凌晨统计各租户数据"这种任务跑起来：

```java
@Component
public class DemoJob {

    @TenantJob                                  // ← 一个注解搞定
    public void execute() {
        // 框架会【遍历每个租户】，每个租户各执行一次这段逻辑
        // 循环内部自动设置 TenantContextHolder
        Long tenantId = TenantContextHolder.getTenantId();
        log.info("正在为租户 {} 统计数据", tenantId);
    }
}
```

💡 **底层就是**：查出所有租户 → for 循环 → 每次 `TenantUtils.execute(tenantId, ...)`。

### 1.9 MQ 层 与 Async 层

**MQ**：发消息时把租户号写进 Message 的消息头 `tenant-id`，消费时再读出来放回上下文。

```
生产者 ──[Message 头: tenant-id=102]──> MQ ──> 消费者（自动还原租户 102）
```

**Async**：用阿里开源的 **TransmittableThreadLocal**（TTL）实现异步时租户号不丢。

> 普通的 `ThreadLocal` 在线程池里会丢（线程复用），TTL 能在提交任务时把值"传递"过去。这在 [[异步任务]] 里有详细讲。

---

## 二、应用篇：怎么用起来

### 2.1 打开多租户开关（两个地方！）

⚠️ **注意：芋道有两个配置项，必须保持一致，否则报错！**

| 位置 | 配置项 | 说明 |
|---|---|---|
| **前端** `.env` | `VITE_TENANT_ENABLE=true` | 登录页要不要显示"租户"输入框 |
| **后端** `application.yaml` | `yudao.tenant.enable=true` | 后端要不要启用租户过滤 |

**为什么要设两个？**（官方解释）

> 前端登录界面需要使用到多租户的配置项，从后端加载配置项的话，体验会比较差。

也就是说：登录页还没登录、没法请求后端接口，只能从前端自己的配置文件里读。所以得配两遍。

### 2.2 创建一个新租户（3 步）

1. **点击 [租户套餐] 菜单 → [新增]**，填写租户信息（租户名、域名、套餐、账号额度、过期时间）
2. **点击 [确认]** —— 系统会自动创建该租户的**管理员账号**和**角色**
3. **退出系统，用新租户的管理员登录**

💡 所谓**租户套餐**，本质是限制这个租户能用哪些菜单、能建多少用户。创建租户时选一个套餐，系统就按套餐给角色赋菜单权限。

### 2.3 新建业务表时该怎么做

**记住这个决策流程**：

```
新建一张表
   │
   ├─ 这张表的数据需要按租户隔离吗？
   │     │
   │     ├─ 需要（如：订单、客户、合同）
   │     │     → 加 tenant_id 字段 + DO 继承 TenantBaseDO
   │     │
   │     └─ 不需要（如：数据字典、菜单、定时任务、系统配置）
   │           → 表名加到 yudao.tenant.ignore-tables
   │
   └─ 搞定
```

### 2.4 租户独立域名（可选，但很实用）

SaaS 产品常见做法：租户 A 用 `a.yourcompany.com`，租户 B 用 `b.yourcompany.com`。

实现三步：

1. `system_tenant` 表有个 **`website`** 字段，填该租户的子域名（如 `a.iocoder.cn`）
2. **Nginx 泛域名解析**：`server_name *.iocoder.cn` 全部指向前端项目
3. 前端登录页**根据当前访问的 host 反查 tenant-id**，之后所有请求都带上它

```
用户访问 a.iocoder.cn
   → 前端拿到 host = a.iocoder.cn
   → 调 /admin-api/system/tenant/get-by-website?website=a.iocoder.cn
   → 拿到 tenant-id = 102
   → 所有请求 Header 带上 tenant-id: 102
```

（注：商城 uniapp 端芋道官方暂未实现，需要自己扩展。）

---

## 三、进阶篇：踩过的坑和面试话术

### 坑 1：`Unknown column 'tenant_id' in 'where clause'`

**原因**：新表没加 `tenant_id`，但也没配到 `ignore-tables`。
**解决**：二选一 —— 加字段，或加配置。

### 坑 2：`this.xxx()` 导致 `@TenantIgnore` 失效

**原因**：AOP 代理没生效。
**解决**：注入自己的代理对象 `self`，用 `self.xxx()`。或者把逻辑抽到另一个 Bean。

### 坑 3：异步/定时任务里查不到数据或查到别人的数据

**原因**：新线程没有租户上下文 → 要么拼了 `WHERE tenant_id = null` 查不到，要么没拼条件查了全量。
**解决**：
- 异步 → 确保用了 TransmittableThreadLocal（芋道已配好，别自己 `new Thread()`）
- 定时任务 → 加 `@TenantJob`，或手动 `TenantUtils.execute(tenantId, ...)`

### 坑 4：全量缓存被租户过滤坑了

加载本地缓存、初始化字典这类"跨租户"操作，**必须**加 `@TenantIgnore`。参见 [[本地缓存]]。

### 坑 5：Redis Key 冲突导致串数据

**症状**：A 公司的人看到了 B 公司的数据（但数据库里明明是分开的）。
**原因**：用了 `RedisTemplate` 手拼 Key，忘了加 `:t{tenantId}`。
**解决**：改用 Spring Cache（自动隔离），或手动拼上租户后缀。

### 坑 6：唯一索引必须带上 tenant_id

```sql
-- ❌ 错误：这样全平台只能有一个叫"admin"的角色
UNIQUE KEY `uk_name` (`name`)

-- ✅ 正确：每个租户可以有自己的"admin"
UNIQUE KEY `uk_name` (`name`, `tenant_id`)
```

⚠️ 这个坑非常隐蔽 —— 单租户测试一切正常，上线后第二个租户注册就报"名称已存在"。

### 坑 7：租户开关前后端不一致

前端开了、后端没开 → 登录页要你填租户，但后端不过滤，**数据全串**。
⚠️ **两个开关必须同步改**。

### 坑 8：多租户 ≠ 数据权限

| | 解决的问题 | 粒度 |
|---|---|---|
| **多租户** | 甲公司 vs 乙公司 | 公司之间（横向） |
| **数据权限**（[[数据权限]]） | 销售部 vs 技术部、只能看自己 | 公司内部（纵向） |

**两者可以叠加**：先按 `tenant_id` 过滤出本租户，再按部门/用户过滤出本部门。

### 面试话术

> **Q：多租户有哪几种数据隔离方案？你怎么选？**
>
> 三种：独立数据库（DATASOURCE）、共享库独立表（SCHEMA）、共享表加字段（COLUMN）。
> 实际项目里我选 COLUMN 为主 —— 成本最低、运维最简单，一套表结构所有租户共用，升级发版一次搞定。
> 它的风险是安全性最依赖框架的自动过滤，所以必须做全链路封装：Web 层传租户号、DB 层用 MyBatis 拦截器自动拼 WHERE、Redis 层在 Key 上加租户后缀、异步和 MQ 要保证上下文传递。
> 如果对隔离要求特别高的大客户，可以走 DATASOURCE 混合模式 —— 大客户独立库、小客户共享库，芋道就是这么设计的。

---

## 四、一句话总结

**多租户字段隔离 = 一张表、一个 `tenant_id` 字段、框架在 8 个层面（Web/Security/DB/Redis/AOP/Job/MQ/Async）自动帮你加过滤条件。你要做的只有三件事：新表加 `tenant_id`、共享表配 `ignore-tables`、跨租户操作加 `@TenantIgnore`。**

---

## 关联笔记

- [[SaaS 多租户 数据库隔离]] — 另一种模式：一个租户一个库
- [[MyBatis 数据库]] — `BaseDO` / `TenantBaseDO` 的区别
- [[数据权限]] — 租户内的部门/用户级权限，可与多租户叠加
- [[Redis 缓存]] — Spring Cache 的租户隔离原理
- [[本地缓存]] — 为什么加载缓存要 `@TenantIgnore`
- [[异步任务]] — TransmittableThreadLocal 传递上下文
- [[配置管理]] — `ignore-tables` 这类配置的存放方式

## 附录：官方截图索引

图片位于 `99_附件_资源文件/Yudao-Cloud/`：

| 截图 | 内容 |
|---|---|
| `SaaS_多租户_字段隔离-2.png` | 多租户开关的两个配置项 |
| `SaaS_多租户_字段隔离-3/4.png` | 租户管理、租户套餐界面 |
| `SaaS_多租户_字段隔离-5.png` | 创建租户（COLUMN 模式） |
| `SaaS_多租户_字段隔离-6.png` | `yudao.tenant.ignore-urls` 配置 |
| `SaaS_多租户_字段隔离-7.png` | `yudao.tenant.ignore-tables` 配置 |
| `SaaS_多租户_字段隔离-8.png` | `yudao.tenant.ignore-cache` 配置 |
| `SaaS_多租户_字段隔离-9.png` | `TenantUtils.execute` 使用示例 |
