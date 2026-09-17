---
tags: #技术/数据库 #Yudao #MyBatis #分页
date: 2026-09-06
source: 芋道《开发指南 —— MyBatis 联表&分页查询》
title: "MyBatis 联表 & 分页查询"
---

# MyBatis 联表 & 分页查询

> **一句话概括**：分页有**两种 XML 写法**（手写两条 SQL vs MyBatis Plus 自动分页，推荐后者）；联表也有**两种写法**（XML vs MyBatis Plus Join，官方偏爱后者）。

---

## 零、先建立整体印象：查通讯录

> 🧒 **费曼第 1 段 · 5 岁小孩也能懂**

你要查"**技术部所有在职员工的姓名和部门名**"。

问题是：姓名在**员工表**，部门名在**部门表**，两张表。

两种做法：

| 做法 | 比喻 |
|---|---|
| **联表查询**（JOIN） | 把两个本子摊开，一次对照着查完 |
| **多次查询 + 内存拼接** | 先查员工表拿到 id，再查部门表，最后自己在本子上对应起来 |

**分页**则是另一件事：查出来可能 1000 条，你要"第 2 页的 10 条" + "总共多少条"。

---

## 一、分页查询：两种 XML 方案

### 方案一：原生 MyBatis XML（手写两条 SQL）

**思路**：自己写"查列表"和"查总数"两条 SQL。

```xml
<!-- AdminUserMapper.xml -->
<mapper namespace="cn.iocoder.yudao.module.system.dal.mysql.user.AdminUserMapper">

    <!-- ① 查列表：自己写 LIMIT -->
    <select id="selectPage01List" resultType="...AdminUserDO">
        SELECT * FROM system_users
        <where>
            <if test="reqVO.username != null and reqVO.username !=''">
                AND username LIKE CONCAT('%',#{reqVO.username},'%')
            </if>
            <if test="reqVO.createTime != null">
                AND create_time BETWEEN #{reqVO.createTime[0]}, #{reqVO.createTime[1]}
            </if>
            <if test="reqVO.status != null">
                AND status = #{reqVO.status}
            </if>
        </where>
        ORDER BY id DESC
        LIMIT #{reqVO.pageNo}, #{reqVO.pageSize}     <!-- 👈 手工分页 -->
    </select>

    <!-- ② 查总数：条件要重复写一遍 -->
    <select id="selectPage01Count" resultType="Long">
        SELECT COUNT(1) FROM system_users
        <where>
            <!-- ... 同样的条件再写一遍 ... -->
        </where>
    </select>
</mapper>
```

**Mapper 接口**：

```java
@Mapper
public interface AdminUserMapper extends BaseMapperX<AdminUserDO> {
    List<AdminUserDO> selectPage01List(@Param("reqVO") UserPageReqVO reqVO);
    Long selectPage01Count(@Param("reqVO") UserPageReqVO reqVO);
}
```

**Service 层**：

```java
@Override
public PageResult<AdminUserDO> getUserPage(UserPageReqVO reqVO) {
    return new PageResult<>(
        userMapper.selectPage01List(reqVO),     // 列表
        userMapper.selectPage01Count(reqVO)     // 总数
    );
}
```

> ❌ **缺点**：`WHERE` 条件要写**两遍**，改条件时容易漏改一处，导致"列表和总数对不上"。

### 方案二：MyBatis Plus XML（推荐）⭐

**思路**：只写一条 SQL，**不写 LIMIT**，MyBatis Plus 自动帮你分页 + 算总数。

```xml
<select id="selectPage02" resultType="...AdminUserDO">
    SELECT * FROM system_users
    <where>
        <if test="reqVO.username != null and reqVO.username !=''">
            AND username LIKE CONCAT('%',#{reqVO.username},'%')
        </if>
        <!-- ... 条件只写一遍 ... -->
    </where>
    ORDER BY id DESC
    <!-- ⚠️ 注意：不需要写 LIMIT -->
</select>
```

**Mapper 接口**（第一个参数必须是 `IPage`）：

```java
@Mapper
public interface AdminUserMapper extends BaseMapperX<AdminUserDO> {
    // 第一个参数、返回结果必须都是 IPage 类型
    IPage<AdminUserDO> selectPage02(IPage<AdminUserDO> page,
                                    @Param("reqVO") UserPageReqVO reqVO);
}
```

**Service 层**：

```java
@Override
public PageResult<AdminUserDO> getUserPage(UserPageReqVO reqVO) {
    // ① 构造 MyBatis Plus 的分页对象
    IPage<AdminUserDO> page = new Page<>(reqVO.getPageNo(), reqVO.getPageSize());
    // ② 查询（结果直接回填到 page 对象里）
    userMapper.selectPage02(page, reqVO);
    // ③ 转成项目的 PageResult
    return new PageResult<>(page.getRecords(), page.getTotal());
}
```

### 两种方案对比

| | 方案一（原生 XML） | 方案二（MP XML）⭐ |
|---|---|---|
| SQL 条数 | 2 条（列表 + 总数） | **1 条** |
| LIMIT | 手写 | 不用写 |
| 条件维护 | ❌ 写两遍，易漏改 | ✅ 写一遍 |
| 总数为 0 时 | 仍会查列表 | ✅ **跳过列表查询**（性能优化） |
| 推荐度 | 特殊场景 | ✅ **官方推荐** |

> 💡 **官方原话**：
> > "一般情况下，建议采用方案二：MyBatis Plus XML，因为它开发效率更高，并且**在分页数量为 0 时，就不多余查询分页的列表**，一定程度上可以提升性能。"

---

## 二、联表查询：两种方案

> ⚠️ 先回顾 [[MyBatis 数据库]] 的建议：**尽量避免连表，优先"多次查询 + Java 内存拼接"**。确实需要连表时，再往下看。

### 方案一：MyBatis XML（传统）

写 XML 的 `<resultMap>` 做映射，灵活但繁琐。适合复杂 SQL。

### 方案二：MyBatis Plus Join（官方偏爱）⭐

芋道集成了 **MyBatis Plus Join（MPJ）**，用 Java 代码写联表，不用写 XML。

**案例一：字段平铺**（把部门名作为普通字段返回）

**① 定义结果类**（继承主表 DO，加平铺字段）：

```java
@Data
public class AdminUserDetailDO extends AdminUserDO {
    private String deptName;      // 部门名，平铺进来
}
```

**② 写联表查询**：

```java
@Mapper
public interface AdminUserMapper extends BaseMapperX<AdminUserDO> {

    default List<AdminUserDetailDO> selectList2ByStatusAndDeptName(Integer status, String deptName) {
        return selectJoinList(AdminUserDetailDO.class, new MPJLambdaWrapper<AdminUserDO>()
            .selectAll(AdminUserDO.class)                              // 查用户表所有字段
            .selectAs(DeptDO::getName, AdminUserDetailDO::getDeptName) // 部门表的 name → deptName 字段
            .eq(AdminUserDO::getStatus, status)                        // WHERE users.status = ?
            .leftJoin(DeptDO.class, DeptDO::getId, AdminUserDO::getDeptId)  // LEFT JOIN dept ON dept.id = users.dept_id
            .eq(DeptDO::getName, deptName)                             // WHERE dept.name = ?
        );
    }
}
```

**案例二：字段内嵌**（把整个部门对象嵌进去）

**① 定义结果类**：

```java
@Data
public class AdminUserDetail2DO extends AdminUserDO {
    private DeptDO dept;      // 整个部门对象
}
```

**② 查询（关键差异：`selectAssociation`）**：

```java
default List<AdminUserDetail2DO> selectListByStatusAndDeptName(Integer status, String deptName) {
    return selectJoinList(AdminUserDetail2DO.class, new MPJLambdaWrapper<AdminUserDO>()
        .selectAll(AdminUserDO.class)
        .selectAssociation(DeptDO.class, AdminUserDetail2DO::getDept)  // 👈 差异点：整个对象内嵌
        .eq(AdminUserDO::getStatus, status)
        .leftJoin(DeptDO.class, DeptDO::getId, AdminUserDO::getDeptId)
        .eq(DeptDO::getName, deptName)
    );
}
```

### 平铺 vs 内嵌对比

| | 平铺 `selectAs` | 内嵌 `selectAssociation` |
|---|---|---|
| 结果结构 | `{ id, name, deptId, deptName }` | `{ id, name, deptId, dept: {id, name} }` |
| 适合 | 只需要 1~2 个关联字段 | 需要关联表的完整对象 |
| 前端处理 | 直接 `row.deptName` | `row.dept.name` |

> 💡 **官方态度**（值得玩味）：
> > "MyBatis Plus Join 相比 MyBatis XML 来说，一开始肯定是需要多看看它的文档。但是**熟悉后，我还是更喜欢使用 MyBatis Plus Join**。"

---

## 三、进阶篇

### 3.1 什么时候该连表、什么时候不该？

| 场景 | 建议 |
|---|---|
| 两张小表（< 10 万），简单条件 | ✅ 连表，省事 |
| 大表 JOIN 大表（百万级） | ❌ **禁止**，改多次查询内存拼接 |
| 分库分表 | ❌ 无法连表，必须内存拼接 |
| 需要跨库关联 | ❌ 必须内存拼接 |
| 关联表数据可缓存（如字典、部门） | ✅ 内存拼接 + 本地缓存（见 [[本地缓存]]） |
| 报表统计（复杂聚合） | ✅ 连表 / 专用统计表 |

### 3.2 内存拼接的标准写法

```java
// 场景：查用户列表，并填充部门名
public List<UserRespVO> getUserList() {
    // ① 查用户（单表）
    List<UserDO> users = userMapper.selectList();

    // ② 批量查部门（避免 N+1！）
    Set<Long> deptIds = users.stream().map(UserDO::getDeptId).collect(Collectors.toSet());
    Map<Long, DeptDO> deptMap = deptService.getDeptMap(deptIds);

    // ③ 内存拼接
    return users.stream().map(user -> {
        UserRespVO vo = UserConvert.INSTANCE.convert(user);
        DeptDO dept = deptMap.get(user.getDeptId());
        vo.setDeptName(dept != null ? dept.getName() : null);
        return vo;
    }).collect(Collectors.toList());
}
```

> ⚠️ **绝对要避免 N+1 问题**：
> ```java
> // ❌ 灾难：查 1 次用户 + 查 N 次部门
> for (UserDO user : users) {
>     user.setDeptName(deptMapper.selectById(user.getDeptId()).getName());
> }
>
> // ✅ 正确：查 1 次用户 + 查 1 次部门（批量）
> ```
> 芋道的「数据翻译」功能就是自动做这件事，见 [[VO 对象转换、数据翻译]]。

### 3.3 联表查询的性能坑

| 坑 | 说明 | 解决 |
|---|---|---|
| **笛卡尔积** | 忘了写 ON 条件，数据量爆炸 | 检查 JOIN 条件 |
| **索引失效** | 关联字段没索引 | **关联字段必须建索引**（如 `dept_id`） |
| **LEFT JOIN vs INNER JOIN** | 用错导致数据变多/变少 | LEFT 保留左表全部；INNER 只保留匹配的 |
| **SELECT \*** | 联表后返回大量无用字段 | 只 select 需要的字段 |
| **分页数据重复** | 一对多 JOIN 后分页，数据条数不对 | 先分页主表，再查子表 |

### 3.4 分页 + 联表的注意事项

一对多联表（如订单 + 订单项）后分页会出问题：

```sql
-- ❌ 错误：一个订单有 3 个商品，JOIN 后变成 3 行，LIMIT 10 只返回了 3 个订单
SELECT * FROM orders o LEFT JOIN order_items i ON o.id = i.order_id LIMIT 10;

-- ✅ 正确：先分页主表，再查子表
SELECT * FROM orders LIMIT 10;                          -- 先拿 10 个订单
SELECT * FROM order_items WHERE order_id IN (...);      -- 再查这些订单的商品
```

---

## 四、一句话总结

| 问题 | 答案 |
|---|---|
| 分页用哪种 XML 方案 | ✅ **方案二（MyBatis Plus XML）**：只写 1 条 SQL，不用写 LIMIT |
| MP 分页的关键 | 第一个参数必须是 `IPage`，返回也是 `IPage` |
| 联表用什么 | ✅ **MyBatis Plus Join**（`MPJLambdaWrapper`），或复杂场景用 XML |
| 平铺 vs 内嵌 | `selectAs`（平铺字段）/ `selectAssociation`（内嵌对象） |
| 要不要连表 | **能不连就不连**，改"多次查询 + 内存拼接" |
| 最大坑 | **N+1 查询** → 必须批量查 |

---

## 关联笔记

- [[MyBatis 数据库]] ⭐ — BaseDO / BaseMapperX / 编码规范 / 避免连表的官方建议
- [[分页实现]] — 用 `LambdaQueryWrapperX` 的单表分页（更常用）
- [[VO 对象转换、数据翻译]] — 自动做内存拼接的"数据翻译"功能
- [[07_MySQL 与 SQL 优化]] ⭐ — JOIN 原理 / 索引 / 深分页优化
- [[本地缓存]] — 字典、部门等关联数据的缓存加速

## 附录：官方截图索引

存于 `99_附件_资源文件/Yudao-Cloud/`：

- `MyBatis_联表_分页查询-1.png`、`MyBatis_联表_分页查询-2.png` — 两种分页方案执行时控制台打印的 SQL（可看到各执行了哪 2 条 SQL）
