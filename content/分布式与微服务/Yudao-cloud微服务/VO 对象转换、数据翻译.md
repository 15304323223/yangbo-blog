---
tags:
  - Java
  - Yudao
  - MapStruct
  - BeanUtils
  - easy-trans
  - 数据翻译
date: 2026-09-06
source: 芋道 ruoyi-vue-pro 开发指南 - 后端手册 - VO 对象转换、数据翻译
title: "VO 对象转换、数据翻译"
---

# VO 对象转换、数据翻译

> **一句话概括**：**对象转换** = 把一个对象的属性"抄"到另一个对象上（比如 `UserDO` → `UserVO`）；**数据翻译** = 把一个字段"翻译"成另一个字段（比如 `deptId=10` → `deptName="技术部"`）。芋道用 **BeanUtils + MapStruct** 解决前者，用 **easy-trans** 解决后者。

**适合谁读**：写接口被"复制属性"代码恶心到的人、搞不清 `DO/VO/DTO/BO` 该用哪个的人、见过 `@Trans` 注解但不明原理的人。
**怎么读**：「零」搞懂为什么要分这么多 O，「一」学转换，「二」学翻译，「三」看坑。

---

## 零、先建立整体印象：快递的"重新打包"

想象你开网店发货：

```
仓库里的货（DO）    →    打包给客户（VO）    →     快递单（DTO）
   原始、完整              按需裁剪、加说明           系统间流转用
```

为什么不能直接把仓库的货发给客户？

| 现实原因 | 对应到代码 |
|---|---|
| 不能把进货价、供应商信息给客户看 | DO 里有 `password`、`deleted`、`creator` 等**敏感/内部字段**，不能返回给前端 |
| 客户要的是"礼盒装"，还要贺卡 | VO 需要**额外字段**，比如 `deptName`、`roleNames`（DO 里没有） |
| 大件家具要拆成零件分箱发 | 复杂结构需要**手工组装** |

所以就有了这几个"O"：

| 缩写 | 全称 | 用在哪 | 例子 |
|---|---|---|---|
| **DO** | Data Object | 和数据库表一一对应，只在 DAO/Service 层 | `UserDO`（含 password） |
| **VO** | View Object | **返回给前端** | `UserRespVO`（不含 password，多了 deptName） |
| **DTO** | Data Transfer Object | 模块之间传递 | `UserDTO`（给别的模块调 API 用） |
| **BO** | Business Object | 业务计算的中间产物 | 报表统计结果 |
| **ReqVO** | Request VO | **接收前端请求参数** | `UserSaveReqVO` |

💡 **记忆口诀**：
- **`RespVO` = 出参**（Response，返回给前端）
- **`ReqVO` = 入参**（Request，前端传进来）
- 看到这两个后缀，你就知道它是 VO 家族的。

---

## 一、对象转换：怎么把 A 抄成 B

### 1.1 芋道提供了两种方案

| 方案 | 性能 | 用法 | 芋道推荐 |
|---|---|---|---|
| **MapStruct** | 略好（编译期生成代码，没有反射） | 写一个 `XxxConvert` 接口 | 复杂/高频场景 |
| **BeanUtils** | 略差（反射） | 一行代码 | **一般项目用它就行 ✅** |

> 芋道官方原话：*"相比来说，MapStruct 性能会略好于 BeanUtils，但是相比数据库操作带来的耗时来说，基本可以忽略不计。因此，一般情况下，建议使用 BeanUtils 即可。"*

💡 **说人话**：一次数据库查询 5ms，MapStruct 转换 0.001ms，BeanUtils 0.01ms。**差的那 0.009ms 在一整次请求里连零头都算不上**。别为了这点性能把代码搞复杂。

### 1.2 MapStruct：编译期生成转换代码

在每个 `yudao-module-xxx-biz` 模块的 **`convert` 包**下，能看到各业务的 Convert 接口：

```java
// UserConvert.java
@Mapper(componentModel = "spring")   // ← 交给 Spring 管理，别的地方能 @Resource 注入
public interface UserConvert {

    UserConvert INSTANCE = Mappers.getMapper(UserConvert.class);

    // 单个对象转换
    UserRespVO convert(UserDO bean);

    // List 转换
    List<UserRespVO> convertList(List<UserDO> list);

    // 分页转换
    PageResult<UserRespVO> convertPage(PageResult<UserDO> page);

    // 字段不一样时，手动指定映射关系
    @Mapping(source = "createTime", target = "createdAt")   // 字段名不同
    @Mapping(target = "deptName", ignore = true)            // 这个字段不自动映射，我后面自己填
    UserDetailRespVO convertDetail(UserDO bean);
}
```

**原理**：MapStruct 在**编译期**（`mvn compile` 时）生成一个 `UserConvertImpl` 实现类，里面是**纯手写的 getter/setter 调用**：

```java
// 自动生成的，你看不见但在 target/generated-sources 里
public UserRespVO convert(UserDO bean) {
    UserRespVO vo = new UserRespVO();
    vo.setId(bean.getId());              // 手写 setter，无反射，所以快
    vo.setUsername(bean.getUsername());
    vo.setCreateTime(bean.getCreateTime());
    return vo;
}
```

✅ **优点**：性能好、字段名写错了**编译期就报错**（不是运行时才发现）。
❌ **缺点**：改字段要重新编译，IDE 需要装 MapStruct 插件才爽。

### 1.3 BeanUtils：芋道自己封装的一层

芋道没有直接用 Hutool 的 `BeanUtil`，而是**又包了一层** `cn.iocoder.yudao.framework.common.util.object.BeanUtils`。

**为什么要多包一层？**（官方给了两条理由）

1. **方便替换实现**：哪天想把 Hutool 换成 Spring BeanUtils 或 BeanCopier，只改这一个文件，全项目生效。
2. **特性增强**：额外支持 **List、Page 对象的转换**，还支持 **Consumer 二次加工**。

#### 场景一：简单转换（一行搞定）

```java
// 单个对象
UserRespVO vo = BeanUtils.toBean(userDO, UserRespVO.class);

// List 转换（Hutool 原生不支持，芋道增强了）
List<UserRespVO> voList = BeanUtils.toBean(userDOList, UserRespVO.class);

// Page 分页转换（这个最常用的！）
PageResult<UserDO> pageResult = userMapper.selectPage(reqVO);
return BeanUtils.toBean(pageResult, UserRespVO.class);
//  ↑ 连 total 都帮你带上，返回一个新的 PageResult<UserRespVO>
```

#### 场景二：复杂转换（用 Consumer 二次加工）

转换完还要**补字段**怎么办？加个 `Consumer`：

```java
@GetMapping("/page")
public CommonResult<PageResult<UserRespVO>> getUserPage(UserPageReqVO reqVO) {
    PageResult<UserDO> pageResult = userService.getUserPage(reqVO);

    // toBean 的第三个参数：转换完每个元素后再做点什么
    return success(BeanUtils.toBean(pageResult, UserRespVO.class, userVO -> {
        // 补充部门名称
        DeptDO dept = deptService.getDept(userVO.getDeptId());
        userVO.setDeptName(dept != null ? dept.getName() : null);
        // 补充角色列表
        userVO.setRoles(roleService.getRoleListByUserId(userVO.getId()));
    }));
}
```

⚠️ **注意这个 Consumer 里的 `deptService.getDept()`** —— 如果列表有 100 条，就会查 100 次部门表。这就是**经典的 N+1 问题**，见 [[MyBatis 联表分页查询]]。

#### 场景三：Consumer 太复杂，挪到 Convert 类里

官方建议：**如果 Consumer 逻辑比较复杂，又希望 Controller 代码精简，就放到 Convert 类里。**

```java
// UserConvert.java
@Mapper(componentModel = "spring")
public interface UserConvert {
    UserRespVO convert(UserDO bean);

    // 自定义一个"带部门名"的转换方法
    default UserRespVO convertWithDept(UserDO bean, DeptDO dept) {
        UserRespVO vo = convert(bean);
        vo.setDeptName(dept != null ? dept.getName() : null);
        return vo;
    }
}

// Controller 里就干净了
return success(BeanUtils.toBean(pageResult, UserRespVO.class, vo -> {
    vo.setDeptName(deptMap.get(vo.getDeptId()));   // 先批量查好放 Map 里，避免 N+1
}));
```

---

## 二、数据翻译：把 id 翻译成名字

### 2.1 什么是数据翻译？

**场景**：数据库里 `system_users` 表只存了 `dept_id = 10`，但前端表格要显示"技术部"而不是"10"。

**两种解法**：

| 方案 | 做法 | 优点 | 缺点 |
|---|---|---|---|
| **方案一：SQL 联表** | `SELECT u.*, d.name FROM system_users u LEFT JOIN system_dept d ON u.dept_id = d.id` | 一次查询搞定 | SQL 复杂、分页麻烦、跨模块难 |
| **方案二：多次单表 + Java 拼接**（芋道推荐 ✅） | 先查用户，再查部门，Java 里拼起来 | SQL 简单、可跨模块、**减少数据库压力** | 代码多一点 |

> 芋道官方原话：*"项目里，大多数采用'方案二'，因为这样可以减少数据库的压力，避免 SQL 过于复杂，也方便后续维护。"*

💡 **为什么方案二反而"减少数据库压力"？**
因为 JOIN 在数据库里做，数据库是最贵的资源、最难扩容的。放到 Java 里做，应用服务器可以随便加机器。**在高并发场景，把计算从 DB 挪到 App 是标准优化手段。**

### 2.2 手写太麻烦？用 easy-trans，一个注解搞定

芋道集成了 **easy-trans** 框架。用法：

#### 场景一：模块内翻译（同一个模块里的表）

**例子**：`OperateLogRespVO`（操作日志）属于 `yudao-module-system`，要读同模块的 `AdminUserDO`。

**第一步**：给 VO 实现 `com.fhs.core.trans.vo.VO` 接口

```java
@Data
public class OperateLogRespVO implements VO {    // ← 实现这个接口（空接口，只是个标记）
    private Long id;
    private Long userId;
    private String userNickname;                 // ← 要被自动填充的字段
}
```

**第二步**：给字段加 `@Trans` 注解

```java
public class OperateLogRespVO implements VO {

    @Trans(type = TransType.SIMPLE,              // 简单翻译：走 MyBatis Plus 查单表
           target = AdminUserDO.class,           // 目标：去查哪个 DO
           fields = "nickname",                  // 取目标 DO 的哪个字段
           ref = "userNickname")                 // 填到本 VO 的哪个字段
    private Long userId;                         // ← 注解打在【源字段】上
}
```

**四个属性解释**：

| 属性 | 含义 | 例子 |
|---|---|---|
| `type` | 翻译类型 | `TransType.SIMPLE` 简单翻译（走 MyBatis Plus 单表查询） |
| `target` | 目标 DO 的**类** | `AdminUserDO.class` |
| `fields` | 读目标 DO 的**哪些字段**（可多个，是数组） | `"nickname"` 或 `{"nickname", "deptId"}` |
| `ref` | 填到本 VO 的**哪些字段**（多个用 `refs`） | `"userNickname"` |

⚠️ **易错点**：注解打在**源字段**（`userId`）上，不是打在目标字段（`userNickname`）上。很多人第一次会搞反。

#### 场景二：跨模块翻译（读别的模块的表）

**例子**：`CrmProductRespVO`（CRM 模块的产品）要读 `yudao-module-system` 的 `AdminUserDO`。

```java
public class CrmProductRespVO implements VO {

    @Trans(type = TransType.RPC,                 // ← 改成 RPC
           targetClassName =                     // ← 注意：用【全路径字符串】，不是 target = Xxx.class
               "cn.iocoder.yudao.module.system.dal.dataobject.user.AdminUserDO",
           fields = "nickname",
           ref = "ownerUserName")
    private Long ownerUserId;
}
```

**为什么这里用 `targetClassName`（字符串）而不是 `target`（Class）？**

> 官方解释得很实在：*"'跨模块翻译'使用 targetClassName 属性的原因，是因为拿不到跨模块的 DO 实体类 = ="*

💡 **说人话**：CRM 模块的 Maven 依赖里没有 system 模块的 DO 类（模块间只依赖 `-api` 包，不依赖 `-biz` 包），编译器不认识 `AdminUserDO.class`，只能用字符串全路径反射加载。

顺带说一句，**`TransType.RPC` 听起来是远程调用，实际上多模块在同一个 Java 进程里，底层还是走 MyBatis Plus 查本地库**。官方说后续作者会统一改成 `SIMPLE`。

#### 场景三：Excel 导出的翻译

Excel 导出不走 Spring MVC 的自动翻译，所以要**手动调一次**：

```java
@GetMapping("/export")
public void exportExcel(HttpServletResponse response) {
    List<UserExcelVO> list = userService.getUserListForExport();

    TranslateUtils.translate(list);              // ← 手动触发翻译

    ExcelUtils.write(response, "用户列表.xls", "数据", UserExcelVO.class, list);
}
```

> 本质就是 easy-trans 的"手动翻译"模式。详见 [[Excel 导入导出]]。

### 2.3 自动翻译是怎么生效的？

芋道配置了 `easy-trans.is-enable-global = true`，**开启全局翻译**。

意思是：**所有 Spring MVC 接口返回的、实现了 `VO` 接口的 RespVO，都会被自动翻译。**

```
Controller return CommonResult<UserRespVO>
   │
   ▼ Spring MVC 的返回值拦截器（ResponseBodyAdvice）
   │
   ▼ easy-trans 扫描对象上的 @Trans 注解
   │
   ▼ 批量查库、填充字段
   │
   ▼ 序列化成 JSON 返回前端
```

**想关掉某个接口的自动翻译？** 加 `@TransIgnore`：

```java
@GetMapping("/big-list")
@TransIgnore              // ← 不翻译，直接返回
public CommonResult<List<UserRespVO>> getBigList() {
    return success(userService.getBigList());
}
```

⚠️ **什么时候该关？** 官方建议：

> *"如果一个 Spring MVC 接口的返回数据比较多，或者 RespVO 是个树形结构，建议添加 @TransIgnore 注解。原因是，easy-trans 全局有递归推断，在数据规模较大的情况下，可能会导致性能问题。"*

💡 **翻译一下**：easy-trans 会**递归遍历**你返回对象的所有层级。如果你返回一个 1000 个节点的菜单树，它会把每个节点都扫一遍 —— 很慢。

**想让普通方法也自动翻译？** 加 `@TransMethodResult`（基于 Spring AOP）：

```java
@TransMethodResult        // ← 普通方法也能自动翻译返回值
public UserRespVO buildUserVO(UserDO user) {
    return BeanUtils.toBean(user, UserRespVO.class);
}
```

---

## 三、进阶篇：踩坑与最佳实践

### 坑 1：忘了实现 `VO` 接口，`@Trans` 完全没反应

**症状**：加了注解，但字段一直是 null。
**原因**：easy-trans 只处理实现了 `com.fhs.core.trans.vo.VO` 接口的对象。
**解决**：`implements VO`。

### 坑 2：`@Trans` 打错字段

```java
// ❌ 错：打在目标字段上
@Trans(...)
private String userNickname;

// ✅ 对：打在源字段上
@Trans(...)
private Long userId;
private String userNickname;
```

### 坑 3：N+1 查询

虽然 easy-trans 内部有缓存/批量优化，但**大列表 + 多种翻译**还是可能产生大量 SQL。

**排查方法**：开 MyBatis SQL 日志，看一次请求打了多少条 SQL。

**解决**：
- 数据量大的接口加 `@TransIgnore`，前端改用别的接口查字典
- 或者自己批量查好放 Map，用 `BeanUtils.toBean(..., consumer)` 手工填

### 坑 4：树形结构 + 全局翻译 = 性能灾难

菜单树、部门树这种递归结构，**务必加 `@TransIgnore`**，否则递归推断能把接口拖到几秒。

### 坑 5：MapStruct 改了字段没重新编译

**症状**：新加的字段一直是 null。
**原因**：MapStruct 生成的实现类还是旧的。
**解决**：`mvn clean compile` 重新编译，或 IDEA 里 `Build → Rebuild Project`。

### 坑 6：循环引用导致 JSON 序列化爆栈

`UserDO` 里有 `dept`，`DeptDO` 里又有 `users` → Jackson 无限递归 → `StackOverflowError`。

**解决**：VO 里不要放完整的 DO 对象，只放扁平字段（`deptName` 而不是 `dept`）。**这也是为什么要分层用 VO 而不是直接返回 DO 的原因之一。**

### 坑 7：把 password 泄露出去了

```java
// ❌ 危险：直接把 DO 返回前端，password、deleted、creator 全暴露
@GetMapping("/get")
public CommonResult<UserDO> get(Long id) {
    return success(userMapper.selectById(id));
}

// ✅ 正确：转成 VO，VO 里根本没有 password 字段
@GetMapping("/get")
public CommonResult<UserRespVO> get(Long id) {
    return success(BeanUtils.toBean(userMapper.selectById(id), UserRespVO.class));
}
```

⚠️ **这是安全问题，不是代码风格问题。** 永远不要直接把 DO 返回给前端。

### 最佳实践：一个典型接口长什么样

```java
@RestController
@RequestMapping("/system/user")
public class UserController {

    @Resource
    private UserService userService;
    @Resource
    private DeptService deptService;

    @GetMapping("/page")
    @PreAuthorize("@ss.hasPermission('system:user:list')")   // 功能权限，见 [[功能权限]]
    public CommonResult<PageResult<UserRespVO>> getUserPage(UserPageReqVO reqVO) {
        // ① 查分页数据（返回 DO）
        PageResult<UserDO> pageResult = userService.getUserPage(reqVO);

        if (CollUtil.isEmpty(pageResult.getList())) {
            return success(PageResult.empty());
        }

        // ② 批量查部门，避免 N+1
        Set<Long> deptIds = convertSet(pageResult.getList(), UserDO::getDeptId);
        Map<Long, DeptDO> deptMap = deptService.getDeptMap(deptIds);

        // ③ 转换成 VO，用 Consumer 补字段
        return success(BeanUtils.toBean(pageResult, UserRespVO.class, vo -> {
            MapUtils.findAndThen(deptMap, vo.getDeptId(), dept -> vo.setDeptName(dept.getName()));
        }));
    }
}
```

这个套路在芋道里到处都是：**批量查 → 转 Map → toBean + Consumer 填充**。

---

## 四、一句话总结

**对象转换用 `BeanUtils.toBean()`（支持 List/Page，还能加 Consumer 补字段），复杂场景再上 MapStruct；数据翻译用 easy-trans 的 `@Trans` 注解（VO 要实现 `VO` 接口，注解打在源字段上），大列表和树形结构记得加 `@TransIgnore` 关掉全局翻译。永远不要把 DO 直接返回给前端。**

---

## 关联笔记

- [[MyBatis 联表分页查询]] — 另一种"翻译"思路：SQL JOIN
- [[分页实现]] — `PageResult` 的转换就靠 `BeanUtils.toBean`
- [[Excel 导入导出]] — Excel 导出需要手动 `TranslateUtils.translate()`
- [[MyBatis 数据库]] — `BaseDO` 与 DO 的字段规范
- [[功能权限]] — 接口上的 `@PreAuthorize` 示例
- [[文件存储（上传下载）]] — 导出文件的下载

## 附录：官方截图索引

图片位于 `99_附件_资源文件/Yudao-Cloud/`：

| 截图 | 内容 |
|---|---|
| `VO_对象转换_数据翻译-1.png` | 各模块 `convert` 包下的 Convert 接口 |
| `VO_对象转换_数据翻译-2.png` | `BeanUtils.toBean()` 简单场景用法 |
| `VO_对象转换_数据翻译-3.png` | `BeanUtils` + Consumer 复杂场景用法 |
| `VO_对象转换_数据翻译-4.png` | Convert 类里封装复杂转换逻辑 |
