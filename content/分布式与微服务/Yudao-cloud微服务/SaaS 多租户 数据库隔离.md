---
tags:
  - Java
  - Yudao
  - 多租户
  - SaaS
  - 多数据源
  - 分布式事务
date: 2026-09-06
source: 芋道 ruoyi-vue-pro 开发指南 - 后端手册 - SaaS 多租户【数据库隔离】
title: "SaaS 多租户【数据库隔离】"
---

# SaaS 多租户【数据库隔离】

> **一句话概括**：数据库隔离（DATASOURCE 模式）= **一个租户一个数据库**，每次操作数据库前，框架先"拨号"切到这个租户的库，再执行 SQL。数据物理上就分开躺着，想串都串不了。

**前置阅读**：[[SaaS 多租户 字段隔离]]（COLUMN 模式）。本篇讲另一种。

---

## 零、先建立整体印象：从"大开间"升级到"独立办公室"

回头看那个写字楼的类比：

| 模式 | 类比 | 数据怎么分 |
|---|---|---|
| COLUMN（字段隔离） | 大开间，工牌上写公司名 | 一张表，靠 `tenant_id` 列区分 |
| **DATASOURCE（本篇）** | **每家公司一栋独立小楼** | **一个租户一个数据库，物理隔离** |

**好处**：隔离级别最高，安全性最好，某租户要定制表结构随便改，出故障只恢复它自己的库。
**代价**：100 个租户 = 100 个库，运维成本、采购成本都上去了。

💡 **什么时候该用 DATASOURCE？**
- 租户数量不多（几十个以内），但每个都是大客户
- 客户明确要求"数据必须独立存储"（金融、医疗、政务常见）
- 客户要求数据能单独导出 / 单独备份 / 单独迁移

---

## 一、原理篇：怎么做到"自动切库"

### 1.1 一句话原理

基于 **dynamic-datasource** 拓展实现。

> **核心：每次对数据库操作时，动态切换到该租户所在的数据源，然后执行 SQL 语句。**

```
请求进来（Header: tenant-id = 102）
   │
   ▼
框架查 system_tenant 表：102 号租户用的是哪个数据源？
   │ → 答案：tenant-a
   ▼
DynamicDataSourceContextHolder.push("tenant-a")   ← 切数据源
   │
   ▼
执行 SQL（此时连接已经指向 ruoyi-vue-pro-tenant-a 库）
   │
   ▼
finally { DynamicDataSourceContextHolder.clear(); }  ← 用完还原
```

这套机制和 [[多数据源（读写分离）、事务]] 里的 `@DS` 是同一套东西，只是**切换的依据从"主/从"变成了"租户号"**。

### 1.2 数据库分两类：主库 和 租户库

这是 DATASOURCE 模式最重要的概念，画个表：

| | 主库（master） | 租户库（tenant-a / tenant-b / ...） |
|---|---|---|
| **存什么** | **所有租户共享的全局表** | **每个租户自己的业务表** |
| **举例** | 菜单表 `system_menu`、定时任务表 `system_job`、字典表、租户表 `system_tenant`、数据源配置表 | 用户表 `system_users`、角色表 `system_role`、部门表 `system_dept`、岗位表、通知公告 |
| **配在哪** | `application-{env}.yaml` 的 master 数据源 | [基础设施 → 数据源配置] 菜单，存数据库 |
| **Mapper 注解** | `@Master` | `@TenantDS` |

**为什么菜单表要放主库？** 因为所有租户用的是同一套菜单（同一套功能）。如果每个租户库都存一份，你加个菜单得改 100 个库。

**为什么用户表要放租户库？** 因为这是要隔离的核心数据。

### 1.3 主库 / 租户库的 Mapper 写法

```java
// ===== 主库 Mapper：必须加 @Master =====
@Mapper
public interface MenuMapper extends BaseMapperX<MenuDO> {

    @Master                                       // ← 强制走主库
    default List<MenuDO> selectListByTenant() {
        return selectList();
    }
}

// ===== 租户库 Mapper：必须加 @TenantDS =====
@Mapper
public interface UserMapper extends BaseMapperX<UserDO> {

    @TenantDS                                     // ← 走当前租户的库
    default UserDO selectByUsername(String username) {
        return selectOne(UserDO::getUsername, username);
    }
}
```

⚠️ **注解漏加会怎样？** 用户表跑到主库去查 → 查不到数据（主库压根没这张表）或查到别人的数据。

### 1.4 一个"反直觉"的设计：主库 + 租户库会叠加 COLUMN 模式

你可能以为 DATASOURCE 模式下就不需要 `tenant_id` 字段了。

**芋道官方：默认还是会叠加 COLUMN 模式**，也就是说 SQL 里照样会拼 `WHERE tenant_id = ?`。

```java
// 如果你不需要，删除 TenantDatabaseInterceptor 类，以及它的 Bean 自动配置即可
```

**为什么要叠加？为了"混合模式"的扩展性。**

> 官方原话：*"拓展性，指的是部分【大】租户独立数据库，部分【小】租户共享数据库。"*

画个图：

```
                    ┌─ 大客户 A  → 独立库 tenant-a
                    ├─ 大客户 B  → 独立库 tenant-b
   一套系统 ────────┤
                    ├─ 小客户 C  ─┐
                    ├─ 小客户 D  ─┼→ 共享库（靠 tenant_id 区分）
                    └─ 小客户 E  ─┘
```

如果小客户们共享一个库，那这个库就必须有 `tenant_id` 才能区分。所以干脆全带上，这样以后想让某个租户"搬家"到独立库，直接改数据源配置就行，代码不用动。

**叠加之后，主库的表要分两种情况处理**：

| 情况 | 要不要 `tenant_id` | 例子 | 处理 |
|---|---|---|---|
| 情况一 | ❌ 不需要 | 菜单表、定时任务表 | 表名加到 `yudao.tenant.ignore-tables` |
| 情况二 | ✅ 需要 | 访问日志表、异常日志表 | 加字段（**目的：排查是哪個租户的系统级日志**） |

💡 情况二这个设计很妙：日志表放主库（统一管理），但要靠 `tenant_id` 知道这条日志是哪个租户产生的。

---

## 二、应用篇：手把手搭一个 DATASOURCE 租户

### 2.1 五步走

**① 新建数据源配置**

[基础设施 → 数据源配置] → [新增] → 名字填 `tenant-a`，URL 指向你新建的 `ruoyi-vue-pro-tenant-a` 库。

**② 把业务表拷贝到租户库**

从主库拷贝这些表到 `ruoyi-vue-pro-tenant-a`：

```sql
system_dept              部门表
system_login_log         登录日志
system_notice            通知公告
system_notify_message    站内信
system_operate_log       操作日志
system_post              岗位表
system_role              角色表
system_role_menu         角色菜单关联
system_social_user       三方用户
system_social_user_bind  三方用户绑定
system_user_post         用户岗位关联
system_user_role         用户角色关联
system_users             用户表
```

**③ 新建租户，绑定数据源**

[基础设施 → 租户管理] → [新增] → 租户名"土豆租户"，数据源选 `tenant-a`。

保存后，**系统会自动在这个租户库里创建管理员账号和角色**（用的就是 [[SaaS 多租户 字段隔离]] 里讲的 `TenantUtils.execute()`）。

**④ 退出，用新租户登录**

**⑤（可选）清理主库**

> 官方建议：把拷贝到租户库的表**从主库删除**，让主库只保留全局表。

⚠️ **这一步有风险**：如果还有小租户在共享主库，删了就完蛋。**只有全部租户都独立库了才删。**

### 2.2 主库数据源的配置

```yaml
spring:
  datasource:
    dynamic:
      primary: master
      datasource:
        master:                                    # 主库：全局表
          url: jdbc:mysql://127.0.0.1:3306/ruoyi-vue-pro?...
          username: root
          password: 123456
```

租户库**不写在这里** —— 它们存在数据库的 `infra_data_source_config` 表，可以在界面上动态添加。这就是"数据源配置"菜单的作用。

---

## 三、进阶篇：多数据源事务 —— 本篇最大的坑

### 3.1 问题从哪来？

DATASOURCE 模式下，一个操作常常**跨两个库**。比如"创建租户"：

```
创建租户
  ├─ 主库：INSERT system_tenant          （登记租户）
  └─ 租户库：INSERT system_users + system_role  （创建管理员和角色）
```

**如果第二步失败了，第一步必须回滚**，否则就留下一个"没有管理员的孤儿租户"。

### 3.2 但 Spring 的 @Transactional 帮不了你

**原因**：Spring 的 `@Transactional` 在**事务开始时**就把数据库连接绑定到当前线程了。之后你再想切换数据源 —— **切不动了**，连接已经定死了。

> 这就是芋道推荐阅读的那篇文章名：《MyBatis Plus 的多数据源 @DS 切换不起作用了，谁的锅》——**锅在 Spring 事务提前绑定了连接。**

### 3.3 三种解决方案

| 方案 | 复杂度 | 性能 | 一致性 | 说明 |
|---|---|---|---|---|
| **Atomikos（JTA）** | 配置复杂 😫 | 较差 | 强 | 老牌 JTA 实现 |
| **Seata** | 中等（要额外部署 Seata Server） | 不错 | 强 | 阿里开源，业界主流 |
| **@DSTransactional（本地事务）** | 简单 ✅ | 好 | **弱（有风险）** | dynamic-datasource 提供 |

### 3.4 芋道的选择：@DSTransactional

> 官方理由：*"考虑到项目是单体架构，不适合采用重量级的事务，因此采用 dynamic-datasource 提供的'本地事务'轻量级方案。"*

**原理**（说人话）：

```java
// 伪代码，说明 @DSTransactional 干了啥
try {
    // 业务执行过程中，可能开启了多个数据源的连接
    // 数据源 A 的事务 → connectionA
    // 数据源 B 的事务 → connectionB

    // 【成功】：循环提交每个数据源的事务
    for (Connection conn : openedConnections) {
        conn.commit();
    }
} catch (Exception e) {
    // 【失败】：循环回滚每个数据源的事务
    for (Connection conn : openedConnections) {
        conn.rollback();
    }
}
```

**⚠️ 它有个致命风险点**（官方明确写出来）：

```
① 主库的事务提交 ✅
② 租户库发生异常（比如数据库宕机），租户的事务提交失败 ❌

结果：主库数据已经提交了，租户库没有 → 数据不一致！
```

**所以官方的建议是**：

> *"如果你的系统对数据一致性要求很高，那么请使用 Seata 方案。"*

💡 **我的判断**：创建租户这种低频操作，用 `@DSTransactional` 完全够（真出问题人工补数据）。但如果是**订单、支付**这种高频资金操作，老老实实上 Seata。

### 3.5 用法示例

```java
@Service
public class TenantServiceImpl implements TenantService {

    // 最外层 Service 用 @DSTransactional
    @DSTransactional                              // ← 注意：不是 @Transactional
    public Long createTenant(TenantSaveReqVO reqVO) {
        // ① 主库操作
        TenantDO tenant = new TenantDO();
        tenant.setName(reqVO.getName());
        tenantMapper.insert(tenant);

        // ② 租户库操作（切换数据源）
        TenantUtils.execute(tenant.getId(), () -> {
            userService.createUser(...);          // 走 tenant-a 库
            roleService.createRole(...);          // 走 tenant-a 库
        });

        return tenant.getId();
    }
}
```

⚠️ **关键约束（官方加黄圈强调的）**：

> **里面不能嵌套有 Spring 自带的事务！** 被调用的子 Service 方法**不能**用 `@Transactional`，否则数据源无法切换。

```java
// ❌ 错误示范
@DSTransactional
public void createTenant(...) {
    userService.createUser(...);
}

@Service
class UserServiceImpl {
    @Transactional          // ← 这里不行！会导致数据源切不过去
    public void createUser(...) { ... }
}

// ✅ 正确：子方法也用 @DSTransactional
@Service
class UserServiceImpl {
    @DSTransactional        // ← 换成这个
    public void createUser(...) { ... }
}
```

---

## 四、踩坑清单

| # | 坑 | 症状 | 解法 |
|---|---|---|---|
| 1 | Mapper 漏加 `@Master` / `@TenantDS` | 表不存在，或查到主库的旧数据 | 全局搜一遍所有 Mapper 检查注解 |
| 2 | 主库表没加 `ignore-tables` | `Unknown column 'tenant_id'` | 菜单表、定时任务表等加到配置 |
| 3 | `@DSTransactional` 里嵌套了 `@Transactional` | 数据源切换失效，全打到主库 | 子 Service 也改成 `@DSTransactional` |
| 4 | 新租户建好了但没管理员 | `TenantUtils.execute` 没生效或异常被吞 | 看日志，检查租户库表是否都拷全了 |
| 5 | 拷贝表不全 | 登录后某些功能报"表不存在" | 对照官方列表逐张检查（版本迭代可能要拷更多） |
| 6 | 主库业务表删早了 | 共享主库的小租户全挂 | 确认**全部**租户都独立库后再删 |
| 7 | 以为 DATASOURCE 就绝对安全 | 主库还是能看到全局表 | 记住：主库是共享的，`@Master` 的操作没有租户隔离 |

---

## 五、一句话总结

**数据库隔离 = 一个租户一个库 + 主库存全局表 + `@Master`/`@TenantDS` 标注每个 Mapper 归属 + 跨库事务用 `@DSTransactional`（重要数据换 Seata）。它隔离性最强但运维最重，适合大客户；小客户还是用[[SaaS 多租户 字段隔离]]更划算，两者还能混合使用。**

---

## 关联笔记

- [[SaaS 多租户 字段隔离]] — 本篇的前置，COLUMN 模式
- [[多数据源（读写分离）、事务]] — `@DS` / `@Master` / `@Slave` / `@DSTransactional` 的通用讲法
- [[MyBatis 数据库]] — `BaseDO`、`TenantBaseDO`、逻辑删除
- [[数据权限]] — 租户内再看部门/个人，两种权限叠加
- [[功能权限]] — 菜单权限，主库 `system_menu` 管的就是这个

## 附录：官方截图索引

图片位于 `99_附件_资源文件/Yudao-Cloud/`：

| 截图 | 内容 |
|---|---|
| `SaaS_多租户_数据库隔离-2.png` | [数据源配置] 新增 tenant-a |
| `SaaS_多租户_数据库隔离-3.png` | 需要拷贝到租户库的表清单 |
| `SaaS_多租户_数据库隔离-4.png` | [租户管理] 新增租户并选择数据源 |
| `SaaS_多租户_数据库隔离-5.png` | 租户库中自动创建的租户管理员/角色 |
| `SaaS_多租户_数据库隔离-6.png` | 主库需保留的全局表 |
| `SaaS_多租户_数据库隔离-7.png` | 主库 master 数据源的 yaml 配置 + `@Master` 示例 |
| `SaaS_多租户_数据库隔离-8.png` | `@TenantDS` 注解示例 |
| `SaaS_多租户_数据库隔离-9.png` | `@DSTransactional` 使用示例（含黄圈标注） |
