---
tags:
  - Java
  - Yudao
  - Excel
  - EasyExcel
  - 导入导出
date: 2026-09-06
source: 芋道 ruoyi-vue-pro 开发指南 - 后端手册 - Excel 导入导出
title: "Excel 导入导出"
---

# Excel 导入导出

> **一句话概括**：芋道用阿里开源的 **EasyExcel**（低内存、能扛百万行），你只要写一个带 `@ExcelProperty("列名")` 注解的 VO 类，然后调 `ExcelUtils.write()` 导出、`ExcelUtils.read()` 导入 —— **和写普通接口没区别**。

**适合谁读**：所有做后台管理系统的（导出报表是刚需）。
**怎么读**：「一」学导出（最常用）、「二」学导入、「三」的**转换器**是本篇亮点（把 `status=1` 自动转成"开启"）。

---

## 零、先建立整体印象：为什么是 EasyExcel？

Java 处理 Excel 的老牌库是 Apache POI，但它**内存爆炸**：

| | POI（老式） | EasyExcel（芋道采用 ✅） |
|---|---|---|
| **原理** | 一次性把整个文件读进内存 | **逐行读取**（SAX 流式解析），读一行处理一行 |
| **内存** | 一个 10MB 的 Excel 可能占几百 MB | 官方数据：**64M 内存，20 秒读完 75M（46 万行 25 列）** |
| **OOM 风险** | 高 😱 | 极低 ✅ |

> 官方介绍：*"EasyExcel 是阿里开源的 Excel 工具库，具有简单易用、低内存、高性能的特点。在尽可能节约内存的情况下，支持百万行的 Excel 读写操作。"*

💡 **类比**：
- POI = 把一整本书复印下来再翻看
- EasyExcel = 一边翻一边看，看完一页撕一页

**技术组件**：`yudao-spring-boot-starter-excel`

---

## 一、Excel 导出

### 1.1 完整流程（以"岗位管理"为例）

**后端接口**：

```java
// PostController.java
@GetMapping("/export")
@Operation(summary = "导出岗位 Excel")
@PreAuthorize("@ss.hasPermission('system:post:export')")   // 权限，见 [[功能权限]]
@ApiAccessLog(operateType = EXPORT)                        // 访问日志，见 [[操作日志、访问日志、异常日志]]
public void export(HttpServletResponse response,
                   @Validated PostPageReqVO reqVO) throws IOException {
    // ① 查询数据：复用分页接口，但要【关掉分页】
    reqVO.setPageSize(PageParam.PAGE_SIZE_NONE);
    List<PostDO> list = postService.getPostPage(reqVO).getList();

    // ② 导出 Excel
    ExcelUtils.write(response, "岗位数据.xls", "岗位列表", PostRespVO.class,
            BeanUtils.toBean(list, PostRespVO.class));
    //                        ↑ 文件名      ↑ sheet名   ↑ VO 类型      ↑ 数据（DO 转 VO）
}
```

⚠️ **两个关键点**（官方标注的）：

**① `setPageSize(PageParam.PAGE_SIZE_NONE)`**

导出要的是**全部数据**，不是第一页。这个常量表示"不做分页限制"。详见 [[分页实现]]。

**② 先转成 VO 再导出**

不要直接把 `PostDO` 列表扔进去 —— DO 里有 `creator`、`deleted` 这些不该出现在 Excel 里的字段。

### 1.2 Excel VO 类怎么写

芋道的做法是**复用 `PostRespVO`**（不单独建 `PostExcelVO`）：

```java
@Schema(description = "管理后台 - 岗位信息 Response VO")
@Data
@ExcelIgnoreUnannotated          // ③ 没有 @ExcelProperty 的字段不导出
public class PostRespVO {

    @Schema(description = "岗位序号", example = "1024")
    @ExcelProperty("岗位序号")     // ① Excel 表头名字
    private Long id;

    @Schema(description = "岗位名称", example = "小土豆")
    @ExcelProperty("岗位名称")
    private String name;

    @Schema(description = "岗位编码", example = "yudao")
    @ExcelProperty("岗位编码")
    private String code;

    @Schema(description = "显示顺序", example = "1024")
    @ExcelProperty("岗位排序")     // ← 表头名可以和字段名不一样
    private Integer sort;

    @Schema(description = "状态", example = "1")
    @ExcelProperty(value = "状态", converter = DictConvert.class)   // ② 字典转换器
    @DictFormat(DictTypeConstants.COMMON_STATUS)                    // ← 指定字典类型
    private Integer status;

    private String remark;         // ← 没有 @ExcelProperty，被 ③ 排除

    private LocalDateTime createTime;  // ← 同样被排除
}
```

**三个要点**：

| # | 要点 | 说明 |
|---|---|---|
| ① | `@ExcelProperty("列名")` | 声明 Excel 表头。改个中文名就行 |
| ② | `converter = DictConvert.class` + `@DictFormat` | 把 `status=1` 转成"开启"（见「三」） |
| ③ | `@ExcelIgnoreUnannotated` | **类级别**注解：没加 `@ExcelProperty` 的字段不导出 |

💡 **`remark` 和 `createTime` 为什么没导出？** 就是因为有 `@ExcelIgnoreUnannotated`。**这个注解强烈建议加上** —— 否则以后你在 VO 里加个字段，Excel 就莫名其妙多一列。

### 1.3 ExcelUtils.write 做了什么

```java
public static <T> void write(HttpServletResponse response, String filename,
                              String sheetName, Class<T> head, List<T> data) throws IOException {
    // ① 设置响应头（告诉浏览器这是个要下载的文件）
    response.setContentType("application/vnd.ms-excel");
    response.setCharacterEncoding("utf-8");
    response.setHeader("Content-Disposition",
            "attachment;filename=" + URLEncoder.encode(filename, "UTF-8"));

    // ② 用 EasyExcel 写到 response 的输出流
    EasyExcel.write(response.getOutputStream(), head)
            .sheet(sheetName)
            .doWrite(data);
}
```

**前端**调用（`/views/system/post/index.vue`）：

```javascript
const handleExport = async () => {
  // 直接下载，注意要用 responseType: 'blob'
  await PostApi.exportPost(queryParams)
}
```

---

## 二、Excel 导入

### 2.1 后端接口

```java
// UserController.java
@PostMapping("/import")
@Operation(summary = "导入用户")
@PreAuthorize("@ss.hasPermission('system:user:import')")
@ApiAccessLog(operateType = IMPORT)
public CommonResult<UserImportRespVO> importExcel(@RequestParam("file") MultipartFile file)
        throws Exception {
    // ① 读取 Excel 成 VO 列表
    List<UserImportExcelVO> list = ExcelUtils.read(file, UserImportExcelVO.class);

    // ② 业务处理：校验 + 落库，返回成功/失败明细
    return success(userService.importUserList(list, updateSupport));
}
```

### 2.2 导入 VO 类

```java
@Data
public class UserImportExcelVO {

    @ExcelProperty("用户名")
    @NotEmpty(message = "用户名不能为空")        // ← 导入也能用校验注解
    private String username;

    @ExcelProperty("昵称")
    private String nickname;

    @ExcelProperty("手机号")
    @Mobile                                     // ← 自定义校验，见 [[参数校验、时间传参]]
    private String mobile;

    @ExcelProperty("邮箱")
    @Email
    private String email;

    @ExcelProperty(value = "部门编号")
    private Long deptId;

    @ExcelProperty(value = "状态", converter = DictConvert.class)
    @DictFormat(DictTypeConstants.COMMON_STATUS)
    private Integer status;
}
```

### 2.3 ExcelUtils.read

```java
public static <T> List<T> read(MultipartFile file, Class<T> head) throws IOException {
    return EasyExcel.read(file.getInputStream())
            .head(head)
            .sheet()
            .doReadSync();      // ← 同步一次性读完（小文件场景）
}
```

⚠️ **大文件别用 `doReadSync()`** —— 它会把所有数据读进 List，等于放弃了 EasyExcel 的低内存优势。

**百万行导入要用监听器模式**：

```java
EasyExcel.read(file.getInputStream(), UserImportExcelVO.class,
        new PageReadListener<UserImportExcelVO>(dataList -> {
            // 每读满一批（默认 100 条）回调一次，在这里批量入库
            userService.batchInsert(dataList);
        })).sheet().doRead();        // ← 注意：不是 doReadSync
```

---

## 三、字段转换器：把 1 翻译成"开启" ⭐

### 3.1 为什么需要它？

Excel 是给人看的。数据库里 `status = 1`，导出的 Excel 里显示 `1` —— 业务人员看不懂。

**想要的效果**：
- **导出时**：`status = 1` → Excel 显示"开启"
- **导入时**：Excel 里写"开启" → Java 里变成 `status = 1`

### 3.2 Converter 接口的两个方法

```java
public interface Converter<T> {

    // ① Excel → Java：把单元格的值转成 Java 对象的值
    T convertToJavaData(ReadConverterContext<?> context);

    // ② Java → Excel：把 Java 对象的值转成单元格的值
    WriteCellData<?> convertToExcelData(WriteConverterContext<T> context);
}
```

💡 **记忆法**：
- `convertToJavaData` = **读**（Excel → Java）
- `convertToExcelData` = **写**（Java → Excel）

### 3.3 DictConvert 怎么用

```java
@ExcelProperty(value = "状态", converter = DictConvert.class)   // ① 指定转换器
@DictFormat(DictTypeConstants.COMMON_STATUS)                     // ② 指定字典类型
private Integer status;
```

**效果**：

```
status = 1  ──导出──>  Excel 显示"开启"
status = 0  ──导出──>  Excel 显示"关闭"

Excel 写"开启"  ──导入──>  status = 1
```

💡 **原理**：`DictConvert` 会去查数据字典表（`system_dict_data`），把 `value` 和 `label` 互相转换。

### 3.4 自定义转换器

字典不够用？自己写。比如把"金额（分）"转成"元"：

```java
public class CentToYuanConverter implements Converter<Integer> {

    @Override
    public Integer convertToJavaData(ReadConverterContext<?> context) {
        // Excel 里写 "99.99" 元 → 存 9999 分
        String value = context.getReadCellData().getStringValue();
        return new BigDecimal(value).multiply(new BigDecimal("100")).intValue();
    }

    @Override
    public WriteCellData<?> convertToExcelData(WriteConverterContext<Integer> context) {
        // 存 9999 分 → Excel 显示 "99.99"
        Integer cents = context.getValue();
        return new WriteCellData<>(
            new BigDecimal(cents).divide(new BigDecimal("100"), 2, RoundingMode.HALF_UP).toString());
    }
}
```

使用：

```java
@ExcelProperty(value = "金额（元）", converter = CentToYuanConverter.class)
private Integer price;
```

---

## 四、EasyExcel 注解速查

### 常用（记住这 3 个就够）

| 注解 | 作用 | 例子 |
|---|---|---|
| `@ExcelProperty` | 列名 / 列序号 / 转换器 | `@ExcelProperty(value = "姓名", index = 0)` |
| `@ExcelIgnore` | 该字段不参与 Excel | 加在个别字段上 |
| `@ExcelIgnoreUnannotated` | 所有没加 `@ExcelProperty` 的都不参与 | 加在**类**上 |
| `@ColumnWidth` | 列宽（单位：字符，最大 255） | `@ColumnWidth(18)` |

### 样式类（做漂亮报表时用）

| 注解 | 作用 |
|---|---|
| `@HeadRowHeight` | 表头行高 |
| `@ContentRowHeight` | 内容行高 |
| `@HeadStyle` | 表头样式（背景色、边框、对齐…） |
| `@ContentStyle` | 内容样式（同上） |
| `@HeadFontStyle` | 表头字体（加粗、颜色、字号…） |
| `@ContentFontStyle` | 内容字体 |
| `@ContentLoopMerge` | 合并单元格 |

**示例：一个带样式的 VO**

```java
@Data
@HeadRowHeight(25)                                    // 表头行高 25
@ContentRowHeight(20)                                 // 内容行高 20
@ColumnWidth(18)                                      // 全局列宽 18
@HeadStyle(fillForegroundColor = 40,                  // 表头背景色（40 = 浅蓝）
           horizontalAlignment = HorizontalAlignmentEnum.CENTER)
@HeadFontStyle(fontHeightInPoints = 12, bold = true)  // 表头 12 号加粗
public class ReportExcelVO {

    @ExcelProperty("订单号")
    @ColumnWidth(25)                                  // 这一列单独设宽
    private String orderNo;

    @ExcelProperty("金额")
    @ContentStyle(horizontalAlignment = HorizontalAlignmentEnum.RIGHT)   // 金额右对齐
    private BigDecimal amount;
}
```

### ⚠️ `@ExcelProperty` 的 value 和 index 二选一

```java
// ✅ 按名字匹配（推荐）
@ExcelProperty("姓名")
private String name;

// ✅ 按列序号匹配（从第 0 列开始）
@ExcelProperty(index = 0)
private String name;

// ❌ 不要同时写
@ExcelProperty(value = "姓名", index = 0)
private String name;
```

💡 **什么时候用 index？** 导入的 Excel **没有表头**时才用（用户给你的模板可能第一行就是数据）。

---

## 五、踩坑清单

| # | 坑 | 症状 | 解法 |
|---|---|---|---|
| 1 | **导出忘了关分页** | 只导出第 1 页 10 条 | `setPageSize(PageParam.PAGE_SIZE_NONE)` |
| 2 | 没加 `@ExcelIgnoreUnannotated` | Excel 里冒出 `deleted`、`creator` 等脏列 | 类上加注解 |
| 3 | **大文件用 `doReadSync()`** | OOM | 换 `PageReadListener` 分批读 |
| 4 | 文件名中文乱码 | 下载的文件名是 `???` | `URLEncoder.encode(filename, "UTF-8")`（`ExcelUtils` 已处理） |
| 5 | 前端没设 `responseType: 'blob'` | 下载下来是乱码/JSON | axios 加这个参数 |
| 6 | 数字变成科学计数法 | 手机号显示成 `1.38E+10` | 字段类型改成 `String`，或加 `@ColumnWidth(20)` |
| 7 | 日期导出成一串数字 | 显示 `45000` | 加 `@DateTimeFormat("yyyy-MM-dd HH:mm:ss")` 或自定义 converter |
| 8 | 导入时校验不生效 | 脏数据直接入库 | 在导入 VO 上加 `@NotEmpty` 等，并在 Service 里手动校验 |
| 9 | 转换器依赖字典但字典没配 | 导出显示空白 | 先去 [系统管理 → 字典管理] 配好 |
| 10 | 导入没有错误提示 | 用户不知道第几行错了 | 返回 `XxxImportRespVO`，包含成功/失败明细 |

### 坑 10 展开：给友好的导入反馈

```java
@Data
public class UserImportRespVO {
    private String createUsernames;      // 成功创建的用户名，逗号分隔
    private String updateUsernames;      // 成功更新的用户名
    private String failureUsernames;     // 失败的用户名
    private String failureReasons;       // 失败原因（第 3 行：手机号格式不正确）
}
```

前端展示："成功导入 8 条，失败 2 条：第 3 行手机号格式不正确；第 7 行用户名已存在。"

💡 **这是产品体验的分水岭**。只说"导入失败"会让用户崩溃。

---

## 六、一句话总结

**导出：写个带 `@ExcelProperty` 的 VO + `ExcelUtils.write(response, 文件名, sheet名, VO.class, 数据列表)`，记得关分页；导入：`ExcelUtils.read(file, VO.class)` 拿到列表再落库，大文件要用 `PageReadListener` 分批读。想让 `1` 显示成"开启"，加 `converter = DictConvert.class` + `@DictFormat`。类上永远加 `@ExcelIgnoreUnannotated`。**

---

## 关联笔记

- [[文件存储（上传下载）]] — 导出的文件也可以存对象存储
- [[分页实现]] — `PageParam.PAGE_SIZE_NONE`
- [[VO 对象转换、数据翻译]] — `BeanUtils.toBean()` 的 DO→VO 转换
- [[操作日志、访问日志、异常日志]] — `@ApiAccessLog(operateType = EXPORT)`
- [[参数校验、时间传参]] — 导入 VO 的校验注解

## 附录：官方截图索引

图片位于 `99_附件_资源文件/Yudao-Cloud/`：

| 截图 | 内容 |
|---|---|
| `Excel_导入导出-2.png` | 岗位管理的导出效果 |
| `Excel_导入导出-3.png` | `PostRespVO` 类的注解写法 |
| `Excel_导入导出-4.png` | `ExcelUtils.write()` 实现 |
| `Excel_导入导出-5.png` | 前端 `handleExport()` |
| `Excel_导入导出-6.png` | `UserImportExcelVO` 导入 VO |
| `Excel_导入导出-7.png` | 导入用的 Excel 模板示例 |
| `Excel_导入导出-8.png` | `ExcelUtils.read()` 实现 |
