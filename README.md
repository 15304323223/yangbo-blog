# 后端技术沉淀

基于 **Obsidian 笔记** + **Quartz** 构建的 Java 后端技术博客。

🔗 线上地址：https://15304323223.github.io/yangbo-blog/

---

## 这是什么

把 Obsidian 里 `01_技术库_Java开发` 的笔记，编译成可在线阅读的技术站点。

```
Obsidian Vault (笔记源，含私密内容)
        │  只挑选 Java 技术库
        ↓
    content/          ← 本仓库的内容目录
        │  npx quartz build
        ↓
     public/          ← 生成的静态站点
        ↓  git push
  GitHub Actions  →  GitHub Pages
```

## 内容组织

| 目录 | 内容 |
| --- | --- |
| `学习路线/` | Java 后端六阶段学习路线与知识体系 |
| `Java 基础/` | 集合、JVM、JUC、设计模式、分布式锁、幂等、Arthas、故障排查、版本特性 |
| `框架与持久层/` | SpringBoot、MyBatis、MySQL、PostgreSQL、达梦、分库分表 |
| `缓存与中间件/` | Redis、本地缓存、Kafka/RabbitMQ、Zookeeper、XXL-JOB |
| `分布式与微服务/` | SpringCloud、Dubbo、高可用设计、Flowable、Yudao-cloud 专题 |
| `运维与工具/` | Docker、开发工具链、Linux、Git、Maven |
| `前端与安全/` | Vue、Spring Security/OAuth2、Minio |
| `架构实战/` | 芋道式脚手架搭建 |
| `大模型与 AI/` | 大模型部署、Spring AI |
| `技术书籍笔记/` | 代码整洁之道、重构、Effective Java、深入理解 JVM 等 |

## 本地使用

```bash
# 安装依赖（首次）
npm i

# 本地预览，访问 http://localhost:8080
npx quartz build --serve

# 只构建不启动服务
npx quartz build
```

## 写作流程

笔记在 Obsidian 里写，通过同步脚本复制到 `content/`：

```bash
npm run sync                # 增量同步（幂等）
node sync-content.cjs --dry-run   # 只看会改哪些，不写入
```

> 注意：本仓库 `package.json` 的 `"type": "module"`，所以脚本用 `.cjs` 后缀（CommonJS），
> 直接写成 `.js` 会被 Node 当 ESM 解析而报 `require is not defined`。

同步脚本会：

- 只读取 `01_技术库_Java开发`，**不会**带上日记、投资库等其他私密目录
- 自动为缺少 YAML frontmatter 的笔记补 `title` / `tags`
- 修正笔记间的失效双链
- 用内容哈希比对，只更新有变化的文件

## 部署

推送到 `main` 分支即自动构建并发布到 GitHub Pages，流程定义在 `.github/workflows/deploy-pages.yaml`。

### 一键发布（首次或以后都可用）

```powershell
# 1. 生成令牌：https://github.com/settings/tokens
#    classic token，必须勾选 repo + workflow（少了 workflow 无法推送工作流文件）
# 2. 把令牌放进环境变量（不会写入磁盘）
$env:GITHUB_TOKEN="ghp_你的令牌"
# 3. 一键完成：建仓 -> 启用 Pages -> 推送 -> 等构建结果
npm run publish
```

脚本做的事：

1. 校验令牌身份
2. 仓库不存在则创建（public）
3. 把 Pages 构建源设为 GitHub Actions
4. 推送当前分支（认证头只通过环境变量传递，不落盘、不进 git config）
5. 轮询 Actions 运行结果并给出线上地址

常用参数：

```bash
node publish.cjs --check   # 只检查环境与 git 状态，不产生任何改动
node publish.cjs --force   # 远程有冲突提交时强制覆盖
```

发布完成后建议去 https://github.com/settings/tokens 撤销该令牌。

### 手动部署

```bash
git push -u origin main
```

之后在仓库 `Settings → Pages → Source` 选择 **GitHub Actions**（仅首次需要）。

## 技术栈

- [Quartz v5](https://quartz.jzhao.xyz/) — 静态站点生成器，原生支持 Obsidian 语法（双链、关系图谱、反向链接）
- GitHub Pages — 托管
- GitHub Actions — 自动构建部署

## 许可

笔记内容版权归作者所有。站点生成框架 Quartz 遵循 MIT 协议。
