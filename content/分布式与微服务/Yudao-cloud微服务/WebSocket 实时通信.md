---
tags:
  - Java
  - Yudao
  - WebSocket
  - 实时通信
  - 消息推送
date: 2026-09-06
source: 芋道 ruoyi-vue-pro 开发指南 - 后端手册 - WebSocket 实时通信
title: "WebSocket 实时通信"
---

# WebSocket 实时通信

> **一句话概括**：HTTP 是"你问我才答"，WebSocket 是"打通了电话，双方随时能说话"。芋道把 Spring WebSocket 包了一层，帮你解决了**认证、Session 管理、集群广播**三件麻烦事，你只需要写个 `WebSocketMessageListener` 收消息、调 `WebSocketMessageSender` 发消息。

**适合谁读**：要做站内信、消息通知、IM 聊天、实时数据大屏的人。
**怎么读**：「零」理解上行/下行，「一」搞懂三个核心概念，「三」的**方案选择**是本篇精华。

---

## 零、先建立整体印象：打电话 vs 发短信

| | HTTP | WebSocket |
|---|---|---|
| **类比** | 发短信：你发一条，我回一条，发完就断 | 打电话：拨通后一直连着，双方随时说 |
| **谁先开口** | 只能客户端先请求 | **服务端可以主动推** |
| **连接** | 每次请求都要重新建立 | 一次握手，长连接 |
| **开销** | 每次带完整 Header | 握手后只传数据，开销极小 |
| **场景** | 查询、提交表单 | 聊天、通知推送、实时监控、协同编辑 |

### 上行与下行（本篇最重要的两个词）

```
         ┌─────────────────────────────┐
         │        WebSocket 连接         │
         │                             │
前端 ────┼───────  上行（前端→后端）────▶│  后端
         │                             │
前端 ◀───┼───────  下行（后端→前端）────│  后端
         └─────────────────────────────┘
```

| 方向 | 含义 | 用什么协议 |
|---|---|---|
| **上行** | 前端发送消息给后端 | WebSocket **或** HTTP 都行 |
| **下行** | 后端主动推送给前端 | **只能** WebSocket |

💡 **记住这句话**：**下行必须用 WebSocket，上行可以偷懒用 HTTP。** 这是方案二（芋道推荐）的理论基础。

---

## 一、原理篇

### 1.0 为什么不用 Netty？

> 官方原话：*"Netty 的学习和使用门槛较高，对大家可能不够友好，而 Spring WebSocket 足够满足 99.99% 的场景。"*

💡 **说人话**：Netty 能支撑百万连接，但你大概率没那么多用户。Spring WebSocket 够用、好上手、和 Spring 生态无缝集成。**别为了 0.01% 的可能性，增加 100% 的学习成本。**

### 1.1 Token 身份认证：连接时怎么知道你是谁？

**问题**：WebSocket 是长连接，没有每次请求都带 Header 的机会。怎么认证？

**解法**：**WebSocket 是基于 HTTP 建立连接的**（先发一个特殊的 HTTP 请求做"握手"，然后升级成 WebSocket 协议）。所以**握手那一下可以复用 HTTP 的认证机制**。

```
ws://127.0.0.1:48080/infra/ws?token=xxx
                                  ↑ token 放在 QueryString 里
```

**为什么 token 不用 Header 传？**

> 官方：*"WebSocket 不支持 Header 传递，所以只能使用 QueryString 传递。"*

⚠️ **注意**：浏览器原生的 `WebSocket` API 不支持自定义 Header（这是浏览器的限制，不是芋道的）。所以只能用 URL 参数。

**认证流程**：

```
① 前端：ws://.../infra/ws?token=eyJhbGci...
                            ↓
② 握手请求经过 TokenAuthenticationFilter（复用 HTTP 的 token 过滤器）
                            ↓
③ 认证通过 → LoginUserHandshakeInterceptor 把用户信息塞进 Session 的 attributes
                            ↓
④ 后续通过 WebSocketFrameworkUtils 随时取用
```

```java
// WebSocketFrameworkUtils.java —— 从 Session 里拿用户信息
public static LoginUser getLoginUser(WebSocketSession session);      // ① 当前用户
public static Integer getLoginUserType(WebSocketSession session);    // ② 用户类型（admin / member）
public static Long getLoginUserId(WebSocketSession session);         // ③ 用户编号
public static Long getTenantId(WebSocketSession session);            // ④ 租户编号
```

### 1.2 Session 会话管理：怎么找到某个人？

**每个前端连上来，后端就是一个 `WebSocketSession` 对象**。要给别人发消息，就得先找到他的 Session。

管理接口 `WebSocketSessionManager`：

```java
// 添加和移除 Session
void addSession(WebSocketSession session);
void removeSession(WebSocketSession session);

// 获得 Session，多种维度
WebSocketSession getSession(String id);                                  // 按 Session 编号
Collection<WebSocketSession> getSessionList(Integer userType);           // 按用户类型（所有管理员）
Collection<WebSocketSession> getSessionList(Integer userType, Long userId); // 按用户编号（某个人的所有连接）
```

💡 **为什么最后一个返回 Collection？** 因为**一个人可能开了多个浏览器标签页** —— 每个标签页都是一个独立连接。发消息时要给他的**所有**连接都发一遍。

**Session 什么时候加、什么时候删？**

由 `WebSocketSessionHandlerDecorator` 处理器负责：建立连接时 `addSession`，断开时 `removeSession`。

### 1.3 Message 消息格式：怎么区分不同类型的消息？

WebSocket 默认传的是文本字符串。但业务上消息有不同类型（聊天消息、系统通知、心跳、在线状态…）。

芋道定义了 `JsonWebSocketMessage`：

```json
{
  "type": "demo-message",       ← 消息类型：决定交给哪个 Listener 处理
  "content": "{\"text\":\"你好\"}"  ← 消息内容：JSON 字符串，会被解析成具体的 Message 对象
}
```

**和 Spring MVC 类比**（官方给的对照表，很精妙）：

| | 标识 | 处理者 | 参数 |
|---|---|---|---|
| **Spring MVC** | URL + Method | Controller 的 Method 方法 | `@RequestBody` 对象 |
| **WebSocket** | `type` 消息类型 | `WebSocketMessageListener` 实现类 | `content` 解析出的 Message 对象 |

💡 **一句话理解**：`type` 就相当于 URL，决定了这条消息交给谁处理。

### 1.4 Message 消息接收：消息进来怎么流转？

```
前端发来 {"type":"demo-message","content":"{...}"}
   │
   ▼ JsonWebSocketMessageHandler 消息处理器
   │ ① 把 JSON 文本解析成 JsonWebSocketMessage 对象
   ▼
   │ ② 根据 type = "demo-message"，找到对应的 Listener
   ▼
DemoWebSocketMessageListener
   │ ③ 把 content 进一步解析成 DemoSendMessage 对象
   ▼
你的业务代码
```

参考实现：`DemoWebSocketMessageListener` + `DemoSendMessage`。

### 1.5 Message 消息推送：怎么发出去？

`WebSocketMessageSender` 接口，三种发送维度：

```java
// ① 发给【指定用户】（他的所有连接都会收到）
void send(Integer userType, Long userId, String messageType, String messageContent);
default void sendObject(Integer userType, Long userId, String messageType, Object messageContent) {
    send(userType, userId, messageType, JsonUtils.toJsonString(messageContent));
}

// ② 发给【指定用户类型】（比如所有管理员）
void send(Integer userType, String messageType, String messageContent);

// ③ 发给【指定 Session】（某一个具体连接）
void send(String sessionId, String messageType, String messageContent);
```

**使用示例**：

```java
// 给某个管理员推送一条通知
webSocketMessageSender.sendObject(
    UserTypeEnum.ADMIN.getValue(),     // 用户类型：管理员
    1024L,                             // 用户编号
    "notice-push",                     // 消息类型
    new NoticePushMessage("系统维护通知", "今晚 22:00 停机维护")  // 内容（自动转 JSON）
);
```

### 1.6 【重点】WebSocket 集群：多台服务器怎么办？

**问题场景**：

```
用户 A 连在服务器 1
用户 B 连在服务器 2
A 想给 B 发消息 → 服务器 1 的内存里根本没有 B 的 Session！❌
```

这就是 **WebSocket 集群的跨进程推送问题**。

**解法（官方原话）**：

> *"消息不直接发送给用户 WebSocketSession，而是先发给 Redis、RocketMQ 等消息队列，再由每个 Java 进程监听该消息，分别判断该用户 WebSocket 是否连接的是自己，如果是，则进行消息推送。"*

画个图：

```
服务器 1（持有 A 的 Session）        服务器 2（持有 B 的 Session）
       ▲                                    ▲
       │ 监听                                │ 监听
       │                                    │
       └──────────┬─────────────────────────┘
                  │
         ┌────────▼────────┐
         │  Redis / MQ 广播  │  ← 发送方把消息扔这里
         └─────────────────┘

服务器 1 收到广播：B 是我的人吗？不是 → 忽略
服务器 2 收到广播：B 是我的人吗？是的 → 推送 ✅
```

**四种实现**：

| 实现类 | 支持集群 | 前置要求 |
|---|---|---|
| `LocalWebSocketMessageSender` | ❌ | 无（默认） |
| `RedisWebSocketMessageSender` | ✅ | Redis |
| `RocketMQWebSocketMessageSender` | ✅ | RocketMQ |
| `KafkaWebSocketMessageSender` | ✅ | Kafka |

**切换方式**（改 `application.yaml`）：

```yaml
yudao:
  websocket:
    enable: true                 # WebSocket 开关
    path: /infra/ws              # 连接路径
    sender-type: redis           # ← 发送类型：local / redis / rocketmq / kafka / rabbitmq
    sender-rocketmq:
      topic: ${spring.application.name}-websocket
      consumer-group: ${spring.application.name}-websocket-consumer
    sender-rabbitmq:
      exchange: ${spring.application.name}-websocket-exchange
      queue: ${spring.application.name}-websocket-queue
    sender-kafka:
      topic: ${spring.application.name}-websocket
      consumer-group: ${spring.application.name}-websocket-consumer
```

⚠️ **重要**：**默认 `local` 不支持集群**。只要你部署了 2 台以上实例，**必须改成 `redis`（或其它 MQ）**，否则会出现"消息发出去了，但只有部分人收到"的诡异 bug。

默认连接地址：`ws://127.0.0.1:48080/infra/ws`

---

## 二、应用篇：两种使用方案

| 方案 | 上行（前端→后端） | 下行（后端→前端） |
|---|---|---|
| **方案一：纯 WebSocket** | WebSocket | WebSocket |
| **方案二：WebSocket + HTTP**（推荐 ✅） | **HTTP** | WebSocket |

### 2.1 方案一：纯 WebSocket

**流程**：

```
前端建立 WebSocket 连接
   → 前端发 WebSocket 消息（上行）
   → DemoWebSocketMessageListener 收到，处理
   → 用 WebSocketMessageSender 推送给目标用户（下行）
```

**后端代码 ① 引入依赖**（`yudao-module-infra-biz/pom.xml`）：

```xml
<dependency>
    <groupId>cn.iocoder.boot</groupId>
    <artifactId>yudao-spring-boot-starter-websocket</artifactId>
</dependency>
```

**后端代码 ② 写监听器**：

```java
@Component
public class DemoWebSocketMessageListener implements WebSocketMessageListener<DemoSendMessage> {

    @Resource
    private WebSocketMessageSender webSocketMessageSender;

    @Override
    public void onMessage(WebSocketSession session, DemoSendMessage message) {
        // ① 拿到发送者信息
        Long fromUserId = WebSocketFrameworkUtils.getLoginUserId(session);

        // ② 处理业务（这里可以做持久化等）

        // ③ 推送给接收者
        webSocketMessageSender.sendObject(
            UserTypeEnum.ADMIN.getValue(),
            message.getToUserId(),
            "demo-message-receive",
            message
        );
    }

    @Override
    public String getType() {
        return "demo-message";      // ← 对应 JsonWebSocketMessage 的 type
    }
}
```

**前端代码**：见 `/views/infra/websocket/index.vue`（[基础设施 → WebSocket 测试] 菜单）

- 建立连接：`new WebSocket(url + '?token=' + getAccessToken())`
- 发送消息：`ws.send(JSON.stringify({type: 'demo-message', content: {...}}))`
- 接收消息：`ws.onmessage = (event) => { ... }`

⚠️ **方案一的限制**（官方说明）：*基于 WebSocket 实现的单聊和群聊，暂时不支持消息的持久化（刷新后，消息会消失）。*

### 2.2 方案二：WebSocket + HTTP（芋道推荐 ✅）

**流程**：

```
前端建立 WebSocket 连接（只用来收消息）
   → 前端发 HTTP 请求（上行，比如 POST /admin-api/system/notice/push）
   → NoticeController.push() 处理业务
   → 调 WebSocketSenderApi 推送给在线用户（下行）
```

**后端代码 ② 引入依赖**（`yudao-module-system-biz/pom.xml`）：

```xml
<dependency>
    <groupId>cn.iocoder.boot</groupId>
    <artifactId>yudao-module-infra-api</artifactId>
    <version>${revision}</version>
</dependency>
```

**后端代码 ③ 在 Controller 里推送**：

```java
// NoticeController.java
@PostMapping("/push")
@Operation(summary = "推送公告")
@PreAuthorize("@ss.hasPermission('system:notice:update')")
public CommonResult<Boolean> push(@RequestParam("id") Long id) {
    NoticeDO notice = noticeService.getNotice(id);
    // 推送给所有在线的管理员
    webSocketSenderApi.sendObject(
        UserTypeEnum.ADMIN.getValue(),
        "notice-push",
        new NoticePushMessage(notice.getTitle(), notice.getContent())
    );
    return success(true);
}
```

#### ❓ WebSocketSenderApi 是什么？

> 官方：*"它是由 yudao-module-infra-biz 对 WebSocketMessageSender 的封装，因为只有它（yudao-module-infra-biz）可以访问到 WebSocketMessageSender 的实现类，所以需要通过 API 的方式，暴露给其它模块使用。"*

💡 **说人话**：`WebSocketMessageSender` 的实现类在 infra 模块里，system 模块依赖不到。所以 infra 通过 `-api` 包暴露一个 `WebSocketSenderApi` 接口给别的模块用 —— **这就是芋道模块化设计的标准套路**（和 [[文件存储（上传下载）]] 里的 `FileApi` 一模一样）。

---

## 三、进阶篇：方案选择与踩坑

### 3.1 官方为什么推荐方案二？

芋道作者给了 3 条理由，我翻译成人话：

**① 便于未来替换成 MQTT**

> *"yudao-module-infra-biz 扮演一个 WebSocket 服务的角色……未来如果使用 MQTT 中间件（EMQX、阿里云 MQTT、腾讯云 MQTT）替换现有 WebSocket 也比较方便。"*

💡 因为下行消息全部收敛在 infra 一个模块里，要换实现只改这一处。如果每个模块自己推，改起来要命。

**② HTTP 上行更习惯**

> *"HTTP 上行消息，相比 WebSocket 上行消息来说，更加方便，也比较符合我们的编码习惯。"*

💡 想想看：HTTP 上行有 Swagger 文档、有参数校验、有统一异常处理、有权限注解、能用 Postman 调试。WebSocket 上行这些全没有 —— 你得自己定义消息格式、自己解析、自己处理错误。**能偷懒为什么不偷？**

**③ 微服务架构下的现实问题** ⭐（这条最关键）

> *"在微服务架构下，多个服务是拆分开的，无法提供相同的 WebSocket 连接。例如说，yudao-module-infra-biz 和 yudao-module-system-biz 两个服务都需要有 WebSocket 推送能力时，需要前端分别连接它们两个服务。"*

💡 **画个图你就懂了**：

```
❌ 如果每个微服务都提供 WebSocket：
前端 ──ws──> infra 服务
前端 ──ws──> system 服务
前端 ──ws──> crm 服务
前端 ──ws──> pay 服务
        ↑ 开 4 个长连接，前端要疯，网关要疯

✅ 芋道的做法：只让 infra 提供 WebSocket
前端 ──ws──> infra 服务（唯一的下行通道）
前端 ──http─> system / crm / pay（正常业务请求）
                  │
                  └─→ 需要推送？调 infra 的 WebSocketSenderApi
```

**所以芋道的结论**：
> *"考虑到 ruoyi-vue-pro 和 yudao-cloud 架构的统一性，还是只让 yudao-module-infra-biz 提供 WebSocket 服务。"*

⚠️ **如果你只用单体架构（ruoyi-vue-pro），方案一也没问题。** 但既然芋道推荐方案二，跟着走准没错 —— 万一哪天要拆微服务呢。

### 3.2 踩坑清单

| # | 坑 | 症状 | 解法 |
|---|---|---|---|
| 1 | **集群部署没改 `sender-type`** | 部分用户收不到消息 | 改成 `redis` 或其它 MQ |
| 2 | 连接 URL 没带 token | 握手失败 401 | `ws://.../infra/ws?token=xxx` |
| 3 | 用了 HTTPS 但 WebSocket 用 `ws://` | 浏览器报混合内容错误 | 生产环境用 `wss://` |
| 4 | Nginx 没配 WebSocket 升级 | 连接一直 400/426 | 加 `proxy_set_header Upgrade $http_upgrade;` |
| 5 | 消息没持久化 | 刷新页面消息没了 | 自己写表存（参考站内信 `system_notify_message`） |
| 6 | 前端没做重连 | 网络波动后永远收不到 | 实现心跳 + 断线重连 |
| 7 | 忘了 `@Component` | Listener 不生效 | 加注解让 Spring 扫描到 |
| 8 | `getType()` 和前端 `type` 对不上 | 消息石沉大海 | 前后端核对字符串 |

#### Nginx 配置（坑 4 展开）

```nginx
location /infra/ws {
    proxy_pass http://backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;      # ← 关键：协议升级
    proxy_set_header Connection "upgrade";       # ← 关键
    proxy_set_header Host $host;
    proxy_read_timeout 3600s;                    # ← 长连接要调大超时，否则 60s 就断
}
```

### 3.3 心跳保活

WebSocket 长时间没数据，中间的 Nginx / 防火墙会**主动断掉连接**。

**解法**：前端定时发心跳（比如每 30 秒发一个 `{"type":"heartbeat"}`），后端不处理或回一个 pong。

💡 也可以直接用浏览器原生的 ping/pong 帧，但业务层心跳更可控。

### 3.4 面试话术

> **Q：WebSocket 怎么做集群？**
>
> 核心难点是 Session 存在各进程内存里，A 进程推不到 B 进程的连接上。
> 解法是引入一个**广播中间件**：发送方不直接推 Session，而是把消息发到 Redis 发布订阅或 MQ 的 Topic，每个进程都订阅这个 Topic，收到后判断"这个用户是不是连在我这儿"，是就推，不是就丢弃。
> 芋道就是这么做的，默认是 `LocalWebSocketMessageSender` 单机模式，改成 `redis` 就支持集群了。

---

## 四、一句话总结

**WebSocket 用于后端主动推消息（下行）。芋道建议：上行走 HTTP（好调试、有文档、有校验），下行走 WebSocket，并且只让 infra 模块提供 WebSocket 服务，其它模块通过 `WebSocketSenderApi` 调用 —— 这样单体和微服务架构能统一。集群部署务必把 `yudao.websocket.sender-type` 从 `local` 改成 `redis`。**

---

## 关联笔记

- [[功能权限]] — WebSocket 握手复用 HTTP 的 Token 认证
- [[用户体系]] — `userType`（admin / member）的区分
- [[SaaS 多租户 字段隔离]] — `WebSocketFrameworkUtils.getTenantId()`
- [[Redis 缓存]] — Redis Pub/Sub 做集群广播
- [[异步任务]] — 同理的上下文传递问题

## 附录：官方截图索引

图片位于 `99_附件_资源文件/Yudao-Cloud/`：

| 截图 | 内容 |
|---|---|
| `WebSocket_实时通信-2.png` | `JsonWebSocketMessage` 与 Spring MVC 的对照表 |
| `WebSocket_实时通信-3.png` | `DemoWebSocketMessageListener` 实现 |
| `WebSocket_实时通信-4/5/6.png` | 前端建立连接、发送消息、接收消息 |
| `WebSocket_实时通信-7.png` | `NoticeController.push()` 使用 `WebSocketSenderApi` |
