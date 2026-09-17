---
title: "Arthas 线上诊断与性能调优（从入门到精通，生产必备）"
---
# Arthas 线上诊断与性能调优（从入门到精通，生产必备）

> **一句话概括**：Arthas 是 Alibaba 开源的 Java 线上诊断工具，不用重启应用、不用改代码，就能实时查看方法入参/返回值、方法耗时、线程状态、JVM 信息、反编译源码——线上出问题，Arthas 是你的「听诊器」。
>
> **适合谁**：线上出了问题只能靠加日志重新发布、排查性能问题只能猜、面试被问「线上 CPU 飙高怎么排查」答不出具体步骤的人。

---

## 零、先建立印象：把它想象成「不用开刀的 CT 扫描仪」

传统排查 = 开刀手术：加日志 → 重新发布 → 复现问题 → 看日志 → 改代码 → 再发布。一次排查可能要发布好几次，耗时几小时。

Arthas = CT 扫描：attach 到正在运行的 JVM 上，实时看内部状态，不用重启、不用改代码。几分钟就能定位问题。

| 传统方式 | Arthas |
|---|---|
| 加日志重新发布 | 实时 watch 方法入参返回值 |
| 猜哪里慢 | trace 方法调用链，精确到每一行耗时 |
| jstack 抓线程快照 | thread 命令实时看线程状态、CPU 占用 |
| 反编译 class 猜源码 | jad 直接反编译，看线上实际运行的代码 |
| 改代码加埋点 | monitor/timer 统计方法调用次数和耗时 |

---

## 一、快速上手：30 秒启动 Arthas

### 1.1 下载与启动

```bash
# 下载 Arthas
curl -O https://arthas.aliyun.com/arthas-boot.jar

# 启动（会自动扫描本机所有 Java 进程，让你选择 attach 哪个）
java -jar arthas-boot.jar

# 输出示例：
# [1]: 12345 org.springframework.boot.loader.JarLauncher
# [2]: 67890 com.example.Application
# 输入 1 回车，attach 到第一个进程
```

### 1.2 常用启动参数

```bash
# 指定进程 ID（不用交互选择）
java -jar arthas-boot.jar 12345

# 指定 telnet 端口（默认 3658）和 http 端口（默认 8563）
java -jar arthas-boot.jar --telnet-port 3658 --http-port 8563

# 远程连接
java -jar arthas-boot.jar --target-ip 192.168.1.100 --telnet-port 3658

# 退出 Arthas（不会影响应用）
quit

# 彻底关闭 Arthas 服务端
stop
```

> ⚠️ **注意**：Arthas attach 到 JVM 后，会在目标 JVM 中启动一个 Agent，占用少量内存。`quit` 只是退出客户端，Agent 还在；`stop` 会彻底卸载 Agent。

---

## 二、诊断命令大全（按场景分类）

### 2.1 场景一：CPU 飙高排查（面试必问）

**排查步骤：**
```bash
# 1. 看哪个线程 CPU 占用最高
thread -n 3          # 显示 CPU 占用最高的 3 个线程，带堆栈

# 2. 看所有线程状态
thread                # 列出所有线程，按 CPU 占用排序
thread --state BLOCKED  # 只看阻塞状态的线程

# 3. 看线程死锁
thread -b             # 检测死锁线程，直接告诉你哪个线程锁了哪个对象

# 4. 看线程池状态
thread --state WAITING  # 看等待状态的线程（可能是线程池空闲）
```

**典型输出解读：**
```
Name: http-nio-8080-exec-10
GROUP: main
PRIORITY: 5
CPU%: 85.2    ← 这个线程占了 85% 的 CPU
TIME: 0:5
INTERRUPTED: false
DAEMON: true

stack trace:
  at com.example.service.OrderService.calculate(OrderService.java:123)  ← 问题在这里
  at com.example.controller.OrderController.submit(OrderController.java:45)
```

> 💡 **醍醐灌顶**：CPU 飙高不要慌，`thread -n 3` 直接告诉你哪个线程、哪行代码在吃 CPU。90% 的情况是死循环、正则回溯、大量 GC。

### 2.2 场景二：方法耗时分析（性能优化必备）

```bash
# trace：追踪方法调用链，显示每一层调用的耗时
trace com.example.service.OrderService submitOrder
# 输出：
# `---[1200ms] com.example.service.OrderService:submitOrder()
#     +---[100ms] com.example.service.UserService:getUser()
#     +---[800ms] com.example.service.StockService:deduct()   ← 这里最慢
#     +---[200ms] com.example.mapper.OrderMapper:insert()
#     `---[100ms] com.example.service.MessageService:send()

# 只追踪耗时超过 100ms 的方法
trace com.example.service.OrderService submitOrder '#cost > 100'

# 包含 JDK 方法（默认不包含）
trace --skipJDKMethod false com.example.service.OrderService submitOrder

# stack：查看方法的调用栈（谁调用了这个方法）
stack com.example.service.OrderService submitOrder

# monitor：统计方法的调用次数、成功失败率、平均耗时（每 60 秒输出一次）
monitor com.example.service.OrderService submitOrder -c 60
# 输出：
#  timestamp          class          method        total  success  fail  avg-rt  fail-rate
#  2024-01-01 12:00  OrderService   submitOrder   100    98      2     150ms   2.00%
```

### 2.3 场景三：查看方法入参/返回值（不用加日志）

```bash
# watch：观察方法的入参、返回值、异常
watch com.example.service.OrderService submitOrder '{params, returnObj, throwExp}' -x 2
# params：入参数组
# returnObj：返回值
# throwExp：异常（如果有）
# -x 2：遍历深度（对象嵌套层级）

# 只看入参
watch com.example.service.OrderService submitOrder '{params}' -x 3

# 只看返回值
watch com.example.service.OrderService submitOrder '{returnObj}' -x 2

# 条件过滤：只看入参第一个元素等于 123 的调用
watch com.example.service.OrderService submitOrder '{params, returnObj}' 'params[0] == 123'

# 观察异常
watch com.example.service.OrderService submitOrder '{throwExp}' -e

# tt：时间隧道，记录方法的每次调用，可以回放
tt -t com.example.service.OrderService submitOrder
# 记录后用 tt -i 1000 查看第 1000 次调用的详情
# tt -i 1000 -p 回放这次调用（重新执行一次）
```

> 💡 **实战技巧**：线上出问题，客户说「我提交订单时参数是 XXX，但系统返回 YYY」。不用加日志重新发布，直接 `watch` 这个方法，让客户再操作一次，实时看到入参和返回值。

### 2.4 场景四：JVM 信息查看

```bash
# dashboard：实时仪表盘，显示线程、内存、GC、Runtime 信息
dashboard
# 每 5 秒刷新一次（默认 5 秒）
dashboard -n 10  # 刷新 10 次后退出

# jvm：查看 JVM 详细信息
jvm
# 显示：堆内存、非堆内存、GC 次数和耗时、类加载信息、系统属性、JVM 参数

# memory：查看内存使用详情
memory
# 显示： Eden、Survivor、Old、Metaspace 各区域的使用量

# gc：执行一次 GC
gc

# heapdump：导出堆转储文件（用于 OOM 分析）
heapdump /tmp/heapdump.hprof
# 只 dump live 对象（推荐，文件更小）
heapdump --live /tmp/heapdump.hprof

# vmoption：查看/修改 JVM 参数
vmoption PrintGC            # 查看 PrintGC 参数
vmoption PrintGC true       # 动态开启 PrintGC（不用重启！）
vmoption HeapDumpBeforeFullGC true  # Full GC 前自动 dump 堆
```

### 2.5 场景五：类与源码相关

```bash
# sc：搜索已加载的类
sc com.example.*Order*
# 显示所有匹配的类名、类加载器

# sc -d：查看类的详细信息（源码位置、类加载器）
sc -d com.example.service.OrderService

# sm：查看类的方法信息
sm com.example.service.OrderService
# 显示所有方法名、参数、返回值

# jad：反编译类，看线上实际运行的源码
jad com.example.service.OrderService
# 只反编译某个方法
jad --source-only com.example.service.OrderService submitOrder

# mc：内存编译（把修改后的 Java 代码编译成 class）
mc /tmp/OrderService.java -d /tmp/

# redefine：热替换 class（不用重启，直接替换运行中的类）
redefine /tmp/OrderService.class
# ⚠️ 危险操作：只能修改方法体，不能增删方法/字段，不能改类继承关系
```

> 💡 **经典场景**：线上出了 Bug，你怀疑是某行代码的问题，但不确定线上跑的是不是最新版本。直接 `jad` 反编译，看线上实际运行的代码，一目了然。

### 2.6 场景六：其他实用命令

```bash
# logger：查看/修改日志级别（不用重启，动态改日志级别）
logger                       # 查看所有 logger
logger -n com.example       # 查看指定包的日志级别
logger --name com.example --level debug  # 动态把 com.example 包的日志级别改成 DEBUG

# ognl：执行 OGNL 表达式（调用 Spring Bean 的方法、查看静态字段）
ognl '@com.example.util.SpringContextUtil@getBean("orderService").getOrderCount()'
# 调用静态方法
ognl '@java.lang.System@out.println("hello")'

# options：设置 Arthas 全局选项
options save-result true    # 保存命令结果到文件（~/logs/arthas/）
options json-format true     # 输出 JSON 格式

# profiler：火焰图（性能分析神器）
profiler start               # 开始采样
# 等待一段时间（比如 30 秒）
profiler stop --file /tmp/flamegraph.html  # 停止并生成火焰图
# 火焰图可以直接用浏览器打开，看哪个方法占 CPU 最多
```

---

## 三、实战案例：线上 CPU 飙高完整排查流程

```
场景：生产环境 CPU 突然飙到 90%+，应用响应变慢
```

### 步骤 1：确认是 Java 进程的问题
```bash
top
# 看 PID 12345 的 Java 进程 CPU 占用 85%
```

### 步骤 2：Attach Arthas
```bash
java -jar arthas-boot.jar 12345
```

### 步骤 3：找 CPU 最高的线程
```bash
thread -n 3
# 输出：http-nio-8080-exec-10 线程 CPU 85%
# 堆栈停在 OrderService.calculate(OrderService.java:123)
```

### 步骤 4：看这个方法在干什么
```bash
watch com.example.service.OrderService calculate '{params}' -x 2
# 发现入参是一个超大的 List（10万条数据）
# 方法里在做嵌套循环，O(n²) 复杂度
```

### 步骤 5：确认耗时
```bash
trace com.example.service.OrderService calculate
# 输出：方法耗时 8000ms，其中 7500ms 在嵌套循环
```

### 步骤 6：临时止血
```bash
# 如果有开关，动态关闭这个功能
ognl '@com.example.config.SwitchConfig@disableBigDataCalc()'
# 或者动态把日志级别调高，减少日志 IO
logger --name com.example --level error
```

### 步骤 7：根因修复
- 优化算法：嵌套循环改成 Map 查找，O(n²) → O(n)
- 加参数校验：限制单次处理数据量
- 异步处理：大数据计算改成异步任务，不阻塞请求线程

---

## 四、Arthas 踩坑清单

| 坑 | 现象 | 解法 |
|---|---|---|
| **Attach 失败** | `Unable to open socket file` | 用启动 Java 进程的同一个用户运行 Arthas；检查 /tmp/hsperfdata_* 目录权限 |
| **命令无输出** | watch/trace 执行后没反应 | 确认类名和方法名完全正确（包括包名）；用 `sc` 搜索确认类已加载 |
| **重载方法冲突** | 方法有多个重载，watch 不知道看哪个 | 在方法名后加参数描述：`watch com.example.Service method(String,int) '{params}'` |
| **redefine 失败** | 热替换报错 | redefine 只能改方法体，不能增删方法/字段、不能改类结构；改完记得同步代码，否则重启后失效 |
| **Arthas 本身占资源** | dashboard 显示 Arthas 线程占 CPU | Arthas 本身占用很小（<1%），但 profiler 采样会有一定开销；排查完记得 `stop` |
| **容器中使用** | Docker/K8s 容器里 attach 失败 | 容器内需要安装 JDK（不是 JRE）；用 `--use-version` 指定 JDK 版本；或者把 arthas-boot.jar 拷进容器执行 |

---

## 五、面试口述总结

> **线上 CPU 飙高怎么排查？**
> 先用 `top` 确认是 Java 进程，然后 Arthas attach 上去，`thread -n 3` 直接看 CPU 最高的 3 个线程和堆栈，定位到具体方法。再用 `trace` 看方法耗时分布，`watch` 看入参。常见原因：死循环、正则回溯、大量 GC、嵌套循环复杂度太高。
>
> **Arthas 常用命令？**
> `thread` 看线程、`trace` 看方法耗时、`watch` 看入参返回值、`jad` 反编译、`dashboard` 仪表盘、`heapdump` 导出堆、`logger` 动态改日志级别、`profiler` 火焰图。
>
> **不用重启能改日志级别吗？**
> 可以，`logger --name com.example --level debug` 动态修改。Arthas 还能 `vmoption` 动态修改 JVM 参数，`redefine` 热替换 class（只能改方法体）。
>
> **Arthas 和传统加日志排查有什么区别？**
> 传统方式要加日志、重新发布、复现、看日志，一次排查可能几小时。Arthas 不用重启不用改代码，实时 attach 到运行中的 JVM，几分钟就能定位问题。是生产环境排查的必备工具。

---

## 六、关联笔记

- [[02_JVM 原理与调优]] — JVM 内存结构、GC、调优参数
- [[18_开发工具链]] — Git、Maven、JMeter 等工具
- [[15_高并发高可用设计]] — 高并发场景的性能问题
- [[03_JUC 详细讲解]] — 线程、线程池、并发问题
