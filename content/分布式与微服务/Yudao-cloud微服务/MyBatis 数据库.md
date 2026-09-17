---
tags: #技术/数据库 #Yudao #MyBatis #规范
date: 2026-09-06
source: 芋道《开发指南 —— MyBatis 数据库》
title: "MyBatis 数据库（Yudao 规范与增强）"
---

# MyBatis 数据库（Yudao 规范与增强）

> **一句话概括**：芋道在 MyBatis Plus 之上做了三件事 —— ① 用 `BaseDO` 统一所有表的公共字段 ② 用 `BaseMapperX` 增强 CRUD ③ 定了一套**严格的编码规范**（DO 放哪、查询写在哪、怎么命名）。

---

## 零、先建立整体印象：图书馆的借还登记

> 🧒 **费曼第 1 段 · 5 岁小孩也能懂**

图书馆每本书的借阅卡上，除了书名，还要记录一些**每本书都一样的信息**：

- 谁**借走**的、什么时候借的
- 谁**归还**的、什么时候还的
- 这本书**还在不在**（有没有被报废）

如果每本书都要单独设计一张卡片格式，太麻烦了。所以图书馆**统一规定**：所有借阅卡**必须有这 5 项**。

数据库表也一样。芋道规定：**所有表都必须有这 5 个公共字段**。

| 字段 | 含义 |
|---|---|
| `creator` + `create_time` | 谁创建的、什么时候 |
| `updater` + `update_time` | 谁改的、什么时候 |
| `deleted` | 是否删除（**逻辑删除**） |

这些字段**不用你手工填** —— 芋道用 `BaseDO` 基类 + 自动填充机制帮你搞定。

---

## 一、原理篇

### 1.1 `BaseDO`：所有实体的父类 ⭐

```java
@Data
public abstract class BaseDO implements Serializable {

    /** 创建时间 */
    @TableField(fill = FieldFill.INSERT)              // 插入时自动填充
    private Date createTime;

    /** 最后更新时间 */
    @TableField(fill = FieldFill.INSERT_UPDATE)       // 插入和更新时都填充
    private Date updateTime;

    /**
     * 创建者
     * 使用 String 类型的原因是，未来可能会存在非数值的情况，留好拓展性
     */
    @TableField(fill = FieldFill.INSERT)
    private String creator;

    /** 更新者 */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private String updater;

    /** 是否删除（逻辑删除） */
    @TableLogic
    private Boolean deleted;
}
```

**对应的表字段**（每张表都要有）：

```sql
`creator`     varchar(64) DEFAULT ''   COMMENT '创建者',
`create_time` datetime    NOT NULL     COMMENT '创建时间',
`updater`     varchar(64) DEFAULT ''   COMMENT '更新者',
`update_time` datetime    NOT NULL     COMMENT '更新时间',
`deleted`     bit(1)      NOT NULL DEFAULT b'0' COMMENT '是否删除',
```

> 💡 **设计细节**：`creator` 用 `String` 而不是 `Long`——官方说明是"未来可能存在非数值的情况（比如系统自动创建、第三方用户），留好拓展性"。**这种"留后路"的意识值得学**。

### 1.2 主键策略：为什么用 Long 自增？

```sql
`id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
```

| 方案 | 优点 | 缺点 | 芋道选择 |
|---|---|---|---|
| **Long 自增** ⭐ | 顺序写入，**性能好**；Long 避免超 Int 范围 | 分库分表时需要额外处理 | ✅ **默认** |
| **雪花算法（ASSIGN_ID）** | 全局唯一，分布式友好 | 不是严格递增，索引碎片多 | 可选 |

切换方式：改 `application.yaml` 的 `mybatis-plus.global-config.db-config.id-type` 为 `ASSIGN_ID`。

> ⚠️ **什么时候必须换成雪花算法？** 分库分表场景（多库自增会撞 ID）。

### 1.3 逻辑删除的隐藏大坑 ⭐

**逻辑删除** = 不真删数据，只是把 `deleted` 标成 1。

**优点**：数据可恢复、可审计。
**代价**：所有 SELECT 都会自动拼 `WHERE deleted = 0`。

**最大的坑 —— 唯一索引冲突**：

```
场景：username 是唯一索引
① 用户注册 username = "yudao"     → 插入成功
② 管理员删除（逻辑删除）            → deleted = 1，但记录还在
③ 又有人注册 username = "yudao"   → ❌ 唯一索引冲突！
```

**官方解法**：唯一索引里**加上 `delete_time` 字段**：

```sql
-- ❌ 错误
UNIQUE KEY `uk_username` (`username`)

-- ✅ 正确
UNIQUE KEY `uk_username` (`username`, `delete_time`)
```

原理：删除时把 `delete_time` 设成当前时间戳，新记录的 `delete_time` 是 0，两者不同 → **不冲突**。

> 💡 这是我见过最实用的逻辑删除技巧。很多项目都栽在这个坑上。

### 1.4 自动填充：`DefaultDBFieldHandler`

基于 MyBatis Plus 的自动填充机制，在插入/更新时自动设置 `creator`、`create_time` 等字段 —— **你完全不用管**。

### 1.5 复杂字段类型：TypeHandler

有些字段是"复杂对象"（如 `List<String>`、`Map`、`Set<Long>`），数据库用 JSON 字符串存。用 TypeHandler 自动转换：

```java
@TableName(value = "xxx", autoResultMap = true)   // ⚠️ 必须加 autoResultMap = true
public class XxxDO extends BaseDO {

    @TableField(typeHandler = JacksonTypeHandler.class)
    private List<String> tags;      // 数据库存 JSON，Java 里是 List
}
```

| TypeHandler | 用途 |
|---|---|
| `JacksonTypeHandler` | 通用 JSON 转换 |
| `JsonLongSetTypeHandler` | `Set<Long>` 专用 |
| `EncryptTypeHandler` | **字段加密**（见 1.6） |

### 1.6 字段加密：`EncryptTypeHandler`

存密码、密钥这类敏感字段时自动加密：

```java
@TableName(value = "infra_data_source_config", autoResultMap = true)
public class DataSourceConfigDO extends BaseDO {

    @TableField(typeHandler = EncryptTypeHandler.class)   // 👈 自动加解密
    private String password;
}
```

密钥配置：`mybatis-plus.encryptor.password`

> ⚠️ **加密后只能精准匹配，不能模糊匹配！**
> ```java
> // ❌ 错误：直接拿明文查
> mapper.selectOne("password", "123456");
>
> // ✅ 正确：先加密再查
> mapper.selectOne(DataSourceConfigDO::getPassword,
>                  EncryptTypeHandler.encrypt("123456"));
> ```

---

## 二、应用篇：芋道的编码规范 ⭐⭐

> 这一节是全文最有价值的部分 —— **这是大厂级的 Java 分层规范**。

### 规范 ①：包结构约定

| 类 | 放哪 | 命名 |
|---|---|---|
| 数据库实体 | `dal.dataobject` 包 | `XxxDO` |
| 数据库访问 | `dal.mysql` 包 | `XxxMapper` |

### 规范 ②：实体类注释要完整

特别是标注哪些字段是**关联（外键）**、**枚举**、**冗余**：

```java
@Data
@TableName("system_users")
public class AdminUserDO extends BaseDO {

    /** 用户昵称 */
    private String nickname;

    /** 部门ID —— 关联 system_dept.id */
    private Long deptId;

    /** 状态 —— 枚举 CommonStatusEnum（0正常 1停用） */
    private Integer status;

    /** 最后登录IP —— 冗余字段，方便查询 */
    private String loginIp;
}
```

### 规范 ③：禁止在 Controller / Service 里直接写 MyBatis Plus 操作 ⭐

> **官方原话**：
> > "禁止在 Controller、Service 中直接进行 MyBatis Plus 操作。原因是：大量 MyBatis 操作散落在 Service 中，会导致 Service 的代码越来越乱，无法聚焦业务逻辑。"

| | 做法 |
|---|---|
| ❌ 错误 | Service 里直接 `userMapper.selectList(new LambdaQueryWrapper<>())` |
| ✅ 正确 | 查询逻辑封装到 Mapper 的 `default` 方法里，Service 调用 `userMapper.selectListByStatus(...)` |

**好处**：
1. Service 聚焦业务逻辑，代码清爽
2. **SELECT 查询可复用**（同一个查询多个 Service 都能调）

### 规范 ④：查询方法命名规则

采用 Spring Data 的 "Query methods" 策略：**`selectBy` + 查询条件**

```java
selectById(Long id)
selectByUsername(String username)
selectListByStatus(Integer status)
selectListByDeptIdAndStatus(Long deptId, Integer status)
```

### 规范 ⑤：优先用 `LambdaQueryWrapper`

```java
// ❌ 手写字段字符串，容易写错（编译不报错，运行时才发现）
wrapper.eq("status", 1);

// ✅ 用方法引用，写错字段名编译就报错
wrapper.eq(UserDO::getStatus, 1);
```

### 规范 ⑥：简单单表查询用 Mapper 的 `default` 方法

```java
@Mapper
public interface UserMapper extends BaseMapperX<UserDO> {

    // 不需要写 XML，直接在接口里用 default 方法实现
    default List<UserDO> selectListByStatus(Integer status) {
        return selectList(UserDO::getStatus, status);
    }
}
```

---

## 三、进阶篇

### 3.1 `BaseMapperX`：增强的 CRUD 接口

芋道的 `BaseMapperX` 继承 MyBatis Plus 的 `BaseMapper`，提供更强能力：

| 方法 | 作用 |
|---|---|
| `selectOne(...)` | 查单条 |
| `selectCount(...)` | 查数量 |
| `selectList(...)` | 查多条 |
| `selectPage(...)` | **分页**（入参 `PageParam`，出参 `PageResult`） |
| `insertBatch(...)` | 批量插入 |
| `selectPage(reqVO, wrapper)` | 分页 + 条件 |

> 💡 `selectPage` 的二次封装是重点：把 MyBatis Plus 的 `IPage` 转成项目自己的 `PageResult`，详见 [[分页实现]]。

### 3.2 `LambdaQueryWrapperX`：`xxxIfPresent` 系列

```java
new LambdaQueryWrapperX<TenantDO>()
    .likeIfPresent(TenantDO::getName, reqVO.getName())     // 不为空才 like
    .eqIfPresent(TenantDO::getStatus, reqVO.getStatus())   // 不为空才 =
    .betweenIfPresent(TenantDO::getCreateTime, begin, end) // 不为空才 between
```

比原生写法少了一半的 `if (xxx != null)`。

### 3.3 批量插入：两个选择

| 方法 | 适合 | 说明 |
|---|---|---|
| `IService.saveBatch()` | ✅ **绝大多数场景** | MyBatis Plus 官方，支持多租户 |
| `BaseMapperX.insertBatch()` | 少量数据 | 逐条插入，性能一般 |

> ❓ **为什么不用 `insertBatchSomeColumn`（真·批量插入）？** 官方给了两个理由：
> 1. **只支持 MySQL**，Oracle 等数据库会报错
> 2. **不支持多租户**（不会自动赋值 `tenant_id`）

### 3.4 尽量避免连表查询 ⭐

> **官方建议**：
> > "尽量避免数据库的连表（多表）查询，而是采用**多次查询 + Java 内存拼接**的方式替代。"

**为什么？**

| 连表查询 | 多次查询 + 内存拼接 |
|---|---|
| 大表 JOIN 慢，容易拖垮数据库 | 单表查询快，可利用缓存 |
| 分库分表后无法 JOIN | 跨库也能拼 |
| 数据库压力集中在 DB | 压力分散到应用（应用可水平扩容） |

**什么时候该连表？** 数据量小、SQL 简单、一次查询能搞定时，连表更省事。详见 [[MyBatis 联表分页查询]]。

---

## 四、一句话总结

| 问题 | 答案 |
|---|---|
| 公共字段怎么办 | 继承 `BaseDO`，自动填充 |
| 主键 | `Long` 自增（分库分表改雪花算法） |
| 逻辑删除的坑 | 唯一索引要**加上 `delete_time`** |
| 查询写在哪 | **必须写在 Mapper 层**，Service 只调 |
| 命名规则 | `selectBy` + 条件 |
| 条件构造 | `LambdaQueryWrapper` + `xxxIfPresent` |
| 连表 | 尽量**避免**，改用多次查询内存拼接 |

---

## 关联笔记

- [[06_MyBatis 与 MyBatis-Plus]] ⭐ — MyBatis 核心原理、插件机制、Wrapper 详解
- [[分页实现]] — `selectPage` 的完整前后端链路
- [[MyBatis 联表分页查询]] — 联表查询的两种方案
- [[07_MySQL 与 SQL 优化]] — 索引、逻辑删除对索引的影响
- [[SaaS 多租户 字段隔离]] — 多租户字段的自动赋值
- [[数据权限]] — MyBatis 拦截器改写 SQL

## 附录：官方截图索引

存于 `99_附件_资源文件/Yudao-Cloud/`，按文档出现顺序（含大量代码与配置截图）：

- `MyBatis_数据库-2.png` ~ `MyBatis_数据库-10.png` — 主键策略配置、逻辑删除配置、自动填充 `DefaultDBFieldHandler`、TypeHandler 示例、包结构与编码规范正反例、CRUD 示例、`saveBatch` 示例、`LambdaQueryWrapperX` 用法、Mapper XML 示例
