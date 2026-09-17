---
title: "前端 Vue 与 ElementUI（原理 → 应用 → 进阶）"
---
# 前端 Vue 与 ElementUI（原理 → 应用 → 进阶）

> 10 年经验视角（后端立场）：简历写"了解 Vue/ElementUI 前端框架"。本文不追求把前端讲成专家，而是帮一个 Java 后端**能读懂、能改、能快速搭后台管理页面**——把前端的"为什么"和"怎么抄代码"讲透，最后补面试/排错进阶。Vue 是渐进式框架，你已有的 Java/Spring 心智模型（IoC、模板、组件化）能直接迁移。

## 一、原理篇
### 1.1 Web 三件套先对齐
- **HTML**：结构，标签 + 属性，类比"后端返回的页面骨架"
- **CSS**：样式，选择器 + 盒模型（content/padding/border/margin）+ 弹性布局 Flex
- **JavaScript**：行为，语言本身；弱类型、函数一等公民、基于原型（prototype）而非类（ES6 才有 class 语法糖）
- **DOM**：浏览器把 HTML 解析成的树，JS 通过 `document.getElementById()` 等操作它——这是"全栈那套"和 Vue 的分水岭

### 1.2 为什么需要 Vue（从原生 DOM 痛点切）
- 原生写法：`data` 变 → 手动 `element.innerHTML = ...` 同步视图，**容易漏更新、难维护**
- Vue 的核心是**响应式（Reactive）+ 声明式渲染**：你只改数据，Vue 自动把变化反映到 DOM
- 心智模型：把视图当成 `f(state) => UI` 的纯函数，你管 state，框架管 DOM 差分更新（虚拟 DOM diff）
- 类比 Spring：`data()/ref()` 像 Bean 的属性，`template` 像 Thymeleaf 模板，`computed` 像派生字段，`watch` 像事件监听

### 1.3 响应式原理（面试常问）
- **Vue 2**：`Object.defineProperty` 劫持每个属性的 get/set；**数组下标/长度、新增属性**监听不到，需 `Vue.set`/`this.$set`
- **Vue 3**：`Proxy` 代理整个对象，天然支持数组、新增属性；性能更好、坑更少
- **虚拟 DOM（VDOM）**：内存里用 JS 对象描述 DOM，数据变 → 生成新 VDOM → 与旧 diff → 只打补丁到真实 DOM（最小化操作）
- **Diff 算法**：同层比较、key 复用（列表**必须加 key**，否则就地复用会出错，类似后端"用 id 做缓存 key"）

### 1.4 组件化
- 一个 `.vue` 文件 = `<template>` + `<script>` + `<style>` 三合一（SFC，单文件组件）
- 父子通信：`props` 向下（父→子，只读）、`$emit` 事件向上（子→父）
- 类比：组件 ≈ 可复用的后端 Service/Widget；`props` ≈ 方法入参；`emit` ≈ 回调

## 二、应用篇（代码，能抄即用）
### 2.1 最小 Vue 3 页面（组合式 API，推荐新项目）
```html
<template>
  <div>
    <h1>{{ title }}</h1>
    <button @click="count++">点了 {{ count }} 次</button>
    <p v-if="count > 5">手痒了</p>
    <ul><li v-for="u in users" :key="u.id">{{ u.name }}</li></ul>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
const title = ref('后台列表')
const count  = ref(0)
const users  = reactive([{ id: 1, name: '张三' }])
const double = computed(() => count.value * 2)   // 派生，自动缓存
onMounted(() => console.log('组件挂载，可发请求'))
</script>
```
- `ref`：基本类型（取用 `.value`）；`reactive`：对象/数组
- 指令：`v-if/v-show`（条件，后者用 display 切换）、`v-for`（循环，配 `:key`）、`v-model`（双向绑定）、`@click`（事件）、`:prop`（动态属性）

### 2.2 发请求对接后端（axios + Spring Boot）
```js
import axios from 'axios'
// 全局基地址，对应你 Spring Boot 的 server.servlet.context-path
axios.defaults.baseURL = '/api'
// 列表查询
const list = ref([])
axios.get('/users', { params: { page: 1, size: 10 } })
  .then(r => list.value = r.data.records)
// 提交
axios.post('/users', { name: '李四' }).then(r => {...})
```
- 跨域：开发期 Vite 配 `proxy` 代理到后端 8080；生产由 Nginx 反代（同源）或后端 `@CrossOrigin`
- 拦截器：统一加 JWT（从 `localStorage` 取，塞 `Authorization` 头）、统一 `401` 跳登录、统一 `res.data` 解包

### 2.3 ElementUI（后台管理页神器，简历点名）
- Vue 2 用 `element-ui`；Vue 3 用 `element-plus`，API 基本一致
- 三步：装包 → `app.use(ElementPlus)` → 直接写 `<el-xxx>` 标签
```html
<el-table :data="list" border>
  <el-table-column prop="name" label="姓名" />
  <el-table-column label="操作">
    <template #default="{ row }">
      <el-button type="primary" size="small" @click="edit(row)">编辑</el-button>
    </template>
  </el-table-column>
</el-table>
<el-pagination layout="total,prev,pager,next" :total="total"
  @current-change="page => load(page)" />
<el-form :model="form" :rules="rules" ref="f">
  <el-form-item label="姓名" prop="name">
    <el-input v-model="form.name" />
  </el-form-item>
</el-form>
<el-dialog v-model="open" title="编辑">
  <el-form :model="form">...</el-form>
</el-dialog>
```
- 表格/分页/表单/弹窗/消息（`ElMessage`）几乎覆盖 80% 后台 CRUD 界面

### 2.4 路由（vue-router）
```js
const routes = [
  { path: '/user', component: UserList, meta: { title: '用户管理' } },
  { path: '/login', component: Login }
]
// 导航守卫：未登录拦去登录页
router.beforeEach((to, from, next) => {
  if (to.path !== '/login' && !localStorage.getItem('token')) next('/login')
  else next()
})
```

## 三、进阶篇（实战与面试）
- **Vue 2 vs Vue 3 怎么选**：新项目直接 Vue 3 + `<script setup>`；老项目（若依/RuoYi 老版、公司存量）多在 Vue 2 + element-ui。**简历里的后台大概率 Vue 2 生态**
- **组合式 vs 选项式 API**：Vue 3 推荐组合式（逻辑按功能聚合，复用用 `composable` 函数）；选项式（data/methods/computed 分块）更像 Vue 2 老写法，好读但复用差
- **状态管理 Pinia / Vuex**：跨组件共享（如登录用户信息、菜单）用 Pinia（Vue 3 官方，比 Vuex 轻、TS 友好）；类比后端"全局上下文/ThreadLocal"
- **响应式坑（面试）**：Vue 2 改数组项/加属性不触发更新 → 用 `this.$set`；Vue 3 无此坑。对象直接替换引用才会更新，改嵌套属性靠 Proxy 自动
- **key 的重要性**：`v-for` 不加 `key` 或乱用 `index` 作 key，列表增删会复用错节点（输入框串值）——务必用稳定 id
- **v-if vs v-show**：频繁切换用 `v-show`（只切 display）；条件少变且重时用 `v-if`（真正销毁/重建）
- **nextTick**：数据改了 DOM 还没刷，需 `await nextTick()` 后再读 DOM/聚焦（类似"等视图渲染完"）
- **SPA 白屏/刷新 404**：history 模式部署需 Nginx `try_files $uri /index.html`；hash 模式不用但 URL 带 `#`
- **工程化**：Vite（快，ESM 原生）/ Webpack（老）。`npm run dev` 本地、`npm run build` 出 `dist/` 交给 Nginx。你后端只管 `dist` 静态托管或 `spring.resources` 指过去
- **和后端协作边界**：前端只做展示与交互，鉴权靠 JWT（见 [[20_Spring Security 与 OAuth2-JWT 安全认证]]），文件走 Minio presigned 直传（见 [[21_Minio 对象存储]]）。**别在前端写业务密钥、别在前端做权限判断（只能 UI 隐藏，真权限在后端拦截器）**
- **常见坑**：① 跨域 OPTIONS 预检后端要放行；② `el-table` 数据层次深要 `row-key`；③ 大列表卡顿用虚拟滚动（`el-table-v2`）；④ 打包后接口 404 多半是 baseURL/代理没配；⑤ `console` 残留别上生产
- **学习路径建议（后端版）**：SFC 三块 → `ref/reactive` → 指令 → axios 联调 → element-plus 抄 CRUD → vue-router + Pinia → 啃一个若依/RuoYi 前端源码即到位

## 关联
- 鉴权对接：[[20_Spring Security 与 OAuth2-JWT 安全认证]]
- 文件上传对接：[[21_Minio 对象存储]]
- 后端主栈：[[05_SpringBoot 核心]] / [[06_MyBatis 与 MyBatis-Plus]]
