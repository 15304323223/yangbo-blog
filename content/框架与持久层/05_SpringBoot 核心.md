---
title: "SpringBoot 核心（原理 → 应用 → 进阶）"
---
# SpringBoot 核心（原理 → 应用 → 进阶）

> **一句话概括**：SpringBoot 就是**一辆"一键启动"的汽车**——你不用自己接电线、调化油器、接点火开关，只要按下按钮（`main` 方法），发动机（Spring 容器）自动启动，所有零部件（Bean）自动装配到位。
>
> **适合谁**：会用 SpringBoot 写 CRUD，但说不清 `@SpringBootApplication` 里藏了什么、自动配置怎么来的、为什么加个依赖就有功能的人。
> **怎么读**：原理篇理解"自动装配"是核心；应用篇三个机制（配置绑定、构造器注入、Profile）直接可抄；进阶篇的启动流程和循环依赖是面试硬菜。

---

## 零、先建立整体印象：把它想象成"一键启动的汽车"

| 汽车部件 | 对应 SpringBoot | 一句话 |
|---|---|---|
| **一键启动按钮** | `SpringApplication.run()` | 按下去，整套系统自己动起来 |
| **发动机** | Spring IoC 容器 | 管理所有零件（Bean）的生命周期 |
| **自动装配机器人** | `@EnableAutoConfiguration` | 检测车上缺什么零件，自动从仓库调过来装上 |
| **条件传感器** | `@ConditionalOnClass` | "有 JDBC 驱动才装 DataSource"、"用户没自定义才用默认" |
| **配置面板** | `application.yml` | 调参数不用改代码，改配置文件就行 |
| **多把钥匙** | Profile | 开发环境用这把钥匙，生产环境用那把 |

---

## 一、原理篇：自动配置是怎么来的

### 1.1 @SpringBootApplication 拆解

```java
@SpringBootApplication   // ← 这一个注解 = 下面三个
public class MyApp {
    public static void main(String[] args) {
        SpringApplication.run(MyApp.class, args);
    }
}
```

拆开看：
```java
@SpringBootApplication =
    @Configuration              // ① 这是一个配置类，可以定义 Bean
  + @ComponentScan             // ② 扫描当前包及子包下的 @Component/@Service/@Controller
  + @EnableAutoConfiguration   // ③ 【核心】自动装配的开关
```

**`@EnableAutoConfiguration` 做了什么？**

```
1. 去所有 jar 包的 META-INF 里找一个"清单文件"
   - Spring Boot 2.7 前：spring.factories
   - Spring Boot 2.7+：META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports

2. 清单里列着一堆自动配置类的全限定名（如 DataSourceAutoConfiguration、RedisAutoConfiguration）

3. 逐个检查这些类头上的 @Conditional 条件：
   - @ConditionalOnClass(RedisOperations.class)  → classpath 里有 Redis 才生效
   - @ConditionalOnMissingBean(DataSource.class) → 用户自己没定义 DataSource 才生效
   - @ConditionalOnProperty("app.feature.x")     → 配置里开了这个开关才生效

4. 条件通过的 → 自动创建 Bean 放进容器
```

> 💡 **这就是"约定优于配置"的真相**：不是不配，是**框架帮你按常见场景配好了**。你要定制？自己定义一个同类型的 Bean，自动配置的就会让步（`@ConditionalOnMissingBean` 的作用）。

### 1.2 条件装配（面试常问）

| 注解 | 条件 | 例子 |
|---|---|---|
| `@ConditionalOnClass` | classpath 里有这个类 | 有 `RedisOperations` 才装 Redis 配置 |
| `@ConditionalOnMissingBean` | 容器里**没有**这个 Bean | 用户自己定义了 DataSource，就不用默认的 |
| `@ConditionalOnProperty` | 配置属性匹配 | `app.cache.enabled=true` 才开缓存 |
| `@ConditionalOnWebApplication` | 是 Web 应用 | 只有 Web 项目才装 Tomcat |

---

## 二、应用篇（三个机制，直接可抄）

### 2.1 配置绑定：把 yml 里的值注入到 Java 对象

**场景**：`application.yml` 里配了一堆参数，怎么在代码里优雅地读取？

```yaml
# application.yml
app:
  redis:
    host: localhost
    port: 6379
    timeout: 3000
```

```java
@Data
@Component
@ConfigurationProperties(prefix = "app.redis")   // ① 前缀 = app.redis
public class RedisProperties {
    private String host;    // ② 字段名和配置 key 对应，自动绑定
    private int port;
    private int timeout;
}

// 使用：直接注入
@Service
public class OrderService {
    @Autowired
    private RedisProperties redisProps;   // host=localhost, port=6379, timeout=3000
}
```

> 💡 **比 `@Value` 强在哪？** `@Value("${app.redis.host}")` 只能绑一个字段，`@ConfigurationProperties` 可以批量绑整个对象，且支持松散绑定（`app.redis.timeout` 对应 `timeout` 或 `timeOut`）。

### 2.2 构造器注入（推荐，为什么？）

```java
@Service
public class OrderService {
    private final OrderMapper orderMapper;   // ① final：一旦赋值不可变，线程安全

    // ② 构造器注入：Spring 4.3+ 单构造器不用写 @Autowired
    public OrderService(OrderMapper orderMapper) {
        this.orderMapper = orderMapper;
    }
}
```

**为什么推荐构造器注入？**
1. **依赖明确**：所有依赖都在构造器参数里，一眼就能看出这个类需要什么
2. **不可变**：`final` 字段赋值后不能改，线程安全
3. **循环依赖早发现**：构造器注入如果循环依赖，启动时就报错；字段注入可能运行时才暴露
4. **测试友好**：单元测试时直接 `new OrderService(mockMapper)`，不用 Spring 容器

> ⚠️ **构造器注入的坑**：如果 A 依赖 B、B 依赖 A，构造器注入会启动失败（因为两个都等着对方先创建）。解法：重构解耦，或用 `@Lazy` 延迟加载。

### 2.3 多环境 Profile：开发/测试/生产各用各的配置

```yaml
# application.yml（公共配置）
spring:
  profiles:
    active: ${ENV:dev}     # 从环境变量 ENV 读，默认 dev

---
# application-dev.yml（开发环境）
server:
  port: 8080
spring:
  datasource:
    url: jdbc:mysql://localhost:3306/dev_db

---
# application-prod.yml（生产环境）
server:
  port: 80
spring:
  datasource:
    url: jdbc:mysql://prod-db.internal:3306/prod_db
```

**激活方式**（优先级从高到低）：
1. 命令行：`java -jar app.jar --spring.profiles.active=prod`
2. 环境变量：`export SPRING_PROFILES_ACTIVE=prod`
3. `application.yml` 里的 `spring.profiles.active`

---

## 三、进阶篇（面试深挖）

### 3.1 启动流程（简要版）

```
SpringApplication.run()
   ↓
1. 推断应用类型（Servlet / Reactive / None）
   ↓
2. 加载 ApplicationContextInitializer 和 ApplicationListener
   ↓
3. 准备 Environment（读 application.yml / 环境变量 / 命令行参数）
   ↓
4. 创建 ApplicationContext（容器）
   ↓
5. 刷新上下文（核心）：
   a. 加载 Bean 定义（扫描 @Component、解析 @Configuration）
   b. 执行 BeanFactoryPostProcessor（修改 Bean 定义，如配置绑定）
   c. 实例化单例 Bean（调用构造器、注入依赖、执行 @PostConstruct）
   ↓
6. 启动内嵌 Tomcat（如果是 Web 应用）
   ↓
7. 发布 ApplicationReadyEvent，启动完成
```

### 3.2 循环依赖与三级缓存

**Spring 怎么解决循环依赖？**

```
A 依赖 B，B 依赖 A

1. 创建 A → 实例化 A（调构造器）→ A 半成品放入【三级缓存】
2. A 需要注入 B → 去创建 B
3. 创建 B → 实例化 B → B 半成品放入【三级缓存】
4. B 需要注入 A → 从【三级缓存】拿 A 的半成品（提前暴露）→ B 完成
5. B 放入【一级缓存】→ 回到 A 的注入 → A 完成
6. A 放入【一级缓存】
```

**三级缓存**：
- **一级 `singletonObjects`**：成品 Bean（完全初始化好的）
- **二级 `earlySingletonObjects`**：半成品 Bean（已实例化，还没注入依赖）
- **三级 `singletonFactories`**：Bean 工厂（用来生成半成品）

> ⚠️ **构造器注入无法解决循环依赖**：因为三级缓存的前提是"实例化完成后提前暴露"，构造器注入时实例化就需要依赖，连半成品都造不出来。**只能用字段注入或 setter 注入。**

### 3.3 Starter 原理（自定义 Starter）

SpringBoot 的 Starter 就是一个 jar，里面藏着自动配置：
```
my-spring-boot-starter/
├── pom.xml                           # 引入需要的依赖
└── src/main/resources/
    └── META-INF/
        └── spring/
            └── org.springframework.boot.autoconfigure.AutoConfiguration.imports
                # 文件内容只有一行：
                # com.example.MyAutoConfiguration
```

```java
@AutoConfiguration
@ConditionalOnClass(MyFeature.class)
@EnableConfigurationProperties(MyProperties.class)
public class MyAutoConfiguration {
    @Bean
    @ConditionalOnMissingBean   // 用户没定义就用默认的
    public MyService myService(MyProperties props) {
        return new MyService(props);
    }
}
```

> 💡 自定义 Starter 的套路：引入依赖 → 写自动配置类 → 注册到 imports 文件 → 别人引你的 starter 就能自动获得功能。

### 3.4 其他面试常问

- **Bean 覆盖冲突**：同类型多个实现 → `@Qualifier("name")` 指定 / `@Primary` 设默认；建议关掉覆盖更稳：`spring.main.allow-bean-definition-overriding=false`
- **配置不生效排查**：检查是否被 `@ConditionalOnProperty` 关掉了、是否被自定义 Bean 覆盖了、yml 缩进是否正确、激活的 profile 对不对
- **Actuator 运维端点**：`/health`（健康检查）、`/metrics`（指标）、`/beans`（所有 Bean 列表）。生产环境暴露需限制：`management.endpoints.web.exposure.include=health,metrics`
- **启动慢优化**：`@ComponentScan` 范围收敛（别扫整个项目）；非必需 Bean 加 `@Lazy` 延迟初始化；去掉不需要的 starter

---

## 关联
- 持久层见 [[06_MyBatis 与 MyBatis-Plus]]
- 芋道框架的 Starter 设计见 [[22_从零搭建芋道式脚手架框架]]
- 微服务网关与注册见 [[14_微服务 SpringCloud 与 Dubbo]]
