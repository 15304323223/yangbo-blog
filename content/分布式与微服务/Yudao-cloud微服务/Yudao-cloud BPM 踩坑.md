---
tags: #技术/架构 #Yudao #Flowable
date: 2026-09-06
title: "Yudao-cloud BPM 踩坑"
---

# Yudao-cloud BPM 踩坑

> 一句话概括：Yudao-cloud 工作流模块（BPM）踩坑实录，围绕 Flowable 流程引擎的部署、审批、会签、干预与二次开发。

## 一、模块结构速览

- `yudao-module-bpm`：流程定义 / 审批 / 待办 / 已办
- 底层引擎：Flowable（BPMN2.0）
- 核心表：`bpm_process_definition` / `bpm_task` / `bpm_process_instance`

## 二、踩坑记录（按需补充）

### 2.1 流程部署
- [ ] 模型设计器保存后重新部署的版本管理
- [ ] 流程定义 key 与 BPMN 文件不一致导致的部署失败

### 2.2 审批流转
- [ ] 会签 / 或签的 Flowable 配置差异
- [ ] 驳回指定节点的实现方式（`changeActivityState` 目标节点）
- [ ] 审批人与候选人（candidateUsers）的权限判断

### 2.3 干预与运维
- [ ] 流程实例的挂起 / 激活 / 删除
- [ ] 流程抄送（copy）与待办去重

### 2.4 微服务化注意
- [ ] BPM 模块间的 Feign 调用链与事务边界
- [ ] 流程数据与业务数据的最终一致性

## 三、调试技巧（待补充）
- 用 Flowable 的 `historyService` 查历史流转
- 监听器：任务监听 / 执行监听 / 流程监听的区别

---
## 关联笔记
- [[16_Flowable 工作流]] — BPMN / 七大 Service / 会签干预驳回
- [[22_从零搭建芋道式脚手架框架]] — 脚手架模块划分与二次开发
- [[20_Spring Security 与 OAuth2-JWT 安全认证]] — 审批接口鉴权
