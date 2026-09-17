---
title: "Zookeeper 实战（原理 → 应用 → 进阶）"
---
# Zookeeper 实战（原理 → 应用 → 进阶）

> **一句话概括**：ZooKeeper 不是存数据的"数据库"，而是**分布式系统的"行政协调中心"**——它不存你的业务资料，只负责发通知、协调资源、维持秩序。注册中心、分布式锁、配置管理、主从选举，都是它的活儿。
>
> **适合谁**：知道 ZooKeeper 是"协调服务"但说不清它到底协调什么、ZAB 是什么、和 Redis 分布式锁有什么区别的人。
> **怎么读**：原理篇理解"它存什么、怎么保证一致"；应用篇两个代码直接可抄；进阶篇是面试高频的 CP vs AP 和羊群效应。

---

## 零、先建立整体印象：把它想象成"公司行政协调中心"

ZooKeeper 不存业务数据（那是 MySQL/Redis 的事），它做的是**协调工作**：

| 行政中心 | 对应 ZK | 一句话 |
|---|---|---|
| **花名册** | 注册中心 | 记录"现在有哪些服务在运行、IP 和端口是多少" |
| **会议室预约牌** | 分布式锁 | "这个会议室（资源）现在被谁占了，别人不能进" |
| **公告栏 + 通知系统** | watch 监听 | "公告栏内容变了，自动广播给所有关注的人" |
| **投票选主任** | Leader 选举 | "老主任退休了，大家投票选新主任" |
| **临时访客证** | 临时节点 | "这个人还在公司就有效，离开自动注销" |

> 💡 **关键认知**：ZK 的数据存在内存里，不适合存大对象。它适合存**小元数据**（IP 列表、配置值、锁标记），每条数据默认限制 1MB。

---

## 一、原理篇

### 1.1 数据模型：ZNode 树

ZooKeeper 把所有数据组织成一棵**树**，每个节点叫 **ZNode**，类似文件系统的目录：

```
/
├── /services                 # 注册中心：所有在线服务
│   ├── /services/order-service/192.168.1.10:8080   # 临时节点
│   └── /services/order-service/192.168.1.11:8080   # 临时节点
├── /config                   # 配置中心
│   └── /config/db-url        # 存数据库连接串
├── /locks                    # 分布式锁
│   └── /locks/resourceA
│       ├── /locks/resourceA/lock-00000001   # 顺序节点
│       └── /locks/resourceA/lock-00000002   # 顺序节点
└── /master                   # 主从选举
    └── /master/leader        # 临时节点，谁创建谁就是主
```

**四种节点类型**（组合出 4 种）：

| 类型 | 持久性 | 是否自动编号 | 特点 |
|---|---|---|---|
| 持久节点 | 持久 | 否 | 显式删除才消失，像正式档案 |
| **临时节点** ⭐ | 随会话 | 否 | 客户端断开（会话过期）**自动删除**，像临时访客证 |
| 持久顺序节点 | 持久 | 是 | 名字后面自动加自增序号 `00000001` |
| **临时顺序节点** ⭐ | 随会话 | 是 | 分布式锁的核心：既临时（自动释放）又顺序（排队公平） |

> ⚠️ **临时节点为什么重要？** 客户端挂了（网络抖动、程序崩溃），临时节点自动消失——**天然防死锁**。Redis 锁需要看门狗续期，ZK 锁不需要，断了就自动释放。

### 1.2 ZAB 协议：怎么保证大家看到的数据一致

**ZAB**（ZooKeeper Atomic Broadcast）= ZooKeeper 的"家规"，保证所有节点上的数据一致。

**核心思想**：
```
所有写操作必须由 Leader 统一调度
  ↓
Leader 收到写请求 → 记到自己的日志 → 发给所有 Follower
  ↓
Follower 收到后写本地日志 → 回复 ACK（我记下了）
  ↓
Leader 收到【半数以上】ACK → 正式提交 → 通知大家"生效了"
```

**为什么集群要奇数台？** ZAB 要求"半数以上"同意才算提交。3 台集群允许挂 1 台（2 > 1.5），5 台允许挂 2 台。4 台和 3 台的容错能力一样（都允许挂 1 台），但 4 台成本更高。**所以集群用 3、5、7 台，不用偶数。**

**Leader 挂了怎么办？**
- Fast Leader Election 快速选举：存数据最新的那个 Follower 当选新 Leader
- 选举期间集群**不能处理写请求**（这是 CP 的代价）

---

## 二、应用篇（代码，照着抄）

### 2.1 分布式锁（临时顺序节点）

**原理**：所有人都在 `/locks/resource` 下创建临时顺序节点，**谁序号最小谁拿到锁**，其他人 watch 前一个节点，等它被删。

```java
public class ZkDistributedLock {

    private final ZooKeeper zk;
    private final String lockPath;
    private String currentNode;   // 自己创建的节点，如 /locks/resource/lock-00000003

    public boolean lock() throws Exception {
        // ① 在锁目录下创建临时顺序节点
        currentNode = zk.create(
            lockPath + "/lock-",           // 前缀
            new byte[0],                    // 不存数据
            ZooDefs.Ids.OPEN_ACL_UNSAFE,
            CreateMode.EPHEMERAL_SEQUENTIAL  // 临时 + 顺序 = 自动编号
        );

        // ② 查当前锁目录下所有子节点，按序号排序
        List<String> children = zk.getChildren(lockPath, false);
        Collections.sort(children);

        // ③ 如果自己是第一个 → 抢到锁了
        String nodeName = currentNode.substring(currentNode.lastIndexOf('/') + 1);
        if (nodeName.equals(children.get(0))) {
            return true;   // 拿到锁！
        }

        // ④ 不是第一个 → 找到前一个节点，watch 它
        int index = Collections.binarySearch(children, nodeName);
        String prevNode = children.get(index - 1);

        // ⑤ 挂起等待：前一个节点被删时，ZK 会通知我
        CountDownLatch latch = new CountDownLatch(1);
        zk.exists(lockPath + "/" + prevNode, event -> {
            if (event.getType() == Event.EventType.NodeDeleted) {
                latch.countDown();   // 前一个节点没了，轮到我了
            }
        });
        latch.await();     // 阻塞等待
        return true;
    }

    public void unlock() throws Exception {
        // ⑥ 释放锁：删自己的临时节点。会话断开也会自动删
        zk.delete(currentNode, -1);
    }
}
```

**和 Redis 分布式锁对比**（面试高频）：

| | ZK 分布式锁 | Redis 分布式锁（Redisson） |
|---|---|---|
| **可靠性** | 高，会话断自动释放，**不会误删** | 需看门狗续期，GC 停顿或时钟漂移可能导致误删 |
| **性能** | 低（每次操作都走网络 + 磁盘日志） | 高（纯内存） |
| **适用** | 锁持有时间长、对可靠性要求极高 | 锁持有时间短、高并发 |
| **依赖** | ZK 集群必须可用 | Redis 集群 |

> ✅ **结论**：高并发短锁用 Redis；长锁、强一致场景用 ZK。

### 2.2 watch 机制（简历秒杀清标记场景）

**场景**：多实例部署时，A 实例本地缓存了"秒杀已结束"的标记。运营补货后，需要通知所有实例"清掉标记，恢复抢购"。

```java
// 监听 /seckill/endFlag 节点
zooKeeper.exists("/seckill/endFlag", event -> {
    if (event.getType() == Event.EventType.NodeCreated) {
        // 节点被创建了 → 说明有人设置了"结束标记"
        // 清掉本地缓存，下次请求就会重新查 Redis
        localCache.invalidate("seckill:end:" + productId);
        System.out.println("收到 ZK 通知：结束标记已更新，本地缓存已清理");
    }
});

// 运营补货时，更新节点触发通知
zooKeeper.setData("/seckill/endFlag", "restocked".getBytes(), -1);
```

> 💡 **watch 是一次性的**：触发一次后自动失效，如果需要持续监听，回调里要重新注册 watch。

---

## 三、进阶篇（面试深挖）

### 3.1 ZK 做注册中心：CP vs AP（面试必考）

| | ZooKeeper / Nacos(CP) | Eureka |
|---|---|---|
| **一致性模型** | **CP**（强一致） | **AP**（高可用优先） |
| **网络分区时** | 宁可拒绝服务，也不给错误数据 | 各节点独立提供服务，可能读到旧列表 |
| **适用场景** | 交易、协调、锁（不能容忍数据不一致） | 纯查询服务注册（读旧列表顶多调到一个下线节点，重试即可） |
| **代表** | ZK、Nacos（默认 CP） | Eureka、Nacos（可切 AP） |

> 💡 **一句话**：CAP 不能全满足，ZK 选了 C（一致），Eureka 选了 A（可用）。**协调类场景必须一致，注册类场景可用优先。**

### 3.2 羊群效应（Herd Effect）

**问题**：100 个客户端同时 watch 同一个节点，节点一变，100 个客户端同时被唤醒、同时抢锁——瞬间流量洪峰。

**解法**：**顺序节点 + 只 watch 前一个节点**（见 2.1 的代码）。100 个节点排队，每个只 watch 自己前面那个。节点 1 释放时，只有节点 2 被唤醒，其余 98 个继续睡——**精准唤醒，不会 herd**。

### 3.3 临时节点误删

网络抖动导致客户端和 ZK 的会话超时 → ZK 认为客户端挂了 → 自动删临时节点 → 锁丢了 / 注册信息没了。

**解法**：
- 合理设置 `sessionTimeout`（不要太短，否则正常网络波动也误删；也不要太长，否则真挂了发现得慢）
- 客户端实现断线重连 + 临时节点重建逻辑

### 3.4 Observer 节点

ZK 集群默认所有节点都参与投票（写操作要半数 ACK）。**Observer 只同步数据、不参与投票**——扩大读能力，不影响写性能。适合跨机房部署：北京机房 3 台（投票），上海机房 2 台 Observer（只读）。

### 3.5 ZK 与 Dubbo / Nacos

- **Dubbo 默认注册中心**：早期用 ZK，现在逐渐切 Nacos（注册 + 配置一体，更轻量）
- **Nacos 的 ZK 替代**：Nacos 也支持 CP 模式（用 Raft），且自带控制台，运维更友好
- **选型建议**：新项目直接 Nacos；老项目用 ZK 的继续维护，没必要强迁

---

## 关联
- 秒杀库存扣减的 Lua 原子操作见 [[10_Redis 实战]]
- 本地缓存与多级缓存见 [[11_本地缓存 Ehcache 与 Caffeine]]
- 微服务注册中心对比见 [[14_微服务 SpringCloud 与 Dubbo]]
- 高并发设计全貌见 [[15_高并发高可用设计]]
