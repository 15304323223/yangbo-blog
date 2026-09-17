---
tags: #技术/中间件 #技术/消息队列 #技术/RabbitMQ #技术/Spring
date: 2026-09-15
title: "RabbitMQ 详解（原理 · 进阶 · Java 实战 · 问题与解决方案）"
---

# RabbitMQ 详解（原理 · 进阶 · Java 实战 · 问题与解决方案）

> **一句话概括**：RabbitMQ 是消息队列里的「**智能快递收发室**」——你（生产者）把包裹交给它就走，不用等收件人（消费者）；分拣员（Exchange）按地址规则把包裹分到不同快递柜（Queue），收件人各自来取。它的强项是**分拣灵活、不丢件、送得快**。
>
> **适合谁**：完全没接触过消息队列也能从零读懂（先看第零章）；正在用 `@RabbitListener` 但说不清原理的人；被"消息丢了 / 重复消费 / 积压雪崩"坑过、想要一份**排错手册**的人。
>
> **怎么读**：**零**建立整体印象（把黑话翻译成人话）→ **一**原理（分拣、存储、投递三层机制）→ **二**进阶（可靠性、顺序、事务、性能的深水区）→ **三**Java 实战（Spring AMQP 完整工程）→ **四**问题与解决方案（**生产事故手册，遇到问题直接查表**）。
>
> 📌 **本文与 [[12_消息队列 Kafka 与 RabbitMQ]] 的分工**：本文是 RabbitMQ **专篇**（原理 → 实战 → 排错全流程）；那篇是 Kafka / RabbitMQ **对比选型**速览。

---

## 零、先建立整体印象：一家快递收发室

### 0.0 术语大白话词典（看不懂黑话时回来查）⭐

**先别急着记专业名词。** 下表把黑话翻译成人话，**读全文遇到不懂的词就回来查**。**其实只要记住 5 个核心词**（生产者 / 消费者 / 交换机 / 队列 / Ack），全篇就能读通。

| 黑话 | 大白话翻译 | 生活类比 |
| --- | --- | --- |
| **消息队列（MQ）** | 帮忙传话的中间人。A 把消息交给它转交 B，**A 不用等 B** | 快递驿站 |
| **生产者（Producer）** | **发**消息的程序 | 寄件人 |
| **消费者（Consumer）** | **收**消息的程序 | 收件人 |
| **Broker** | RabbitMQ 这个软件本身（专门收发消息的服务器） | 整个收发室 |
| **Exchange（交换机）** | 收发室里的**分拣员**。看包裹地址，决定放哪个柜子。**他自己不留包裹** | 分拣员 |
| **Queue（队列）** | 存包裹的**快递柜**。包裹在这排队等取（先到先取，叫 FIFO） | 快递柜 |
| **Binding（绑定）** | 「分拣规则」——告诉分拣员哪种地址该进哪个柜子 | 分拣规章 |
| **Routing Key（路由键）** | 包裹上的**地址** | 收件地址 |
| **Channel（信道）** | 电话线上的**一个个通话窗口**。一条线能开很多窗口 | 电话分机 |
| **Connection（连接）** | 你的程序和 Broker 之间的**一条电话线**（TCP 连接） | 电话线 |
| **vhost（虚拟主机）** | 一台服务器里切出的**互不干扰的独立空间** | 一栋楼里不同公司 |
| **持久化** | **写到硬盘**，服务器重启数据还在 | 存进保险柜 |
| **Ack（确认）** | 「**我收到并处理好了**」的回执。没回执前消息不删 | 快递签收 |
| **Confirm（确认）** | 「我已收到你的包裹」的确认（Broker 对生产者说） | 揽收短信 |
| **死信队列（DLQ / DLX）** | 「**疑难件处理处**」。处理失败的消息送这里，而不是扔掉 | 快递异常件仓库 |
| **幂等** | 同一条消息处理 1 次和 100 次，**结果都一样** | 同一张票只检一次 |
| **异步 / 解耦 / 削峰** | 不用等对方 / 两家互不认识 / 高峰先存起来慢慢处理 | 寄快递 / 群发通知 / 水库蓄洪 |
| **反压（流控）** | 下游忙不过来时**逼上游慢下来** | 水龙头关小 |
| **仲裁队列** | 消息**复制到多个节点**，坏一两台也不丢（用 Raft 协议） | 重要文件复印几份分开存 |

### 0.1 RabbitMQ 到底在干什么

**先看个生活场景**：你网购后收到"快递已揽收"短信。这过程里——

- **商家**没亲自送货（不用等），而是**交给快递公司**；
- 快递公司的**分拣中心**按你所在城市，把包裹分到不同的**配送站点**；
- **快递员**从站点取件送到你手上。

**RabbitMQ 干的就是"快递公司"这个活**：

```
生产者（商家发货）
    │ 把包裹交给快递公司
    ▼
┌──────────────────────────────┐
│  Exchange（分拣中心）          │  ← ⭐ RabbitMQ 的灵魂
│  按「地址规则」决定发往哪个站点 │
└───────┬───────────┬──────────┘
        │           │
   ┌────▼────┐ ┌────▼────┐
   │ Queue A │ │ Queue B │      ← 配送站点（消息真正存这）
   └────┬────┘ └────┬────┘
        │           │
   ┌────▼────┐ ┌────▼────┐
   │ 消费者1  │ │ 消费者2  │      ← 快递员各自来取件
   └─────────┘ └─────────┘
```

**为什么需要这个"中间人"？** 因为**商家不想等快递送完才服务下一个客户**。同理，你的程序把消息交给 RabbitMQ 后**立刻能干别的**，不用等对方处理完。

**⚠️ 最关键的一点：生产者不直接发给队列，而是先发给「交换机」。**

这是 RabbitMQ 与 Kafka 最大的设计差异，也是"分拣灵活"的根源：

| | RabbitMQ | Kafka |
| --- | --- | --- |
| 生产者发给谁 | **Exchange**（交换机） | Topic（分区） |
| 路由能力 | **强**（4 种交换机 + 通配符） | 弱（基本只能按 key 分区） |
| 类比 | 有分拣员的智能快递柜 | 一条条传送带 |

> 💡 **一句话记住**：**Kafka 是"传送带"，消息只能往前走；RabbitMQ 是"分拣中心"，消息能按规则被分发到不同地方。**

### 0.2 核心概念一览

| 概念 | 类比 | 说明 |
| --- | --- | --- |
| **Producer** | 寄件人 | 发消息的应用 |
| **Consumer** | 收件人 | 收消息的应用 |
| **Exchange** | 分拣员 | **决定消息去哪个队列**，自己**不存消息** |
| **Queue** | 快递柜 | **消息真正存放的地方**，先到先取 |
| **Binding** | 分拣规则 | 把 Exchange 和 Queue 连起来，附带匹配条件 |
| **Routing Key** | 收件地址 | Exchange 靠它判断消息该去哪 |
| **vhost** | 独立收发室 | 逻辑隔离，不同业务用不同 vhost |
| **Channel** | 通话窗口 | 复用在一条 TCP 连接上的轻量通道 |
| **Connection** | 电话线 | 应用和 Broker 之间的 TCP 连接 |
| **Broker** | 整个收发室 | RabbitMQ 服务本身 |

> ⚠️ **新手第一大坑：Exchange 不存消息！**
>
> 打个比方：**分拣员手上没有临时货架**。如果包裹地址他一个柜子都匹配不上，这个包裹**当场就扔了**——不退回、不留档、不报错。
>
> 后果就是：**消息发出去了，代码没报错，但没有任何队列收到**。（解法见 3.2 和 5.4）

### 0.3 一条消息的完整旅程（后面全挂在这条链上）

```
① 生产者 → 建立 Connection（拨通电话线）→ 开 Channel（占一个通话窗口）
② 生产者把消息发给 Exchange，带上 Routing Key（写好收件地址）
③ Exchange 按【交换机类型 + 绑定规则】查找匹配的 Queue（分拣员按规章找柜子）
④ 消息进入 Queue（包裹放进柜子；开了持久化则同时写硬盘）
⑤ Broker 回 Confirm 给生产者（快递公司回你"已揽收"）
⑥ 消费者从 Queue 取消息（快递员来取件）
⑦ 消费者执行业务逻辑（把包裹送到你手上）
⑧ 消费者手动 Ack → Broker 才删除消息（你签收，快递单才作废）
```

**每一步都可能出问题——这就是"可靠性"要讨论的全部内容**：

| 步骤  | 可能的问题            | 解法                                     |
| --- | ---------------- | -------------------------------------- |
| ②③  | 网络抖动，消息没到 Broker | **Publisher Confirm**                  |
| ③   | 路由不到队列，消息被丢弃     | **mandatory + Return 回调**、**备用交换机 AE** |
| ④   | Broker 宕机，消息丢失   | **三重持久化** + **仲裁队列**                   |
| ⑥⑦  | 消费者处理慢，队列积压      | **prefetch 限流** + **多消费者**             |
| ⑦⑧  | 消费者崩溃，消息丢失       | **手动 Ack**                             |
| ⑧   | 反复失败，无限重试        | **死信队列 + 重试队列**                        |

> 💡 **一句话理解**：**想让消息不丢，就得每一步"留一手"**——发出去了要确认（⑤）、存下来要落盘（④）、取走了要回执（⑧）。

### 0.4 什么时候该用（别什么场景都硬上）

```
你要解决什么问题？
├─ 业务系统里"发通知/发短信/发邮件"这类异步任务
│     → ✅ RabbitMQ（低延迟、可靠、路由灵活）
├─ 订单 30 分钟未支付自动关闭这类"延时任务"
│     → ✅ RabbitMQ（TTL + 死信 或 延时插件）
├─ 日志、埋点、设备心跳这类"海量流数据"
│     → ❌ 用 Kafka（吞吐差一个数量级）
├─ 需要"重新消费历史消息"（重放）
│     → ❌ RabbitMQ 消费完就删，用 Kafka
├─ 单机吞吐要求 10 万+/秒
│     → ❌ 用 Kafka / RocketMQ
└─ 只想简单解耦 + 异步，量也不大
      → ✅ RabbitMQ 是最省心的选择
```

> 💡 **一句话选型**：**业务消息用 RabbitMQ，数据流用 Kafka。**
> 判据：**这条消息是"一件事"还是"一条数据"？**「订单已创建」是**事件**（RabbitMQ，要办得靠谱别丢别乱）；「用户点击了按钮」是**数据**（Kafka，量大能重放）。

---

## 一、原理篇：三层机制

> RabbitMQ 的原理可以拆成三层：**分拣层**（消息去哪）、**存储层**（消息怎么存）、**投递层**（消息怎么给消费者）。**每一层对应一类线上问题**——这是本篇的第一条主线。

### 1.1 分拣层：Exchange 的四种类型 ⭐

**先说人话**：Exchange 就是那个**分拣员**。四种类型 = **四个性格不同的分拣员**——有的只认完全一样的地址，有的会用通配符，有的干脆不看地址见谁都发。

**为什么这是最重要的一节？** 因为**你选哪种交换机，决定了消息能被送到哪里**。90% 的"消息发丢了"问题，根源都在这。

#### ① `direct`：精确匹配（最死板）

**分拣员性格**：**地址必须一字不差**。你说送"北京朝阳区"，他绝不送"北京海淀区"。

```
Exchange(direct) 的绑定关系：
  routingKey="order.pay"    → Queue: pay-queue
  routingKey="order.cancel" → Queue: cancel-queue

发消息 routingKey="order.pay"   → 只进 pay-queue ✅
发消息 routingKey="order.other" → 一个都不匹配 → 消息丢弃 💀
```

**最后一行就是新手最容易踩的"消息凭空消失"**——**不报错、不通知、不留痕**。

```java
@Bean
DirectExchange orderDirectExchange() {
    return new DirectExchange("order.direct", true, false);  // 名字, durable, autoDelete
}

@Bean
Binding payBinding(Queue payQueue, DirectExchange orderDirectExchange) {
    return BindingBuilder.bind(payQueue).to(orderDirectExchange).with("order.pay");
}
```

**适用**：按业务类型精确分发（支付、取消各走各的队列）。

#### ② `topic`：通配符匹配（最灵活，项目里用得最多）

**分拣员性格**：**会用通配符**。你说"凡寄往北京所有区的都放这个柜子"，他能听懂。

Routing Key 用 `.` 分隔成多个单词，绑定键可用两个通配符：

| 通配符 | 含义 | 例子 |
| --- | --- | --- |
| `*` | 匹配**恰好一个**单词 | `order.*.create` 匹配 `order.wechat.create`，**不匹配** `order.create` |
| `#` | 匹配**零个或多个**单词 | `order.#` 匹配 `order`、`order.pay`、`order.pay.wechat.success` |

> 💡 **好记**：`*` **小气，只认一个**；`#` **大方，多少个都收**。

```
绑定关系：
  "order.*.success" → Queue: order-success-queue
  "user.#"          → Queue: user-all-queue
  "#.error"         → Queue: error-queue

routingKey="order.pay.success" → order-success-queue ✅（* 匹配了 pay）
routingKey="user.login.wechat" → user-all-queue     ✅（# 匹配了 login.wechat）
routingKey="db.conn.error"     → error-queue        ✅（# 匹配了 db.conn）
```

> 💡 **命名建议**：用 `业务.模块.动作.结果` 四段式，如 `order.pay.wechat.success`。这样**一条 `#.fail 就能一网打尽所有失败消息**做统一告警——这就是"路由灵活"的实际价值。
>
> ⚠️ **性能提醒**：`#` 开头的绑定（如 `#.error）匹配开销较大，绑定多时慎用。

#### ③ `fanout`：广播（不看地址）

**分拣员性格**：**瞎发**。不管地址写什么，**所有登记过的柜子都放一份**。Routing Key 被忽略。

```java
// 典型场景：配置中心改了配置，广播给所有服务实例清本地缓存
@Bean
FanoutExchange configFanoutExchange() {
    return new FanoutExchange("config.fanout", true, false);
}
```

> 💡 **先理解默认规则**：**普通队列是「一条消息只被一个消费者消费」**——快递柜里只有一个包裹，快递员 A 拿走了，B 就没了（叫"竞争消费"）。
>
> **fanout 的经典用法——"每个实例都收到"**：想让**所有实例**都收到（如清本地缓存），就让**每个实例绑定一个自己的独占队列**到 fanout 交换机——相当于**每个站点各放一份副本**。这是"广播"和"集群"的关键区别。

#### ④ `headers`：按消息头匹配（基本不用）

不看 Routing Key，看消息的 headers 属性。

```java
Map<String, Object> args = Map.of(
    "x-match", "all",      // all=全部匹配；any=任一匹配
    "type", "order",
    "format", "pdf"
);
```

**实践中几乎不用**——`topic` 能满足 95% 需求，且 headers 性能更差、可读性更差。

#### 四种交换机速查

| 类型 | 分拣员性格 | 匹配依据 | 典型场景 |
| --- | --- | --- | --- |
| **direct** | 死板，一字不差 | Routing Key 完全相等 | 按业务类型精确分发 |
| **topic** | 聪明，会用通配符 | `*` / `#` | **最常用**，按层级规则分发 |
| **fanout** | 豪爽，见谁都发 | 全广播 | 配置刷新、缓存失效、多系统同步 |
| **headers** | 看标签不看地址 | 消息头键值 | 极复杂条件（可忽略） |

> ✅ **选型口诀**：**不知道选哪个就用 `topic`**；**只想精确对应就用 `direct`**；**要所有人收到就用 `fanout``**；`headers` 先忘了它。

### 1.2 存储层：队列类型与消息状态

#### 队列类型：经典队列 vs 仲裁队列

**先说人话**：队列就是"存消息的柜子"。两种柜子的区别在于「**要不要在多个仓库各存一份**」：

- **Classic Queue（经典队列）**：**只在一个仓库放**。快、省地方，但**那个仓库塌了货就没了**。
- **Quorum Queue（仲裁队列）**：**多个仓库各放一份，必须大部分仓库确认收到才算存好**。慢一点、占地方多，但**塌一两台也没事**。

| | **经典队列** | **仲裁队列** |
| --- | --- | --- |
| 实现 | 单节点为主 | 基于 Raft 协议复制 |
| 一致性 | 镜像队列有缺陷（已废弃） | **强一致**，多数派确认 |
| 性能 | 高 | 略低（要写多个节点） |
| 适用 | 短队列、低价值消息、临时队列 | **重要业务消息**（订单、支付） |
| 声明方式 | 默认 | `QueueBuilder.durable("q").quorum()` |

```java
// 仲裁队列：重要业务消息推荐
@Bean
Queue orderQueue() {
    return QueueBuilder.durable("order.queue")
            .quorum()                     // ⭐ 强一致
            .build();
}
```

> ⚠️ **镜像队列已废弃**，新项目别用，要高可靠就用**仲裁队列**。
>
> ⚠️ **仲裁队列的限制**：不支持优先级（`x-max-priority`）、不支持非持久化消息、队列名不能以 `amq.` 开头。**要优先级就不能用仲裁队列**——这是选型必知的取舍。
>
> 💡 **怎么选**：**订单、支付这类"错了要赔钱"的用仲裁队列**；**日志、监控、临时通知这类"丢了影响不大"的用经典队列**（省资源、更快）。

#### 消息的三个状态（理解"消息消失"的钥匙）

**这是理解无数丢消息事故的关键**：消息在 Broker 里有明确的生命周期，**Ack 是唯一的"删除触发器"**——注意"唯一"这两个字。

```
ready    → 在队列里等着被投递（控制台 Ready 列）
unacked  → 已投递给消费者，但还没收到 Ack（控制台 Unacked 列）⭐ 最危险
acked    → 收到 Ack，Broker 删除消息
```

**打比方**：快递员把包裹送到你家门口（unacked），但你**还没签字**。这时：
- 你签字了（Ack）→ 快递单归档，流程结束
- 你没签字、快递员又把包裹带走了（服务重启）→ 系统认为"没送达"，**重新投递**

| 状态 | 控制台位置 | 含义 | 危险信号 |
| --- | --- | --- | --- |
| **ready** | `Ready` 列 | 待消费，正常积压 | 持续增长 = **消费能力跟不上** |
| **unacked** | `Unacked` 列 | 已投递未确认 | 长期不降 = **消费者卡住/死循环** ⚠️ |
| **persistent** | 磁盘 | 已落盘 | 队列非持久化时，重启全丢 |

**这条机制直接解释三类"消息消失"事故**：

| 事故现象 | 根因 | 对应防线 |
| --- | --- | --- |
| 消费者崩了，消息也没了 | **自动 Ack**：一投递就确认删除，业务还没跑完 | 改 `manual` 手动 Ack |
| Broker 重启，消息全丢 | **消息非持久化**：只在内存里 | `deliveryMode=PERSISTENT` + 队列 durable |
| 处理失败后彻底消失 | `requeue=false` 且**没配死信**：被 reject 后无处可去 | 队列必须配 `deadLetterExchange` |

> ⚠️ **第三种最隐蔽**：很多项目开了手动 Ack，也老老实实 `basicNack(requeue=false)`，但**忘了给队列配死信交换机**。
>
> 打个比方：**你让快递员"送不到就退回去"，却没给他退货地址**——他只能当场扔掉。程序里完全看不到"消息丢了"，日志里只有业务异常。**队列不配 DLX，`requeue=false` 就等于删除。**

### 1.3 投递层：推送模型与 prefetch

**先说人话**：RabbitMQ 是**推送模型（push）**——不是消费者主动去拉，而是 **Broker 主动推给消费者**。`prefetch` 就是「**一次最多给这个消费者塞多少条**」。

**打比方**：食堂打饭。**师傅一次给你盛 10 份**，你端走慢慢吃，别人只能等；**一次只给 1 份**，你吃完再盛，大家轮流吃。

```yaml
spring:
  rabbitmq:
    listener:
      simple:
        prefetch: 1        # 每次只拿 1 条，处理完再拿
        concurrency: 5     # 5 个并发消费者（5 个打饭窗口）
```

| prefetch 值 | 效果 | 适用 |
| --- | --- | --- |
| **0（无限制）** | 一次把队列消息全推给消费者 | ❌ 危险：全堆一个消费者内存，别的饿死 |
| **1** | 一次只拿一条 | ✅ **处理慢、耗时长**的任务（公平分发） |
| **10~50** | 一次拿一小批 | ✅ **处理快**的任务（减少网络往返，吞吐高） |

> ⚠️ **Spring Boot 默认 prefetch 是 250**，很多场景下**偏大**，会导致分配严重不均。**建议显式设置**。

**💡 "消费者饥饿"是什么？**

两个消费者，一个处理一条 10 毫秒（快），一个要 1 秒（慢）。

prefetch=250 时，**Broker 一次性给两人各塞了 250 条**：

```
消费者 A（快，10ms）→ 250 条 2.5 秒干完，然后【闲着没事干】
消费者 B（慢，1s）  → 250 条要干 250 秒 ⚠️ 消息全卡在 B 手里
```

结果：**队列里明明还有几万条，但因为都"名花有主"，快的消费者只能干瞪眼**。

**这就是"明明有 5 个消费者，为什么消费速度像只有一个"的答案。** 设 `prefetch=1` 才能做到"谁干完谁再取"。

### 1.4 三层机制 → 三类问题的对应关系 ⭐

**这是本篇的第一条主线**——把"原理层"和"排错"打通：

| 原理层 | 核心机制 | 对应的线上问题 | 排查入口 |
| --- | --- | --- | --- |
| **分拣层** | Exchange 无状态转发 | **消息静默消失**（发出去没人收到） | 有无 Return 回调日志 |
| **存储层** | Ack 驱动消息生命周期 | **消息丢失**、消息重复 | `Ready` / `Unacked` 列 |
| **存储层** | 消息默认在内存 | **Broker 重启丢消息** | 队列 `durable` 属性 |
| **存储层** | 内存水位触发流控 | **积压 → 生产端被卡 → 全站雪崩** | Broker 内存 + `Ready` 数 |
| **投递层** | 推送模型 + 信用额度 | **消费负载不均**，看着有消费者却慢 | `Consumers` 数 vs 消费速率 |

> 💡 **用法**：看到线上问题，先从"对应的线上问题"这列找到你的症状，再看"核心机制"，就知道该去查哪里。**从症状反推原理，比从原理背到症状快得多。**

---

## 二、进阶篇：深水区

> 前一章讲"是什么"，这章讲"**为什么会这样，以及怎么用对**"。四个主题：可靠性、顺序性、事务与一致性、性能与集群。

### 2.1 可靠性：消息不丢的五道防线 ⭐

**先看个生活场景**：你寄一台电脑给朋友。要保证电脑不丢，需要做多少事？

| 环节 | 你做的事 | 对应机制 | 生活类比 |
| --- | --- | --- | --- |
| ① | 交给快递要有**揽收凭证** | **Publisher Confirm** | 快递揽收短信 |
| ② | 快递内部**不能分错站点** | **mandatory + Return 回调 / AE** | 分拣正确性检查 + 异常件转寄 |
| ③ | 中转仓库要放**实体货架** | **三重持久化** | 货物上货架（不是堆地上） |
| ④ | 仓库**不能只有一个** | **仲裁队列 / 集群** | 多仓库备份 |
| ⑤ | 朋友收到要**签收** | **手动 Ack** | 收件人签收 |

**这就是"五道防线"，缺一不可**：

```java
// ① Publisher Confirm：Broker 收到消息后回调（相当于揽收短信）
rabbitTemplate.setConfirmCallback((correlationData, ack, cause) -> {
    if (!ack) {
        // ⚠️ Broker 没收到 → 必须重发或落库补偿
        log.error("消息未到达 Broker，id={}", correlationData != null ? correlationData.getId() : null, cause);
    }
});

// ② 路由失败回调：Exchange 找不到队列时触发（分拣员发现"地址查无此处"）
rabbitTemplate.setMandatory(true);     // ⭐ 必须开，否则默认静默扔掉
rabbitTemplate.setReturnsCallback(returned -> {
    log.error("消息路由失败：exchange={}, routingKey={}, replyText={}",
            returned.getExchange(), returned.getRoutingKey(), returned.getReplyText());
});
```

```java
// ③ 三重持久化（三个都要！少一个都可能丢）
new DirectExchange("order.direct", true, false);          // 交换机 durable=true
QueueBuilder.durable("order.queue").build();              // 队列 durable=true
Message message = MessageBuilder.withBody(bytes)
        .setDeliveryMode(MessageDeliveryMode.PERSISTENT)  // 消息持久化 ⭐ 最容易漏
        .build();
```

> ⚠️ **最容易漏的是第 3 个**。打个比方：**你把货架（队列）加固了，却把货物随手放在地上**——仓库一着火（Broker 重启），货架还在，货没了。
>
> **记住：三个 durable 一起设。**

### 2.2 顺序性：RabbitMQ 怎么保证有序 ⭐

**问题**：消息 A 先发、B 后发，消费者可能先处理 B。

**先理解为什么会乱**——**有三个环节都能打乱顺序**：

| 环节 | 为什么乱 | 解法 |
| --- | --- | --- |
| **多消费者** | 多个消费者并行处理，谁先处理完谁先算 | **单队列单消费者** |
| **prefetch > 1** | 消费者预取多条后并行/乱序处理 | **prefetch=1** |
| **多个队列** | 同一业务的消息分散到多个队列 | 同一业务**固定一个队列** |
| **发送方多线程** | 多线程发送本身顺序就不确定 | 发送侧**按 key 路由到同一队列** |

**生产可用的方案（两种，按业务影响面选）**：

**方案一：全局串行（简单，但吞吐低）**

```yaml
spring:
  rabbitmq:
    listener:
      simple:
        concurrency: 1     # ⭐ 只有 1 个消费者
        prefetch: 1        # ⭐ 一次只取 1 条
```

> ✅ 保证严格有序，**吞吐受限于单线程**。适合"订单状态流转"这类**业务上必须严格有序、但量不大**的场景。

**方案二：按业务 ID 分队列（推荐，兼顾有序和吞吐）**

```java
// ⭐ 关键：把同一个订单的消息"钉死"在同一个队列里
public void sendOrderEvent(OrderEvent event) {
    // 按订单 ID 哈希取模，选出固定的队列（同一订单永远走同一个队列）
    int queueIndex = Math.abs(event.getOrderId().hashCode()) % QUEUE_COUNT;
    String routingKey = "order." + queueIndex;

    rabbitTemplate.convertAndSend(ORDER_EXCHANGE, routingKey, event, msg -> {
        msg.getMessageProperties().setDeliveryMode(MessageDeliveryMode.PERSISTENT);
        return msg;
    });
}

// 消费端：N 个队列各有自己的消费者（同一队列内单消费者 → 队列内有顺序）
@RabbitListener(queues = "order.queue.0", concurrency = "1")
public void consume0(OrderEvent event) { handle(event); }
@RabbitListener(queues = "order.queue.1", concurrency = "1")
public void consume1(OrderEvent event) { handle(event); }
```

**效果**：不同订单并行处理（吞吐高），**同一订单严格有序**（正确性保证）。

> 💡 **为什么这样能保证有序？** 因为**同一订单永远进同一个队列，而每个队列只有一个消费者**——像"同一个客户的快递固定由同一个快递员负责"，自然按顺序处理。
>
> ⚠️ **注意**：`% QUEUE_COUNT` 必须在生产端和消费端**保持一致**，否则消息会跑到没有消费者的队列里。

### 2.3 事务与一致性：数据库和消息怎么保证一起成功

**问题**：业务代码通常是"**写库 + 发消息**"两步。但这两步**不是原子的**。

**打比方**：你收了钱（写库成功），要同时开一张发货单（发消息）。**万一起单前停电了**——钱收了货没人发；**万一单开了但交易取消**——货发了钱却退了。

```
写完库，发消息前服务挂了 → 订单创建了，但没人发短信 ❌
发消息成功，但事务回滚了 → 短信发了，订单却不存在 ❌
```

**三种解法**：

**解法一：本地消息表（最常用，推荐）⭐**

```java
@Transactional(rollbackFor = Exception.class)   // ⭐ 三步在同一事务里
public void createOrder(Order order) {
    // ① 写业务表
    orderMapper.insert(order);

    // ② 写"待发送消息表"（和业务表在同一个本地事务里）
    LocalMessage msg = new LocalMessage();
    msg.setBizId(order.getId().toString());
    msg.setExchange("order.topic");
    msg.setRoutingKey("order.create.success");
    msg.setPayload(JSON.toJSONString(new OrderCreatedEvent(order.getId())));
    msg.setStatus(LocalMessage.STATUS_PENDING);  // 待发送
    localMessageMapper.insert(msg);

    // ③ 事务提交后，由定时任务扫描"待发送消息表"发 MQ
}
```

```java
// 定时任务：扫描待发送消息，补发漏掉的
@Scheduled(fixedDelay = 5000)
public void sendPendingMessages() {
    List<LocalMessage> pending = localMessageMapper.selectList(
            LocalMessage.STATUS_PENDING, 100);

    for (LocalMessage msg : pending) {
        try {
            rabbitTemplate.convertAndSend(msg.getExchange(), msg.getRoutingKey(), msg.getPayload());
            localMessageMapper.updateStatus(msg.getId(), LocalMessage.STATUS_SENT);  // 标记已发送
        } catch (Exception e) {
            log.error("补发消息失败, id={}", msg.getId(), e);
            localMessageMapper.increaseRetryCount(msg.getId());   // 记重试次数，超限告警
        }
    }
}
```

> 💡 **大白话**：**收货时【顺手把发货单也记在同一个账本上】**，然后安排一个专门的人盯着账本，把漏掉的单子补发出去。
>
> ✅ **这是 RabbitMQ 场景下的标准答案**——因为 RabbitMQ 没有原生事务消息。

**解法二：事务消息**（RocketMQ 原生支持，RabbitMQ 没有）

**解法三：接受不一致 + 定时对账补偿**（业务简单时够用）

> 💡 **面试高频追问**："写完数据库、发消息前宕机了怎么办？"
> **标准答案：本地消息表 + 定时补偿。**

### 2.4 性能与集群：从单机到生产

#### 单机性能优化清单

| 优化点 | 做法 | 收益 |
| --- | --- | --- |
| **连接复用** | 连接池 + Channel 缓存 | 避免 TCP 握手开销（见 5.3 坑 7/8） |
| **批量确认** | `publisher-confirm-type: correlated` + 批量发送 | 减少网络往返 |
| **消费者并发** | `concurrency` / `max-concurrency` | 提升消费吞吐 |
| **prefetch 调优** | 慢任务 1，快任务 10~50 | 负载均衡 + 吞吐 |
| **消息体积** | 控制在 **128KB 内**，大文件走 OSS | 降低内存和网络压力 |
| **异步确认** | 用 `CorrelationData` 做异步确认 | 不阻塞发送线程 |

#### 集群模式

| 模式 | 说明 | 适用 |
| --- | --- | --- |
| **普通集群** | 只同步元数据，**消息只存一个节点** | 提升吞吐（但单点故障会丢消息） |
| **仲裁队列** | Raft 多数派，**消息多副本** | ⭐ **生产首选**（重要业务） |
| **Federation / Shovel** | 跨机房/跨集群消息转发 | 异地多活、数据同步 |

> ⚠️ **脑裂与网络分区**：经典集群在网络分区时，镜像队列**可能丢数据**（两个分区各自选主，恢复后丢一边）。
>
> **打比方**：让两个仓库各存一份货，某天**线路断了**，两边都以为自己是正本各自收发货。等线路恢复一对接——**记录冲突，只能丢一边**。
>
> **仲裁队列（Raft）修正了这个问题**：改成"**必须大部分仓库都确认收到才算存好**"。线路断了时，**人少的那拨干脆停业**（而不是自己乱记），等恢复再对齐——**绝不会出现两份冲突记录**。

| 对比 | 镜像队列（已废弃） | 仲裁队列 |
| --- | --- | --- |
| 一致性 | ⚠️ 分区时可能丢数据 | ✅ 强一致（多数派确认） |
| 可用性 | 分区时两边都能写 | 少数派不可用（CP 取向） |
| 节点数 | 任意 | **必须奇数**（3/5） |
| 写入性能 | 高 | 略低（要等多数派） |

> 💡 **为什么节点数必须奇数？** 因为要"多数派"。3 个节点坏 1 个还剩 2 个（多数派在，能干活）；**4 个节点坏 1 个只剩 3 个，但凑够 3 个才算多数派——容错能力和 3 节点一模一样，却多花一台机器的钱**。所以要么 3 要么 5。

### 2.5 机制 → 配置 → 症状（进阶篇总结表）⭐

**把"底层为什么这样"和"线上怎么表现"打通**：

| 底层机制 | 必配参数 | 不配的症状 | 排查看哪里 |
| --- | --- | --- | --- |
| Exchange 无状态转发 | `mandatory` + AE | 消息**静默消失**，日志无异常 | 有无 Return 回调日志 |
| 消息生命周期靠 Ack 驱动 | `acknowledge-mode: manual` | 消费者崩 → 消息丢 | `Unacked` 列 |
| 消息默认在内存 | `deliveryMode=PERSISTENT` | Broker 重启 → 消息全丢 | 队列 `durable` 属性 |
| 内存水位触发流控 | `maxLength` + `reject-publish` | 积压 → **生产端线程被卡** → 雪崩 | `Ready` 数 + Broker 内存 |
| 推送模型 + 信用额度 | `prefetch`（1 或 10~50） | 消费负载不均，看着有消费者却慢 | `Consumers` 数 vs 消费速率 |
| Connection 是 Erlang 进程 | 连接池 + Channel 缓存 | 连接数爆炸 → Broker 扛不住 | `Connections` 数 |
| 镜像队列分区可丢数据 | 改用 **quorum queue** | 分区恢复后数据凭空少 | 队列类型 |
| 消息处理完即删 | （无解，换 Kafka） | 无法重放历史消息修复 bug | — |

---

## 三、Java 实战：Spring AMQP 完整工程

> 这一章是**可以直接抄进项目**的完整代码，按"依赖 → 配置 → 声明 → 生产 → 消费 → 延时的顺序。**每一段都配了逐行注释和"为什么这么写"**。

### 3.1 引入依赖

```xml
<!-- Spring Boot AMQP 起步依赖（内置 RabbitMQ 客户端） -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-amqp</artifactId>
</dependency>

<!-- 消息体用 JSON 序列化（强烈建议，见 3.6） -->
<dependency>
    <groupId>com.fasterxml.jackson.core</groupId>
    <artifactId>jackson-databind</artifactId>
</dependency>
```

### 3.2 生产级 application.yml（逐行注释）⭐

```yaml
spring:
  rabbitmq:
    host: ${RABBITMQ_HOST:localhost}
    port: 5672
    username: ${RABBITMQ_USER:guest}
    password: ${RABBITMQ_PWD:guest}
    virtual-host: /order-service          # ⭐ 逻辑隔离，不同环境不同 vhost

    # ==================== 生产者可靠性 ====================
    publisher-confirm-type: correlated    # ⭐ 开启 Confirm（correlated 可关联到具体消息）
    publisher-returns: true               # ⭐ 开启路由失败回调
    template:
      mandatory: true                     # ⭐ 路由不到队列时触发 Return 回调（不设则静默丢弃）
      retry:
        enabled: true                     # 发送失败自动重试
        initial-interval: 1000            # 首次重试间隔 1s
        max-attempts: 3                   # 最多重试 3 次

    # ==================== 消费者可靠性 ====================
    listener:
      simple:
        acknowledge-mode: manual          # ⭐ 手动 Ack（生产必须）
        prefetch: 1                       # ⭐ 每次预取 1 条，公平分发
        concurrency: 5                    # 初始消费者数
        max-concurrency: 20               # 最大消费者数（自动扩容）
        retry:
          enabled: true                   # 本地重试
          max-attempts: 3                 # 最多 3 次
          initial-interval: 1000          # 首次 1s
          multiplier: 2                   # 退避倍数：1s → 2s → 4s
          max-interval: 10000             # 最大间隔 10s
          default-requeue-rejected: false # ⭐ 重试用尽后进死信队列（别重回原队列！）
```

> ⚠️ **`acknowledge-mode` 三个取值**（回执怎么给）：
> | 值 | 行为 | 风险 |
> | --- | --- | --- |
> | `none` | **快递员一放下就算签收** | ❌ **消费者崩了消息就丢** |
> | `auto`（默认） | **没喊"有问题"就算签收** | ⚠️ 异步处理时可能提前 Ack |
> | `manual` | **必须你亲自签字才算签收** | ✅ **生产推荐** |
>
> 💡 **为什么生产必须 `manual`？** 只有"**业务真正跑完**才算签收"才是安全的。用 `none` 的话消息一到手就算完了——**这时候程序崩了，消息没了业务也没做**。

### 3.3 声明交换机、队列、绑定（含死信配置）

```java
@Configuration
public class RabbitMQConfig {

    // ==================== 常量（集中管理，避免手写字符串出错）====================
    public static final String ORDER_EXCHANGE = "order.topic";
    public static final String ORDER_QUEUE    = "order.queue";
    public static final String ORDER_ROUTING  = "order.#";

    public static final String DLX_EXCHANGE   = "order.dlx";
    public static final String DLQ_QUEUE      = "order.dlq";
    public static final String DLQ_ROUTING    = "order.dlq.key";

    // ==================== 业务交换机与队列 ====================

    /** 业务交换机：topic 类型，durable=true */
    @Bean
    public TopicExchange orderExchange() {
        return ExchangeBuilder.topicExchange(ORDER_EXCHANGE)
                .durable(true)              // ⭐ 持久化：Broker 重启后交换机还在
                .build();
    }

    /**
     * 业务队列：⭐ 关键——声明时就指定"我处理失败的消息去哪"
     */
    @Bean
    public Queue orderQueue() {
        return QueueBuilder.durable(ORDER_QUEUE)
                .deadLetterExchange(DLX_EXCHANGE)      // 死信交换机
                .deadLetterRoutingKey(DLQ_ROUTING)     // 死信路由键
                .ttl(30 * 60 * 1000)                   // 消息 30 分钟过期（可选）
                .maxLength(100_000)                    // ⭐ 队列最大长度，防内存打爆
                .overflow(QueueBuilder.Overflow.rejectPublish)  // ⭐ 满了拒收而非丢旧的
                .build();
    }

    @Bean
    public Binding orderBinding(Queue orderQueue, TopicExchange orderExchange) {
        return BindingBuilder.bind(orderQueue).to(orderExchange).with(ORDER_ROUTING);
    }

    // ==================== 死信交换机与队列 ====================

    @Bean
    public DirectExchange dlxExchange() {
        return ExchangeBuilder.directExchange(DLX_EXCHANGE).durable(true).build();
    }

    @Bean
    public Queue dlqQueue() {
        // ⚠️ 死信队列不用再配死信（否则无限套娃）
        return QueueBuilder.durable(DLQ_QUEUE).build();
    }

    @Bean
    public Binding dlqBinding(Queue dlqQueue, DirectExchange dlxExchange) {
        return BindingBuilder.bind(dlqQueue).to(dlxExchange).with(DLQ_ROUTING);
    }
}
```

> 💡 **`maxLength` 是救命参数**：不设的话，消费者挂了消息会无限堆积，**把 Broker 内存打爆**。**生产环境必须设。**
>
> 💡 **`overflow` 三种策略**（仓库满了怎么办）：
> | 策略 | 行为 | 适用 |
> | --- | --- | --- |
> | `drop-head`（默认） | **丢掉最老的消息** | ⚠️ **静默丢数据**，慎用 |
> | **`reject-publish`** | **拒收新消息**（"满了，别来了"） | ✅ **推荐**：让生产者立刻感知压力 |
> | `reject-publish-dlx` | 拒收并转入死信 | ✅ 需要留存证据时用 |

### 3.4 生产者：发送 + 两个回调

```java
@Component
@Slf4j
@RequiredArgsConstructor
public class OrderProducer {

    private final RabbitTemplate rabbitTemplate;

    /** 构造后注册两个回调（⚠️ 只注册一次，别每次发消息都注册） */
    @PostConstruct
    public void initCallbacks() {

        // ① Confirm 回调：Broker 是否收到了消息
        rabbitTemplate.setConfirmCallback((correlationData, ack, cause) -> {
            if (ack) {
                log.debug("消息已到达 Broker：{}", correlationData != null ? correlationData.getId() : "null");
            } else {
                // ⚠️ 消息没到 Broker！必须补偿：重发 / 落库 / 告警
                log.error("❌ 消息未到达 Broker, id={}, 原因={}",
                        correlationData != null ? correlationData.getId() : "null", cause);
                // 实际项目：写补偿表，由定时任务重发
            }
        });

        // ② Return 回调：到了 Broker，但路由不到任何队列
        rabbitTemplate.setReturnsCallback(returned -> {
            log.error("❌ 消息路由失败（没有队列接收）：exchange={}, routingKey={}, replyCode={}, replyText={}",
                    returned.getExchange(), returned.getRoutingKey(),
                    returned.getReplyCode(), returned.getReplyText());
            // 实际项目：告警 + 落库（通常意味着"队列没声明"或"路由键写错了"）
        });
    }

    /** 发送订单事件 */
    public void sendOrderEvent(OrderEvent event) {
        // ⭐ CorrelationData 用于把 Confirm 回调和具体消息关联起来
        CorrelationData correlationData = new CorrelationData(event.getOrderId());

        rabbitTemplate.convertAndSend(
                RabbitMQConfig.ORDER_EXCHANGE,    // 交换机
                "order.create.success",           // 路由键（会被 order.# 匹配）
                event,                            // 消息体（Jackson 转 JSON）
                message -> {
                    // ⭐ 消息持久化（最容易漏的一步！）
                    message.getMessageProperties()
                           .setDeliveryMode(MessageDeliveryMode.PERSISTENT);
                    // 设置消息 ID，便于追踪
                    message.getMessageProperties().setMessageId(event.getOrderId());
                    return message;
                },
                correlationData
        );
    }
}
```

### 3.5 消费者：手动 Ack 的完整写法 ⭐

**这是最容易写错的地方**——手动 Ack 写不好，要么丢消息，要么死循环。

```java
@Component
@Slf4j
@RequiredArgsConstructor
public class OrderConsumer {

    private final OrderService orderService;
    private final RedisTemplate<String, String> redisTemplate;

    /**
     * 消费订单消息
     * ⚠️ 注意：channel 参数只有手动 Ack 模式才需要
     */
    @RabbitListener(queues = RabbitMQConfig.ORDER_QUEUE)
    public void onOrderMessage(OrderEvent event,
                               Channel channel,
                               @Header(AmqpHeaders.DELIVERY_TAG) long deliveryTag) {
        String msgId = event.getOrderId();
        try {
            // ========== 第 1 步：幂等校验（⚠️ 见 2.6 / 5.4 坑 14）==========
            // MQ 是 at-least-once（至少送一次，可能送多次），必须防重复
            Boolean first = redisTemplate.opsForValue()
                    .setIfAbsent("mq:idempotent:" + msgId, "1", 24, TimeUnit.HOURS);
            if (Boolean.FALSE.equals(first)) {
                log.warn("[消费] 重复消息，已忽略, msgId={}", msgId);
                channel.basicAck(deliveryTag, false);   // ⭐ 重复消息也要 Ack，否则会一直重投
                return;
            }

            // ========== 第 2 步：执行业务逻辑 ==========
            orderService.handleOrderCreated(event);

            // ========== 第 3 步：业务成功 → 手动 Ack ==========
            channel.basicAck(deliveryTag, false);       // ⭐ 告诉 Broker"处理好了，可以删"

        } catch (BusinessException e) {
            // ========== 业务异常（如"库存不足"）→ 重试没意义 → 直接进死信 ==========
            log.error("[消费] 业务异常，不再重试, msgId={}", msgId, e);
            // ⚠️ requeue=false 才会进死信队列（前提：队列配了 DLX，见 3.3）
            channel.basicNack(deliveryTag, false, false);

        } catch (Exception e) {
            // ========== 系统异常（如"数据库连接超时"）→ 值得重试 ==========
            log.error("[消费] 系统异常，将重试, msgId={}", msgId, e);
            // ⚠️ requeue=true 需要谨慎！若无限制重试会死循环（见 5.4 坑 3）
            //    生产建议：改成本地重试（已配 retry），最终失败进死信
            channel.basicNack(deliveryTag, false, false);
        }
    }
}
```

**⚠️ 手动 Ack 的三种确认方式**：

| 方法 | 含义 | 消息去哪 |
| --- | --- | --- |
| `basicAck(tag, false)` | ✅ 成功确认 | **Broker 删除消息** |
| `basicNack(tag, false, false)` | ❌ 失败，**不重新入队** | **进死信队列**（前提：配了 DLX） |
| `basicNack(tag, false, true)` | ❌ 失败，**重新入队** | ⚠️ 回到队头，**极易死循环** |

> ⚠️ **最容易犯的三个错**：
> 1. **重复消息不 Ack** → 会一直重投，形成死循环。**重复消息也要 Ack。**
> 2. **`requeue=true` 用在不该用的地方** → 立即重回队头，马上又失败，**CPU 打满**。
> 3. **忘了给队列配 DLX** → `requeue=false` 的消息**被静默丢弃**。

### 3.6 消息转换器：必须配 JSON ⭐

不配的话默认用 **JDK 序列化**——消息体是**乱码**，其他语言读不了，控制台也看不懂。

```java
@Configuration
public class RabbitMQConverterConfig {

    @Bean
    public MessageConverter jsonMessageConverter() {
        // ⭐ 用 Jackson 转 JSON：跨语言可读，控制台可查
        Jackson2JsonMessageConverter converter = new Jackson2JsonMessageConverter();
        // 带类型信息，消费端能自动反序列化成原对象
        converter.setClassMapper(new DefaultJackson2JavaTypeMapper());
        return converter;
    }

    @Bean
    public RabbitTemplate rabbitTemplate(ConnectionFactory connectionFactory,
                                         MessageConverter jsonMessageConverter) {
        RabbitTemplate template = new RabbitTemplate(connectionFactory);
        template.setMessageConverter(jsonMessageConverter);
        template.setMandatory(true);      // ⭐ 开启路由失败回调
        return template;
    }

    // ⚠️ 消费端也要配（否则反序列化失败）
    @Bean
    public SimpleRabbitListenerContainerFactory rabbitListenerContainerFactory(
            ConnectionFactory connectionFactory,
            MessageConverter jsonMessageConverter) {
        SimpleRabbitListenerContainerFactory factory = new SimpleRabbitListenerContainerFactory();
        factory.setConnectionFactory(connectionFactory);
        factory.setMessageConverter(jsonMessageConverter);
        return factory;
    }
}
```

> ⚠️ **生产端和消费端必须用同一个转换器**，否则报 `SimpleMessageConverter only supports String, byte[]...`。

### 3.7 延时队列实战：订单 30 分钟未支付自动关闭 ⭐

**这是使用频率最高的场景，也是坑最多的**。先说清两种方案：

| 方案 | 原理 | 优点 | 缺点 |
| --- | --- | --- | --- |
| **TTL + 死信** | 消息设 TTL，过期后进死信队列被消费 | **不装插件**，开箱即用 | ⚠️ **队头阻塞**（见下） |
| **延时插件** | 装 `rabbitmq_delayed_message_exchange` | 精度高、无阻塞 | 需要运维装插件 |

**⚠️ 必须理解"队头阻塞"**——这是 TTL 方案的致命缺陷：

```
队列是【先到先出】的，RabbitMQ 只检查【队头】那条消息是否过期！

场景：依次放入 TTL=30分钟、TTL=10分钟 的两条消息
  → 队头是 30 分钟那条，还没过期 → 后面的 10 分钟消息【只能等着】
  → 结果：10 分钟的消息实际等了 30 分钟才被处理 ⚠️

类比：超市只有一个收银台，前面的人买了一大车（要慢慢结账），
      后面只买一瓶水的人也【必须等前面结完】才能结
```

**✅ 正确做法：按延时时长分队列**（不同 TTL 用不同队列，避免队头阻塞）

```java
@Configuration
public class DelayQueueConfig {

    /** 延时交换机（用 direct，按不同延时投递到不同队列） */
    @Bean
    public DirectExchange delayExchange() {
        return ExchangeBuilder.directExchange("delay.exchange").durable(true).build();
    }

    /** ⭐ 关键：每个延时时长【各建一个队列】——避免队头阻塞 */
    @Bean
    public Queue delay30MinQueue() {
        return QueueBuilder.durable("delay.queue.30min")
                .ttl(30 * 60 * 1000)                    // 30 分钟
                .deadLetterExchange("delay.dlx")        // 过期后转到死信
                .deadLetterRoutingKey("delay.timeout")  // 死信路由键
                .build();
    }

    @Bean
    public Queue delay10MinQueue() {
        return QueueBuilder.durable("delay.queue.10min")
                .ttl(10 * 60 * 1000)                    // 10 分钟
                .deadLetterExchange("delay.dlx")
                .deadLetterRoutingKey("delay.timeout")
                .build();
    }

    @Bean
    public Binding bind30Min() {
        return BindingBuilder.bind(delay30MinQueue()).to(delayExchange()).with("delay.30min");
    }

    @Bean
    public Binding bind10Min() {
        return BindingBuilder.bind(delay10MinQueue()).to(delayExchange()).with("delay.10min");
    }

    // ==================== 死信侧：真正的"到期处理" ====================

    @Bean
    public DirectExchange delayDlx() {
        return ExchangeBuilder.directExchange("delay.dlx").durable(true).build();
    }

    @Bean
    public Queue delayTimeoutQueue() {
        return QueueBuilder.durable("delay.timeout.queue").build();
    }

    @Bean
    public Binding delayTimeoutBinding() {
        return BindingBuilder.bind(delayTimeoutQueue()).to(delayDlx()).with("delay.timeout");
    }
}
```

```java
/** 发送延时消息 */
public void sendDelayMessage(Long orderId, int delayMinutes) {
    String routingKey = "delay." + delayMinutes + "min";   // ⭐ 按延时时长选队列
    rabbitTemplate.convertAndSend("delay.exchange", routingKey, orderId, msg -> {
        msg.getMessageProperties().setDeliveryMode(MessageDeliveryMode.PERSISTENT);
        return msg;
    });
    log.info("[延时消息] 已发送, orderId={}, 延时={}分钟", orderId, delayMinutes);
}
```

```java
/** 消费"已到期"的消息 */
@RabbitListener(queues = "delay.timeout.queue")
public void onDelayTimeout(Long orderId, Channel channel,
                           @Header(AmqpHeaders.DELIVERY_TAG) long tag) throws IOException {
    try {
        // 真正的业务：检查订单是否仍未支付
        orderService.closeIfUnpaid(orderId);
        channel.basicAck(tag, false);
    } catch (Exception e) {
        log.error("[延时消费] 失败, orderId={}", orderId, e);
        channel.basicNack(tag, false, false);
    }
}
```

> ✅ **记住两句话**：
> 1. **不同延时时长必须分不同队列**（否则队头阻塞）
> 2. **延时队列 = 普通队列 + TTL + 死信交换机**（不是特殊类型的队列）

### 3.8 生产调优速查表

| 参数 | 建议值 | 为什么 |
| --- | --- | --- |
| `publisher-confirm-type` | `correlated` | 知道哪条消息没到，便于精确补偿 |
| `publisher-returns` + `mandatory` | `true` | 否则路由失败静默丢消息 |
| `acknowledge-mode` | `manual` | 业务跑完才算签收 |
| `prefetch` | 慢任务 `1`，快任务 `10~50` | 公平分发 / 提吞吐 |
| `concurrency` / `max-concurrency` | 按 CPU 和 IO 比例设 | 5 / 20 是常用起点 |
| `retry.max-attempts` | `3` + `multiplier: 2` | 指数退避，别死循环 |
| `default-requeue-rejected` | `false` | **重试用尽进死信，别重回原队列** |
| 队列 `maxLength` | 按业务压测量 | 防内存打爆导致雪崩 |
| 队列 `overflow` | `reject-publish` | 满了拒收，让生产者感知压力 |
| 消息体积 | **< 128KB** | 大消息走 OSS，消息里放 URL |
| `vhost` | 按环境/业务划分 | 隔离，防测试消息串到生产 |

---

## 四、问题与解决方案：生产事故手册 ⭐

> **这一章是全文的"排错入口"**。遇到问题**直接按症状查表**。
>
> 💡 **用法**：先在第 4.1 节按**症状**定位问题编号 → 到 4.2 节看**根因和完整解法** → 需要理解原理就点回**第二/三章对应小节**。

### 4.1 症状速查表（出了问题先看这里）⭐

| 你的症状 | 问题编号 | 直接嫌疑 |
| --- | --- | --- |
| 消息发出去了，**没有任何队列收到**，日志无异常 | **P1** | `mandatory` 没开 / 路由键写错 / 队列没声明 |
| **Broker 重启后消息全没了** | **P2** | 消息没设 `deliveryMode=PERSISTENT` |
| **消费者崩了消息就丢** | **P3** | 用了自动 Ack，没改 `manual` |
| **CPU 100%**，消息反复重投 | **P4** | `requeue=true` 死循环 |
| 消息处理失败后**彻底消失** | **P5** | `requeue=false` 但队列没配 DLX |
| **重复消费**，导致重复扣款/重复发短信 | **P6** | 没做幂等 |
| 队列积压，**整个应用卡死/失去响应** | **P7** | 触发流控，生产者被阻塞 |
| **有 5 个消费者，但消费速度像只有一个** | **P8** | `prefetch` 太大 |
| **短延时的消息没有按时触发** | **P9** | TTL 队头阻塞 |
| **连接数持续增长**，最终打满 | **P10** | Channel/Connection 泄漏 |
| 报错 `SimpleMessageConverter only supports String...` | **P11** | 生产/消费端转换器不一致 |
| **顺序错乱**（先发的后处理） | **P12** | 多消费者 / prefetch>1 |
| **队列莫名消失** | **P13** | autoDelete 或没人用被自动删 |
| **消息进了死信队列没人知道** | **P14** | 死信没有告警 |
| 集群**分区后数据凭空少** | **P15** | 用了镜像队列而非仲裁队列 |

### 4.2 问题详解与解决方案 ⭐

#### P1 — 消息静默消失（最常见）⚠️⚠️

**症状**：`convertAndSend` 正常返回，不抛异常，但**所有队列都没有消息**。

**根因**：**Exchange 不存消息**（见 1.1、2.5）。路由不到任何队列时，默认行为是**静默丢弃**。

**排查步骤**：

```bash
# ① 先确认队列和绑定是否存在（在控制台 15672 看，或命令行）
rabbitmqctl list_exchanges name type
rabbitmqctl list_queues name messages
rabbitmqctl list_bindings source_name destination_name routing_key

# ② 确认队列真的绑上了交换机，且 routingKey 对得上
#    ⚠️ 最常见的错误：绑定键写了 "order.pay"，却发 "order.pay.success"
```

**解决方案（三步全做）**：

```java
// ① 开 mandatory + Return 回调（至少让你知道出事了）
rabbitTemplate.setMandatory(true);
rabbitTemplate.setReturnsCallback(returned -> {
    log.error("❌ 路由失败：exchange={}, routingKey={}, replyText={}",
            returned.getExchange(), returned.getRoutingKey(), returned.getReplyText());
    // 这条日志是排 P1 最重要的线索
});

// ② 配【备用交换机 AE】兜住数据（不丢，转到兜底队列）
@Bean
public TopicExchange orderExchange() {
    return (TopicExchange) ExchangeBuilder.topicExchange("order.topic")
            .durable(true)
            .alternate("order.ae")     // ⭐ 路由失败转这里
            .build();
}
```

```yaml
# ③ yml 里也要开（两处都开才生效）
spring:
  rabbitmq:
    publisher-returns: true
    template:
      mandatory: true
```

> ✅ **生产建议**：**AE 兜数据 + Return 回调告警，两个都配**。AE 保证不丢，回调保证你知道。

#### P2 — Broker 重启后消息全丢 ⚠️⚠️

**症状**：队列和交换机都还在（`durable=true`），但**里面的消息没了**。

**根因**：**队列持久化 ≠ 消息持久化**。消息默认是**非持久化**的，只在内存里。

**打比方**：**你把货架（队列）加固了，却把货物随手放在地上**——仓库一着火（Broker 重启），货架还在，货没了。

**解决方案**：

```java
// ⭐ 发送时必须显式设置消息持久化（最容易漏的一步）
rabbitTemplate.convertAndSend(exchange, routingKey, event, message -> {
    message.getMessageProperties()
           .setDeliveryMode(MessageDeliveryMode.PERSISTENT);   // 👈 就是这一行
    return message;
});
```

**三个 durable 检查清单**：

| 对象 | 怎么设 | 检查位置 |
| --- | --- | --- |
| **交换机** | `ExchangeBuilder.xxxExchange("x").durable(true)` | 控制台 Exchange → Features 显示 `D` |
| **队列** | `QueueBuilder.durable("q")` | 控制台 Queue → Features 显示 `D` |
| **消息** | `setDeliveryMode(MessageDeliveryMode.PERSISTENT)` | 控制台消息 → `delivery_mode: 2` |

> ⚠️ **注意持久化的性能代价**：持久化消息要写磁盘，吞吐会下降。**不是所有消息都需要持久化**——日志、监控类可以不要。

#### P3 — 消费者崩了消息就丢 ⚠️⚠️

**症状**：消费服务重启/崩溃后，**正在处理的消息消失**，业务没做完也没重试。

**根因**：用了**自动 Ack**（`none` / `auto`），消息**一投递给消费者就确认删除**，业务还没跑完。

**解决方案**：

```yaml
spring:
  rabbitmq:
    listener:
      simple:
        acknowledge-mode: manual    # ⭐ 改成手动
```

配合 3.5 的手动 Ack 代码（业务成功后 `basicAck`）。

#### P4 — `requeue=true` 死循环，CPU 100% ⚠️

**症状**：消费失败 → 消息回队列 → 立刻又消费 → 又失败 → **CPU 打满，消息数不降**。

**根因**：`basicNack(tag, false, true)` 把消息**放回队头**，立刻又被同一个消费者拿到，形成无限循环。

**打比方**：退货单退回去，**马上就又派给你**——你处理不了，又退，再派给你……**快递员一直在原地打转**。

**解决方案（推荐组合）**：

```yaml
spring:
  rabbitmq:
    listener:
      simple:
        retry:
          enabled: true                   # ① 先做【本地重试】（在消费者内部，不回到队列）
          max-attempts: 3
          initial-interval: 1000
          multiplier: 2                   # 1s → 2s → 4s 指数退避
        default-requeue-rejected: false   # ② 重试用尽后【进死信】，不重回原队列
```

```java
// ③ 业务代码里区分"该重试"和"不该重试"
} catch (BusinessException e) {
    // 业务异常（如"参数非法"）→ 重试100次也没用 → 直接进死信
    channel.basicNack(deliveryTag, false, false);
} catch (Exception e) {
    // 系统异常（如"数据库超时"）→ 值得重试，但交给上面的本地重试机制
    channel.basicNack(deliveryTag, false, false);   // 也是 false，让 retry 机制处理
}
```

> ⚠️ **绝对不要用 `requeue=true` 做重试**。要重试用**本地重试 + 死信**的组合。

#### P5 — 消息处理失败后彻底消失 ⚠️

**症状**：代码里写了 `basicNack(requeue=false)`，但消息**既没进死信队列，也没留在原队列**。

**根因**：**队列没配死信交换机**。消息被 reject 后**无处可去，Broker 直接丢弃**。

**打比方**：**你让快递员"送不到就退回去"，却没给他退货地址**——他只能当场扔掉。

**解决方案**（队列声明时必须配全）：

```java
@Bean
public Queue orderQueue() {
    return QueueBuilder.durable("order.queue")
            .deadLetterExchange("order.dlx")       // ⭐ 必须配
            .deadLetterRoutingKey("order.dlq.key")
            .build();
}
```

**⚠️ 已存在的队列改不了**——RabbitMQ 队列声明后**属性不可变**。要么删了重建，要么用**策略（Policy）**在控制台加（推荐，不用删队列）：

```
控制台 → Admin → Policies → 新增：
  Name:     dlx-policy
  Pattern:  ^order\..*        （正则匹配队列名）
  Apply to: Queues
  Priority: 1
  Definition: dead-letter-exchange = order.dlx
              dead-letter-routing-key = order.dlq.key
```

> ✅ **一句话**：**`requeue=false` 必须配 DLX，否则等于删除。**

#### P6 — 重复消费（重复扣款 / 重复发短信）⚠️

**症状**：同一条消息被消费多次，导致**重复扣款、重复发短信、库存多扣**。

**根因**：**MQ 是 at-least-once（至少投递一次）**，不是 exactly-once。
>
> 什么情况下会重复？
> - 消费者处理完了，但 **Ack 没发出去**（网络抖动 / 消费者崩在 Ack 前）→ Broker 认为没处理，重投
> - 网络分区、集群切换
> - 消费者重试机制

**✅ 解决方案：消费端做幂等**（三种方案，按场景选）：

**方案一：Redis 去重（最常用）**

```java
String key = "mq:idempotent:" + msgId;
Boolean first = redisTemplate.opsForValue()
        .setIfAbsent(key, "1", 24, TimeUnit.HOURS);   // ⭐ 原子操作
if (Boolean.FALSE.equals(first)) {
    log.warn("重复消息，已忽略, msgId={}", msgId);
    channel.basicAck(tag, false);    // ⭐ 注意：重复消息也要 Ack
    return;
}
```

**方案二：数据库唯一索引（强可靠）**

```sql
-- 加唯一约束，重复插入直接报错
ALTER TABLE t_order ADD UNIQUE KEY uk_msg_id (msg_id);
```

```java
try {
    orderMapper.insert(order);    // 重复会抛 DuplicateKeyException
} catch (DuplicateKeyException e) {
    log.warn("重复消息（唯一索引拦截）, msgId={}", msgId);   // 正常情况，直接忽略
}
```

**方案三：状态机（业务天然幂等）**

```java
// 只允许"待支付 → 已支付"的流转，重复执行第二次时状态已变，直接跳过
int affected = orderMapper.updateStatus(orderId, OrderStatus.UNPAID, OrderStatus.PAID);
if (affected == 0) {
    log.warn("订单状态已变更，忽略重复消息, orderId={}", orderId);
}
```

> ✅ **选型建议**：**Redis 去重最常用**（简单、快）；**唯一索引最可靠**（Redis 挂了也能防）；**状态机最优雅**（业务天然支持时优先）。

#### P7 — 队列积压导致整个应用卡死（最严重）⚠️⚠️⚠️

**症状**：消费端故障 → 队列积压 → **生产端应用也失去响应**，Tomcat 线程全部卡住。

**根因**：**内存流控（Flow Control）**。经典队列会把消息尽量留在内存，积压到接近内存水位（默认 40%）时，**Broker 对生产者连接发送阻塞信号**——**生产者的 `publish` 调用被卡住**，Tomcat 线程被占满。

**打比方**：快递公司的**分拣中心地面空间有限**。包裹太多堆满了，**分拣员只好站门口拦住所有送货车**——连正常揽收都停了。你的商家（生产者程序）就卡在"送货"这步，**什么都干不了**。

```
消费者挂了 → 队列积压 → 内存吃紧 → 触发流控 → 生产者被 block
  → 上游线程全部阻塞 → 整个系统雪崩 💥
```

**✅ 三层防御（缺一不可）**：

```java
// ① 队列设上限 + 满了拒收（而不是默默丢旧消息）
@Bean
public Queue orderQueue() {
    return QueueBuilder.durable("order.queue")
            .maxLength(100_000)                              // 最多存 10 万条
            .overflow(QueueBuilder.Overflow.rejectPublish)   // ⭐ 满了拒收，让生产者立刻感知
            .build();
}
```

```java
// ② 生产者捕获拒绝异常，做降级（而不是傻等）
try {
    rabbitTemplate.convertAndSend(exchange, routingKey, event);
} catch (AmqpException e) {
    log.error("消息发送被拒（队列满），降级处理", e);
    // 降级：写本地表稍后重试 / 直接返回"系统繁忙" / 落盘补偿
    compensationService.saveForRetry(event);
}
```

```yaml
# ③ 监控告警（最关键！）——Ready 数和内存水位都要盯
#    阈值建议：Ready > 5 万 或 Broker 内存 > 30% 就告警（留出缓冲）
```

**监控命令**：

```bash
# 看队列积压
rabbitmqctl list_queues name messages messages_ready messages_unacknowledged

# 看内存水位和流控状态
rabbitmqctl status | grep -A 20 "memory"
rabbitmqctl list_connections name blocked    # blocked=true 说明在流控
```

> ⚠️ **这条雪崩路径是 RabbitMQ 最危险的坑**——因为**消费端的问题会传导到生产端**，很多人以为是两套系统不会互相影响。
>
> ✅ **记住**：**积压不是"消费慢"这么简单，它会反噬生产端**。`maxLength` 必须设。

#### P8 — 5 个消费者，消费速度像只有一个

**症状**：`concurrency=5` 配了，但消费速度提升不明显，**快的消费者闲着，慢的忙不过来**。

**根因**：`prefetch` 太大（Spring Boot 默认 250）。消息被**一次性均分**给各消费者，快的干完了也不能去拿慢的手上那些（见 1.3）。

**解决方案**：

```yaml
spring:
  rabbitmq:
    listener:
      simple:
        prefetch: 1        # ⭐ 慢任务设 1（谁干完谁再取）
        concurrency: 5
```

#### P9 — 短延时的消息没有按时触发

**症状**：延时 10 分钟的消息，**实际过了 30 分钟才处理**。

**根因**：**TTL 队头阻塞**——队列是 FIFO 的，RabbitMQ **只检查队头消息是否过期**。前面有条 30 分钟的消息没到期，后面的 10 分钟消息只能等（见 3.7）。

**打比方**：超市只有一个收银台，前面的人买了一大车慢慢结账，**后面只买一瓶水的人也必须等前面结完**。

**解决方案（二选一）**：

```java
// ✅ 方案一：不同延时时长【各建一个队列】（推荐，无需插件）
@Bean
public Queue delay10MinQueue() {
    return QueueBuilder.durable("delay.queue.10min").ttl(10 * 60 * 1000)   // 10 分钟
            .deadLetterExchange("delay.dlx").deadLetterRoutingKey("delay.timeout").build();
}
@Bean
public Queue delay30MinQueue() {
    return QueueBuilder.durable("delay.queue.30min").ttl(30 * 60 * 1000)   // 30 分钟
            .deadLetterExchange("delay.dlx").deadLetterRoutingKey("delay.timeout").build();
}
// 完整代码见 3.7
```

```bash
# ✅ 方案二：装延时插件（精度高，无阻塞）
rabbitmq-plugins enable rabbitmq_delayed_message_exchange
```

> ✅ **记住**：**不同延时时长必须分不同队列**。这是 TTL 方案唯一要记住的事。

#### P10 — 连接数持续增长

**症状**：Broker 的 `Connections` 数持续增长，最终打满 `connection_limit`。

**根因**：
- 每次发消息都新建 `Connection`（没用连接池）
- 手动 `createChannel()` 后没有关闭
- 用 `channel` 当长生命周期对象反复持有

**解决方案**：

```yaml
# ① 用 Spring AMQP 自动管理的连接池 + Channel 缓存
spring:
  rabbitmq:
    cache:
      channel:
        size: 50                # 每个 Connection 缓存 50 个 Channel
        checkout-timeout: 5000
```

> ⚠️ **② 别手动 `createChannel()`**。Spring AMQP 已经把 Connection 池化和 Channel 缓存管好了，你手动开反而会泄漏。
>
> 💡 **为什么 Connection 贵而 Channel 便宜？** 建立 TCP 连接要**三次握手 + TLS 握手 + 认证协商**，跨机房超 100ms。Channel 是**纯用户态轻量对象**，创建几乎零成本。所以**复用的是 Connection，多用的是 Channel**（见 5.3 坑 7）。

**监控**：

```bash
rabbitmqctl list_connections name user state
rabbitmqctl list_channels name number
```

#### P11 — 报错 `SimpleMessageConverter only supports String, byte[]...`

**症状**：发送自定义对象时报错，或消费端反序列化失败、消息体是乱码。

**根因**：生产端/消费端**消息转换器不一致**，或都没配（用了默认的 JDK 序列化）。

**解决方案**：见 3.6，**两边都配 `Jackson2JsonMessageConverter`**。

> 💡 **JDK 序列化为什么不好？** 消息体是全二进制乱码，**控制台看不懂、其他语言读不了、还不安全**（反序列化漏洞）。生产必须用 JSON。

#### P12 — 顺序错乱

**症状**：同一笔订单的"创建 → 支付 → 完成"消息，处理顺序变成"支付 → 创建 → 完成"。

**根因**：三个环节都能打乱顺序（见 2.2）——多消费者、`prefetch>1`、多队列。

**解决方案（按业务影响面选）**：

```yaml
# 方案一：全局串行（简单，吞吐低）——适合订单状态流转这类强有序场景
spring:
  rabbitmq:
    listener:
      simple:
        concurrency: 1      # 单消费者
        prefetch: 1         # 一次一条
```

```java
// 方案二：按业务 ID 分队列（推荐，兼顾有序和吞吐）
// 同一订单哈希到固定队列 → 该队列单消费者 → 队列内有序
int queueIndex = Math.abs(orderId.hashCode()) % QUEUE_COUNT;
```

> ⚠️ **方案二的注意点**：`% QUEUE_COUNT` 在生产端和消费端**必须一致**；扩容队列数时，**历史消息会错位**（需停机或双写过渡）。

#### P13 — 队列莫名消失

**症状**：跑着跑着，队列不见了，消息也丢了。

**根因**：
- `autoDelete=true`：最后一个消费者断开后**自动删除队列**
- `exclusive=true`：连接断开后自动删除
- 队列从未被声明过（消费者和生产者都没声明）

**解决方案**：

```java
// 生产队列：durable=true，autoDelete=false，exclusive=false
QueueBuilder.durable("order.queue").build();    // ⭐ 默认就是 autoDelete=false
```

> ⚠️ **临时队列才用 `autoDelete`**（如 fanout 广播的每实例独占队列）。**业务队列千万别开。**

#### P14 — 死信队列成"数据黑洞"

**症状**：失败消息进了死信队列，**没有人知道**，等发现时已经积压几千条。

**根因**：配了死信队列但**没有消费者 + 没有告警**。

**解决方案**：

```java
/** 死信消费者：必须接告警 */
@RabbitListener(queues = "order.dlq")
public void onDeadLetter(Message message, Channel channel,
                         @Header(AmqpHeaders.DELIVERY_TAG) long tag) throws IOException {
    String body = new String(message.getBody(), StandardCharsets.UTF_8);
    String routingKey = message.getMessageProperties().getReceivedRoutingKey();

    log.error("☠️ 死信到达：routingKey={}, body={}", routingKey, body);

    // ⭐ 必须告警（钉钉/企微/短信）
    alertService.send("RabbitMQ 死信告警",
            String.format("routingKey=%s\nbody=%s", routingKey, body));

    // 落库便于人工排查
    deadLetterMapper.insert(new DeadLetter(routingKey, body));

    channel.basicAck(tag, false);
}
```

> ✅ **铁律：死信队列必须有消费者，消费者必须接告警。** 否则它就是"数据黑洞"。

#### P15 — 集群分区后数据凭空少

**症状**：网络分区恢复后，**部分消息消失**。

**根因**：用了**镜像队列**（已废弃），分区时两边各自选主，恢复后丢一边的数据。

**解决方案**：改用**仲裁队列**（Raft 多数派）。

```java
@Bean
public Queue orderQueue() {
    return QueueBuilder.durable("order.queue")
            .quorum()        // ⭐ 仲裁队列
            .build();
}
```

> ⚠️ **集群节点数用奇数**（3/5）——原因见 2.4。
>
> ⚠️ **仲裁队列的限制**：不支持优先级、不支持非持久化消息。**要优先级就不能用 quorum。**

### 4.3 坑位速查表（按踩坑频率排序）

> 📌 **每条坑的"底层为什么"在第二/三章都能找到**。**坑是现象，机制是根因**。
>
> 💡 **上线前必查 1/2/3/4/5 条**——它们都会**静默丢消息**（程序不报错、日志没异常）。

| # | 坑 | 现象 | 正确做法 | 详解 |
| --- | --- | --- | --- | --- |
| **1** | 消息持久化漏设 ⚠️⚠️ | Broker 重启消息全丢 | `setDeliveryMode(PERSISTENT)` | P2 |
| **2** | 自动 Ack 丢消息 ⚠️⚠️ | 消费者崩了消息没了 | `acknowledge-mode: manual` | P3 |
| **3** | `requeue=true` 死循环 ⚠️ | CPU 100%，消息反复重投 | 本地重试 + `default-requeue-rejected: false` | P4 |
| **4** | 路由不到队列静默丢弃 ⚠️ | 日志无异常但没人收到 | `mandatory` + Return + **AE** | P1 |
| **5** | `requeue=false` 未配 DLX ⚠️ | 失败消息彻底消失 | 队列必须配 `deadLetterExchange` | P5 |
| **6** | 未做幂等 | 重复扣款/发短信 | Redis 去重 / 唯一索引 / 状态机 | P6 |
| **7** | 队列未设 `maxLength` ⚠️ | 积压 → 流控 → **全站雪崩** | `maxLength` + `reject-publish` | P7 |
| **8** | `prefetch` 用默认值 | 消费负载不均 | 慢 `1`，快 `10~50` | P8 |
| **9** | Channel 非线程安全 | `Already closed` | 别手动开 Channel | P10 |
| **10** | 消息转换器不一致 | 反序列化失败/乱码 | 两边都配 Jackson | P11 |
| **11** | 延时队列队头阻塞 ⚠️ | 短延时消息延迟触发 | 按延时时长**分队列** | P9 |
| **12** | 死信队列无告警 | 失败消息成黑洞 | 死信消费者必须告警 | P14 |
| **13** | 发大消息 | Broker 内存压力大 | **< 128KB**，大文件走 OSS | — |
| **14** | `autoDelete` 误开 | 队列莫名消失 | 业务队列用 `durable` + `autoDelete=false` | P13 |
| **15** | `vhost` 权限过大 | 测试消息串到生产 | 按环境/业务分 vhost | — |
| **16** | 用镜像队列 | 分区后丢数据 | 改用**仲裁队列** | P15 |

### 4.4 排错工具箱（命令速查）

```bash
# ==================== 队列与消息 ====================
rabbitmqctl list_queues name messages messages_ready messages_unacknowledged
# messages=总消息数, messages_ready=待消费, messages_unacknowledged=已投递未确认 ⭐
# ⚠️ unacknowledged 持续高 = 消费者卡住

rabbitmqctl list_queues name consumers        # 每个队列有几个消费者（0 说明没人消费）

# ==================== 连接与信道（查泄漏）====================
rabbitmqctl list_connections name user state
rabbitmqctl list_channels name number
rabbitmqctl list_connections name blocked     # ⭐ blocked=true 说明正在流控！

# ==================== 交换机与绑定（查 P1 路由问题）====================
rabbitmqctl list_exchanges name type
rabbitmqctl list_bindings source_name destination_name routing_key

# ==================== 消费者（查"谁在消费")====================
rabbitmqctl list_consumers queue_name channel_pid ack_required prefetch_count

# ==================== 集群与内存 ====================
rabbitmqctl status                            # 内存水位、磁盘告警、流控状态
rabbitmqctl cluster_status

# ==================== 应急操作 ====================
rabbitmqctl purge_queue order.queue           # ⚠️ 清空队列（消息全丢，慎用！）
rabbitmqctl delete_queue order.queue          # 删队列
```

**控制台（15672）关键位置**：

| 位置 | 看什么 |
| --- | --- |
| **Queues** 页 | `Ready`（积压）/ `Unacked`（消费者卡住）/ `Consumers`（消费者数） |
| **Queue 详情** → Bindings | 绑定关系（排 P1 必看） |
| **Connections** 页 | 连接数、`blocked` 状态（流控） |
| **Admin → Policies** | 给已存在的队列加 DLX（不用删队列，见 P5） |

### 4.5 生产上线检查清单 ⭐

**上线前逐条打勾**：

**可靠性**
- [ ] 交换机 `durable=true`
- [ ] 队列 `durable=true`
- [ ] 消息 `setDeliveryMode(PERSISTENT)`
- [ ] `publisher-confirm-type: correlated`（发 Confirm）
- [ ] `publisher-returns: true` + `template.mandatory: true`（路由失败可感知）
- [ ] 配了**备用交换机 AE** 兜底
- [ ] `acknowledge-mode: manual` + 业务成功才 `basicAck`
- [ ] 队列配了 `deadLetterExchange`（+ `deadLetterRoutingKey`）
- [ ] 死信队列**有消费者 + 有告警**

**正确性**
- [ ] 消费端做了**幂等**（Redis 去重 / 唯一索引 / 状态机）
- [ ] 重复消息也 `basicAck`（避免死循环）
- [ ] 需要有序的场景：单队列单消费者，或按业务 ID 分队列
- [ ] 生产/消费端**都用 `Jackson2JsonMessageConverter`**

**稳定性**
- [ ] 队列设了 `maxLength`
- [ ] 队列设了 `overflow=reject-publish`
- [ ] `prefetch` 显式设置（不是默认 250）
- [ ] `default-requeue-rejected: false`
- [ ] 生产者捕获 `AmqpException` 并降级
- [ ] 消息体积 < 128KB

**运维**
- [ ] 按环境/业务分了 `vhost`
- [ ] 接入了监控（`Ready` 数、`Unacked` 数、Broker 内存、连接数）
- [ ] 配了告警阈值
- [ ] 延时消息按延时时长分了队列
- [ ] 重要业务用了**仲裁队列**（非镜像队列）
- [ ] 集群节点数是**奇数**

---

## 五、常见认知误区

| 误区 | 真相 |
| --- | --- |
| ❌「队列设了 `durable=true` 消息就不会丢」 | **队列持久化 ≠ 消息持久化**。还要设交换机持久化 + 消息 `deliveryMode=PERSISTENT`，三个一起才有效（P2） |
| ❌「消费失败就 `requeue=true` 重试」 | 会**立刻重回队头**形成死循环打爆 CPU。要用**本地重试 + 死信**（P4）。**注意：`requeue=false` 不配 DLX 等于直接删除**（P5） |
| ❌「MQ 保证消息不重复」 | MQ 是 **at-least-once**，**必然可能重复**。不重复要靠**消费端幂等**（P6） |
| ❌「积压只是消费慢，不影响生产端」 | **积压会通过流控反噬生产端**，导致整个应用卡死（P7）。这是最危险的认知误区 |
| ❌「延时队列是一种特殊队列」 | **延时队列 = 普通队列 + TTL + 死信交换机**。没有"延时队列"这种类型（3.7） |
| ❌「prefetch 越大吞吐越高」 | 太大会导致**消费者饥饿**（快的闲着，慢的积压）（P8） |
| ❌「RabbitMQ 能做所有 MQ 的事」 | 吞吐、重放、分区有序这三件事它**天生做不到**。选型前先看场景 |

---

## 六、动手路线（五阶段）

| 阶段 | 目标 | 具体动作 | 验收标准 |
| --- | --- | --- | --- |
| **一：跑起来**（半天） | 能收发消息 | ① Docker 起 RabbitMQ（`rabbitmq:3-management`）<br>② 访问 15672 控制台<br>③ 写一个 `@RabbitListener` 收消息 | 控制台能看到队列和消息 |
| **二：玩透四种交换机**（1 天） | 理解路由 | ① 各写一个 direct / topic / fanout 例子<br>② **故意发一个匹配不到队列的路由键**，观察消息去哪了 | 能说清四种交换机区别 |
| **三：可靠性**（1 天） | 消息不丢 | ① 开 Confirm + Return，故意制造失败看回调<br>② 改手动 Ack，中途抛异常，看消息是否重回队列<br>③ 配死信队列，看失败消息是否进 DLQ | 能画出"五道防线" |
| **四：延时队列**（1 天） | 最实用场景 | ① 用 TTL + DLX 实现"订单 30 分钟关闭"<br>② **故意建两个不同延时的消息放同一队列，验证队头阻塞**<br>③ 按延时时长分队列，验证修复 | 能说清队头阻塞及解法 |
| **五：生产化**（2 天） | 敢上线 | ① 配 `prefetch`、`maxLength`、`overflow`<br>② 加幂等（Redis 去重）<br>③ 接监控（Prometheus + RabbitMQ Exporter）<br>④ 写死信告警<br>⑤ **压测：消费者挂掉后队列积压是否触发流控** | 能说清雪崩路径和防御 |

**推荐练手项目**：做一个「**订单超时自动关闭 + 支付成功通知**」
- 订单创建 → 发延时消息（30 分钟后检查）
- 用户支付 → 发支付成功事件 → 短信 / 积分服务各自订阅（fanout 或 topic）
- 30 分钟未支付 → 延时消息触发 → 关单 + 回滚库存
- 消费失败 → 重试 3 次 → 进死信 → **告警**

**一个项目下来，RabbitMQ 的核心场景全摸过了。**

---

## 七、一句话总结

> **RabbitMQ 是"业务消息的路由王"**——Exchange 提供灵活路由，手动 Ack + 持久化保证可靠，微秒级延迟适合业务系统；但它吞吐有上限、不支持重放、延时消息要插件，所以数据流场景交给 Kafka。

### 四个核心认知

1. **生产者发给 Exchange，不是队列**——Exchange 不存消息，路由不到就丢（P1 的根因）
2. **可靠性是"五道防线"**——Confirm、Return、三重持久化、集群、手动 Ack，缺一不可
3. **Ack 是消息唯一的"删除触发器"**——理解这点，就能理解所有丢消息事故
4. **积压会反噬生产端**——消费端问题会导致整个应用雪崩（最危险的认知盲区）

### 原理 ↔ 实战对应关系（全文地图）⭐

| 原理层 | 机制 | 实战体现 | 对应问题 |
| --- | --- | --- | --- |
| 分拣层 | Exchange 无状态转发 | `mandatory` + Return + **AE** | P1 |
| 存储层 | Ack 驱动生命周期 | `manual` + `basicAck` / `basicNack` | P3、P4、P5 |
| 存储层 | 消息默认在内存 | 三重持久化（交换机 + 队列 + `deliveryMode=2`） | P2 |
| 存储层 | 内存水位触发流控 | `maxLength` + `reject-publish` + 监控 | P7 |
| 投递层 | 推送模型 + 信用额度 | `prefetch`（慢 1，快 10~50） | P8 |
| 投递层 | 队列 FIFO + 只查队头 | 延时队列**按延时时长分队列** | P9 |
| 存储层 | at-least-once 语义 | 消费端**幂等**（Redis / 唯一索引 / 状态机） | P6 |
| 集群 | 镜像队列分区丢数据 | 改用 **quorum queue**（奇数节点） | P15 |

> 💡 **怎么用这张表**：面试被问"怎么保证消息不丢"，不要背"开 Confirm"——**先说消息会在哪几个环节物理性消失（对应机制），再说每个环节的防线**。这就是"原理贴合实战"的答法。

### 🧑🎓 新手学习路线（按这个顺序读，不会晕）

| 轮次 | 目标 | 读哪些 | 多久 |
| --- | --- | --- | --- |
| **第 1 轮：认脸** | 知道 RabbitMQ 是干嘛的 | **第零章**（跳过代码） | 30 分钟 |
| **第 2 轮：上手** | 能跑通收发消息 | **3.1~3.5**（抄代码跑起来） | 半天 |
| **第 3 轮：理解** | 明白为什么会丢消息 | **第一章原理** + **第二章进阶** | 1~2 天 |
| **第 4 轮：排错** | 遇到问题能自己解决 | **第四章（问题与解决方案）** | 边用边查 |
| **第 5 轮：精进** | 敢上生产 | 2.4 集群 + 4.5 上线检查清单 | 2~3 天 |

> ✅ **一句话建议**：**别一开始就啃第四章的坑**——那是"遇到问题时的字典"，不是入门读物。**先跑通，再理解，遇到问题再查表。**

---

## 关联笔记

- [[12_消息队列 Kafka 与 RabbitMQ]] — **对比选型**：Kafka vs RabbitMQ 核心差异、三大难题
- [[03_JUC 详细讲解]] — 线程池与 `CompletableFuture`：MQ 消费端 `concurrency` 的底层就是线程池
- [[15_高并发高可用设计]] — 削峰、幂等、状态机的通用设计（本文多个场景的底层支撑）
- [[异步任务]] — 芋道 `@Async` + `TransmittableThreadLocal`（本地异步 vs MQ 异步）
- [[10_Redis 实战]] — 消息幂等去重（`SETNX`）、秒杀库存扣减
- [[11_本地缓存 Ehcache 与 Caffeine]] — fanout 广播"缓存失效"的配合使用
- [[27_XXL-JOB分布式任务调度实战]] — 定时任务 vs 延时队列的选型对比
- [[26_生产故障排查方法论与复盘]] — 流控雪崩、消息积压的完整排查流程
- [[13_Zookeeper 实战]] — Kafka 的元数据协调（对比 RabbitMQ 无中心化依赖）
- [[05_SpringBoot 核心]] — Spring AOP / 自动配置，理解 Spring AMQP 的工作原理
- [[MOC_技术库]] — 技术库总索引
