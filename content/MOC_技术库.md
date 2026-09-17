---
title: "MOC · 技术库（Java 开发）"
tags: 技术/java 技术/jvm 技术/框架 技术/数据库 技术/缓存 技术/微服务 技术/高并发 技术/工具 技术/前端 技术/安全 技术/架构 技术/书籍 技术/计算机基础 技术/代码规范
---
# MOC · 技术库（Java 开发）

Java 全栈技能地图。全部笔记已按「原理 → 应用 → 进阶」三层 + **通俗易懂风格**重写：每篇都有「一句话概括 + 生活类比贯穿 + 大白话讲透 + 逐行代码注释 + ⚠️💡 标记」。基础 → 框架 → 中间件 → 高并发 → 前端安全 → 工具 → 大模型 → 架构实战，最后以【技术书籍笔记】补上**方法论与底层地基**。详见 [[MOC_技术书籍]]。

## 零、学习路线总览
- [[00_Java 后端学习路线与知识体系]] — 百度云盘资料提炼，六阶段学习路线图 + 微服务/容器化/中间件核心知识 + 云盘资料索引 + 面试自检清单

## 一、Java 基础
- [[01_Java 基础核心]] — 集合 / 异常 / 反射 / 泛型 / IO / NIO
- [[02_JVM 原理与调优]] — 内存结构 / GC / 类加载 / 调优参数 / OOM
- [[03_JUC 详细讲解]] ⭐ — JUC 专篇（原理 → 应用 → 进阶）**全篇按「线上真实场景 + 可抄代码 + 出事怎么查」三段式写**。原理：线程状态机（含 `top -Hp`→`printf %x`→`jstack nid` 三步定位卡点）/ 三大特性（含可见性 bug 现场复现）/ 锁升级（含 `waiting to lock` 同地址配对法定位锁竞争）/ CAS 自旋烧 CPU 的识别与退避写法 / AQS。应用：`ReentrantLock` 分段锁库存扣减（tryLock 超时降级 + 中断标志恢复）· `Condition` 双队列自研阻塞队列（`while` 防伪唤醒）· 订单池完整配置（核数测算 + 埋点监控看板 + 四种拒绝策略选择 + `jstack` 按线程名溯源）· 商品详情页 6 路聚合（串行 600ms → 并行 250ms，`thenCompose` 依赖串联 + `orTimeout` 硬降级）· 三种并发容器取舍。进阶：线程池执行顺序用数字走一遍 / 无界队列 OOM 报错特征 / 死锁三步定位（`jstack` 自动分析 + `thread -b` + `ThreadMXBean` 主动告警）/ TTL 解决线程池传参丢失 / `ConcurrentHashMap` 1.8 协同扩容 / 三大同步器辨析（`CountDownLatch`·`CyclicBarrier`·`Semaphore` 限流批查）。末附**面试速查表**（11 问一页背完）
- [[04_设计模式]] — 创建/结构/行为型，Spring 中的体现
- [[23_分布式锁实现原理与实战]] — Redis/ZK/数据库三种实现 / Redisson watchdog / 选型决策 / 秒杀场景
- [[24_接口幂等设计与防重实战]] — Redis Token / 唯一索引 / 状态机 / MQ消费幂等 / 前端防重
- [[25_Arthas线上诊断与性能调优]] — 不用重启改代码 / thread/trace/watch/jad / CPU飙高排查 / 火焰图
- [[26_生产故障排查方法论与复盘]] — 黄金5分钟止血 / 5Why根因 / 常见故障排查套路 / 复盘模板
- [[33_Java 8、17、21 特性全解]] ⭐ — 三个 LTS 版本语言特性专篇。Java 8（Lambda / 函数式接口四大件 / Stream 三段结构与惰性求值 / 方法引用 / Optional / default 方法 / java.time / CompletableFuture）→ Java 9~16 过渡 → Java 17（文本块 / record / sealed / switch 表达式 / instanceof 模式匹配 / 增强 NPE）→ **Java 21（虚拟线程与 pinning / 结构化并发 / 记录模式 / switch 模式匹配 / 分代 ZGC / SequencedCollection）** → 三版本横向对比 + 升级迁移五步法与依赖对照 + 五阶段动手路线

## 二、框架与持久层
- [[05_SpringBoot 核心]] — 自动配置原理 / 启动流程 / 常用注解
- [[06_MyBatis 与 MyBatis-Plus]] — 动态 SQL / Wrapper / 分页 / 逻辑删除 / 乐观锁
- [[07_MySQL 与 SQL 优化]] — 索引 / 事务锁 / EXPLAIN / 分库分表 / 与 Oracle·DM 差异
- [[08_PostgreSQL JSONB 使用笔记]] — JSONB vs 关系表 / 操作符 / GIN 索引 / MP 集成
- [[09_达梦 DM 数据库]] — 国产库，兼容 Oracle，迁移与 MP 注意点
- [[28_分库分表落地实战]] — 垂直/水平拆分 / 分片算法 / 分片键选择 / ShardingSphere / 跨库查询/分布式事务/扩容

## 三、缓存与中间件
- [[10_Redis 实战]] — 数据结构 / 持久化 / 穿透击穿雪崩 / 分布式锁 / 原子操作
- [[11_本地缓存 Ehcache 与 Caffeine]] — 多级缓存第一级，Caffeine W-TinyLFU
- [[12_消息队列 Kafka 与 RabbitMQ]] — 解耦异步削峰 / 丢失重复顺序积压（RabbitMQ 深入见下方 35 号专篇）
- [[35_RabbitMQ 实战详解（场景·用法·弊端·举一反三）]] ⭐⭐ — RabbitMQ 专篇（**小白友好 + 生产级**，七章结构）。**零·建立印象**（19 个黑话的大白话词典 / 快递收发室类比 / 核心概念 / 一条消息的完整旅程 8 步 / 什么时候该用）→ **一·原理篇（三层机制）**：分拣层 Exchange 四类型 direct·topic·fanout·headers（"四个性格不同的分拣员"）· 存储层 classic vs quorum 与消息三状态 · 投递层推送模型与 `prefetch` 信用额度 · **三层机制 → 三类问题的对应关系** → **二·进阶篇（深水区）**：可靠性五道防线 · 顺序性（按业务 ID 分队列）· 事务与一致性（本地消息表完整实现）· 性能与集群（含为何要奇数节点）· **机制 → 配置 → 症状总结表** → **三·Java 实战**：生产级 yml 逐行注释 / 声明交换机队列绑定（含死信）/ 生产者 + Confirm·Return 两个回调 / **手动 Ack 完整写法（含幂等校验）** / JSON 转换器 / 延时队列实战（TTL+DLX 与队头阻塞）/ 生产调优速查表 → **四·问题与解决方案（核心）**：**症状速查表 → P1~P15 问题详解**（每条含：症状 · 根因 · 打比方 · 排查步骤 · 解决方案代码）——P1 消息静默消失 / P2 Broker 重启丢消息 / P3 消费者崩了丢消息 / P4 `requeue=true` 死循环 / P5 `requeue=false` 未配 DLX / P6 重复消费 / P7 积压雪崩 / P8 消费者饥饿 / P9 TTL 队头阻塞 / P10 连接泄漏 / P11 转换器不一致 / P12 顺序错乱 / P13 队列消失 / P14 死信无告警 / P15 集群分区丢数据；另附 16 条坑位速查表 · `rabbitmqctl` 排错工具箱 · **生产上线检查清单** → **五·常见认知误区**（7 条）→ **六·动手路线**（五阶段）→ **七·一句话总结**：四个核心认知 + **原理 ↔ 实战对应关系全文地图** + 🧑🎓 新手学习路线（5 轮读法）
- [[13_Zookeeper 实战]] — 注册中心 / 分布式锁 / watch 机制（秒杀清标记）
- [[27_XXL-JOB分布式任务调度实战]] — 调度中心+执行器 / 路由策略 / 分片广播 / 阻塞策略 / 失败告警

## 四、分布式与微服务
- [[14_微服务 SpringCloud 与 Dubbo]] — 注册发现 / 网关 / 熔断限流 / RPC
- [[15_高并发高可用设计]] — 多级缓存 / 限流 / 降级熔断 / 库存扣减 / 幂等（简历秒杀·大屏）
- [[16_Flowable 工作流]] — BPMN / 七大 Service / 会签干预驳回（合同系统）

## 五、运维与工具
- [[17_Docker容器排错]] — 诊断三板斧 / 6 类常见问题 / 速查命令
- [[18_开发工具链]] — Git / Maven / Arthas / JMeter（速览版）
- [[29_Linux运维与性能诊断实战]] — CPU/内存/磁盘/网络四大件 / 进程与服务管理 / 日志排查 / 性能排查完整流程
- [[31_Git 原理、应用与进阶（含 IDEA 实战）]] ⭐ — Git 专篇。原理（快照模型 / blob·tree·commit 三对象 / SHA-1 内容寻址 / HEAD 与分支指针 / 三区状态流转 / reflog）→ 应用（配置 / 三件套 / 查看 / 分支 / 远程 / 撤销对照表 / stash / tag / 工作流选型）→ 进阶（merge vs rebase / rebase -i / cherry-pick / reflog 救援实录 / 冲突 / .gitignore·.gitattributes / LFS / submodule / hooks / 仓库瘦身 / 翻车救援手册）→ **IDEA 实战**（配置 / 界面 / Commit·Log 面板 / 分支 / 三栏合并 / 回退 / Shelve vs Stash / .idea 处理 / 快捷键 / 常见报错）→ 踩坑速查表 + 五阶段动手路线
- [[32_Maven 配置详解与实战（含 IDEA 配置）]] ⭐ — Maven 专篇。原理（GAV 坐标 / 仓库三级 / 依赖传递与两条仲裁规则 / scope 六种 / 三套生命周期 / 插件与 goal）→ **配置篇（settings.xml 逐段：localRepository·mirrors·servers·proxies·profiles·完整模板；pom.xml 逐段：坐标·parent·properties·dependencies vs dependencyManagement·repositories·build·distributionManagement·modules；多环境两套方案；Nexus 私服发布；JDK 四种配法；常用插件；多模块父 pom 模板）** → 命令速查 + 依赖排查 → 进阶（依赖冲突四步法 / SNAPSHOT vs RELEASE / BOM / 构建加速 6 招 / 报错手册）→ **IDEA 配置**（settings 对齐 / Importing / Runner / Maven 面板 / Profiles / 常见问题）→ 踩坑速查表 + 五阶段动手路线

## 六、前端与安全
- [[19_前端 Vue 与 ElementUI]] — HTML/CSS/JS 基础 / 响应式原理 / Vue3 组合式 API / axios 联调 / ElementPlus CRUD / 路由守卫（后端视角）
- [[20_Spring Security 与 OAuth2-JWT 安全认证]] — 认证 vs 授权 / Session-JWT-OAuth2 / 过滤器链 / SecurityFilterChain / JWT / RBAC
- [[21_Minio 对象存储]] — 对象存储原理 / 纠删码 / S3 兼容 / Spring Boot 集成 / presigned 直传 / 分片 / 与 OSS 对比

## 七、架构实战（综合篇）
- [[22_从零搭建芋道式脚手架框架]] ⭐ — 通俗版串讲篇。开篇用「开连锁餐厅」类比建立整体印象，全文大白话 + 逐行代码注释。含：脚手架定位 / Manager 层 / 五灵魂设计 / **9 步搭建**（多模块→统一返回→MP→认证→RBAC→数据权限→注解化能力→代码生成→微服务化）/ starter 自动装配 / 多租户 / 分布式事务 / 安全清单 / 面试话术 / 坑速查表 / 动手路线

## 八、大模型与 AI
- [[30_大模型部署与应用实战]] — Qwen模型选型 / vLLM高性能推理 / OneAPI统一网关 / Dify应用编排（对话·知识库RAG·工作流）/ 完整架构 / Java后端集成
- [[34_Spring AI 实战]] ⭐ — Spring AI 专篇（Java 生态的 AI 应用框架）。原理（六大核心抽象 / ChatModel·ChatClient·Advisor·EmbeddingModel·VectorStore / 版本现状 1.0/1.1/2.0）→ 应用（依赖配置 / 第一个对话接口 / 提示词模板与结构化输出 / 流式 SSE / 多轮记忆 / **RAG 全流程与四个坑** / **Tool Calling @Tool** / **MCP 双向集成** / 多模型共存与降级）→ 进阶（自定义 Advisor / 可观测性 / 成本优化六招与语义缓存 / Evaluator 评测 / 生产化清单）→ 弊端与坑（框架六个局限 + 通用 LLM 十坑）→ 选型对比（Spring AI vs LangChain4j vs Dify）+ 五阶段动手路线

## 九、Yudao-cloud 微服务专题（33 篇）
- [[一键改包]] ⭐ — 用「给公司整体改名」类比讲透 `ProjectReactor`：原理（复制→扫描→替换→移动）/ 名字藏身 7 处 / 4 步实操 / 改完 10 项检查清单 / 报错速查表 / 微服务版额外检查（Nacos·Gateway·Seata·Docker）/ 升级冲突破解 / 回滚方案
- [[技术选型]] ⭐ — **费曼学习法 4 段式**讲清芋道技术栈：架构图逐项翻译（餐厅布局类比）/ 后端 7 个角色 7 个职位 / 前端 5 套方案对比 / 选型 8 问决策框架 / 微服务版额外补充（Nacos·Seata·XXL-Job·SkyWalking）/ 版本陷阱（JDK 17 / Jakarta / Security 6）/ 面试话术
- [[Yudao-cloud BPM 踩坑]] — 工作流模块踩坑实录（部署 / 会签 / 驳回 / 微服务化注意）

### 后端手册（30 篇）
**数据层**
- [[MyBatis 数据库]] — `BaseDO` / `TenantBaseDO` / 逻辑删除 + `delete_time` 在唯一索引 / TypeHandler / 6 条编码规范 / `BaseMapperX` / 批量插入
- [[MyBatis 联表分页查询]] — XML 分页 2 种写法 / MPJLambdaWrapper / N+1 避免 / 分页+联表坑
- [[多数据源（读写分离）、事务]] — Druid vs HikariCP / `@Master`/`@Slave`/`@DS` / `@DSTransactional` / Seata
- [[分页实现]] — Vue 前端 + `PageParam`/`PageResult` / 深分页优化 / COUNT(*) 优化
- [[数据库文档]] — Screw 实时生成在线数据库文档，改表刷新即同步

**缓存与中间件**
- [[Redis 缓存]] — 编程式 vs 声明式 / `RedisKeyConstants` 集中管理 / Cache-Aside / `cacheNames="users#300" / JSON 序列化
- [[本地缓存]] — `volatile Map` + 全量替换 / `@TenantIgnore` / Redis Pub/Sub 广播刷新
- [[分布式锁]] — Redisson `RLock` / watchdog / `@Lock4j` / 4 条件 / 6 坑 / 锁≠幂等

**高并发与安全**
- [[幂等性（防重复提交）]] — MD5 键 / 3 种 KeyResolver / 4 层防御 / 幂等 vs 锁 vs 限流
- [[请求限流 RateLimiter]] — `@RateLimiter` / 5 种 KeyResolver / 4 种算法 / 3 层限流 / HTTP 429
- [[异步任务]] — `@Async` + TransmittableThreadLocal / 4 种失败原因 / 自定义线程池

**权限与用户**
- [[功能权限]] — Token vs JWT / `@PreAuthorize` / `permitAll()` vs `anonymous()` / Boot 2 vs 3 配置
- [[用户体系]] — AdminUser vs MemberUser / `user_type` / 4 种登录方式 / 6 个坑
- [[数据权限]] — MyBatis 拦截器 + JSqlParser / 5 种数据范围 / `@DataPermission` / 字段权限不支持
- [[OAuth 2.0（SSO 单点登录）]] — 4 种授权模式 / 自建 vs SAS / 8 步授权码流程 / `system_oauth2_*` 5 张表
- [[三方登录]] — JustAuth / `system_social_user` + `system_social_user_bind` / 快捷登录 vs 绑定登录 / 小程序一键登录

**SaaS 与多租户**
- [[SaaS 多租户 字段隔离]] — COLUMN 模式 / `TenantContextHolder` / 8 层封装 / `@TenantIgnore` / `TenantUtils.execute()` / `@TenantJob` / 8 个坑
- [[SaaS 多租户 数据库隔离]] — DATASOURCE 模式 / `@Master`/`@TenantDS` / 叠加 COLUMN / `@DSTransactional` / Seata

**文件与通信**
- [[文件存储（上传下载）]] — S3 对象存储 / 5 种 FileClient 实现 / 前端直传 S3（presigned URL）/ CORS / 自定义域名
- [[WebSocket 实时通信]] — 上行走 HTTP / 下行走 WebSocket / `@TenantJob` / Redis 集群广播 / Nginx 配置

**工具与开发效率**
- [[VO 对象转换、数据翻译]] — `BeanUtils.toBean()` + Consumer / MapStruct / easy-trans `@Trans` / `@TransIgnore`
- [[Excel 导入导出]] — EasyExcel / `@ExcelProperty` / `DictConvert` / `PageReadListener` / 百万行导入
- [[参数校验、时间传参]] — `@Validated`/`@Valid` / `@NotNull`/`@NotEmpty`/`@NotBlank` 区别 / Query `@DateTimeFormat` / JSON Long 时间戳
- [[验证码]] — AJ-Captcha 行为验证码 / 二次校验 / `cache-type: redis` / 前端直传
- [[异常处理（错误码）]] — `CommonResult` / `throw exception()` / 10 位分段错误码 / 后台改文案 60 秒生效
- [[操作日志、访问日志、异常日志]] — `@LogRecord` / `_DIFF` / `@ApiAccessLog` / 脱敏 / H2 内存数据库
- [[单元测试]] — JUnit5 + Mockito / `BaseDbUnitTest` / `BaseMockitoUnitTest` / `randomPojo()` / `assertPojoEquals()`
- [[工具类 Util]] — Hutool（`StrUtil`/`CollUtil`/`MapUtil`）/ 芋道 `CollectionUtils` / Lombok 全局配置
- [[新建模块]] — 父模块(pom) + api(jar) + biz(jar) / 包名扫描 / Swagger 分组 / 404 排查

**代码生成**
- [[代码生成【单表】]] — 5 步建表规范 / 4 步生成 / 收尾 4 件事（错误码/H2/菜单SQL/刷新缓存）/ 后续变更直接改代码
- [[代码生成（树表）]] — `parent_id` / 标准/内嵌/ERP 三种模式 / 防环 / 迭代组装树
- [[代码生成【主子表】]] — 1 主 + N 子 / 标准/内嵌/ERP 模式 / 事务 / 先删后插 / N+1 避免

## 十、技术书籍笔记 📚（8 篇）
> **定位**：技术库正文（01~35 号）讲「**怎么做**」；书籍笔记讲「**为什么经典书籍这么规定**」——把大师的原则翻译成 Java 后端能落地的规矩。入口：[[MOC_技术书籍]]

### 10.1 工程素养 · 怎么写好代码
- [[《代码整洁之道》笔记]] ⭐ — **「代码写出来是给人读的，顺便能在机器上跑」**。整体印象（写信给接盘侠）→ 核心心法（五大师定义 + 四把尺子）→ **命名六铁律**（Java 改造对照 + 类/方法名约定）→ **函数六规矩**（短小 / 只做一件事 / 单一抽象层级 / switch 封装 / 参数少 / 无副作用 + 三段式重构演示）→ 注释是失败的味道 → 格式 → 错误处理 → 边界 → 单元测试 F.I.R.S.T. → 类与系统 → 并发 → **坏味道速查表** → 落地清单 + 4 轮读法
- [[《重构》笔记]] ⭐ — **「不改变外部行为，小步安全地改善结构」**。核心心法（三次法则 / 两顶帽子 / 何时不该重构）→ **24 种坏味道速查表**（含「症状→手法→IDE 快捷键」三列）→ **重构手法 6 组 60+**（提炼 / 搬移 / 重组数据 / 简化条件 / 重构 API / 处理继承）→ **Java 实战：订单结算完整重构**（从 200 行烂方法到整洁代码的全过程）→ 安全网测试 → 工作流 + 五阶段动手路线
- [[《Effective Java》笔记]] ⭐ — **Java 的 90 条最佳实践**。开篇「最易踩的 10 个坑」避坑地图 → 创建与销毁对象（静态工厂 / 建造者 / **枚举单例** / 避免多余对象 / 过期引用 / finalize）→ 通用方法（**`equals` 五约定 / `equals`+`hashCode` 契约** / `toString` / `Comparable`）→ Lambda 与 Stream → 方法与泛型（**PECS** / `BigDecimal` 用字符串构造器 / `Optional` / 基本类型 vs 装箱）→ 并发（`volatile` / 避免过度同步 / 双重检查锁）→ Java 特有坑速查表

### 10.2 底层原理 · Java 与 JVM
- [[《深入理解Java虚拟机》笔记]] ⭐ — **JVM 的「为什么」**。整体印象（公司运营类比）→ 内存结构（**JVM 内存模型 vs JMM 区分**）→ **垃圾回收（灵魂章）**：收集器演进史 ASCII 图 · 三色标记 · 增量更新 vs SATB · 记忆集/卡表 · 参数速查 → 字节码与执行引擎（CAFEBABE / 分层编译 / JIT 优化）→ 类加载机制（**双亲委派与打破案例**）→ 编译期优化与泛型（类型擦除 / 装箱坑）→ 高效并发（JMM / `volatile` / happens-before / 锁升级）→ 性能调优与诊断 → **OOM 速查**
- [[《Java性能权威指南》笔记]] — **性能从玄学变成测量**。**五层排查法** + 三条铁律 → JIT 编译与预热 → GC（三指标）→ 堆内存分析（**MAT 四视图 / 堆外内存**）→ 线程与同步（**线程池公式：核数 × 利用率 × (1 + 等待/计算)** / 伪共享 `@Contended`）→ 数据库性能（批处理 / 连接池）→ 测试方法论（**P99 比平均值重要**）→ 优化优先级清单

### 10.3 计算机基础 · 万变不离其宗
- [[《计算机组成原理》笔记]] — **一切性能问题的物理根源**。整体印象（工厂类比）+ **硬件速度量级表** → CPU 怎么干活（指令周期五步 / **流水线三种冒险** / 乱序执行）→ **四种内存屏障（直通 `volatile`）** → **存储层次与缓存（全篇最重要）**：局部性原理 / **64 字节 Cache Line** / **MESI 协议** / **伪共享与 `@Contended`** / 三种映射 / 写策略 → 指令级优化（**JIT 内联门槛 35/325 字节**）→ 存储系统（**32 位 JVM 堆上限的物理原因** / HDD vs SSD / 校验码 / ECC）→ 总线与 IO（**DMA / 零拷贝 sendfile / 页缓存**）→ **后端开发者「硬件知识映射表」**（19 条 Java 概念 ↔ 硬件根源）
- [[《操作系统》笔记]] — **Java 并发与 NIO 的地基**。整体印象（行政部门类比）→ 进程与线程（状态机 / 调度 / 上下文切换 / 三个经典同步问题 / **死锁四条件** / Java 线程映射）→ 内存管理（虚拟内存 / 分页 / 多级页表 / **TLB** / 页面置换与 Belady 异常 / 用户态内核态 / **mmap 零拷贝** / **epoll 水平与边缘触发**）→ 文件系统（inode / 硬软链接 / 磁盘调度）→ **后端开发的「操作系统知识映射表」** + COW

> 💡 **为什么多了这一层**：`volatile` 的内存屏障、`MESI` 缓存一致性、零拷贝、`epoll`、页表、伪共享——**这些「高大上」的词，答案全在计算机基础里**。读了这 8 本，面试被问「为什么」时能说到硬件层，就赢了 90% 的人。
>
> 🔗 **三层闭环**：书籍笔记（**为什么**）→ 技术库正文 [[02_JVM 原理与调优]]（**怎么做**）→ [[26_生产故障排查方法论与复盘]]（**出事怎么查**）。

## 标签约定
`#技术/java `#技术/jvm `#技术/框架 `#技术/数据库 `#技术/缓存 `#技术/微服务 `#技术/高并发 `#技术/工具 `#技术/前端 `#技术/安全 `#技术/架构 `#技术/书籍 `#技术/计算机基础 `#技术/代码规范

## 待补充
- Yudao 微服务拆解细节：Gateway 责任链、Nacos 配置灰度、Seata 落地，可在 [[22_从零搭建芋道式脚手架框架]] 基础上再拆子笔记
- PostgreSQL 深度适配：JSONB 实战细节（见 [[08_PostgreSQL JSONB 使用笔记]] 待补充坑位）、PGSQL 特有语法迁移
