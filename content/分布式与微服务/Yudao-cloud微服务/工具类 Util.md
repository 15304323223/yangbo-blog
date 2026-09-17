---
tags:
  - Java
  - Yudao
  - Hutool
  - Lombok
  - 工具类
date: 2026-09-06
source: 芋道 ruoyi-vue-pro 开发指南 - 后端手册 - 工具类 Util
title: "工具类 Util"
---

# 工具类 Util

> **一句话概括**：芋道用 **Hutool 为主 + 自研 `XxxUtils` 为辅 + Lombok 消除样板代码**。**写任何工具方法前，先查有没有现成的** —— 99% 的情况下轮不到你造轮子。

**适合谁读**：所有写 Java 的人。这篇是**速查手册**，不用通读，用到时翻。
**怎么读**：「一」背下 ⭐ 标的高频工具类，「三」记住几个芋道独有的增强方法。

---

## 零、先建立整体印象：三层工具箱

```
┌─────────────────────────────────────────────┐
│ 第 1 层：JDK 原生                             │
│   String.split()、Collections、Stream API     │
│   ↓ 不够用，太啰嗦                            │
├─────────────────────────────────────────────┤
│ 第 2 层：Hutool（国产，主力）⭐                │
│   StrUtil、CollUtil、MapUtil、DateUtil...     │
│   ↓ 还差业务相关的                            │
├─────────────────────────────────────────────┤
│ 第 3 层：yudao-common 的 util 包（补充）       │
│   JsonUtils、BeanUtils、ServletUtils...       │
│   命名规范：以 Utils 结尾（注意是复数）         │
└─────────────────────────────────────────────┘
```

💡 **命名小知识**：
- Hutool 的类是 **`XxxUtil`**（单数）：`StrUtil`、`CollUtil`
- 芋道自研的是 **`XxxUtils`**（复数）：`JsonUtils`、`BeanUtils`

**看到结尾是单数还是复数，就知道是哪一层的。**

---

## 一、Hutool 速查表（⭐ = 高频，必记）

| 分类 | Hutool 类 | 典型方法 |
|---|---|---|
| ⭐ **字符串** | `StrUtil` | `isBlank` / `isNotBlank` / `isEmpty` / `format` / `subAfter` / `split` |
| ⭐ **集合** | `CollUtil` | `isEmpty` / `isNotEmpty` / `newArrayList` / `toSet` / `subtract` |
| ⭐ **Map** | `MapUtil` | `isEmpty` / `newHashMap` / `getStr` / `findAndThen` |
| 数组 | `ArrayUtil` | `isEmpty` / `contains` / `toArray` |
| List | `ListUtil` | `split`（分片）/ `toList` |
| 文件 | `FileUtil` | `readBytes` / `writeBytes` / `del` / `copy` |
| 文件类型 | `FileTypeUtil` | `getType`（根据魔数判断真实类型） |
| 压缩 | `ZipUtil` | `zip` / `unzip` / `gz` |
| IO 流 | `IoUtil` | `readBytes` / `copy` / `close` |
| 资源 | `ResourceUtil` | `readStr`（读 classpath 下的文件） |
| 数字 | `NumberUtil` | `add` / `sub` / `mul` / `div` / `equals` |
| 对象 | `ObjectUtil` | `isNull` / `isNotNull` / `defaultIfNull` / `clone` |
| 唯一 ID | `IdUtil` | `fastSimpleUUID` / `getSnowflake` / `randomUUID` |
| 时间 | `DateUtil` | `now` / `format` / `parse` / `between` / `offsetDay` |
| 反射 | `ReflectUtil` | `getFieldValue` / `setFieldValue` / `newInstance` |
| 异常 | `ExceptionUtil` | `getRootCauseMessage` / `stacktraceToString` |
| 随机 | `RandomUtil` | `randomInt` / `randomString` / `randomEle` |
| URL | `URLUtil` | `encode` / `decode` / `getHost` |
| Spring | `SpringUtil` | `getBean`（非 Spring 管理的类里拿 Bean） |
| 校验 | `ValidationUtil` | `isMobile` / `isEmail` / `isIdCard` |

> 芋道官方还推荐了 Google 的 **Guava**，感兴趣可以看《Guava 学习笔记》。

### 最常用的 5 个，举例

**① `StrUtil` —— 字符串判空（比 `StringUtils` 好用）**

```java
// ❌ JDK 原生写法
if (str != null && !str.trim().isEmpty()) { }

// ✅ Hutool
if (StrUtil.isNotBlank(str)) { }          // null / "" / "  " 都算空

// 格式化（比 String.format 快，且 null 安全）
String msg = StrUtil.format("用户 {} 的年龄是 {}", name, age);

// 截取子串
String path = StrUtil.subAfter(url, "/get/", false);   // 取 "/get/" 之后的
```

**② `CollUtil` —— 集合判空 + 操作**

```java
if (CollUtil.isEmpty(list)) { return; }            // null 和空集合都算空
if (CollUtil.isNotEmpty(list)) { }

List<Long> ids = CollUtil.newArrayList(1L, 2L);    // 不用写 new ArrayList<>() + add
Set<Long> idSet = CollUtil.toSet(list, UserDO::getId);   // List 转 Set（抽取字段）

// 求差集：找出"需要删除的"
List<Long> toDelete = CollUtil.subtract(oldIds, newIds);
```

**③ `MapUtil` —— Map 操作**

```java
// 从 Map 取值，取到就执行逻辑（芋道到处在用这个）
MapUtil.findAndThen(deptMap, vo.getDeptId(),
    dept -> vo.setDeptName(dept.getName()));
// 等价于：
// DeptDO dept = deptMap.get(vo.getDeptId());
// if (dept != null) { vo.setDeptName(dept.getName()); }

String name = MapUtil.getStr(map, "name");         // 取出来直接是 String
```

**④ `IdUtil` —— 生成 ID**

```java
String uuid = IdUtil.fastSimpleUUID();             // 不带横线的 UUID，文件名常用
// 例：822aebded6e6414e912534c6091771a4.jpg（见 [[文件存储（上传下载）]]）
```

**⑤ `DateUtil` / `LocalDateTimeUtil` —— 时间**

```java
String now = DateUtil.now();                       // "2026-09-06 14:30:00"
Date tomorrow = DateUtil.offsetDay(new Date(), 1); // 明天
long days = DateUtil.between(start, end, DateUnit.DAY);   // 相差天数
```

---

## 二、芋道自研的 Utils（补 Hutool 的缺）

在 `yudao-common` 的 `util` 包下，**以 `Utils` 结尾**：

| 类 | 作用 | 高频方法 |
|---|---|---|
| ⭐ `JsonUtils` | JSON 序列化/反序列化 | `toJsonString` / `parseObject` / `parseArray` |
| ⭐ `BeanUtils` | 对象转换（**增强版，支持 List/Page**） | `toBean`（详见 [[VO 对象转换、数据翻译]]） |
| `ServletUtils` | Servlet 响应操作 | `writeJSON` / `writeAttachment`（下载文件） |
| `NumberUtils` | 数字转换 | `toLong` / `toInt` |
| `CollectionUtils` | 集合增强（**比 Hutool 多了"抽取字段"**） | `convertSet` / `convertMap` / `convertList` / `diffList` |
| `DateUtils` | 时间增强 | `buildTime` / `isBetween` |
| `StringUtils` | 字符串增强 | `maxLength` / `trim` |
| `ObjectUtils` | 对象增强 | `clone` / `max` / `min` |
| `ValidationUtils` | 校验 | `isMobile` / `isEmail` |
| `SpringUtils` | Spring 工具 | `getBean` / `getApplicationName` |

### ⭐ `CollectionUtils` —— 芋道写得最顺手的增强

```java
// 从对象列表里抽某个字段，组成 Set（避免 N+1 时必备）
Set<Long> deptIds = convertSet(userList, UserDO::getDeptId);
// 等价于：userList.stream().map(UserDO::getDeptId).collect(Collectors.toSet());

// 抽成 Map（key = 某字段，value = 对象本身）
Map<Long, DeptDO> deptMap = convertMap(deptList, DeptDO::getId);
// 然后批量查，再 MapUtil.findAndThen 填充 → 避免 N+1

// 转成另一种类型的 List
List<Long> ids = convertList(userList, UserDO::getId);

// 计算差集，得到"要新增/要删除/要更新"的三份（批量更新场景神器）
List<Long> toCreate = diffList(newIds, oldIds);
```

💡 **这个套路在芋道里到处都是**：
```java
// 标准写法：先抽 id → 批量查 → 转 Map → 填充 VO
Set<Long> deptIds = convertSet(pageResult.getList(), UserDO::getDeptId);
Map<Long, DeptDO> deptMap = deptService.getDeptMap(deptIds);
return success(BeanUtils.toBean(pageResult, UserRespVO.class, vo -> {
    MapUtils.findAndThen(deptMap, vo.getDeptId(), dept -> vo.setDeptName(dept.getName()));
}));
```

### ⭐ `ServletUtils` —— 文件下载

```java
@GetMapping("/export")
public void export(HttpServletResponse response) throws IOException {
    byte[] content = generateExcel();
    ServletUtils.writeAttachment(response, "用户列表.xls", content);
    // 设置 Content-Disposition: attachment，让浏览器下载而不是打开
}
```

---

## 三、Lombok：消除样板代码

**Lombok 用注解在编译期自动生成 getter/setter/构造器等**，让 Java 也能"甜甜的"。

### 全局配置

项目根目录有 `lombok.config`：

```properties
# 开启链式调用：new UserDO().setId(1L).setName("张三")
lombok.accessors.chain = true

# 生成的 toString/hashCode/equals 会调用父方法（继承 BaseDO 时必须开）
lombok.equalsAndHashCode.callSuper = true
lombok.toString.callSuper = true
```

### 常用注解

| 注解 | 作用 | 说明 |
|---|---|---|
| `@Data` | getter + setter + toString + equals + hashCode | **最常用** |
| `@Getter` / `@Setter` | 只生成 getter / setter | 字段或类上 |
| `@NoArgsConstructor` | 无参构造 | MyBatis 需要 |
| `@AllArgsConstructor` | 全参构造 | |
| `@Builder` | 建造者模式 | `UserDO.builder().id(1L).build()` |
| `@Slf4j` | 生成 `log` 对象 | **不用再写 `private static final Logger log = ...`** |
| `@EqualsAndHashCode(callSuper = true)` | equals/hashCode 包含父类字段 | **继承 `BaseDO` 时必加** |

### 示例：一个标准的 DO

```java
@Data                                              // getter/setter/toString...
@EqualsAndHashCode(callSuper = true)               // ← 继承 BaseDO 时必加
@TableName("system_user")
public class UserDO extends TenantBaseDO {
    private Long id;
    private String username;
    private String password;
}
```

⚠️ **`@EqualsAndHashCode(callSuper = true)` 忘了会怎样？**

`equals()` 只比较本类的字段，**忽略父类的 `id`、`createTime`**。结果：`new UserDO(1L).equals(new UserDO(2L))` 返回 `true`（如果其他字段都一样）—— **极其隐蔽的 bug**。

### 链式调用

```java
// 因为 lombok.accessors.chain = true，setter 返回 this
UserDO user = new UserDO()
    .setId(1L)
    .setUsername("zhangsan")
    .setPassword("123456");
```

比一行行 `user.setXxx()` 清爽多了。

---

## 四、HTTP 调用外部接口

芋道给了两种方案：

**方案一：Feign（声明式，推荐用于服务间调用）**

```java
@FeignClient(name = "xxx-service")
public interface XxxApi {
    @GetMapping("/xxx/get")
    String get(@RequestParam("id") Long id);
}
```

适合：微服务之间、有服务发现的场景。

**方案二：`HttpUtil`（Hutool 自带，简单粗暴）**

```java
String result = HttpUtil.get("https://api.example.com/user?id=1");
String result2 = HttpUtil.post("https://api.example.com/user", params);
```

适合：调用第三方开放 API（微信、支付宝、短信服务商等）。

---

## 五、实战：一个典型的 Service 方法用到哪些工具

```java
@Service
@Slf4j                                   // ← Lombok：log 对象
public class UserServiceImpl implements UserService {

    @Resource
    private UserMapper userMapper;
    @Resource
    private DeptService deptService;

    @Override
    @Transactional
    public Long createUser(UserSaveReqVO reqVO) {
        // ① 校验：Hutool 的 StrUtil
        if (StrUtil.isBlank(reqVO.getUsername())) {
            throw exception(USER_USERNAME_NOT_EMPTY);
        }

        // ② 查重
        if (userMapper.selectByUsername(reqVO.getUsername()) != null) {
            throw exception(USER_USERNAME_EXISTS, reqVO.getUsername());
        }

        // ③ 转换：芋道的 BeanUtils
        UserDO user = BeanUtils.toBean(reqVO, UserDO.class);
        user.setPassword(encodePassword(reqVO.getPassword()));

        // ④ 落库
        userMapper.insert(user);
        log.info("[createUser][用户({}) 创建成功]", user.getId());   // ← @Slf4j

        return user.getId();
    }

    @Override
    public PageResult<UserRespVO> getUserPage(UserPageReqVO reqVO) {
        PageResult<UserDO> pageResult = userMapper.selectPage(reqVO);
        if (CollUtil.isEmpty(pageResult.getList())) {          // ← Hutool CollUtil
            return PageResult.empty();
        }

        // 避免 N+1：抽 id → 批量查 → 转 Map
        Set<Long> deptIds = convertSet(pageResult.getList(), UserDO::getDeptId);  // ← 芋道 CollectionUtils
        Map<Long, DeptDO> deptMap = deptService.getDeptMap(deptIds);

        return BeanUtils.toBean(pageResult, UserRespVO.class, vo -> {
            MapUtils.findAndThen(deptMap, vo.getDeptId(),      // ← Hutool MapUtil
                dept -> vo.setDeptName(dept.getName()));
        });
    }
}
```

---

## 六、踩坑与最佳实践

### ⚠️ 坑 1：混用 `StrUtil.isEmpty` 和 `isBlank`

```java
String s = "   ";
StrUtil.isEmpty(s)     // false（有字符）
StrUtil.isBlank(s)    // true（trim 后为空）

// ✅ 用户输入校验一律用 isBlank
```

### ⚠️ 坑 2：`CollUtil.isEmpty` 的 null 安全

```java
List<String> list = null;
list.isEmpty()           // 💥 NullPointerException
CollUtil.isEmpty(list)   // true ✅ 安全
```

**永远用 `CollUtil.isEmpty()`，别用 `list.isEmpty()`。**

### ⚠️ 坑 3：忘了 `@EqualsAndHashCode(callSuper = true)`

见上文第三节，**继承 `BaseDO` 时必加**。

### ⚠️ 坑 4：在 Stream 里用 `Collectors.toMap` 遇到 null value

```java
// ❌ 会 NPE（Collectors.toMap 不允许 value 为 null）
Map<Long, String> map = list.stream()
    .collect(Collectors.toMap(DeptDO::getId, DeptDO::getParentName));

// ✅ 用芋道的 convertMap，内部处理了 null
Map<Long, DeptDO> map = convertMap(list, DeptDO::getId);
```

### 💡 最佳实践 1：写工具方法前先搜一遍

```
IDEA 里按两次 Shift → 输入 "字符串 判空" / "StrUtil"
先看看 Hutool 和 yudao-common 有没有现成的
```

**重复造轮子是团队代码腐化的开始。**

### 💡 最佳实践 2：业务相关的工具方法放 `yudao-common`

如果你的工具方法**多个模块都要用**，别放在某个业务模块里：

```java
// ❌ 放在 yudao-module-crm 里，system 模块用不了
// ✅ 放在 yudao-common 的 util 包，命名 XxxUtils
```

---

## 七、一句话总结

**工具方法优先用 Hutool（`StrUtil`/`CollUtil`/`MapUtil` 三个最高频），业务相关的用 `yudao-common` 的 `XxxUtils`（尤其 `CollectionUtils` 的 `convertSet`/`convertMap`，是避免 N+1 的神器）。实体类必加 `@Data` + `@EqualsAndHashCode(callSuper = true)`（继承 BaseDO 时）。写任何工具方法前，先确认是不是已经有人造过轮子了。**

---

## 关联笔记

- [[MyBatis 数据库]] — `BaseDO` 与 `@EqualsAndHashCode(callSuper = true)`
- [[VO 对象转换、数据翻译]] — `BeanUtils.toBean()` 详解
- [[新建模块]] — `yudao-common` 在模块结构中的位置
- [[代码生成【单表】]] — 生成的代码里大量使用这些工具类
- [[单元测试]] — `RandomUtils` 也是芋道的工具类

## 附录：速查卡片

```java
// ===== 判空（永远用 Hutool）=====
StrUtil.isBlank(str)          // null / "" / "  "
StrUtil.isNotBlank(str)
CollUtil.isEmpty(list)        // null / 空集合
CollUtil.isNotEmpty(list)
ObjectUtil.isNull(obj)

// ===== 字符串 =====
StrUtil.format("{} - {}", a, b)
StrUtil.subAfter(url, "/get/", false)
StrUtil.maxLength(str, 100)   // 芋道 StringUtils

// ===== 集合（芋道增强）=====
convertSet(list, XxxDO::getId)        // 抽字段成 Set
convertMap(list, XxxDO::getId)        // 转 Map
convertList(list, XxxDO::getId)       // 抽字段成 List
MapUtil.findAndThen(map, key, v -> {})  // 取到就执行

// ===== 对象转换 =====
BeanUtils.toBean(do, XxxRespVO.class)
BeanUtils.toBean(list, XxxRespVO.class)
BeanUtils.toBean(pageResult, XxxRespVO.class)
BeanUtils.toBean(page, XxxRespVO.class, vo -> { /* 补字段 */ })

// ===== JSON =====
JsonUtils.toJsonString(obj)
JsonUtils.parseObject(json, XxxVO.class)
JsonUtils.parseArray(json, XxxVO.class)

// ===== ID / 时间 =====
IdUtil.fastSimpleUUID()
DateUtil.now()

// ===== 日志 =====
@Slf4j  // 类上加，然后直接 log.info(...)
```
