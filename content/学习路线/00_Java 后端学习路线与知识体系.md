---
title: "Java 后端学习路线与知识体系（百度云盘资料提炼）"
---
# Java 后端学习路线与知识体系（百度云盘资料提炼）

> **一句话概括**：Java 后端学习 = 基础打牢 → 框架熟练 → 微服务分布式 → 容器化运维 → 高并发架构。每一层都不是孤立的，而是层层递进、互相支撑。
>
> **资料来源**：百度云盘 `/02_学习/` 目录下的 Java 相关学习资料
> **怎么读**：先看整体路线图，再按阶段对照云盘资料逐个攻克，最后用面试自检清单查漏补缺。

---

## 零、整体学习路线图

```
阶段一：Java 基础（已掌握）
  └─ 语法、集合、JUC、JVM、设计模式

阶段二：主流框架（已掌握）
  └─ Spring、SpringBoot、MyBatis、Redis、MySQL

阶段三：微服务分布式（云盘重点资料）
  ├─ 注册配置中心：Nacos
  ├─ 网关：SpringCloud Gateway
  ├─ 熔断限流：Sentinel
  ├─ 远程调用：Dubbo / OpenFeign
  ├─ 分布式事务：Seata
  └─ 链路追踪：Sleuth / SkyWalking

阶段四：容器化与 DevOps（云盘资料）
  ├─ Docker 基础与镜像仓库
  ├─ Docker Compose 编排
  └─ CI/CD 持续集成与交付

阶段五：消息队列与中间件（云盘资料）
  ├─ Kafka 高吞吐消息队列
  └─ Dubbo 高性能 RPC 框架

阶段六：高并发高可用架构（进阶）
  └─ 集群、负载均衡、缓存、分库分表、限流降级
```

---

## 一、阶段三：微服务分布式（云盘核心资料）

> 云盘位置：`/02_学习/springCloud学习文档/`

### 1.1 Nacos：注册中心 + 配置中心 二合一

**核心作用**：
- **服务注册发现**：所有服务启动时把自己的 IP:端口 注册到 Nacos，调用方从 Nacos 拉取服务列表
- **配置中心**：统一管理所有服务的配置文件，改配置不用重启服务，动态刷新

**关键概念**：
| 概念 | 说明 |
|---|---|
| Namespace | 命名空间，区分环境（dev/test/prod） |
| Group | 分组，区分业务线 |
| Service | 服务名，唯一标识一个微服务 |
| Cluster | 集群，同一个服务的不同机房分组 |
| Data ID | 配置文件的唯一标识 |

**面试重点**：
- Nacos 是 AP 还是 CP？→ Nacos 支持 AP/CP 切换，默认 AP
- 服务心跳机制：临时实例用心跳，永久实例用主动探测
- 配置动态刷新原理：长轮询 + 本地缓存对比

---

### 1.2 SpringCloud Gateway：响应式网关

**核心作用**：所有外部请求的统一入口，做**认证、限流、路由、日志**。

**核心概念**：
| 概念 | 说明 |
|---|---|
| Route | 路由，匹配规则 + 转发目标 |
| Predicate | 断言，判断请求是否匹配该路由（路径、Header、时间等） |
| Filter | 过滤器，请求转发前/后做处理（鉴权、限流、改 Header） |

**Gateway vs Zuul**：
- Zuul 1.x：Servlet 阻塞模型，性能差
- Gateway：基于 WebFlux + Netty，非阻塞响应式，性能高

**常用过滤器**：
- `StripPrefix`：去掉路径前缀
- `AddRequestHeader`：添加请求头（透传用户ID、traceId）
- `RequestRateLimiter`：限流
- 自定义全局过滤器：统一鉴权

---

### 1.3 Sentinel：熔断限流降级

**核心作用**：保护系统不被流量冲垮，三大功能 = **限流 + 熔断 + 降级**。

| 功能 | 场景 | 配置方式 |
|---|---|---|
| 限流 | 每秒最多 1000 请求，超出拒绝 | QPS 阈值、线程数阈值 |
| 熔断 | 下游服务错误率超 50%，暂停调用 10 秒 | 慢调用比例、异常比例、异常数 |
| 降级 | 主流程挂了，返回兜底数据 | fallback 方法 |

**Sentinel vs Hystrix**：
- Hystrix：线程池隔离，开销大，已停更
- Sentinel：信号量隔离，轻量，阿里开源，控制台可视化

**滑动窗口原理**：把 1 秒分成多个小窗口，每个窗口独立统计，滑动计算 QPS。

---

### 1.4 分布式事务：Seata

**核心问题**：一个操作跨多个服务（比如下单 = 扣库存 + 扣余额 + 建订单），怎么保证要么全成功，要么全回滚？

**四种模式**：
| 模式 | 原理 | 一致性 | 性能 | 适用场景 |
|---|---|---|---|---|
| AT | 一阶段提交 + 回滚日志自动补偿 | 最终一致 | 高 | 大多数业务，推荐 |
| TCC | Try-Confirm-Cancel，手动写三个方法 | 最终一致 | 中 | 资金、库存等强一致场景 |
| SAGA | 长事务，每个步骤都有补偿 | 最终一致 | 中 | 业务流程长、参与者多 |
| XA | 两阶段提交，数据库层面支持 | 强一致 | 低 | 对一致性要求极高 |

**Seata 三大组件**：
- **TC（Transaction Coordinator）**：事务协调器，全局事务管理器
- **TM（Transaction Manager）**：事务管理器，发起全局事务
- **RM（Resource Manager）**：资源管理器，分支事务的数据库连接

---

### 1.5 Sleuth + SkyWalking：链路追踪

**核心问题**：一个请求经过网关 → A服务 → B服务 → C服务，在哪一步慢了？在哪一步报错了？

**Sleuth 核心概念**：
| 概念 | 说明 |
|---|---|
| TraceId | 整条链路唯一ID，一次请求全链路不变 |
| SpanId | 当前这一段调用的ID，每段调用一个 |
| ParentSpanId | 父调用的 SpanId，用来还原调用树 |

**你抓包看到的 `X-B3-TraceId`、`X-B3-SpanId` 就是 Sleuth 的 B3 协议头。**

**Sleuth vs SkyWalking**：
- Sleuth：只负责生成和传递 traceId，需要配合 Zipkin 展示
- SkyWalking：一站式 APM，Agent 无侵入，自带 UI，功能更强（性能分析、告警、拓扑图）

**推荐**：生产用 SkyWalking，开发调试用 Sleuth + 日志打 traceId。

---

## 二、阶段四：容器化与 DevOps（云盘资料）

> 云盘位置：`/02_学习/Docker 学习笔记/`

### 2.1 Docker 核心

| 知识点 | 核心内容 |
|---|---|
| 镜像 Image | 只读模板，包含运行环境 + 应用代码 |
| 容器 Container | 镜像的运行实例，隔离的进程空间 |
| 仓库 Registry | 存放镜像的地方（Docker Hub、私有 Harbor） |
| Dockerfile | 构建镜像的脚本，FROM/COPY/RUN/CMD/EXPOSE |
| 数据卷 Volume | 容器数据持久化，挂载宿主机目录 |
| 网络 Network | bridge/host/none，容器间通信 |

### 2.2 Docker Compose

**作用**：单机多容器编排，一个 `docker-compose.yml` 定义多个服务，一键启动。

**常用配置**：
```yaml
version: '3'
services:
  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: 123456
    volumes:
      - ./mysql/data:/var/lib/mysql
    ports:
      - "3306:3306"
  redis:
    image: redis:7
    ports:
      - "6379:6379"
  app:
    build: .
    depends_on:
      - mysql
      - redis
    ports:
      - "8080:8080"
```

### 2.3 CI/CD 持续集成与交付

**核心流程**：
```
代码提交 → 自动构建 → 自动测试 → 自动打包镜像 → 自动部署
  (Git)     (Maven)    (JUnit)    (Docker)     (Deploy)
```

**常用工具链**：Jenkins / GitLab CI / GitHub Actions + Docker + Harbor + K8s

---

## 三、阶段五：消息队列与 RPC（云盘资料）

> 云盘位置：`/02_学习/JAVA/KafKa/`、`/02_学习/JAVA/Dubbo/`

### 3.1 Kafka

**核心作用**：高吞吐、低延迟的分布式消息队列，适合日志收集、数据流、事件驱动。

**核心概念**：
| 概念 | 说明 |
|---|---|
| Broker | Kafka 服务节点，一个集群多台 Broker |
| Topic | 消息主题，一类消息一个 Topic |
| Partition | 分区，一个 Topic 分多个 Partition，并行读写 |
| Producer | 生产者，发消息 |
| Consumer | 消费者，收消息 |
| Consumer Group | 消费者组，组内负载均衡，组间广播 |
| Offset | 消息偏移量，消费者消费位置 |
| Replica | 副本，每个 Partition 多副本，主从同步 |

**Kafka 高可用原理**：
- Partition 多副本，Leader 负责读写，Follower 同步
- Leader 挂了，从 Follower 中选新 Leader
- 生产者 acks=all，确保所有副本都写入才返回成功

**Kafka 不丢消息**：
- 生产者：acks=all + 重试
- Broker：多副本 + 最小同步副本数
- 消费者：手动提交 offset，处理完再提交

### 3.2 Dubbo

**核心作用**：高性能 Java RPC 框架，服务间调用像调用本地方法一样。

**核心架构**：
| 角色 | 说明 |
|---|---|
| Provider | 服务提供者，暴露服务 |
| Consumer | 服务消费者，调用远程服务 |
| Registry | 注册中心（Nacos/ZK），服务注册发现 |
| Monitor | 监控中心，统计调用次数和耗时 |
| Container | 服务运行容器（Spring） |

**调用流程**：
```
Provider 启动 → 注册到 Registry
Consumer 启动 → 从 Registry 拉取 Provider 列表
Consumer 调用 → 本地负载均衡选一个 Provider → 网络调用 → 返回结果
```

**Dubbo vs Feign**：
| 对比 | Dubbo | Feign |
|---|---|---|
| 协议 | Dubbo 协议（TCP，二进制） | HTTP（文本） |
| 性能 | 高（长连接、二进制序列化） | 中（HTTP 开销大） |
| 易用性 | 需要接口 JAR 包依赖 | 简单，写接口+注解 |
| 适用 | 内部服务间高频调用 | 对外、跨语言、简单调用 |

**负载均衡策略**：随机、轮询、最少活跃调用数、一致性 Hash

---

## 四、百度云盘 Java 学习资料索引

| 主题 | 云盘路径 | 资料文件 |
|---|---|---|
| Nacos | `/02_学习/springCloud学习文档/` | SpringCloud-Nacos.pdf |
| Sentinel | `/02_学习/springCloud学习文档/` | SpringCloud-Sentinel.pdf |
| Gateway | `/02_学习/springCloud学习文档/` | SpringCloud-Gateway.pdf |
| 分布式事务 | `/02_学习/springCloud学习文档/` | SpringCloud-分布式事务.pdf |
| 链路追踪 | `/02_学习/springCloud学习文档/` | SpringCloud-Sleuth.pdf |
| Docker Compose | `/02_学习/Docker 学习笔记/Docker课件/` | docker7-Docker-Compose.pdf |
| CI/CD | `/02_学习/Docker 学习笔记/Docker课件/` | docker8-持续集成与持续交付.pdf |
| Docker 仓库 | `/02_学习/Docker 学习笔记/Docker课件/` | docker4-仓库.pdf |
| Docker 课程介绍 | `/02_学习/Docker 学习笔记/` | Docker-课程介绍.docx |
| Kafka | `/02_学习/JAVA/KafKa/` | 资料 + 截图 |
| Dubbo | `/02_学习/JAVA/Dubbo/` | 资料 + 截图 |
| Typora（非学习） | `/02_学习/JAVA/Typora/` | 安装包，建议移到软件安装包目录 |

---

## 五、面试自检清单

### 微服务
- [ ] 说清楚微服务要解决哪五个核心问题
- [ ] Nacos AP/CP 切换原理、心跳机制
- [ ] Gateway 路由、断言、过滤器，和 Zuul 区别
- [ ] Sentinel 限流熔断降级，滑动窗口原理
- [ ] 分布式事务四种模式对比，Seata AT 模式原理
- [ ] Sleuth traceId/spanId，SkyWalking 无侵入原理

### 容器化
- [ ] Docker 镜像、容器、仓库区别
- [ ] Dockerfile 常用指令
- [ ] Docker Compose 编排
- [ ] CI/CD 完整流程

### 中间件
- [ ] Kafka Topic/Partition/Consumer Group，高可用原理
- [ ] Kafka 不丢消息的三种保障
- [ ] Dubbo 架构角色、调用流程
- [ ] Dubbo vs Feign 对比
- [ ] Dubbo 负载均衡策略

---

## 六、关联笔记

- [[14_微服务 SpringCloud 与 Dubbo]] — 微服务详细原理与代码
- [[12_消息队列 Kafka 与 RabbitMQ]] — Kafka 深入讲解
- [[17_Docker容器排错]] — Docker 实战排错
- [[05_SpringBoot 核心]] — SpringBoot 基础
- [[15_高并发高可用设计]] — 架构进阶
- [[22_从零搭建芋道式脚手架框架]] — 框架实战

---

> **最后一句话**：技术不是学出来的，是用出来的。每学一个组件，都要在本地跑起来、写个 Demo、踩几个坑，才算真正掌握。云盘里的 PDF 是地图，不是终点——照着走，还要自己走一遍。
