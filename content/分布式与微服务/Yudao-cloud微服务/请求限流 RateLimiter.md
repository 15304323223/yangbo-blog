---
tags: #技术/高并发 #Yudao #Redis #限流
date: 2026-09-06
source: 芋道《开发指南 —— 请求限流（RateLimiter）》
title: "请求限流 RateLimiter（Yudao @RateLimiter）"
---

# 请求限流 RateLimiter（Yudao @RateLimiter）

> **一句话概括**：限制一个接口"一段时间内最多被调用 N 次"。芋道用 `@RateLimiter(count = 10, time = 60)` 一个注解实现，底层是 **Redis 计数器 + 过期时间**，超限返回 HTTP 429。

---

## 零、先建立整体印象：景区限流

> 🧒 **费曼第 1 段 · 5 岁小孩也能懂**

故宫每天最多卖 8 万张票。卖完了就不卖了 —— 不是不想赚这个钱，是**人太多会出事**。

程序也是一个道理。服务器能同时处理的请求是有限的，**超过了就会崩**。所以：

| 场景 | 不限流的后果 |
|---|---|
| 用户疯狂点击按钮 | 瞬间几百个请求打崩数据库 |
| 爬虫疯狂抓取 | 带宽被占满，正常用户访问不了 |
| 恶意刷短信接口 | 短信费一夜之间烧掉几万块 💸 |
| 秒杀活动 | 所有人同时抢，系统直接雪崩 |

**限流 = 给接口装一个"闸机"**：一分钟最多放行 N 个人，多的请在门口等着（或直接拒绝）。

---

## 一、原理篇

### 1.1 核心流程（和幂等几乎一样）

> 🎓 **费曼第 2 段 · 给高中生讲**

```
① 方法执行前：根据【方法名 + 参数】算出 Key
        │
        ▼
② 去 Redis 查这个 Key 的计数值
        │
        ├── 计数 >= 限制值 ──→ ❌ 报错 429 "请求过于频繁"
        │
        └── 计数 < 限制值 ──→ ③ Redis 计数 +1（并设置过期时间）
                                    │
                                    ▼
                              ④ 执行业务方法
```

> 💡 **官方原话**："它的实现原理，和《幂等性（防重复提交）》比较接近。"
>
> 区别只有一个：**幂等是"只能 1 次"，限流是"最多 N 次"**。

### 1.2 Key 怎么算 + Redis Key 前缀

默认用 **MD5(方法名 + 方法参数)**（和幂等一样，避免 Key 过长）。

Redis Key 前缀：`rate_limiter:%s`

---

## 二、应用篇

### 2.1 引入依赖

```xml
<dependency>
    <groupId>cn.iocoder.boot</groupId>
    <artifactId>yudao-spring-boot-starter-protection</artifactId>
</dependency>
```

### 2.2 加注解

```java
// UserController.java
@GetMapping("/page")
@RateLimiter(count = 1, time = 60)     // 👈 60 秒内最多 1 次
public CommonResult<PageResult<UserRespVO>> getUserPage(@Valid UserPageReqVO pageReqVO) {
    // ... 业务代码
}
```

**被限流时的返回**：

```json
{
  "code": 429,
  "data": null,
  "msg": "请求过于频繁，请稍后重试"
}
```

> 💡 `429` 是 HTTP 标准状态码 **Too Many Requests**，专业做法。很多项目用 500 是错误的。

### 2.3 完整参数

```java
@RateLimiter(
    count = 10,                      // 允许的次数
    time = 60,                       // 时间窗口（默认单位秒）
    timeUnit = TimeUnit.MINUTES,     // 时间单位（用了它 time=1 就是 1 分钟）
    message = "请求过于频繁，请稍后重试",   // 被拦时的提示
    keyResolver = DefaultRateLimiterKeyResolver.class,  // Key 策略
    keyArg = ""                      // 自定义表达式
)
```

### 2.4 五种 Key 策略（重点）⭐

**默认是全局级别**（全站用户共享配额），这几乎肯定不是你想要的。按需切换：

| 策略类 | 限制维度 | 使用场景 |
|---|---|---|
| `DefaultRateLimiterKeyResolver` | **全局**：所有用户共享配额 | 极少数全局接口 |
| `UserRateLimiterKeyResolver` | **用户 ID**：每个用户独立配额 | ⭐ **最常用**，如"每个用户每分钟 10 次" |
| `ClientIpRateLimiterKeyResolver` | **客户端 IP**：每个 IP 独立配额 | ⭐ **防爬虫/防刷** |
| `ServerNodeRateLimiterKeyResolver` | **服务器节点**：每台机器独立配额 | 保护单机不被打垮 |
| `ExpressionIdempotentKeyResolver` | **自定义**：`keyArg` 写 Spring EL | 按手机号、订单号等任意维度 |

**示例**：

```java
// 场景1：每个用户每分钟最多下单 5 次
@RateLimiter(count = 5, time = 1, timeUnit = TimeUnit.MINUTES,
             keyResolver = UserRateLimiterKeyResolver.class,
             message = "下单太频繁，请稍后再试")
@PostMapping("/order/create")
public CommonResult<Long> createOrder(@RequestBody OrderCreateReqVO reqVO) { ... }

// 场景2：每个 IP 每分钟最多发 1 条短信（防刷短信费）⭐
@RateLimiter(count = 1, time = 1, timeUnit = TimeUnit.MINUTES,
             keyResolver = ClientIpRateLimiterKeyResolver.class,
             message = "验证码发送过于频繁")
@PostMapping("/sms/send")
public CommonResult<Boolean> sendSms(@RequestBody SmsSendReqVO reqVO) { ... }

// 场景3：按手机号维度限制
@RateLimiter(count = 3, time = 60,
             keyResolver = ExpressionIdempotentKeyResolver.class,
             keyArg = "#reqVO.mobile",
             message = "该手机号操作过于频繁")
@PostMapping("/verify")
public CommonResult<Boolean> verify(@RequestBody VerifyReqVO reqVO) { ... }
```

---

## 三、进阶篇

### 3.1 四种限流算法（面试必考）

芋道用的是最简单的**固定窗口计数**，生产环境高并发场景可能需要更强的算法：

| 算法 | 原理 | 优点 | 缺点 |
|---|---|---|---|
| **固定窗口计数** | 每 60 秒一个窗口，计数超过就拒绝 | 简单，Redis 一个 Key | ⚠️ **临界问题**：59.9 秒和 60.1 秒各打 100 次，实际 0.2 秒内 200 次 |
| **滑动窗口** | 把窗口切成小格，统计最近 60 秒 | 解决临界问题 | 实现复杂，占内存 |
| **令牌桶** | 桶里匀速放令牌，取到才能过 | **允许突发**（桶里有令牌就能连过），Guava `RateLimiter` | 实现复杂 |
| **漏桶** | 请求进桶，桶以恒定速率出水 | **绝对平滑**，严格限速 | 不允许任何突发 |

> 💡 **怎么选**：
> - 芋道 `@RateLimiter` = 固定窗口，够用（中小项目 90% 场景）
> - 要允许突发流量 → **令牌桶**（如 Guava RateLimiter、Sentinel）
> - 要严格限速保护下游 → **漏桶**
> - 网关层限流 → **Sentinel**（Spring Cloud Alibaba，见 [[14_微服务 SpringCloud 与 Dubbo]]）

### 3.2 三级限流体系（生产架构）

```
用户请求
    │
    ▼
┌──────────────────────────────────────┐
│ ① Nginx 层限流（IP 维度，最外层）        │  ← 挡住绝大部分恶意流量
└──────────────┬───────────────────────┘
               ▼
┌──────────────────────────────────────┐
│ ② 网关 Gateway + Sentinel（路由维度）   │  ← 微服务架构下的统一限流
└──────────────┬───────────────────────┘
               ▼
┌──────────────────────────────────────┐
│ ③ 应用层 @RateLimiter（接口维度）       │  ← 芋道本篇，精细控制单个接口
└──────────────────────────────────────┘
```

> 💡 **面试加分**：说"我们做了**三级限流**，Nginx 挡恶意流量、网关做统一限流、应用层对关键接口精细控制"，比只说一种专业得多。

### 3.3 幂等 / 限流 / 锁 三兄弟对比

| | 幂等 `@Idempotent` | 限流 `@RateLimiter` | 锁 `@Lock4j` |
|---|---|---|---|
| 限制 | 一段时间内**只能 1 次** | 一段时间内**最多 N 次** | 同一时刻**只能 1 个** |
| 实现 | Redis 存标记 | Redis **计数** | Redis `SETNX` |
| 超时后 | 标记消失，可再提交 | **计数清零**，可再请求 | 锁释放，可再抢 |
| 典型场景 | 防表单重复提交 | 防刷、防爬虫 | 防并发执行 |

### 3.4 生产坑位

| 坑 | 现象 | 解决 |
|---|---|---|
| **默认全局维度** | 一个用户用完配额，全站用户都被限 | 99% 场景要设 `keyResolver` |
| **固定窗口临界问题** | 窗口交界瞬间流量翻倍 | 提高限流阈值；或改用 Sentinel 滑动窗口 |
| **Redis 挂了** | 限流失效，流量直冲数据库 | Redis 不可用时**降级为放行**（不能因为限流挂了导致业务不可用） |
| **限流阈值拍脑袋** | 要么太松没用，要么太紧误伤 | 压测得出单机 QPS，再乘机器数 × 0.7 |
| **误伤正常用户** | 用户正常操作被拦 | 提示语要友好；重要接口阈值调高 |

---

## 四、一句话总结

| 问题 | 答案 |
|---|---|
| 限流解决什么 | 一个接口一段时间内最多被调用 N 次，防刷防崩 |
| 怎么用 | `@RateLimiter(count = 10, time = 60)` |
| 底层 | Redis 计数 + 过期时间，Key = `rate_limiter:MD5(...)` |
| 最大坑 | 默认**全局维度**，要按用户/IP 设 `keyResolver` |
| 状态码 | 返回 **429**（Too Many Requests） |
| 生产架构 | 三级限流：Nginx → 网关 Sentinel → 应用层 `@RateLimiter` |

---

## 关联笔记

- [[幂等性（防重复提交）]] — 三兄弟之一：只能 1 次（原理几乎相同）
- [[分布式锁]] — 三兄弟之一：同时只能 1 个
- [[15_高并发高可用设计]] ⭐ — 限流/降级/熔断完整体系，含 Sentinel
- [[10_Redis 实战]] — Redis 计数、INCR、过期策略
- [[14_微服务 SpringCloud 与 Dubbo]] — 网关层 Sentinel 限流

## 附录：官方截图索引

存于 `99_附件_资源文件/Yudao-Cloud/`，按文档出现顺序：

- `请求限流_RateLimiter-1.png` ~ `请求限流_RateLimiter-3.png` — 含 `RateLimiterAspect` 切面核心代码、`IdempotentRedisDAO` 的 Key 前缀定义、接口被限流的返回效果
