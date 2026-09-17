---
tags: #技术/缓存 #Yudao #Redis
date: 2026-09-06
source: 芋道《开发指南 —— Redis 缓存》
title: "Redis 缓存（Yudao 编程式 + 声明式）"
---

# Redis 缓存（Yudao 编程式 + 声明式）

> **一句话概括**：芋道把 Redis 用法分成两套 —— **编程式**（自己写代码 `set`/`get`，用 `RedisDAO` 三层封装）和**声明式**（一个 `@Cacheable` 注解搞定）。另外它做了一个很多项目都缺的好设计：**把所有 Redis Key 集中到一个常量类管理**。

---

## 零、先建立整体印象：办公室抽屉 vs 楼下仓库

> 🧒 **费曼第 1 段 · 5 岁小孩也能懂**

想象你在办公室工作：

- **楼下仓库（MySQL）**：东西全，但下去拿一趟要 5 分钟
- **桌上抽屉（Redis）**：只能放几样东西，但伸手就能拿到，1 秒钟

聪明的做法是：**常用的东西放抽屉，不常用的放仓库**。

Redis 缓存干的就是这件事 —— 把"经常查、不常变"的数据（比如角色列表、字典配置、访问令牌）从 MySQL 搬到 Redis，下次查直接走 Redis，不用麻烦数据库。

芋道给了你**两种搬法**：

| 方式 | 比喻 | 适合场景 |
|---|---|---|
| **编程式** | 你自己走到抽屉前，亲手放、亲手拿 | 逻辑复杂、要精细控制（如 Token 缓存） |
| **声明式** | 你贴个标签"这个放抽屉"，助手自动帮你放/拿 | 简单查询缓存（如根据 ID 查角色） |

---

## 一、原理篇：两种方式怎么选

### 1.1 编程式缓存（RedisTemplate / RedisDAO）

芋道用的是 **Redisson** 作为 Redis 客户端（而不是 Lettuce 或 Jedis）：

```xml
<dependency>
    <groupId>org.redisson</groupId>
    <artifactId>redisson-spring-boot-starter</artifactId>
</dependency>
```

> 💡 **为什么用 Redisson？** 因为它不只是 Redis 客户端，还自带**分布式锁、延迟队列、限流器**等高级特性。用一个客户端解决一堆问题，省得再引别的依赖。

**芋道的三层封装**（这是一个非常值得学的设计）：

```
Controller
    ↓
Service  ← 业务代码，只认识 DAO 接口
    ↓
XxxRedisDAO  ← 封装这个对象的所有 Redis 操作（放/拿/删）
    ↓
RedisClient / RedisTemplate  ← 芋道二次封装的底层客户端
```

好处：Service 里看不到任何 Redis 细节，只知道 `oauth2AccessTokenRedisDAO.get(token)`。

### 1.2 声明式缓存（Spring Cache 注解）

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-cache</artifactId>
</dependency>
```

一个注解搞定：

```java
@Cacheable(value = "users", key = "#id")
UserDO getUserById(Integer id);
```

---

## 二、应用篇

### 2.1 编程式：以 Access Token 缓存为例（芋道实战）

#### 第 ① 步：引入依赖

```xml
<dependency>
    <groupId>cn.iocoder.boot</groupId>
    <artifactId>yudao-spring-boot-starter-redis</artifactId>
</dependency>
```

#### 第 ② 步：定义缓存对象（DO）

```java
// 如果值是简单的 String / Integer，不需要建类，直接存
// 如果是复杂对象，建议在 dal/dataobject 包下建一个 DO 类
@Data
public class OAuth2AccessTokenDO {
    private String accessToken;
    private Long userId;
    private Integer userType;
    private LocalDateTime expiresTime;
    // ...
}
```

#### 第 ③ 步：在 `RedisKeyConstants` 里登记 Key ⭐

```java
public interface RedisKeyConstants {

    // OAUTH2_ACCESS_TOKEN：访问令牌缓存
    // 格式：oauth2_access_token:%s   （%s 是 accessToken 值）
    String OAUTH2_ACCESS_TOKEN = "oauth2_access_token:%s";
}
```

> 💡 **这是芋道最值得偷师的设计**：每个模块都有一个 `RedisKeyConstants` 类，**把该模块所有的 Redis Key 集中起来**。
>
> **为什么这么干？** 官方原话解释得很到位：
> > "目的是避免 Redis Key 散落在 Service 业务代码中，**像对待数据库的表一样，对待每个 Redis Key**。想了解一个模块用了哪些 Redis，只看这一个类就够了。"
>
> 反例（很多项目的现状）：Key 字符串散落在十几个 Service 里，想改个前缀要全局搜索，想清理无用 Key 根本不敢删。

#### 第 ④ 步：写 RedisDAO

```java
@Repository
public class OAuth2AccessTokenRedisDAO {

    @Resource
    private RedisClient<String, OAuth2AccessTokenDO> redisClient;  // 芋道封装的客户端

    public OAuth2AccessTokenDO get(String accessToken) {
        return redisClient.get(format(OAUTH2_ACCESS_TOKEN, accessToken));
    }

    public void set(String accessToken, OAuth2AccessTokenDO tokenDO) {
        redisClient.set(format(OAUTH2_ACCESS_TOKEN, accessToken), tokenDO);
    }

    public void delete(String accessToken) {
        redisClient.delete(format(OAUTH2_ACCESS_TOKEN, accessToken));
    }
}
```

#### 第 ⑤ 步：Service 里直接用

```java
@Service
public class OAuth2TokenServiceImpl {

    @Resource
    private OAuth2AccessTokenRedisDAO oauth2AccessTokenRedisDAO;  // 注入即可

    // 业务代码非常干净，看不到任何 Redis API
}
```

### 2.2 声明式：三个核心注解

| 注解 | 干啥的 | 执行顺序 |
|---|---|---|
| `@Cacheable` | **先查缓存**，有就返回；没有就执行方法并缓存 | ① 查缓存 → ② 有则返回 → ③ 无则执行方法 → ④ 存缓存 |
| `@CachePut` | **永远执行方法**，然后把结果更新到缓存 | ① 执行方法 → ② 更新缓存（**不看有没有缓存**） |
| `@CacheEvict` | 删除缓存 | 执行方法后删除缓存 |

**`@Cacheable` vs `@CachePut` 的区别（面试常考）**：

```
@Cacheable：有缓存 → 直接返回，方法不执行        （用于查询）
@CachePut  ：有缓存 → 照样执行方法，然后覆盖缓存  （用于更新）
```

### 2.3 声明式实战：角色缓存（为什么用"被动读"）

芋道在 `RoleServiceImpl` 里用 Spring Cache 缓存角色，但采用的是**【被动读】**方案：

```java
// ① 读：从 MySQL 读不到才写缓存（被动）
private RoleDO getRoleFromCache(Long id) {
    return roleCache.get(id, key -> roleMapper.selectById(id));  // 缓存没有就查库并写入
}

// ② 写：更新/删除 MySQL 后，直接删掉缓存（不是更新缓存）
public void updateRole(RoleSaveReqVO reqVO) {
    roleMapper.updateById(bean);
    roleCache.invalidate(reqVO.getId());   // 删缓存，让下次读取时重新加载
}
```

> 💡 **为什么是"被动读 + 删缓存"，而不是"主动写 + 更新缓存"？** 官方给了两个理由：
> 1. **一致性更好**：更新时直接删缓存，下次读自动回源，避免出现"数据库改了、缓存还是旧的"
> 2. **不浪费内存**：绝大多数数据其实没那么高频，主动写会把一堆用不上的数据塞进 Redis
>
> 这就是经典的 **Cache-Aside Pattern（旁路缓存模式）**。详细见 [[10_Redis 实战]]。

### 2.4 自定义过期时间（小技巧）

Spring Cache 默认全局过期时间是 1 小时（`spring.cache.redis.time-to-live`）。

想给某个缓存单独设过期时间？**在 `cacheNames` 后面加 `#{秒数} 后缀**：

```java
// 缓存 1 小时（默认）
@Cacheable(cacheNames = "users", key = "#id")
UserDO getUserById(Long id);

// 缓存 5 分钟（300 秒）
@Cacheable(cacheNames = "users#300", key = "#id")
UserDO getUserById(Long id);
```

> 💡 这是芋道对 Spring Cache 的扩展（原生 Spring Cache 不支持按缓存名设过期时间）。

---

## 三、进阶篇

### 3.1 序列化：必须用 JSON

芋道在 `YudaoRedisAutoConfiguration` 里把 value 序列化改成了 **JSON**（默认是 JDK 序列化）。

| 序列化方式 | 问题 |
|---|---|
| ❌ JDK 序列化（默认） | Redis 里存的是乱码二进制，**Redis 命令行看不到内容**，跨语言读不了 |
| ✅ JSON | 人能看懂，`redis-cli` 直接可查，跨语言通用 |

### 3.2 三种方式怎么选速查

| 场景 | 用什么 |
|---|---|
| 简单查询，按 ID 缓存 | `@Cacheable` 声明式（最省事） |
| 复杂对象、要精细控制过期/删除 | 编程式 `RedisDAO` |
| 要在缓存里做计数/排行/队列 | 编程式 `RedisTemplate` 原生 API |
| 分布式锁 | 见 [[分布式锁]] |

### 3.3 生产坑位

| 坑 | 现象 | 解决 |
|---|---|---|
| **缓存穿透** | 查一个不存在的 ID，每次都打到数据库 | 缓存空值 `null` + 短过期时间；或用布隆过滤器 |
| **缓存击穿** | 热点 Key 过期瞬间，大量请求同时打库 | 加锁 / 逻辑过期，见 [[10_Redis 实战]] |
| **缓存雪崩** | 大批 Key 同时过期 | 过期时间加随机扰动 |
| **双写不一致** | 改了数据库没删缓存 | 遵循"**先改库，再删缓存**"，见 2.3 |
| **Key 太长** | 内存浪费、网络开销大 | 业务参数做 MD5 摘要（芋道幂等组件就是这么干的） |
| **Big Key** | 一个 Key 存了几 MB，阻塞 Redis | 拆分 / 压缩 / 改数据结构 |

### 3.4 Redis 监控（运维视角）

`yudao-module-infra` 提供了 Redis 监控功能，访问【基础设施 → Redis 监控】：

- 基础信息（版本、运行时长）
- **命令统计**（哪个命令调用最多）
- **内存信息**（内存占用、Key 数量）

排障时第一站：先看 Key 数量有没有异常增长（可能是缓存没设过期时间）。

---

## 四、一句话总结

| 问题 | 答案 |
|---|---|
| 两种用法 | 编程式（`RedisDAO` 三层封装）/ 声明式（`@Cacheable` 注解） |
| 为什么用 Redisson | 自带分布式锁、队列、限流，一个客户端搞定所有 |
| 最值得学的设计 | **`RedisKeyConstants` 集中管理所有 Key**，像管数据库表一样管 Redis Key |
| 一致性策略 | **被动读 + 删缓存**（Cache-Aside），不要主动写缓存 |
| 序列化 | 必须 JSON，别用 JDK 序列化 |
| 自定义过期 | `cacheNames = "xxx#300"（单位秒） |

---

## 关联笔记

- [[10_Redis 实战]] ⭐ — Redis 数据结构 / 持久化 / 穿透击穿雪崩 / 分布式锁原理
- [[本地缓存]] — 一级缓存 Caffeine，与 Redis 组成多级缓存
- [[分布式锁]] — Redisson 分布式锁，本篇的延伸
- [[22_从零搭建芋道式脚手架框架]] ⭐ — Redis 在脚手架中的定位
- [[技术选型]] — 为什么选 Redis 5.0+、为什么用 Redisson

## 附录：官方截图索引

官方文档中的配置与代码截图（按出现顺序编号），存于 `99_附件_资源文件/Yudao-Cloud/`：

- `Redis_缓存-2.png` ~ `Redis_缓存-12.png` — 含 `spring.redis` 配置、`YudaoRedisAutoConfiguration` 序列化配置、`RedisKeyConstants` 定义、`OAuth2AccessTokenRedisDAO` 实现、Spring Cache 配置与实战代码、自定义过期时间配置、Redis 监控界面
