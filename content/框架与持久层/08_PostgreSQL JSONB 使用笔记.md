---
tags: #技术/数据库 #PostgreSQL
date: 2026-09-06
title: "PostgreSQL JSONB 使用笔记"
---

# PostgreSQL JSONB 使用笔记

> 一句话概括：JSONB 是 PostgreSQL 的二进制 JSON 类型，用「文档字段 + GIN 索引」替代部分关系表设计。

## 一、JSONB vs JSON vs 关系表

| 场景 | 选型 |
|------|------|
| 结构固定的业务字段 | 关系表（别滥用 JSONB） |
| 低频变动的扩展字段 | JSONB + GIN 索引 |
| 纯存储不查询 | JSONB（省去解析开销，仍优于 JSON） |

## 二、常用操作符（速查）

| 操作符 | 含义 | 示例 |
|--------|------|------|
| `->` | 取 JSON 对象字段（返回 JSON） | `data->'name'` |
| `->>` | 取字段（返回文本） | `data->>'name'` |
| `@>` | 包含（左含右） | `data @> '{"role":"admin"}'` |
| `?` | 键是否存在 | `data ? 'phone'` |
| `#>> | 取路径（返回文本） | `data #>> '{a,b}'` |

## 三、GIN 索引（查询提速关键）

```sql
CREATE INDEX idx_user_data_gin ON sys_user USING GIN (data);
-- 只有用了 @> ? ?| ?& 等操作符才能命中 GIN 索引
```

## 四、与 MyBatis-Plus 集成要点

- 实体字段用 `String` 或 `Map<String, Object>` 接收
- 插入时按 JSON 字符串传入，注意类型处理器配置
- 查询条件用 `@> '{"key":"value"}'::jsonb` 拼接，或 `apply()` 手写片段

## 五、⚠️ 实战坑（待补充）

- [ ] JSONB 字段更新整列覆盖 vs 局部更新的性能差异
- [ ] 与达梦 DM 兼容性：达梦无原生 JSONB，迁移时的替代方案
- [ ] 大字段在分页查询中的序列化开销

---
## 关联笔记
- [[07_MySQL 与 SQL 优化]] — 关系型索引设计对比
- [[09_达梦 DM 数据库]] — 国产库兼容性对照
- [[22_从零搭建芋道式脚手架框架]] — 多数据源 / 数据库选型上下文
