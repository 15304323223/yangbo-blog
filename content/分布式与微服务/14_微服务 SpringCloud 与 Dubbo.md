---
title: "微服务 SpringCloud 与 Dubbo（原理 → 应用 → 进阶）"
---
# 微服务 SpringCloud 与 Dubbo（原理 → 应用 → 进阶）

> **一句话概括**：微服务就是把一个"大单体"拆成多个"小服务"，每个服务独立开发、独立部署、独立扩容。但拆完不是结束，**怎么找到对方、怎么调用、挂了怎么办、配置怎么管**——这些才是微服务真正要解决的问题。
>
> **适合谁**：听说过 Eureka、Gateway、Feign、Dubbo 这些名词，但说不清它们各自解决什么问题、什么时候用 SpringCloud 什么时候用 Dubbo 的人。
> **怎么读**：原理篇理解"微服务要解决哪五个问题"；应用篇 Gateway 和 Dubbo 代码可抄；进阶篇 Netflix 停更和 CP vs AP 是面试热点。

---

## 零、先建立整体印象：把它想象成"城市公交系统"

一个城市的公交系统 = 多条线路 + 换乘站 + 调度中心 + 应急机制：

| 公交系统 | 对应微服务 | 一句话 |
|---|---|---|
| **线路总图（哪路车经过哪站）** | 注册中心（Eureka/Nacos/ZK） | 记录"现在有哪些服务在跑、IP 和端口是多少" |
| **火车站/机场（统一入口）** | 网关（Gateway） | 所有外部请求从这里进，验票、限流、指路 |
| **公交线路换乘** | 服务间调用（Feign/Dubbo） | A 服务查 B 服务，像乘客从 1 路换到 2 路 |
| **调度中心（哪条路堵车就限流）** | 熔断限流（Sentinel/Hystrix） | 某条线路故障，临时改道或停运，不影响全城 |
| **广播通知"线路调整"** | 配置中心（Nacos/Apollo） | 改规则不用停运，广播出去所有车立刻知道 |
| **交通事故应急** | 降级兜底 | 主路断了，走辅路；辅路也断了，发"暂停服务"通知 |

---

## 一、原理篇：微服务要解决五个核心问题

拆完单体后，你必须回答这五个问题：

```
1. 服务在哪？        → 注册中心
2. 怎么找到它？      → 服务发现
3. 怎么调用它？      → RPC / HTTP（Feign / Dubbo）
4. 它挂了怎么办？    → 熔断、降级、限流
5. 配置怎么统一管？  → 配置中心
```

**对应组件表**（简历技术栈 = SpringCloud Alibaba + Dubbo + ZK）：

| 问题 | Netflix 套件（老） | SpringCloud Alibaba（新） | Dubbo 生态 |
|---|---|---|---|
| 注册发现 | Eureka（停更） | **Nacos** | **Nacos / ZK** |
| 配置中心 | Config（鸡肋） | **Nacos**（注册+配置一体） | Nacos |
| 网关 | Zuul（阻塞） | **Gateway**（响应式） | — |
| 熔断限流 | Hystrix（停更） | **Sentinel** | Sentinel |
| 远程调用 | OpenFeign（HTTP） | OpenFeign | **Dubbo（RPC）** |
| 链路追踪 | — | SkyWalking | SkyWalking |

> 💡 **选型结论**：新项目直接 **SpringCloud Alibaba + Nacos + Gateway + Sentinel + Dubbo**（简历就是这个组合）。Netflix 那套（Eureka/Hystrix/Zuul）已停更，别再用了。

---

## 二、应用篇（代码，照着抄）

### 2.1 网关 Gateway：所有请求的"统一入口"

Gateway 是响应式、非阻塞的，性能比老旧的 Zuul 高得多。它做的事 = **验身份 → 限流量 → 找地址 → 送过去**。

```java
@Bean
public RouteLocator routes(RouteLocatorBuilder builder) {
    return builder.routes()
        // 匹配 /api/order/** 的请求 → 转发到 order-service
        .route("order-route", r -> r.path("/api/order/**")
            .filters(f -> f
                // ① 认证过滤器：解析 JWT，没令牌直接 401
                .filter(authFilter)
                // ② 限流过滤器：每秒最多 1000 个请求
                .filter(rateLimitFilter)
                // ③ 去掉 /api 前缀，只把 /order/** 转给下游
                .stripPrefix(1)
                // ④ 给请求头加 traceId，方便全链路追踪
                .addRequestHeader("X-Trace-Id", UUID.randomUUID().toString()))
            // lb:// = 从注册中心（Nacos）找服务并负载均衡
            .uri("lb://order-service"))
        .route("user-route", r -> r.path("/api/user/**")
            .filters(f -> f.stripPrefix(1))
            .uri("lb://user-service"))
        .build();
}
```

**Filter 执行顺序**：Global Filter（全局）→ Gateway Filter（路由级）。认证和限流通常放全局，日志和重写放路由级。

### 2.2 Dubbo RPC：像调本地方法一样调远程

Dubbo 是**RPC 框架**（Remote Procedure Call），核心优势是**高性能**——基于 Netty 长连接 + Hessian2 序列化，比 HTTP 快 2~5 倍。

**服务提供方**（暴露服务）：
```java
@DubboService(version = "1.0.0")   // 暴露到注册中心
public class OrderServiceImpl implements OrderService {
    @Override
    public Order getOrder(Long id) {
        return orderMapper.selectById(id);
    }
}
```

**服务消费方**（调用远程）：
```java
@Service
public class PayServiceImpl {
    // 像注入本地 Bean 一样注入远程服务
    // Dubbo 帮你做：找地址 → 建连接 → 发请求 → 收结果 → 异常处理
    @DubboReference(version = "1.0.0", check = false)
    private OrderService orderService;

    public void pay(Long orderId) {
        Order order = orderService.getOrder(orderId);   // 看起来像本地调用
        // ... 扣款逻辑
    }
}
```

**和 OpenFeign 对比**（面试常问）：

| | OpenFeign（SpringCloud） | Dubbo |
|---|---|---|
| **协议** | HTTP + JSON | 自定义协议（Netty 长连接 + Hessian2） |
| **性能** | 一般（HTTP 头开销大） | **高**（二进制序列化、长连接复用） |
| **耦合度** | 弱（HTTP 通用，非 Java 也能调） | 强（接口即契约，双方必须共享接口 jar） |
| **适用** | 跨语言、弱耦合、通用 REST | **内网 Java 服务间高性能调用** |
| **负载均衡** | Ribbon / LoadBalancer | 内置（随机、轮询、一致性哈希等） |

> ✅ **建议**：对外暴露的 API（给前端/第三方）用 HTTP（Gateway + Feign）；**内部服务间调用用 Dubbo**，性能更好。

---

## 三、进阶篇（面试深挖 + 生产注意）

### 3.1 SpringCloud Netflix 为什么被弃用

| 组件 | 状态 | 替代品 |
|---|---|---|
| Eureka | 停更 | **Nacos**（注册+配置一体，性能更好） |
| Hystrix | 停更 | **Sentinel**（阿里开源，功能更强，有控制台） |
| Zuul | 停更 | **Gateway**（响应式、非阻塞） |
| Ribbon | 维护模式 | **LoadBalancer**（Spring 官方） |

> 💡 **Netflix 组件停更不是因为不好，是因为 Netflix 自己不用了**，开源社区没人维护了。阿里生态（Alibaba Cloud）接棒，所以新项目直接走 Alibaba 套件。

### 3.2 服务雪崩与三板斧

**雪崩**：一个服务慢/挂了，调用方线程全部阻塞等它 → 调用方也挂了 → 上游继续挂 → 全链路崩。

**三板斧**：

| 手段 | 作用 |  analogy |
|---|---|---|
| **限流** | 入口控量，超出的直接拒绝 | 车站限流，站台满了不让进 |
| **熔断** | 下游故障率太高，暂时切断调用 | 线路塌方，临时停运 |
| **降级** | 关掉非核心功能，返回简化版 | 只保留主线，支线暂停 |

**简历里的降级方案**：合同系统用**策略模式**做服务降级——正常走完整审批流程，压力大时切到"简化审批"策略，只保留关键节点。

### 3.3 注册中心选型：CP vs AP（面试必考）

| | CP（强一致） | AP（高可用） |
|---|---|---|
| **代表** | ZooKeeper、Nacos（默认 CP 模式） | Eureka、Nacos（可切 AP 模式） |
| **网络分区时** | 宁可拒绝服务，也不给错误地址 | 各节点独立提供服务，可能读到旧列表 |
| **适用** | 交易、协调、锁（不能容忍数据不一致） | 纯查询、读旧列表顶多调到一个下线节点（重试即可） |

> 💡 **一句话**：CAP 不能全满足，交易场景选 CP（一致），查询场景选 AP（可用）。

### 3.4 分布式事务：能不用就不用

微服务拆开后，一个操作可能跨多个数据库。**能异步补偿的，就别上分布式事务。**

| 方案 | 原理 | 代价 |
|---|---|---|
| **最终一致**（推荐） | 本地事务 + MQ 异步通知 + 补偿任务 | 无性能损耗，短暂不一致可接受 |
| **Seata AT** | 加 `undo_log` 表，二阶段回滚 | 性能损耗 30%+，热点行锁竞争 |
| **TCC** | 业务层实现 Try/Confirm/Cancel | 开发成本高，每个接口要拆三段 |

> ⚠️ **只有信贷、资金、支付这类"一分钱都不能错"的场景才值得上 Seata**。普通业务用"本地消息表 + 定时补偿"就够了。

### 3.5 其他生产注意

- **版本对齐**：SpringCloud 与 SpringBoot 版本强绑定，建项目先查官网兼容表，别乱配
- **灰度发布**：Nacos 支持标签路由 / 权重路由；发布时先切 5% 流量验证，再全量
- **无损下线**：服务停之前先从注册中心摘流量（`preStop` 钩子），避免正在处理的请求被中断
- **链路追踪**：SkyWalking 自动埋点，跨服务调用链一屏看完，定位慢调用节点

---

## 关联
- 注册中心 ZK 详情见 [[13_Zookeeper 实战]]
- 高并发下的限流熔断见 [[15_高并发高可用设计]]
- 消息队列异步解耦见 [[12_消息队列 Kafka 与 RabbitMQ]]
- 链路追踪和监控工具见 [[18_开发工具链]]
