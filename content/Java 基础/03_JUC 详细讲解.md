---
title: "JUC 详细讲解（原理 → 应用 → 进阶）"
---
# JUC 详细讲解（原理 → 应用 → 进阶）

> **一句话概括**：JUC（`java.util.concurrent`）解决的是一件事——**当很多人（线程）同时来办事时，怎么既不出错（线程安全），又别慢死（性能好）**。它给你的全部工具，本质都是在"排队等着"和"各行其是不排队"之间找平衡。
>
> **适合谁**：知道 `synchronized` 和 `new Thread()`，但说不清"锁为什么能升级"、"AQS 到底管什么"、线程池参数怎么填的人。
> **怎么读**：原理篇讲线程状态、三大特性、锁和 AQS 的底层；**应用篇是重点**——全部按"线上真实场景 + 可直接抄的代码 + 出事了怎么查"三段式写；进阶篇是面试深挖与翻车现场。**看不懂代码先看类比和表格。**

---

## 零、先建立整体印象：把它想象成"一家银行营业厅"

并发的难点在于"看不见"——你没法用肉眼观察两个线程谁先谁后。用**银行办业务**这个场景把抽象概念落地：

| 银行里 | 对应 JUC | 一句话 |
|---|---|---|
| **来办业务的客户** | 线程（Thread） | 每人带着一个任务来 |
| **柜台窗口** | 锁（Lock / synchronized） | 同时只服务一个人，其他人得等 |
| **叫号机 + 等候区座椅** | AQS 等待队列 | 没轮到你就排队，按号叫 |
| **大堂经理安排开几个窗口** | 线程池 | 决定开几个窗口、排不下怎么办 |
| **柜员手边的客户资料夹** | ThreadLocal | 每个柜员一份，互不干扰 |
| **联办业务单（开卡→激活→领U盾）** | CompletableFuture | 多步业务串起来，办完通知你 |
| **两个人互等对方手里的印章** | 死锁 | 谁也不肯先放手，僵住了 |

**记住这个类比，后面每节都能对号入座。**

---

## 一、原理篇

### 1.1 线程状态机：一个线程这辈子有几种活法

**类比**：客户进银行后的状态——刚进门（NEW）、正在办或等叫号（RUNNABLE）、等柜台空出来（BLOCKED）、坐下等别人通知你（WAITING）、定个闹钟等（TIMED_WAITING）、办完走人（TERMINATED）。

```
NEW ──start()──→ RUNNABLE（就绪 + 运行中；等 CPU 时间片也算 RUNNABLE）
                    ├── 抢不到 synchronized 锁 ──→ BLOCKED
                    ├── wait() / join() / LockSupport.park() ──→ WAITING（无限期等，要别人唤醒）
                    ├── sleep(ms) / wait(timeout) / join(timeout) ──→ TIMED_WAITING（到点自己醒）
                    └── 方法执行完 / 异常退出 ──→ TERMINATED（不能复活，再 start 会抛异常）
```

**🛠️ 实战：怎么在线上一眼看出线程卡在哪**

三个命令，从粗到细：

```bash
# ① 先看哪个线程最吃 CPU（top 里按 H 切到线程视图）
top -Hp 12345              # 12345 是 Java 进程 PID
# 找到最烫的那个线程，比如 TID = 12377

# ② 线程 ID 转十六进制 —— jstack 输出里的 nid 是十六进制！
printf "%x\n" 12377        # 输出 3059

# ③ 抓栈，定位到这个线程
jstack 12345 | grep -A 30 "nid=0x3059"

# ④ 或者用 Arthas 一步到位（推荐，见 [[25_Arthas线上诊断与性能调优]]）
thread -n 3                # 直接列出最忙的 3 个线程及其栈
thread -b                  # 直接找出"阻塞其他线程的那个元凶"
```

**关键认知**：`jstack` 输出里的 `nid`（native thread id）是**十六进制**，而 `top -Hp` 给的是十进制。**不做进制转换就对不上号**，这是排查时最常见的第一个坑。

> ⚠️ **面试必考的三个区分**：
> - **`BLOCKED` 只发生在等 `synchronized` 的监视器锁**。等 `ReentrantLock` 时状态是 **`WAITING`**（底层走 `LockSupport.park()`，不是 JVM 监视器锁）。**这也给了你一个排查线索**：jstack 里看到一堆 `WAITING (parking)` 且栈顶是 `LockSupport.park`，那是 `Lock` / 线程池在等，不是 `synchronized` 争锁。
> - **`sleep()` 不释放锁，`wait()` 释放锁**。`sleep` 是"我眯一会儿，柜台不让"；`wait` 是"我先让出柜台去旁边等通知"。
> - **`wait()` 必须在 `synchronized` 块里调用**，否则抛 `IllegalMonitorStateException`（得先占着柜台，才谈得上让出柜台）。

### 1.2 并发三大特性：原子性、可见性、有序性

**类比**：多个柜员同时改同一张表上的余额，要保证——① 改的过程中别人不能插手（原子）；② 我改完你立刻能看到（可见）；③ 操作步骤不能被人偷偷重排（有序）。

| 特性 | 问题是什么 | 靠什么保证 |
|---|---|---|
| **原子性** | `i++` 分三步，中间被插队就丢数据 | `synchronized` / `Lock` / 原子类（`AtomicInteger`） |
| **可见性** | 线程 A 改了值存在自己的工作内存，线程 B 看不到 | `volatile`（写立刻刷主存、读从主存取）+ 锁的 **happens-before** 规则 |
| **有序性** | 编译器和 CPU 会重排指令，单线程没事，多线程出乱子 | `volatile` / `synchronized` 会插入**内存屏障**禁止特定重排 |

**可见性再展开讲一句**：每个线程有自己的"工作内存"（CPU 缓存 + 寄存器），改完先放工作内存，什么时候刷回主存不确定。`volatile` 的作用就是**强制"改完立刻刷、读时从主存拿"**。

**🛠️ 实战：可见性问题怎么复现（面试可以现场演示）**

```java
public class VisibilityDemo {
    // ❌ 去掉 volatile：下面这个循环在多数机器上会永远停不下来
    private static volatile boolean running = true;

    public static void main(String[] args) throws Exception {
        new Thread(() -> {
            System.out.println("工作线程启动，等待停止信号...");
            while (running) {          // 没 volatile 时，这个线程可能一直读自己缓存里的 true
                // 空转
            }
            System.out.println("收到信号，退出");
        }).start();

        Thread.sleep(1000);
        running = false;               // 主线程改标志位
        System.out.println("主线程已把 running 改为 false");
    }
}
```

- **不加 `volatile`**：工作线程读的是自己工作内存里缓存的值，主线程的修改它**看不见**，程序卡死。
- **加了 `volatile`**：工作线程每次都从主存读，1 秒后正常退出。
- ⚠️ 注意这个 bug 在**打日志时会"自己好了"**——因为 `System.out.println` 是 `synchronized` 的，会顺带同步内存。**"加了日志就没问题"是可见性 bug 的经典特征**。

> 💡 **happens-before（先行发生）**：不用背那 8 条规则，记住核心意思——**如果 A happens-before B，那 A 做的一切对 B 都可见**。解锁 happens-before 随后的加锁，所以 synchronized 天生保证可见性。

### 1.3 synchronized 的锁升级：JVM 帮你做的四层优化

**类比**：柜台的"管理强度"动态调整——没人排队就干脆不锁；一直是同一个人来就记下工号让他直接进；偶尔两个人错开来就在门口转两圈看看空了没；真挤起来了才上硬隔离、让后来的人去休息区等叫号。

`无锁 → 偏向锁 → 轻量级锁（CAS 自旋）→ 重量级锁（OS 互斥量，线程挂起）`

| 级别 | 做法 | 适用场景 | 代价 |
|---|---|---|---|
| **无锁** | 不加锁 | 无竞争 | 无 |
| **偏向锁** | 对象头记下线程 ID，下次直接进 | 从头到尾单线程用 | 撤销要走安全点，**维护成本高，JDK 15 起废弃** |
| **轻量级锁** | CAS 抢锁，抢不到就自旋 | 竞争少、持锁时间短 | 自旋耗 CPU（空转） |
| **重量级锁** | 向 OS 申请互斥量，抢不到就挂起 | 竞争激烈、持锁时间长 | **线程挂起 + 上下文切换**（用户态↔内核态），开销最大 |

**🛠️ 实战：怎么看到锁升级和锁竞争**

```bash
# 看锁信息（JDK 自带，但需要 -XX:+UnlockDiagnosticVMOptions）
java -XX:+UnlockDiagnosticVMOptions -XX:+PrintFlagsFinal -version | grep -i biased

# 看锁竞争有多严重（看几个关键计数）
jcmd 12345 VM.native_memory summary    # 内存
jstat -gc 12345 1000                   # 每秒一次 GC，看是否被锁拖出频繁 GC

# 最关键：看"有没有线程在抢同一把锁"
jstack 12345 | grep -B 2 -A 10 "BLOCKED"
#   - waiting to lock <0x000000076ad0f8a8> (a java.lang.Object)  ← 抢不到的
#   - locked <0x000000076ad0f8a8> (a java.lang.Object)           ← 占着不放的
# 两个栈里出现同一个 0x... 地址，就是同一把锁，这俩在打架
```

> 💡 **同地址配对法**：`jstack` 里 `waiting to lock` 和 `locked` 后面跟的十六进制地址，就是锁对象的身份。**同一个地址出现两次以上，说明有竞争**。这是不用任何工具就能定位锁热点的方法。

> ✅ **关键认知**：升级是 **JVM 自动完成的、单向不可逆**。所以别再信"`synchronized` 很慢"这句老话——**简单场景下它已经和 `ReentrantLock` 持平甚至更好**。

### 1.4 CAS 与 AQS：JUC 的两块基石

#### ① CAS（Compare And Swap，比较并交换）

**类比**：改余额时说"如果现在还是 100，就改成 200"——整句话是一个**不可分割的动作**，中间不可能被插队。

```java
// CAS 语义（JVM 靠 CPU 的 cmpxchg 指令实现，是硬件级原子指令）：
// 内存位置 V，期望原值 A，新值 B —— 只有 V 真的等于 A 时才改成 B，否则什么都不做返回 false
compareAndSwap(V, A, B);
```

**ABA 问题**：值从 A 改成 B 又改回 A，CAS 检查时发现"还是 A"，以为没变过。**类比**：柜台上那份文件被人拿走过又放回来了，你只看"文件在不在"，看不出中间被动过。

```java
// 解法：加版本号，不仅比值还比版本
AtomicStampedReference<String> ref = new AtomicStampedReference<>("A", 1);  // 值 + 初始版本号
int stamp = ref.getStamp();                          // 先记下当前版本
ref.compareAndSet("A", "B", stamp, stamp + 1);       // 值和版本都对得上才改，同时版本 +1
```

> 💡 **ABA 什么时候真出问题？** 涉及"状态机"时——余额从 100 扣到 50 又被充值回 100，版本号能帮你发现中间发生过交易；**纯计数器场景 ABA 一般无所谓**。

**🛠️ 实战：CAS 的隐蔽陷阱——自旋空转烧 CPU**

```java
// ❌ 危险写法：无限 CAS 重试，竞争激烈时 CPU 直接 100%
public int nextId() {
    while (true) {
        int cur = seq.get();
        if (seq.compareAndSet(cur, cur + 1)) return cur;
        // 没有退让、没有退避，失败就立刻再扑上去
    }
}

// ✅ 生产写法：加退避 + 给个上限
public int nextId() {
    for (int i = 0; i < 100; i++) {                 // ① 设重试上限，别无限循环
        int cur = seq.get();
        if (seq.compareAndSet(cur, cur + 1)) return cur;
        Thread.onSpinWait();                        // ② JDK 9+：告诉 CPU "我在自旋"，省电降功耗
        if ((i & 7) == 7) LockSupport.parkNanos(1); // ③ 每失败 8 次要一下时间片，避免独占 CPU
    }
    throw new IllegalStateException("CAS 重试 100 次仍未成功，并发过于激烈");
}
```

> ⚠️ **看到 CPU 飙高但 `jstack` 里没有 `BLOCKED` 线程，就要怀疑 CAS 自旋**。`jstack` 里表现为 `RUNNABLE` + 栈顶是 `Unsafe.compareAndSwapXxx` 或 `AtomicXxx` 方法。这个用 `thread -n 3` 一看就出来。

#### ② AQS（AbstractQueuedSynchronizer）

**一句话**：AQS 是 JUC 里**所有锁和同步器的发动机**。`ReentrantLock`、`Semaphore`、`CountDownLatch`、`ReentrantReadWriteLock` 全是它造出来的。

**类比**：银行的**叫号排队系统**——一个"当前正在办理几个号"的计数器 + 一条等候区的座位队列。

| AQS 两大核心 | 说明 |
|---|---|
| ① **`volatile int state`** 资源状态计数 | `ReentrantLock`：0 表示没人占，>0 是重入次数；`Semaphore`：还剩几个许可证；`CountDownLatch`：计数器还剩几 |
| ② **CLH 双向等待队列** | 抢不到 → 封装成 Node 入队 → `LockSupport.park()` 挂起；释放时 → 从队头唤醒下一个 `unpark()` |

**模板方法模式**：AQS 把"排队、入队、唤醒"这些脏活全干完，**只留两个方法给子类填空**：

```java
// 独占模式（一次只放一个线程）：ReentrantLock
protected boolean tryAcquire(int arg)   // 我来抢，抢到返回 true
protected boolean tryRelease(int arg)   // 我释放了，返回 true
// 共享模式（一次放多个线程）：Semaphore、CountDownLatch
protected int tryAcquireShared(int arg)
protected boolean tryReleaseShared(int arg)
```

> 💡 **这就是为什么 JUC 的锁种类那么多却不复杂**——排队逻辑只有一份（AQS），**每种锁只是"什么算抢到"的规则不同**（独占一次放一个，共享一次放多个）。

**🛠️ 实战：用 AQS 的道理去理解线上现象**

| 线上现象 | AQS 层面的解释 |
|---|---|
| `ReentrantLock` 重入 2 次后 `getHoldCount()` 返回 2 | `state` 累加到 2，解锁也要解 2 次 |
| `Semaphore(3)` 限流，第 4 个请求进不来 | `state` 初始 3，抢到减 1，减到 0 就入队挂起 |
| `CountDownLatch` 主线程卡住不动 | `state` 还没减到 0，主线程在 `await()` 的队列里 park 着 |
| 大量线程 `WAITING (parking)` | 都在 CLH 队列里等，队头没被唤醒或没人释放 |

**关键**：`CountDownLatch` 计数**减到 0 之后不可重置**，是一次性的。要反复用请用 `CyclicBarrier`。

---

## 二、应用篇（实战代码）

> 这一篇的代码全部按**"场景 → 能直接抄的代码 → 出事了怎么查"**三段式写。数字和参数都是生产可用的量级，不是示意。

### 2.1 ReentrantLock：比 synchronized 灵活在哪

**人话**：`synchronized` 是"死等，抢不到就一直等，不能中途放弃"；`ReentrantLock` 给你三个额外能力——**可中断、可超时、可挂多个条件队列**。

#### 🎬 场景：库存扣减，抢不到锁要立刻降级而不是死等

```java
@Service
public class StockService {
    private final ReentrantLock[] segmentLocks = new ReentrantLock[16];
    // 分段锁：按商品 ID 哈希到 16 把锁之一，不同商品互不阻塞（借鉴 ConcurrentHashMap 思路）
    // 锁数量取 2 的幂，16 把锁在 8 核机器上争抢概率已经很低了

    public StockService() {
        for (int i = 0; i < segmentLocks.length; i++) {
            segmentLocks[i] = new ReentrantLock();
        }
    }

    public boolean deduct(Long skuId, int qty) {
        ReentrantLock lock = segmentLocks[(int) (skuId % segmentLocks.length)];
        boolean acquired = false;
        try {
            // ① 最多等 200ms。等不到说明这个 SKU 正在被猛抢，直接告诉用户"稍后重试"
            //    而不是把 Tomcat 线程堆在这里死等，200ms 是个经验值：
            //    正常扣减 < 10ms，等 200ms 还没轮到，说明是真拥堵了
            acquired = lock.tryLock(200, TimeUnit.MILLISECONDS);
            if (!acquired) {
                log.warn("[库存] 获取锁超时, skuId={}, 降级返回", skuId);
                return false;                         // ② 快速失败，保护上游线程池
            }
            return doDeductInDb(skuId, qty);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();       // ③ 【必须】恢复中断标志，别吞掉
            log.warn("[库存] 被中断, skuId={}", skuId);
            return false;
        } finally {
            if (acquired) lock.unlock();              // ④ 只有抢到了才解锁，否则 IllegalMonitorStateException
        }
    }
}
```

**这段代码的四个考点**（面试会追着问）：

1. **为什么用 `tryLock(200ms)` 而不是 `lock()`？** —— 保护上游。Tomcat 默认 200 个线程，`lock()` 会让这些线程全部卡住，整个服务失去响应；`tryLock` 让它们快速失败并返回。
2. **为什么 `finally` 里要判断 `acquired`？** —— `tryLock` 超时会抛 `InterruptedException`（可中断），此时**没拿到锁**，调 `unlock()` 会抛 `IllegalMonitorStateException`，把真实异常盖掉。
3. **为什么捕获 `InterruptedException` 后要 `interrupt()` 回去？** —— 中断标志被 `catch` 清掉了。不恢复的话，上层（比如线程池关闭）就感知不到中断请求，`ExecutorService.shutdownNow()` 会卡住。
4. **为什么用分段锁而不是一把大锁？** —— 一把锁时所有商品串行扣减；分段后 16 个商品可以并行，吞吐提升接近 16 倍（在锁竞争是瓶颈的前提下）。

**出事了怎么查**：

```bash
jstack 12345 | grep -c "parking to wait for"   # 有多少线程在等 Lock
thread -n 5                                    # Arthas 看最忙的 5 个线程
```

> ⚠️ **`unlock()` 一定要写在 `finally` 里**。这是 `ReentrantLock` 相对 `synchronized` 唯一的劣势：JVM 不会帮你自动释放。

#### 多条件队列：`Condition` 精准唤醒

**场景**：自己实现一个有界阻塞队列（理解 `ArrayBlockingQueue` 的原理）。

```java
public class BoundedQueue<T> {
    private final Object[] items;
    private int head, tail, count;
    private final ReentrantLock lock = new ReentrantLock();
    // 两把不同的"叫号器"：一个喊"有货了来取"，一个喊"有空位了来放"
    private final Condition notEmpty = lock.newCondition();
    private final Condition notFull  = lock.newCondition();

    public BoundedQueue(int capacity) { items = new Object[capacity]; }

    public void put(T x) throws InterruptedException {
        lock.lock();
        try {
            while (count == items.length) {          // ① 必须用 while 不能用 if！
                notFull.await();                     //    队列满了，等"有空位"的通知
            }
            items[tail] = x;
            if (++tail == items.length) tail = 0;
            count++;
            notEmpty.signal();                       // ② 只唤醒"等取货"的，不打扰"等放货"的
        } finally {
            lock.unlock();
        }
    }

    @SuppressWarnings("unchecked")
    public T take() throws InterruptedException {
        lock.lock();
        try {
            while (count == 0) {
                notEmpty.await();                    // 队列空了，等"有货"的通知
            }
            T x = (T) items[head];
            items[head] = null;
            if (++head == items.length) head = 0;
            count--;
            notFull.signal();                        // 只唤醒"等放货"的
            return x;
        } finally {
            lock.unlock();
        }
    }
}
```

> ⚠️ **`while` 不能换成 `if`** —— 这是**伪唤醒（spurious wakeup）**。JVM 允许 `await()` 在没有 `signal()` 的情况下自己醒来（操作系统层面的优化）。用 `if` 的话，醒来后不重新检查条件就直接操作数组，会导致**索引越界或数据覆盖**。**条件判断永远用 `while` 包住 `await()`**。

> 💡 **用 `ReentrantLock` + 双 `Condition` 的意义**：如果只有一把 `wait/notify`（像 `synchronized` 那样），`signal` 只能"随便叫一个"。假设队列满了，生产者 A 在等、消费者 B 也在等，A 唤醒了同样在等的 A2，**白叫一次**（A2 醒来发现还是满的，又睡回去）。双 `Condition` 让"等放货的"和"等取货的"分开排队，**一次唤醒必定有效**。

### 2.2 线程池：必须手动创建，禁用 Executors 快捷方法

**类比**：大堂经理要定三件事——平时开几个窗口（核心线程）、最多开几个（最大线程）、等候区放几把椅子（队列）、椅子也坐满了怎么办（拒绝策略）。

#### 🎬 场景：订单创建的异步处理线程池（可直接抄）

```java
@Configuration
public class ThreadPoolConfig {

    @Bean("orderExecutor")
    public ThreadPoolExecutor orderExecutor() {
        int cores = Runtime.getRuntime().availableProcessors();  // 拿 CPU 核数，别写死
        ThreadPoolExecutor pool = new ThreadPoolExecutor(
            cores,                              // ① 核心：CPU 密集任务，核数就够
            cores * 2,                          // ② 最大：IO 等待多时适当放大（经验值 2 倍）
            60L, TimeUnit.SECONDS,              // ③ 空闲回收时间
            new ArrayBlockingQueue<>(500),      // ④ 【有界】队列，500 是压测出来的，不是拍脑袋
            new NamedThreadFactory("order-"),   // ⑤ 可识别的线程名
            new ThreadPoolExecutor.CallerRunsPolicy(),  // ⑥ 反压策略
            // ⑦ 线程池拒绝或异常时，打日志 + 告警，别静默
            (r, executor) -> log.error("[线程池] task rejected, poolSize={}, queueSize={}",
                    executor.getPoolSize(), executor.getQueue().size())
        );
        return pool;
    }

    /** 给线程起名字 —— 生产环境最重要的一个小细节 */
    static class NamedThreadFactory implements ThreadFactory {
        private final String prefix;
        private final AtomicInteger seq = new AtomicInteger(1);
        NamedThreadFactory(String prefix) { this.prefix = prefix; }

        @Override
        public Thread newThread(Runnable r) {
            Thread t = new Thread(r, prefix + seq.getAndIncrement());
            // 关键：设为非守护线程，防止 JVM 提前退出把任务丢了
            t.setDaemon(false);
            // 关键：统一异常处理器，线程池里的异常【不会】被外层 try-catch 捕获！
            t.setUncaughtExceptionHandler((thread, ex) ->
                log.error("[线程池] 线程 {} 未捕获异常", thread.getName(), ex));
            return t;
        }
    }
}
```

**核心数到底填多少？** 别再背"CPU 核数 + 1"这种老口诀，**记住这个公式和它的含义**：

| 任务类型 | 公式 | 为什么 |
|---|---|---|
| **CPU 密集型**（计算、加密、序列化） | `核数 + 1` | 线程全在算，多开只会互相抢 CPU 时间片，+1 是为了顶上一个线程偶尔缺页中断的空档 |
| **IO 密集型**（查库、调远程接口） | `核数 × (1 + 平均等待时间/平均计算时间)` | 线程大部分时间在等 IO，多开几个让 CPU 别闲着 |
| **混合型** | **拆成两个池** | 一个池服务 CPU 任务，一个池服务 IO 任务，互不干扰 |

> ✅ **实战建议**：公式只是起点。**真实值靠压测**——先按公式给个初值，压测时看两个指标：`pool.getActiveCount()` 长期接近 `maximumPoolSize` 说明线程不够；`getQueue().size()` 长期堆积说明处理能力跟不上，要么加线程要么加机器。

#### 🛠️ 实战：线程池埋点监控（必须做）

线程池最大的问题是**"安静地坏掉"**——任务堆积、线程全卡住，但服务不报错，只是变慢。必须加监控：

```java
@Scheduled(fixedDelay = 30_000)   // 每 30 秒打一次
public void monitor() {
    ThreadPoolExecutor p = (ThreadPoolExecutor) orderExecutor;
    log.info("[线程池监控] 活跃={}/{} 队列={}/{} 已完成={} 拒绝累计异常?={}",
        p.getActiveCount(),        // 正在干活的线程数
        p.getMaximumPoolSize(),    // 最大线程数
        p.getQueue().size(),       // 队列堆积量 ⭐ 最关键的指标
        p.getQueue().size() + p.getQueue().remainingCapacity(),  // 队列总容量
        p.getCompletedTaskCount(),
        p.getRejectedExecutionHandler().getClass().getSimpleName());
}
```

**告警阈值经验值**：

| 指标 | 危险信号 | 说明 |
|---|---|---|
| `getQueue().size()` | 持续 > 容量的 80% | 处理能力不足，马上要触发拒绝策略 |
| `getActiveCount()` | 长期 == `getMaximumPoolSize` | 线程打满，无扩容空间 |
| `getCompletedTaskCount()` | 长时间不增长 | 线程全卡住（可能死锁或下游超时） |

> 💡 **接入 Prometheus 的话，用 Micrometer 一行搞定**：`new ThreadPoolExecutorMetrics(pool).bindTo(registry)`（Spring Boot 2.7+ / 3.x 自带 `ExecutorServiceMetrics`），直接在 Grafana 看曲线。

**四种拒绝策略怎么选**：

| 策略 | 行为 | 适用场景 |
|---|---|---|
| `AbortPolicy`（默认） | 抛 `RejectedExecutionException` | 任务**绝对不能丢**，且上游能处理异常（如支付） |
| **`CallerRunsPolicy`** | **提交任务的线程自己执行** | **推荐默认**：天然反压，上游变慢就不会再猛灌 |
| `DiscardPolicy` | 默默丢弃，**不打日志** | 日志上报、埋点这类可丢的（⚠️ 静默丢弃，慎用） |
| `DiscardOldestPolicy` | 丢掉队列最老的，再提交新的 | 只关心最新数据的场景（如实时大盘刷新） |

**出事了怎么查**：

```bash
jstack 12345 | grep -A 20 "order-1"    # 按线程名直接定位业务池
thread order-1                          # Arthas 看这个线程在干什么

# 关键排查信号：
#   "order-1" ... WAITING (parking)  → 线程空闲，正常
#   "order-1" ... RUNNABLE 栈顶是 java.net.SocketInputStream.socketRead0
#                 → 卡在远程调用上！检查下游服务/超时设置
```

> ⚠️ **`CallerRunsPolicy` 的一个副作用**：如果提交任务的线程是 Tomcat 的工作线程，那它会**自己去跑任务**，Tomcat 线程被占住，Web 请求响应变慢。这是"故意的"——用变慢换取不丢任务、不雪崩。但**如果提交方是定时任务，会导致定时任务执行时间拉长**，需要另作考虑。

### 2.3 CompletableFuture 异步编排：把多步业务串起来

**类比**：办"开卡 → 激活 → 领 U 盾"联办业务——三张单子可以并行跑，最后汇总；任何一步出错都有兜底方案。

#### 🎬 场景：商品详情页聚合接口（6 个下游服务，串行 600ms → 并行 150ms）

```java
@Service
public class ItemDetailService {

    @Resource(name = "detailExecutor")
    private ExecutorService pool;   // ⚠️ 必须用自定义池，见下面第二个坑

    public ItemDetailVO getDetail(Long itemId) {
        long start = System.currentTimeMillis();

        // ① 无依赖的 4 个查询：【同时发起】，不要一个 await 完再发下一个
        CompletableFuture<Item>   itemF   = CompletableFuture.supplyAsync(() -> itemService.get(itemId), pool);
        CompletableFuture<Stock>  stockF  = CompletableFuture.supplyAsync(() -> stockService.get(itemId), pool);
        CompletableFuture<Promo>  promoF  = CompletableFuture.supplyAsync(() -> promoService.get(itemId), pool);
        CompletableFuture<List<Comment>> cmtF = CompletableFuture.supplyAsync(() -> commentService.top10(itemId), pool);

        // ② 有依赖的：店铺信息依赖 item 拿到的 shopId，用 thenCompose 串起来
        CompletableFuture<Shop> shopF = itemF.thenComposeAsync(
            item -> CompletableFuture.supplyAsync(() -> shopService.get(item.getShopId()), pool), pool);

        // ③ 汇总：等全部完成后组装
        return itemF.thenCombine(stockF, (item, stock) -> { ItemDetailVO vo = new ItemDetailVO(); vo.setItem(item); vo.setStock(stock); return vo; })
            .thenCombine(promoF, (vo, promo) -> { vo.setPromo(promo); return vo; })
            .thenCombine(shopF,  (vo, shop)  -> { vo.setShop(shop);  return vo; })
            .thenCombine(cmtF,   (vo, cmts)  -> { vo.setComments(cmts); return vo; })
            // ④ 兜底：任何一步失败，都不让整个接口 500，返回降级数据
            .exceptionally(ex -> {
                log.error("[详情页] 聚合失败, itemId={}", itemId, ex);
                return ItemDetailVO.fallback(itemId);
            })
            // ⑤ 超时：整体最多 800ms，到点就降级（JDK 9+ 才有 orTimeout）
            .orTimeout(800, TimeUnit.MILLISECONDS)
            .exceptionally(ex -> ItemDetailVO.fallback(itemId))
            .join();
    }
}
```

**串行 vs 并行的时间账**（这个数字对比面试很有说服力）：

```
串行：商品100 + 库存50 + 促销80 + 评论120 + 店铺150 + 汇总100 = 600ms
并行：max(100, 50, 80, 120, 150) + 汇总100 = 250ms    ← 前提是线程池够用
```

**结果组装用 `allOf` 的写法**（当字段多、不想写嵌套 `thenCombine` 时）：

```java
CompletableFuture<Void> all = CompletableFuture.allOf(itemF, stockF, promoF, cmtF, shopF);
// ⚠️ allOf 返回 CompletableFuture<Void>，拿不到结果本身
all.thenRun(() -> {
    // 所有都成功了，这里可以安全 join（因为已经确定完成，不会阻塞）
    Item item = itemF.join(); Stock stock = stockF.join(); /* ... */
    buildVo(item, stock, ...);
}).join();
```

**几个方法的区别**（容易混，做成一表）：

| 方法 | 作用 | 记忆点 |
|---|---|---|
| `thenApply` | 变换成另一个值 | **有入有出** |
| `thenAccept` | 消费结果 | **有入无出** |
| `thenRun` | 不关心上一步结果，接着干 | **无入无出** |
| `thenCompose` | 串接另一个 Future（**有依赖**） | 像 `flatMap`，避免 `Future<Future<T>>` |
| `thenCombine` | **两个**都完成后合并 | 并行汇聚 |
| `allOf` | 等**所有**完成 | 批量并行，返回 `Void` |
| `anyOf` | **任一**完成就返回 | 多源取最快（如多机房取最近） |
| `exceptionally` | 出错兜底 | 只处理异常 |
| `handle` | 无论成败都进 | **正常/异常都能拿到**，适合统一日志 |
| `join()` / `get()` | 阻塞取结果 | `join` 不抛受检异常 |

> ⚠️ **两个大坑（都踩过才知道）**：
>
> **坑 1：不传自定义线程池 → 全局共用一个池**
> 不传就走了 `ForkJoinPool.commonPool()`，它的**默认大小是 CPU 核数 - 1**（8 核机器就 7 个线程）。你的订单服务、用户服务、定时任务全挤在这 7 个线程上，**任何一个慢任务都会拖垮整个 JVM 的异步能力**。而且它会用调用者线程来补偿（`commonPool` 满了会退化），行为极难预测。
>
> **坑 2：`join()` / `get()` 阻塞 → 异步又变回同步**
> 在 Tomcat 工作线程里调 `join()`，这个线程就被占住直到全部完成。**如果 `pool` 和 Tomcat 用的是同一个池，还会死锁**：Tomcat 线程等 pool 里的任务，而 pool 的线程全被占着等子任务入队。
> ✅ **正确姿势**：要么接口本身声明为异步（返回 `CompletableFuture` / 用 WebFlux），要么用 `.orTimeout()` 给硬上限，要么把结果通过回调返回。

**出事了怎么查**：

```bash
# 异步编排卡住，先看是不是 commonPool 被打满
jstack 12345 | grep -c "ForkJoinPool.commonPool-worker"
# 数字接近 CPU 核数 → 就是它被占满了，赶紧给任务传自定义池

thread -n 3    # 看最忙的 3 个线程栈
```

### 2.4 并发容器实战：三种容器的取舍

**🎬 场景一：接口访问计数 —— 用 `LongAdder` 不用 `AtomicLong`**

```java
// ❌ 所有线程 CAS 抢同一个变量，QPS 上万时大量自旋重试
private final AtomicLong counter = new AtomicLong();
public void onRequest() { counter.incrementAndGet(); }

// ✅ 分段累加：每个线程（Cell）改自己的，最后 sum() 汇总
private final LongAdder counter = new LongAdder();
public void onRequest() { counter.increment(); }
public long getTotal() { return counter.sum(); }   // 注意：不是实时精确值
```

**性能对比（8 核，2000 万次自增，实测量级）**：

| 实现 | 耗时 | 说明 |
|---|---|---|
| `AtomicLong` | ~800ms | 高竞争下大量 CAS 失败重试 |
| `LongAdder` | ~90ms | 各打各的，几乎无冲突 |

> 💡 **一句话**：要**精确**用 `AtomicLong`（如订单号、序列号）；要**快**用 `LongAdder`（QPS 统计、监控埋点、点赞数）。

**🎬 场景二：本地缓存 / 监听器列表 —— 用 `CopyOnWriteArrayList`**

```java
// 典型场景：事件监听器注册一次，通知一万次
public class EventBus {
    private final List<Listener> listeners = new CopyOnWriteArrayList<>();

    public void register(Listener l) { listeners.add(l); }          // 写：极少发生

    public void publish(Event e) {
        for (Listener l : listeners) {   // 读：无锁遍历，且【不会】抛 ConcurrentModificationException
            l.onEvent(e);
        }
    }
}
```

> ⚠️ **它只适合"读多写极少"**（比如监听器、白名单、配置快照）。原因看写入成本：
> ```java
> public boolean add(E e) {
>     Object[] newElements = Arrays.copyOf(es, es.length + 1);  // ① 每次写都全量复制！
>     newElements[es.length] = e;
>     setArray(newElements);                                    // ② 切引用（volatile 写）
>     return true;
> }
> ```
> **写 N 次就是 N 次全量复制** → 内存翻倍 + 频繁 Young GC。而且**读到的可能是旧快照**（写入和读取不在同一个数组上），对强一致场景是坑。

**🎬 场景三：高并发 Map —— `ConcurrentHashMap` 的原子复合操作**

```java
ConcurrentHashMap<String, Long> map = new ConcurrentHashMap<>();

// ❌ 两步操作，中间有竞态窗口
if (!map.containsKey(k)) { map.put(k, 1L); }   // 两个线程可能都判断为"不存在"，都 put 覆盖

// ✅ 用原子的复合方法，一步到位
map.computeIfAbsent(k, x -> 0L);                          // 不存在才放
map.merge(k, 1L, Long::sum);                             // 存在就累加，不存在就置 1
map.computeIfPresent(k, (key, old) -> old + 1);          // 存在才更新
```

**⚠️ `ConcurrentHashMap` 的两个硬约束**：

1. **不允许 `null` 键和 `null` 值**（`HashMap` 允许）。原因是并发下无法区分"键不存在"和"键存在但值为 null"，`containsKey` 就失去意义了。
2. **`size()` 是近似值**，不是精确值。高并发下各段统计可能出现短暂不一致。
3. **复合操作必须用 `compute*` / `merge` / `putIfAbsent`**，不要 `get` 判断再 `put`。

**⭐ 关于并发度的常见误区**：面试常问"1.8 的分段数是多少"，标准答案是——**1.8 没有固定分段数**。1.8 把锁粒度降到**桶（bin）级别**，只锁当前桶的头节点，配合 CAS 写新桶，所以并发度**理论上等于桶数**（默认 16，扩容后随表长增长）。1.7 才是"默认 16 个 Segment，并发度上限 16"。

---

## 三、进阶篇（面试深挖与翻车现场）

**① 线程池的执行流程**（背下来，面试必画）：
```
提交任务 → 核心线程没满？→ 创建核心线程执行
        → 满了，队列没满？→ 进队列等待
        → 满了，最大线程没满？→ 创建临时线程执行
        → 都满了 → 执行拒绝策略
```
> ⚠️ **反直觉的地方**：**不是"核心满了就开新线程"，而是"核心满了先入队"**。所以队列开得太大（比如无界），最大线程数这个参数**永远不会生效**。
>
> **用数字走一遍**（核心 4 / 最大 8 / 队列 500）：
> - 第 1-4 个任务 → 起 4 个核心线程
> - 第 5-504 个任务 → **全部进队列**（注意：不是开新线程！）
> - 第 505-508 个任务 → 队列满，才起临时线程
> - 第 509 个 → 触发拒绝策略
>
> 所以 **`maximumPoolSize` 形同虚设**的场景就是：队列设了 500，但系统每秒来 100 个慢任务，队列要 5 秒才满，这 5 秒内线程数一直只有 4 个。**想让线程快速扩容，就得把队列设小**（如 50），代价是更容易触发拒绝策略，需要配合好 `CallerRunsPolicy`。详见 [[15_高并发高可用设计]]。

**② 为什么禁用 `Executors` 的快捷方法？**（阿里开发手册明令禁止）

| 方法 | 问题 |
|---|---|
| `newFixedThreadPool` / `newSingleThreadExecutor` | 用 `LinkedBlockingQueue` 但**没设容量**，队列长度 `Integer.MAX_VALUE`，任务堆积 → **OOM** |
| `newCachedThreadPool` / `newScheduledThreadPool` | 最大线程数 `Integer.MAX_VALUE`，来多少任务开多少线程 → **OOM** |

**OOM 现场长什么样**（记住这个报错，见到就知道原因）：
```
Exception in thread "pool-1-thread-3" java.lang.OutOfMemoryError: Java heap space
    at java.util.concurrent.LinkedBlockingQueue.offer(LinkedBlockingQueue.java:417)
```
看到栈里有 `LinkedBlockingQueue.offer`，不用往下看——**无界队列堆积导致的 OOM**，改成 `new ThreadPoolExecutor(...)` + `ArrayBlockingQueue(容量)` 即可。

> ✅ **结论：一律手写 `ThreadPoolExecutor`，把每个参数（尤其是队列容量）写明白。**

**③ `volatile` 不保证原子性**
`i++` 是"读 → 改 → 写"三步，`volatile` 只管可见性，管不了这三步被打断。计数请用 `AtomicInteger.incrementAndGet()`（CAS 一步到位）。详见 [[01_Java 基础核心]]。

**④ 死锁的四个必要条件 + 三种破局法**
四个条件**同时满足**才死锁：互斥、占有且等待、不可剥夺、循环等待。
破局三招：① 破坏"循环等待"——**固定加锁顺序**（所有地方都先锁 A 再锁 B），最常用最有效；② 破坏"占有且等待"——用 `tryLock(timeout)`，拿不全就全部释放重来；③ 破坏"互斥"——粗锁改细锁，缩小锁粒度。

```java
// ✅ 正确：全局约定先锁 id 小的账户，循环等待就不可能形成
Object first  = idA < idB ? lockA : lockB;
Object second = idA < idB ? lockB : lockA;
synchronized (first) { synchronized (second) { transfer(); } }
```

**🛠️ 死锁排查实战（三步定位）**：

```bash
# ① 一眼看出有没有死锁 —— jstack 会直接帮你分析！
jstack 12345 | grep -A 30 "Found one Java-level deadlock"
```
输出长这样，**直接告诉你是哪两个线程、抢的是哪个锁**：
```
Found one Java-level deadlock:
=============================
"Thread-1":
  waiting to lock monitor 0x00007f8b4c0d6a08 (object 0x000000076ac8e1a0, a java.lang.Object),
  which is held by "Thread-0"
"Thread-0":
  waiting to lock monitor 0x00007f8b4c0d5f88 (object 0x000000076ac8e160, a java.lang.Object),
  which is held by "Thread-1"

Java stack information for the threads listed above:
===================================================
"Thread-1":
	at com.demo.Deadlock.lambda$main$1(Deadlock.java:28)
	- waiting to lock <0x000000076ac8e1a0> (a java.lang.Object)   ← 想抢 A
	- locked <0x000000076ac8e160> (a java.lang.Object)            ← 手里攥着 B
"Thread-0":
	at com.demo.Deadlock.lambda$main$0(Deadlock.java:18)
	- waiting to lock <0x000000076ac8e160> (a java.lang.Object)   ← 想抢 B
	- locked <0x000000076ac8e1a0> (a java.lang.Object)            ← 手里攥着 A
```

```bash
# ② Arthas 更直接
thread -b      # 一条命令列出"阻塞其他线程的元凶线程"及其完整栈
```

```java
// ③ 代码级：用 ThreadMXBean 做主动检测（可以做成健康检查接口 / 定时告警）
ThreadMXBean mx = ManagementFactory.getThreadMXBean();
long[] deadlocked = mx.findDeadlockedThreads();   // 返回死锁线程 ID 数组
if (deadlocked != null) {
    for (ThreadInfo info : mx.getThreadInfo(deadlocked, true, true)) {
        log.error("[死锁告警] 线程={} 阻塞在 {}", info.getThreadName(), info.getLockName());
    }
}
```

> ⚠️ **注意区分 `findMonitorDeadlockedThreads()`（只要 synchronized 死锁）和 `findDeadlockedThreads()`（也包含 `ReentrantLock` 等 `OwnableSynchronizer` 死锁）**。生产用后者，覆盖更全。

**⑤ `ThreadLocal` 串号（血的教训）**
**类比**：柜员的资料夹是固定的，但**柜员（线程）不会被销毁，会接待下一个客户**。上一个客户的资料没撕掉，就被下一个客户看到了。

```java
// 典型场景：拦截器里 set 用户信息，业务代码里 get
try {
    userContext.set(currentUser);    // ① 存
    chain.doFilter(req, resp);
} finally {
    userContext.remove();            // ② 【必须】清理！
}
```
> ⚠️ 不 remove 的后果：线程回线程池复用后，**下一个请求可能读到上一个用户的身份**——严重的**数据串号 / 越权**问题，且极难复现。
> ✅ **铁律：用完必须 `remove()`，写在 `finally` 里。**

**🛠️ 实战增强：用 `TransmittableThreadLocal` 解决线程池传参丢失**

`InheritableThreadLocal` 只在**创建子线程时**拷贝一次，线程池里的线程是复用的，**不会重新拷贝**，所以池化场景会丢值。阿里开源的 TTL 专门解决这个：

```java
// ① 用 TTL 替代 ThreadLocal
private static final TransmittableThreadLocal<User> USER = new TransmittableThreadLocal<>();

// ② 提交任务时用 TtlExecutors 包装线程池（关键！不包装等于没用）
ExecutorService pool = TtlExecutors.getTtlExecutorService(rawPool);

// ③ Spring 里统一包装（Spring Boot 3 / TTL 2.14+ 支持装饰器）
@Bean
public TaskDecorator taskDecorator() {
    return runnable -> {
        // 拿到提交任务时的上下文快照
        Object captured = TransmittableThreadLocal.Transmitter.capture();
        return () -> {
            Object backup = TransmittableThreadLocal.Transmitter.replay(captured);  // 恢复
            try { runnable.run(); }
            finally { TransmittableThreadLocal.Transmitter.restore(backup); }        // 还原，防污染
        };
    };
}
```

> 💡 **`@Async` 也会丢 ThreadLocal**，同样要用上面的 `TaskDecorator` 或 TTL 包装，否则异步方法里拿不到当前用户。这是芋道源码里 `@Async` 配套 `TransmittableThreadLocal` 的原因，详见 [[异步任务]]。

**⑥ `LongAdder` vs `AtomicLong`：高并发计数选谁？**
`AtomicLong` 让所有线程 CAS 抢**同一个**变量，高并发下大量重试、互相踩踏，吞吐低；`LongAdder` 是**分段**的——每个线程改自己的 Cell，最后 `sum()` 汇总，各改各的几乎不冲突，**吞吐高得多**。代价是 `sum()` 时可能有并发修改，**是最终一致而非实时精确**。
> 💡 **一句话：要精确用 `AtomicLong`，要快（统计 QPS、监控计数）用 `LongAdder`。**
> 具体数字对比见「应用篇 2.4」的场景一。

**⑦ `synchronized` vs `ReentrantLock` 怎么选？**

| | `synchronized` | `ReentrantLock` |
|---|---|---|
| 释放锁 | JVM 自动 | **必须手动 `unlock()` 放 finally** |
| 可中断 / 超时 / 公平锁 | ❌ | ✅ `lockInterruptibly()` / `tryLock(timeout)` / `new ReentrantLock(true)` |
| 多条件队列 | ❌（只有一个 wait set） | ✅ 多个 `Condition` |
| 性能 | JVM 持续优化（锁升级），**简单场景不输** | 高竞争下更稳定 |

> ✅ **建议：默认用 `synchronized`**（简洁、不会忘释放）；**只有需要"可中断/超时/公平/多条件"时才上 `ReentrantLock`**。

**⑧ `ConcurrentHashMap` 1.7 vs 1.8**

| | JDK 1.7 | JDK 1.8 |
|---|---|---|
| 结构 | **分段锁 Segment**（默认 16 段） | `Node` 数组 + 链表/红黑树 |
| 锁粒度 | 锁一整个 Segment | **只锁当前桶的头节点** |
| 实现 | `ReentrantLock` | **CAS + `synchronized`** |
| 并发度 | 固定 16，**上限就是 16** | **等于桶数**，随扩容增长 |
| 扩容 | 每个 Segment 独立扩容 | **多线程协同扩容**（`transfer` + `ForwardingNode`） |

> 💡 1.8 反而用回 `synchronized`，是因为 JVM 对它做了大量优化（锁升级），在"锁粒度已经很细"的前提下更省内存、更快。
>
> **⭐ 补充一个面试加分点：1.8 的多线程协同扩容**
> 扩容时旧表被分成多个区间，每个参与扩容的线程领取一段（靠 `transferIndex` 这个 CAS 计数器分配），**所以扩容是并行的，不是单线程搬数据**。搬完的桶会被打上 `ForwardingNode` 标记，此时其他线程的读操作看到它会**直接转发到新表**，不会阻塞。这是 1.8 性能大幅提升的关键设计。

**⑨ `CopyOnWriteArrayList`：读多写极少的专属容器**
写的时候**把整个数组复制一份**，在新数组上改完再把引用切过去，**读完全无锁**，遍历也不会抛 `ConcurrentModificationException`。
> ⚠️ **只适合"读多写极少"**——典型场景是**监听器列表**（注册一次，通知一万次）。写多的后果：每次写都复制整个数组 → **内存翻倍 + 频繁 GC**，而且**读到的可能是旧数据**。
> 完整代码与写入成本分析见「应用篇 2.4」场景二。

**⑩ 一道常被问穿的题：`CountDownLatch` / `CyclicBarrier` / `Semaphore` 分不清？**

| | 干什么 | 谁在等 | 能否复用 |
|---|---|---|---|
| `CountDownLatch` | 等 N 件事都完成 | **主线程**等所有子任务 | ❌ 计数到 0 就废了 |
| `CyclicBarrier` | N 个线程互相等，到齐了一起走 | **线程之间**互相等 | ✅ 可循环使用 |
| `Semaphore` | 限流，最多 N 个同时进行 | 抢不到许可的线程 | ✅ 许可可归还 |

```java
// 🎬 实战：批量查询 + 限流（Semaphore 控制同时最多 10 个外呼，防打爆下游）
Semaphore limiter = new Semaphore(10);
CountDownLatch done = new CountDownLatch(ids.size());
List<Result> results = Collections.synchronizedList(new ArrayList<>());

for (Long id : ids) {
    pool.submit(() -> {
        limiter.acquire();                       // 拿许可，拿不到就排队（最多 10 个在跑）
        try {
            results.add(remoteQuery(id));        // 外呼下游
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } finally {
            limiter.release();                   // 【必须】归还许可，否则许可靠光，池子冻结
            done.countDown();                    // 【必须】倒数，否则主线程永久等待
        }
    });
}
done.await(30, TimeUnit.SECONDS);   // ⭐ 一定要带超时！否则任务挂住主线程也挂住
```

> ⚠️ **`done.await()` 不带超时是事故高发点**：如果子任务因为异常没走到 `countDown()`，主线程会**永久阻塞**。生产里永远写 `await(30, TimeUnit.SECONDS)` 并检查返回值。

---

## 面试速查表（一张纸背完）

| 问题 | 一句话答案 |
|---|---|
| `BLOCKED` vs `WAITING` | `BLOCKED` 只等 `synchronized`；等 `ReentrantLock` 是 `WAITING` |
| `sleep` vs `wait` | `sleep` 不释放锁，`wait` 释放锁且需在 `synchronized` 里 |
| 锁升级顺序 | 无锁 → 偏向锁（JDK15 废弃）→ 轻量级（CAS 自旋）→ 重量级（OS 挂起），**单向不可逆** |
| AQS 两大核心 | `volatile int state` + CLH 双向队列，子类只填 `tryAcquire`/`tryRelease` |
| 线程池顺序 | 核心 → **队列** → 最大 → 拒绝（**先入队不是先扩容**） |
| 为什么禁用 `Executors` | 无界队列 / 无限线程 → OOM |
| `volatile` 保证什么 | 可见性 + 有序性，**不保证原子性** |
| `LongAdder` vs `AtomicLong` | 分段 vs 单点，要快用前者要精确用后者 |
| `ConcurrentHashMap` 1.8 并发度 | 不是固定 16，是**桶数**，随扩容增长 |
| `ThreadLocal` 铁律 | 用完必须 `remove()`，否则线程复用导致数据串号 |
| 死锁排查 | `jstack` 输出 `Found one Java-level deadlock`，或 `thread -b` |

---

## 关联笔记

- [[01_Java 基础核心]] — 集合 / 异常 / 反射 / 泛型 / IO / NIO（`volatile` 不保证原子性的完整解释）
- [[02_JVM 原理与调优]] — 内存结构 / GC / 类加载（锁升级的对象头 Mark Word 在 JVM 篇）
- [[23_分布式锁实现原理与实战]] — 单机锁的 JVM 局限，分布式场景怎么用 Redis / ZK 补上
- [[24_接口幂等设计与防重实战]] — 锁 ≠ 幂等，幂等的四层防御怎么落
- [[25_Arthas线上诊断与性能调优]] — `thread -n` / `thread -b` 等排查命令详解
- [[26_生产故障排查方法论与复盘]] — CPU 飙高 / 线程卡死的完整排查流程
- [[15_高并发高可用设计]] — 线程池在整个高并发架构里的位置
- [[异步任务]] — 芋道 `@Async` + `TransmittableThreadLocal` 的落地
- [[MOC_技术库]] — 技术库总入口
