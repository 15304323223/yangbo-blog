---
title: "Flowable 工作流（原理 → 应用 → 进阶）"
---
# Flowable 工作流（原理 → 应用 → 进阶）

> **一句话概括**：Flowable 就是一个**流程引擎**——你把"审批要走哪些步骤、谁审批、什么条件通过/驳回"画成一张流程图，它帮你按图执行、记录进度、处理会签和干预。
>
> **适合谁**：项目里有请假、合同审批、报销这类"谁审核、到哪了、能不能催"的需求，或者面试被问到"工作流引擎用过吗"的人。
> **怎么读**：原理篇理解"流程定义 vs 流程实例"；应用篇的代码直接可抄；进阶篇是面试常问的七大 Service 和性能优化。

---

## 零、先建立整体印象：把它想象成"工厂流水线"

一个产品（审批单）从上线到出厂，要经过固定的工位：

| 工厂流水线 | 对应 Flowable | 一句话 |
|---|---|---|
| **产品设计图纸** | 流程定义（BPMN XML） | 这张图纸规定了"要经过哪些步骤" |
| **按图纸启动的一次生产** | 流程实例（ProcessInstance） | 张三今天提的请假单，就是一次"生产" |
| **当前正在加工的工位** | 用户任务（UserTask） | "部门经理审批"就是一个工位 |
| **自动检测/搬运的机器人** | 服务任务（ServiceTask） | "自动发送邮件通知"，不用人干 |
| **岔路口：质量合格往左，不合格往右** | 排他网关（ExclusiveGateway） | "金额 > 1 万走财务总监，否则走主管" |
| **多个质检员同时签字** | 会签（多实例任务） | "三个部门负责人都同意才通过" |
| **生产记录本** | 历史表（ACT_HI_*） | 谁、什么时候、干了什么，全记着 |

**核心区别**：
- **流程定义** = 图纸（只一份，不会变）
- **流程实例** = 按图纸生产的产品（每次发起都新建一个，互相独立）

---

## 一、原理篇：BPMN 与引擎

### 1.1 BPMN 2.0 —— 流程图的"普通话"

BPMN（Business Process Model and Notation）是画流程图的标准。Flowable 读的就是这种图。

**常见节点类型**（看懂这些就能画 90% 的流程）：

| 节点图标 | 名字 | 干什么 |
|---|---|---|
| ○ | 开始事件 | 流程的起点 |
| ▭ | 用户任务（UserTask） | 需要人审批的节点，"部门经理审核" |
| ▭（齿轮） | 服务任务（ServiceTask） | 系统自动执行的节点，"发邮件/调接口" |
| ◇ | 排他网关 | 二选一：条件 A 走左边，条件 B 走右边 |
| ◇（加号） | 并行网关 | 同时触发多条分支，"技术评审 + 财务评审 同时进行" |
| ◇（圆圈） | 包容网关 | 满足条件的分支都走（并行 + 排他的混合） |
| ○（双圈） | 结束事件 | 流程终点 |

**会签怎么实现**：在流程图里把一个用户任务设成"多实例"，配上完成条件：
```xml
<!-- 三个审批人，过半数通过即算通过 -->
<userTask id="review" name="会签审批">
  <multiInstanceLoopCharacteristics
      isSequential="false"                    <!-- false = 并行会签（三人同时收到） -->
      flowable:collection="reviewers"         <!-- 从变量里取审批人列表 -->
      flowable:elementVariable="reviewer">
    <completionCondition>
      ${nrOfCompletedInstances / nrOfInstances >= 0.5}   <!-- 完成数 / 总数 >= 0.5 -->
    </completionCondition>
  </multiInstanceLoopCharacteristics>
</userTask>
```

### 1.2 流程定义 vs 流程实例（面试必考）

```java
// 流程定义 = 图纸。部署一次，数据库里存一份
repositoryService.createDeployment()
    .addClasspathResource("process/contract.bpmn20.xml")   // 加载图纸
    .deploy();                                              // 存到数据库

// 流程实例 = 按图纸启动的一次生产。每次发起都新建一个
ProcessInstance pi = runtimeService
    .startProcessInstanceByKey("contract", vars);           // "contract" 是图纸的 key
// 返回的 pi 里有：当前走到哪了、发起人是谁、业务关联 ID
```

**版本机制**：同一份图纸（同 key）多次部署，会产生新版本。但**已经启动的流程实例按启动时的版本走**，不受后续部署影响——这是灰度发布的天然支持。

---

## 二、应用篇（代码，照着抄）

### 2.1 部署与启动

```java
// ① 部署流程定义（通常在系统启动时做一次，或管理后台"发布流程"时做）
Deployment deployment = repositoryService.createDeployment()
    .name("合同审批流程")
    .addClasspathResource("process/contract.bpmn20.xml")   // 从 classpath 读 BPMN 文件
    .deploy();

// ② 发起一个流程实例（用户点击"提交合同"时）
Map<String, Object> vars = new HashMap<>();
vars.put("contractAmount", 50000);           // 合同金额，网关会用它判断走哪条路
vars.put("applicant", "张三");

ProcessInstance pi = runtimeService
    .startProcessInstanceByKey("contract", vars);

// 返回的 pi.getId() 就是这次审批的"流水号"，后面所有操作都围绕它
```

### 2.2 审核（完成任务）

```java
// 查询当前用户的待办任务
List<Task> tasks = taskService.createTaskQuery()
    .taskAssignee("李四")                       // 查"李四"的待办
    .list();

// 完成审批：通过
Task task = tasks.get(0);
Map<String, Object> vars = new HashMap<>();
vars.put("approve", true);                     // 审批结果：通过
vars.put("comment", "金额合理，同意签约");        // 审批意见

taskService.complete(task.getId(), vars);      // 提交完成，流程自动流向下一个节点
```

### 2.3 会签（多人审批）

会签在 BPMN 里配置，Java 代码几乎不用改——和普通任务一样 `complete`，引擎自动处理计数：
```java
// 每个审批人都这样操作
Map<String, Object> vars = new HashMap<>();
vars.put("approve", true);                     // 这个人投了"同意"
taskService.complete(taskId, vars);

// 当完成人数达到配置的"过半/全通过"条件时，引擎自动聚合结果，走向下一个节点
```

### 2.4 驳回（直送到指定节点）

Flowable 原生没有"驳回"按钮，但可以通过排他网关实现：
```xml
<!-- 在 BPMN 里加一个"驳回"分支 -->
<exclusiveGateway id="decision" />
<sequenceFlow id="toEnd" sourceRef="decision" targetRef="end">
  <conditionExpression>${approve == true}</conditionExpression>   <!-- 通过 → 结束 -->
</sequenceFlow>
<sequenceFlow id="toReject" sourceRef="decision" targetRef="start">
  <conditionExpression>${approve == false}</conditionExpression>  <!-- 驳回 → 回到发起人 -->
</sequenceFlow>
```

> 💡 更复杂的"驳回到任意节点"需要用到**动态跳转**（`runtimeService.createChangeActivityStateBuilder()`），这属于高级操作，会破坏流程的完整追溯，**谨慎使用**。

### 2.5 管理员干预（强制跳转/终止）

```java
// 强制把流程从当前节点跳到另一个节点（比如领导直接要求"跳过财务审核"）
runtimeService.createChangeActivityStateBuilder()
    .processInstanceId(piId)
    .moveActivityIdTo("currentTaskId", "targetTaskId")
    .changeState();

// 强制终止流程
runtimeService.deleteProcessInstance(piId, "管理员强制终止：合同作废");
```
> ⚠️ **干预操作会破坏流程完整性**，只给管理员用，且要记操作日志。普通审批人不应该有这权限。

---

## 三、进阶篇（面试深挖 + 生产注意）

### 3.1 七大 Service（背下来，面试常问）

| Service | 管什么 | 常用方法 |
|---|---|---|
| **RepositoryService** | 流程定义（图纸） | 部署、查询定义、删旧版本 |
| **RuntimeService** | 流程实例（运行中的） | 启动、终止、查询变量、改状态 |
| **TaskService** | 用户任务（待办） | 查询任务、完成任务、委派、转办 |
| **HistoryService** | 历史记录（已结束的） | 查审批历史、耗时统计 |
| **IdentityService** | 用户/组（新版弱化） | 查用户、查组，建议接自己的用户系统 |
| **ManagementService** | 运维管理 | 执行命令、查数据库、清数据 |
| **FormService** | 表单（已不常用） | 动态表单，实际项目多自建表单 |

> 💡 **实际项目里，IdentityService 几乎不用**——Flowable 自带的用户表太简单，生产环境都接自己的用户/权限系统（如芋道的 sys_user / sys_role）。

### 3.2 与 Spring Boot 集成

```xml
<!-- 加一个 starter，自动建 57 张 ACT_* 表 -->
<dependency>
    <groupId>org.flowable</groupId>
    <artifactId>flowable-spring-boot-starter</artifactId>
</dependency>
```
```yaml
flowable:
  database-schema-update: true          # 自动建表/更新表结构
  history-level: audit                  # 历史记录级别：none / activity / audit / full
  # audit = 记录流程实例 + 任务 + 变量，够用且省空间
  # full = 什么都记，数据膨胀极快，慎用
```

### 3.3 性能优化（生产必看）

1. **历史表膨胀**：`full` 级别会把每次变量修改都记下来，几个月就爆库。**建议用 `audit`，只记关键节点**。
2. **查历史慢**：`HistoryService` 查大数据量时极慢。简历里的解法——**把流程关键节点冗余进业务表/Redis**，前端查进度走业务表，不走 Flowable 历史表。
3. **大流程变量**：附件、JSON 等大对象存 `BYTEARRAY` 表，要控制大小，否则拖慢整个实例。
4. **定时清理**：已结束半年的流程实例和历史数据，定期归档或删除。

### 3.4 达梦适配

简历项目用达梦数据库，Flowable 默认按 MySQL/Oracle 语法建表。适配要点：
- 确认 `db-type=dm`（或在连接串里让 Flowable 识别达梦方言）
- 主键策略：达梦没有自增，用 UUID 或序列（见 [[09_达梦 DM 数据库]]）
- 57 张 `ACT_*` 表首次启动自动创建，注意达梦的大小写敏感问题

### 3.5 面试常问

- **"流程定义和流程实例的区别？"** 定义是图纸（一份），实例是按图纸启动的审批（多个）。同 key 多次部署产生新版本，运行中实例按旧版本走。
- **"会签怎么实现？"** BPMN 多实例任务 + completionCondition，过半或全通过。
- **"驳回怎么做？"** 排他网关加驳回分支；复杂场景用动态跳转，但会破坏完整性。
- **"查审批历史慢怎么优化？"** 关键节点冗余到业务表，前端查业务表；Flowable 历史表只做兜底。

---

## 关联
- 高并发下的历史表冗余策略见 [[15_高并发高可用设计]]
- 达梦数据库适配见 [[09_达梦 DM 数据库]]
- Spring Boot 自动配置原理见 [[05_SpringBoot 核心]]
