---
title: "MyBatis 与 MyBatis-Plus（原理 → 应用 → 进阶）"
---
# MyBatis 与 MyBatis-Plus（原理 → 应用 → 进阶）

> **一句话概括**：MyBatis 是 Java 和数据库之间的**翻译官**——你写 Java 接口，它帮你翻译成 SQL 去执行，再把结果翻译回 Java 对象。MyBatis-Plus（MP）是这个翻译官的"增强版"，把"增删改查"这些重复翻译工作全自动化了。
>
> **适合谁**：用过 MyBatis 写 XML，但说不清 `#{} 和 `${}` 的区别、MP 分页为什么必须注册插件、乐观锁怎么防并发覆盖的人。
> **怎么读**：原理篇理解"SQL 怎么从接口走到数据库"；应用篇三段代码直接可抄；进阶篇的"分页必须注册插件"和"逻辑删除与唯一索引冲突"是生产真坑。

---

## 零、先建立整体印象：把它想象成"翻译官"

你（Java 程序员）说中文（Java 对象和方法），数据库只懂 SQL（数据库语言）。MyBatis 就是中间的双语翻译：

| 你说 | MyBatis 翻译 | 数据库执行 |
|---|---|---|
| `orderMapper.selectById(1)` | `SELECT * FROM orders WHERE id = 1` | 返回结果 |
| `orderMapper.insert(order)` | `INSERT INTO orders (...) VALUES (...)` | 插入数据 |
| `orderMapper.updateById(order)` | `UPDATE orders SET ... WHERE id = ?` | 更新数据 |

**MyBatis vs MyBatis-Plus**：
- **MyBatis**：翻译官只提供"翻译框架"，每句话（SQL）你自己写
- **MyBatis-Plus**：翻译官自带了"常用句型模板"（单表 CRUD），你不用写 SQL，直接调方法

---

## 一、原理篇：SQL 从接口到数据库的旅程

### 1.1 执行链路

```
你的代码：orderMapper.selectById(1)
   ↓
Mapper 接口（只有方法声明，没实现）
   ↓
JDK 动态代理 → 被拦截 → 转给 SqlSession
   ↓
SqlSession（会话）："这次查询用哪个 Mapper、传什么参数"
   ↓
Executor（执行器）：处理一级/二级缓存
   ↓
StatementHandler：真正调 JDBC，生成 PreparedStatement
   ↓
ParameterHandler：把 Java 参数塞进 SQL 的 `?` 占位符
   ↓
JDBC → 数据库执行 → 返回 ResultSet
   ↓
ResultSetHandler：把 ResultSet 转成 Java 对象
   ↓
返回给你：Order 对象
```

> 💡 **为什么 Mapper 接口没有实现类也能运行？** MyBatis 用 **JDK 动态代理** 在运行时生成代理对象，拦截接口方法调用，转给 SqlSession 执行。你写的 `orderMapper.selectById()` 实际上走的是代理类的 `invoke()` 方法。

### 1.2 一级缓存 vs 二级缓存

| 缓存 | 范围 | 默认 | 什么时候清空 | 生产建议 |
|---|---|---|---|---|
| **一级缓存** | `SqlSession` 级别 | 开启 | 会话关闭、提交、执行了 update | 不用管，会话级缓存意义不大 |
| **二级缓存** | `Mapper`（namespace）级别 | 关闭 | 需手动配置，执行 update 时清空 | **生产环境常关**，容易脏读，用 Redis 替代 |

> ⚠️ **二级缓存的坑**：多表关联查询时，A 表改了但 B 表的缓存没清 → 读到的数据是旧的。**生产环境缓存统一交给 Redis，别用 MyBatis 二级缓存。**

---

## 二、应用篇（代码，照着抄）

### 2.1 动态 SQL（XML 写法）

**场景**：查询条件不确定——有时按 userId 查，有时按 status 查，有时两个都按。

```xml
<select id="listOrders" resultType="Order">
  SELECT * FROM orders
  <where>
    <!-- ① <where> 标签会自动处理 AND/OR 前缀，不会多出 "WHERE AND" 这种语法错误 -->
    <if test="userId != null">
      AND user_id = #{userId}
    </if>
    <if test="status != null">
      AND status = #{status}
    </if>
  </where>
  ORDER BY id DESC
</select>
```

**`#{} vs `${}`——这是安全红线**：

| 写法 | 原理 | 安全性 | 适用 |
|---|---|---|---|
| `#{} | 预编译参数，`?` 占位，数据库自动转义 | ✅ **防 SQL 注入** | 所有用户输入的值 |
| `${}` | 字符串直接拼接进 SQL | ❌ **有注入风险** | 仅表名、列名、排序字段（且要白名单校验） |

```xml
<!-- ✅ 正确：用户传入的值用 #{} -->
AND user_id = #{userId}

<!-- ⚠️ 危险：如果 sortField 是用户传入的 "id; DROP TABLE orders;" -->
ORDER BY ${sortField}
<!-- 会变成：ORDER BY id; DROP TABLE orders; → 表被删了！ -->

<!-- ✅ 安全做法：排序字段白名单校验 -->
ORDER BY ${@com.example.SqlUtil@escapeOrderBy(sortField)}
```

### 2.2 MyBatis-Plus 条件构造器（不用写 SQL）

```java
// Lambda 写法：字段名从实体类推导，编译期检查，不会写错字段名
List<Order> list = orderMapper.selectList(
    new LambdaQueryWrapper<Order>()
        .eq(Order::getUserId, 1)                    // user_id = 1
        .in(Order::getStatus, 1, 2)                 // status IN (1, 2)
        .ge(Order::getCreateTime, startDate)        // create_time >= ?
        .orderByDesc(Order::getCreateTime)          // ORDER BY create_time DESC
        .last("LIMIT 10")                           // 拼在最后（慎用，直接拼字符串）
);
```

> 💡 **MP 的核心价值**：单表查询几乎不用写 SQL，条件用链式 API 拼，类型安全、可读性好。

### 2.3 MP 分页 + 逻辑删除 + 乐观锁

**① 注册插件（必须做！否则分页是内存分页，大表直接崩）**：
```java
@Configuration
public class MybatisPlusConfig {

    @Bean
    public MybatisPlusInterceptor mybatisPlusInterceptor() {
        MybatisPlusInterceptor interceptor = new MybatisPlusInterceptor();

        // 分页插件：自动识别数据库方言，生成对应的分页 SQL
        interceptor.addInnerInterceptor(new PaginationInnerInterceptor(DbType.MYSQL));
        // 达梦用 DbType.DM，Oracle 用 DbType.ORACLE

        // 乐观锁插件：更新时自动带版本号
        interceptor.addInnerInterceptor(new OptimisticLockerInnerInterceptor());

        return interceptor;
    }
}
```

**② 实体类**：
```java
@Data
@TableName("orders")
public class Order {
    @TableId(type = IdType.AUTO)
    private Long id;

    @TableLogic
    private Integer deleted;     // 逻辑删除标记：0=未删除，1=已删除

    @Version
    private Integer version;     // 乐观锁版本号
}
```

**③ 分页查询**：
```java
// ① 创建分页对象：第 1 页，每页 10 条
Page<Order> page = new Page<>(1, 10);

// ② 分页查询：MP 自动在 SQL 后面拼 LIMIT
Page<Order> result = orderMapper.selectPage(page,
    new LambdaQueryWrapper<Order>()
        .eq(Order::getUserId, 100)
        .orderByDesc(Order::getCreateTime));

// ③ 结果
List<Order> records = result.getRecords();      // 当前页数据
long total = result.getTotal();                  // 总条数
long pages = result.getPages();                  // 总页数
```

> ⚠️ **分页插件必须注册！** 没注册时 `selectPage` 会先把全表数据查进内存，再截取前 10 条——百万级表直接 OOM。

---

## 三、进阶篇（面试深挖 + 生产坑）

### 3.1 逻辑删除与唯一索引的冲突

**问题**：`orders` 表有唯一索引 `UNIQUE(user_id, order_no)`。用户删了订单（逻辑删除，`deleted=1`），再下一个同样 `order_no` 的订单 → 唯一索引冲突！因为逻辑删除的数据还在表里。

**解法**：唯一索引要加上 `deleted` 列：
```sql
-- ✅ 正确：把 deleted 也放进唯一约束
UNIQUE KEY uk_user_order (user_id, order_no, deleted)

-- 这样 deleted=0 和 deleted=1 被视为不同的组合，不会冲突
```

### 3.2 乐观锁怎么防并发覆盖

**场景**：A 和 B 同时读订单（version=1），A 改金额提交，B 也改金额提交。

**MP 的乐观锁机制**：
```sql
-- A 提交时执行的 SQL：
UPDATE orders SET amount = 100, version = version + 1
WHERE id = 1 AND version = 1;
-- 执行成功，version 变成 2

-- B 提交时执行的 SQL：
UPDATE orders SET amount = 200, version = version + 1
WHERE id = 1 AND version = 1;
-- 影响行数 = 0（因为 version 已经是 2 了）→ MP 抛异常 OptimisticLockingFailureException
```

**业务处理**：
```java
try {
    orderMapper.updateById(order);
} catch (OptimisticLockingFailureException e) {
    // ① 重试：重新读取最新数据，合并修改后再提交
    // ② 或抛给用户："数据已被修改，请刷新后重试"
}
```

### 3.3 批量插入优化

MP 的 `saveBatch` 默认是**循环单条插入**：
```java
// 底层是 for 循环调用 INSERT，性能差
orderService.saveBatch(orderList);
```

**真正批量插入**：
```java
// MySQL：连接串加 rewriteBatchedStatements=true
// jdbc:mysql://localhost:3306/db?rewriteBatchedStatements=true

// 这样 saveBatch 才会把多条 INSERT 合并成一条批量 SQL
orderService.saveBatch(orderList, 500);   // 每 500 条一批
```

### 3.4 多数据源

```java
// 引入 dynamic-datasource-spring-boot-starter
// 注解切换数据源
@DS("slave")   // 读走从库
public List<Order> queryOrders() { ... }

@DS("master")  // 写走主库
public void saveOrder(Order order) { ... }
```

### 3.5 其他面试常问

- **`selectById` 走主键索引**，最快；复杂查询用 `Wrapper` 或自定义 XML
- **字段命名**：开 `map-underscore-to-camel-case: true`，`user_name` 自动映射 `userName`
- **达梦适配**：`DbType.DM`、序列代替自增、生成器配 `db-type=dm`（见 [[09_达梦 DM 数据库]]）
- **SQL 片段复用**：XML 里用 `<sql id="baseColumns">` + `<include refid="baseColumns"/>`

---

## 关联
- 数据库优化与 SQL 调优见 [[07_MySQL 与 SQL 优化]]
- 达梦数据库适配见 [[09_达梦 DM 数据库]]
- 芋道框架的数据权限拦截器见 [[22_从零搭建芋道式脚手架框架]]
