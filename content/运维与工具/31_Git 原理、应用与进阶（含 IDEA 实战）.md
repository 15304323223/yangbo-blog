---
title: "Git 原理、应用与进阶（含 IDEA 实战）"
---
# Git 原理、应用与进阶（含 IDEA 实战）

> **一句话概括**：Git 是「给代码拍快照的时光机」——每次 `commit` 就是给整个项目拍一张完整照片，你随时能回到任何一张照片。它的内核只有**三个对象**（blob / tree / commit）+ **一个指针**（HEAD），把这两样吃透，所有命令都不再是死记硬背的咒语。
>
> **适合谁**：只会 `git add / commit / push` 三板斧、一遇到冲突就慌、`merge` 和 `rebase` 分不清、代码写坏了只会删库重来、在 IDEA 里点来点去却不知道背后发生了什么的人。
> **怎么读**：**零（建立印象）→ 一（原理，别跳过）→ 二（应用，照着抄）→ 三（进阶，救援与高手操作）→ 四（IDEA 实战）→ 五（踩坑速查）**。原理篇是地基，跳过它后面就全是背咒语，换个场景立刻失效。

---

## 零、先建立整体印象：把 Git 想象成「写书稿」

### 0.1 没有版本控制的世界长什么样

你一定见过这种文件名：

```
毕业论文_最终版.docx
毕业论文_最终版2.docx
毕业论文_最终版_真的最终.docx
毕业论文_最终版_导师改过_别动.docx
```

这就是「人肉版本控制」——**靠复制文件 + 起名来记录历史**。问题很明显：

| 痛点 | 人肉版本控制 | Git |
|---|---|---|
| 历史 | 一堆文件，不知道谁改了啥 | 每次提交有作者、时间、说明 |
| 回退 | 靠记忆挑文件 | 一条命令回到任意版本 |
| 协作 | 微信传文件，互相覆盖 | 多人并行改，自动合并 |
| 对比 | 用肉眼比两坨文字 | `git diff` 精确到行 |
| 追责 | 「这行谁写的？」没人知道 | `git blame` 精确到人 |

**一句话**：Git 把「版本管理」从「手动复制文件」变成了「自动化、可追溯、可协作」的工程能力。

### 0.2 一个类比：Git 就是「写书 + 存档 + 多人合写」

| 写书的场景 | Git 里的对应 |
|---|---|
| 你在书房**改稿子**（还没保存到正式档案） | **工作区**（Working Directory） |
| 改完一部分，**先放进「待归档」文件夹** | **暂存区**（Staging Area / Index） |
| 确认无误，**正式归档，编上卷号** | **本地仓库**（`.git` 目录） |
| 把定稿**寄给出版社**，大家都能拿到 | **远程仓库**（GitHub / GitLab / Gitee） |
| 你**另开一条线**写外传，不影响正传 | **分支**（branch） |
| 两条线**合并成一本** | **合并**（merge） |

**记住这四个区域，Git 80% 的困惑都来自「东西现在在哪个区」。**

```
┌──────────────┐  git add   ┌──────────────┐  git commit  ┌──────────────┐  git push   ┌──────────────┐
│    工作区     │ ─────────► │    暂存区     │ ───────────► │   本地仓库    │ ──────────► │   远程仓库    │
│ Working Dir  │            │ Index/Stage  │              │    .git/     │             │   GitHub     │
│  你正在编辑   │ ◄───────── │  「待提交」   │ ◄─────────── │  「已归档」   │ ◄────────── │  「已推送」   │
└──────────────┘ git restore└──────────────┘  git reset   └──────────────┘ git fetch/pull└──────────────┘
```

> 💡 **一句话记忆**：**`add` 是「挑」、`commit` 是「存」、`push` 是「传」**。搞不清当前状态时，先敲 `git status`——它永远告诉你「现在在哪、下一步能干什么」。

### 0.3 Git vs SVN：为什么 Git 赢了

很多人简历上两个都写，但说不清区别。**核心只差一个字：分布式的「分」。**

| | **Git（分布式）** | **SVN（集中式）** |
|---|---|---|
| 仓库形态 | **每个人本地都有一份完整仓库**（含全部历史） | 只有中心服务器有完整历史，本地只是个「工作副本」 |
| 断网 | **照样提交、建分支、看历史、切版本** | **啥也干不了**（连 `commit` 都要连服务器） |
| 建分支 | 写一个 41 字节的文件，**毫秒级** | 复制整个目录，**慢且重** |
| 提交速度 | 快（提交到本地，不依赖网络） | 慢（每次提交都要联网） |
| 历史安全 | 任何一台机器坏了都不影响（人人有全量备份） | 中心服务器挂了 = 全公司历史没了 |
| 典型 | GitHub / GitLab / Gitee | 老企业内网（很多银行、国企遗留系统） |

> ✅ **一句话面试话术**：Git 是分布式的，本地有完整仓库，所以**断网也能提交、建分支零成本**；SVN 是集中式的，一切依赖中心服务器，**分支重、离线废**。这也是 Git 能支撑开源大规模协作的根本原因。

---

## 一、原理篇：Git 为什么这么设计

> 这一章是全篇的地基。**看懂这一章，后面所有命令你都能自己推导出来**，而不是靠背。

### 1.1 核心认知：Git 存的是「快照」，不是「差异」

**最大的误解**：很多人以为 Git 像 SVN 一样，每次记录「这次改了哪几行」（diff / 增量）。

**事实是**：**Git 每次提交，存的是整个项目在该时刻的一张完整快照**（snapshot）。

**类比**：每次修完车，Git 给**整车拍一整套照片**；而不是只记一句「换了轮胎」。
- 只记「改了啥」（差异）：想还原到某一天，得从第一天开始把所有改动叠加起来，越往后越慢。
- 存「整张快照」：想还原到哪天，直接把那天的照片拿出来即可，**速度恒定**。

**那不是很占空间吗？** 不会。Git 内部会做两件事：
1. **内容相同的文件只存一份**（用哈希去重）；
2. **未改动的文件在快照里只是「指针」**，指向之前存过的那份，不重复存内容。

> 💡 所以 Git 仓库通常比你想的小得多——**几万次提交的项目，`.git` 可能只有几百 MB**。

### 1.2 三个核心对象：blob / tree / commit

Git 内部一切数据都存在 `.git/objects` 里，只有四种对象（第四种是 tag，先忽略）：

| 对象 | 存什么 | 生活类比 | 关键点 |
|---|---|---|---|
| **blob** | **一个文件的内容**（不含文件名！） | 一张照片 | 同样内容的文件，只存一个 blob |
| **tree** | **一个目录**（文件名 → blob/tree 的映射） | 相册目录页 | 记录「哪张照片叫什么、放在哪」 |
| **commit** | **一次提交**（指向一个 tree + 作者 + 时间 + 说明 + **父提交**） | 一本相册 + 拍摄信息 | 靠 `parent` 串成历史链条 |
| **tag** | 给某个 commit 起的「别名」（如 `v1.0.0`） | 书签 | 见 2.9 节 |

**它们的关系长这样**：

```
commit a1b2c3  ──►  tree  ──►  blob (README.md)
    │                 └────►  blob (Main.java)
    │
    └─ parent ──►  commit 9f8e7d  ──►  tree  ──► ...
                     │
                     └─ parent ──►  commit 3c4d5e ...
```

**关键理解**：
- **blob 不含文件名**——文件名由它上层的 tree 决定。所以「改名」在 Git 看来不是「改文件」，而是「改 tree 里的一条记录」，文件内容 blob 完全不动。
- **commit 靠 `parent` 指针串起来**——这就是「历史」的本质。一个 commit 知道自己的上一个 commit 是谁。
- **第一次提交没有 parent**（root commit）。

**动手看真相**（感受一下 Git 的「裸数据」）：

```bash
git cat-file -t HEAD            # 看 HEAD 指向的对象类型 → commit
git cat-file -p HEAD            # 打印这个 commit 的内容（能看到 tree、parent、author）
git cat-file -p HEAD^{tree}     # 打印这次提交的根目录 tree
git cat-file -p <blob哈希>      # 打印某个文件的内容
```

> 💡 敲一遍这几条命令，你会突然明白：**所谓「版本控制」，不过是「一堆对象 + 一堆指针」而已。**

### 1.3 哈希：为什么 Git 用 SHA-1 做「内容指纹」

Git 给每个对象算一个 **SHA-1 哈希值**（40 位十六进制，如 `3c4d5e6f...`），并用它作为对象的「名字」。

**这带来三个极其重要的性质**：

| 性质 | 含义 | 实际好处 |
|---|---|---|
| **内容寻址** | 对象名 = 内容的哈希，内容变了名字必变 | 你只要报出哈希，就能精确拿到那份内容 |
| **不可篡改** | 改任何一个字节，哈希全变 | 历史无法被偷偷修改（改了就对不上父指针） |
| **全局唯一** | 相同内容在任何机器上哈希都一样 | 分布式协作天然一致，无需中心协调 |

**类比**：哈希就像**用「内容摘要」当文件名**。你不可能把一篇论文改一个字，还指望摘要一模一样——所以「篡改历史」在 Git 里几乎不可能（除非重写整条链，哈希会全变，`reflog` 也能查到）。

> ⚠️ **注意**：SHA-1 在密码学上已被证明有碰撞风险，Git 正在向 SHA-256 迁移（`git init --object-format=sha256`）。但**对普通开发者的日常使用毫无影响**，知道这回事即可。

### 1.4 HEAD 与分支：分支只是一个「41 字节的文件」

**这是 Git 最反直觉、也最精妙的设计。**

**分支（branch）不是一份代码副本，而只是一个「指向某个 commit 的指针」**——本质上就是 `.git/refs/heads/<分支名>` 这个文件，里面写着一行 40 位哈希。

```
        main                    ← 分支 = 一个写着哈希的文件
         ↓
A ───── B ───── C               ← 提交链（每个 commit 指向它的 parent）
                ↑
             feature            ← 新建分支 = 再写一个小文件，指向 C
```

**所以**：
- **建分支是毫秒级**（写个文件而已，SVN 要复制整个目录）；
- **切分支是毫秒级**（改一下 HEAD 指向谁）；
- **删分支只是删个文件**（commit 对象还在，`reflog` 还能找回来）。

**HEAD 是什么？** HEAD 是「**你现在站在哪**」的指针：

| HEAD 的状态 | 含义 | 俗称 |
|---|---|---|
| `ref: refs/heads/main` | HEAD 指向 `main` 分支 | **在 main 分支上**（正常状态） |
| 直接指向某个 commit 哈希 | HEAD 不指向任何分支 | **分离头指针（detached HEAD）** ⚠️ |

**分离头指针（detached HEAD）** 是新手最容易踩的坑：

```bash
git checkout 3c4d5e          # 直接切到某个 commit（不是分支名）→ 进入 detached HEAD
```

此时你**不在任何分支上**。如果在这个状态下 `commit`，新提交**不属于任何分支**，一旦切走就可能「丢失」（其实还能用 reflog 找回）。

> ✅ **正确姿势**：想在某个历史版本上改代码，**先建分支再切**：
> ```bash
> git switch -c hotfix-3c4d5e 3c4d5e   # 基于某个 commit 建一个新分支并切过去
> ```

**看指针现状的神器**：

```bash
git log --oneline --graph --all --decorate
# --graph    用 ASCII 画出分叉合并的树形结构
# --all      显示所有分支（不只当前分支）
# --decorate 显示分支名、tag 名（即「指针贴在哪」）
# --oneline  一行显示一个提交，简洁
```

> 💡 **把这条命令设成别名**，它会成为你看历史的默认姿势：
> ```bash
> git config --global alias.lg "log --oneline --graph --all --decorate"
> # 之后敲 git lg 即可
> ```

### 1.5 三个区域与文件状态流转

文件在 Git 眼里有**四种状态**，理解这张图，`git status` 的每一行输出你都能看懂：

```
        未跟踪                已暂存                已提交
     (Untracked) ──add──► (Staged) ──commit──► (Committed)
          │                   │                     │
          │              restore ─┘                 │
          │                                        │
          └────────────── 已修改 (Modified) ◄── 编辑已提交文件
```

| 状态 | 含义 | `git status` 里长什么样 |
|---|---|---|
| **Untracked** | 新文件，Git 从没管过 | `Untracked files:` |
| **Modified** | 已跟踪的文件被改了，还没暂存 | `Changes not staged for commit:` |
| **Staged** | 改动已放进暂存区，等着提交 | `Changes to be committed:` |
| **Committed** | 已存进本地仓库 | 不出现在 status 里（干净） |

**为什么要有「暂存区」这个中间层？** 这是 Git 相比其他工具的高明之处：

> 💡 **暂存区让你「挑着提交」**。比如你一次改了 5 个文件，但其中 2 个是修 bug、3 个是新功能——可以只把 2 个 bug 相关文件 `add` 进去先提交一次，剩下 3 个下次再提。**提交粒度干净，历史才可读**。

```bash
git add bugfix.java          # 只暂存这一个文件（挑着提交）
git add -p                   # 交互式暂存：同一个文件里，挑「哪几块改动」要提交
git commit -m "fix: 修复登录空指针"
```

### 1.6 reflog：Git 的「后悔药」

`git log` 只显示**当前分支的历史**；而 **`git reflog` 记录 HEAD 的每一次移动**——包括切分支、reset、rebase、commit。

```bash
git reflog
# 输出示例（每次 HEAD 移动都有一行）：
# 3c4d5e6 HEAD@{0}: commit: feat: 新增订单导出
# 9f8e7d4 HEAD@{1}: reset: moving to HEAD~1      ← 你刚做的「危险操作」也在里面
# a1b2c3f HEAD@{2}: checkout: moving from main to feature
```

> ✅ **绝大多数「代码丢了」都能用 reflog 救回来**——只要对象还在（默认 90 天才被 GC 清理）。
> 详见 3.4 节「reflog 救援实录」。

---

## 二、应用篇：日常命令照着抄

> 这一章是「**照着抄就能干活**」的部分。每条命令都标了「干什么、什么时候用」。

### 2.1 安装与首次配置（装机后第一件事）

**安装**：
```bash
# macOS
brew install git
# Windows：官网下载 Git for Windows（自带 Git Bash，推荐）
# Linux（Debian/Ubuntu）
sudo apt install git
```

**必做的全局配置**（不做会导致提交作者显示错误）：

```bash
git config --global user.name  "张三"                  # 提交时显示的作者名
git config --global user.email "zhangsan@company.com"  # 提交时显示的作者邮箱（建议用公司邮箱）

git config --global core.autocrlf input   # ⚠️ 换行符：macOS/Linux 用 input；Windows 用 true
# 作用：避免 Windows(\r\n) 和 Linux(\n) 混用导致「整个文件都显示被改过」

git config --global core.quotepath false  # 让中文文件名正常显示，不显示成 \346\226\207
git config --global init.defaultBranch main  # 新仓库默认分支叫 main（而不是 master）
git config --global pull.rebase false     # pull 时默认用 merge（后面进阶篇讲为什么可以改）
```

**查看配置 / 别名（效率神器）**：

```bash
git config --list                    # 看所有配置
git config --global --list           # 只看全局配置
git config --global alias.st status  # 把 git status 简写成 git st
git config --global alias.co checkout
git config --global alias.br branch
git config --global alias.lg "log --oneline --graph --all --decorate"  # 最好用的看历史命令
git config --global alias.last "log -1 HEAD --stat"  # 看最后一次提交改了啥
```

**配置 SSH 免密（强烈推荐，比 HTTPS 少输密码）**：

```bash
ssh-keygen -t ed25519 -C "zhangsan@company.com"   # 一路回车（-C 是备注，一般填邮箱）
cat ~/.ssh/id_ed25519.pub                          # 复制输出的公钥
# 粘贴到 GitHub → Settings → SSH and GPG keys → New SSH key
ssh -T git@github.com                              # 测试：出现 "Hi xxx! You've successfully..." 即成功
```

> ⚠️ **`id_ed25519` 是私钥，绝不能外传**；`id_ed25519.pub` 才是可以给出去的公钥。别搞反。

### 2.2 两种起步方式：`init` 与 `clone`

```bash
# 方式一：本地已有代码，要纳入 Git 管理
git init                    # 在当前目录创建 .git，初始化仓库
git init my-project         # 新建目录并初始化

# 方式二：远程已有仓库，拉下来开发（99% 的工作场景）
git clone git@github.com:company/order-service.git        # 克隆到同名目录
git clone git@github.com:company/order-service.git order  # 克隆到指定目录名
git clone -b dev git@github.com:company/x.git             # 只克隆 dev 分支
git clone --depth 1 git@github.com:company/x.git          # 浅克隆：只拉最近 1 次提交（仓库巨大时提速）
```

### 2.3 日常三件套：`add` → `commit` → `push`

```bash
# ① 看现状（敲任何命令前先看它，永远不吃亏）
git status                      # 哪些文件改了、哪些已暂存、当前在哪个分支
git status -s                   # 精简输出（M=修改 A=新增 ??=未跟踪）

# ② 暂存（挑要提交的改动）
git add file1.java file2.java   # 暂存指定文件
git add .                       # 暂存当前目录所有改动（新增+修改，不含删除）
git add -A                      # 暂存所有改动（含删除、含上级目录）
git add -p                      # ⭐ 交互式：同一个文件里挑「哪几块」要提交

# ③ 提交（生成一张快照）
git commit -m "feat(order): 新增订单导出接口"   # 提交并写说明
git commit                      # 不带 -m：打开编辑器写多行说明（推荐复杂改动用）
git commit -am "fix: 紧急修复空指针"            # 跳过 add，直接提交「已跟踪文件」的改动（⚠️ 新文件不会被提交）

# ④ 推送（把本地提交传到远程）
git push                        # 推送到已关联的远程分支
git push -u origin main         # 首次推送并建立跟踪关系（之后直接 git push 即可）
```

**Commit Message 规范（团队协作的硬要求）**——推荐 **Conventional Commits**：

```
<type>(<scope>): <subject>

type 取值：
  feat     新功能
  fix      修 bug
  docs     只改文档
  style    格式（不影响代码运行，如空格、分号）
  refactor 重构（不是新功能也不是修 bug）
  perf     性能优化
  test     加测试
  chore    构建/工具/依赖等杂项

示例：
  feat(order): 新增订单批量导出 Excel 接口
  fix(auth): 修复 token 过期后未跳转登录页的问题
  refactor(user): 抽离用户校验逻辑到 UserValidator
```

> 💡 **为什么必须规范**：`git log` 一眼能看懂改了什么；能自动生成 CHANGELOG；能按 `feat/fix` 过滤发版内容。**写「update」「修改」这种说明，等于没写**。

### 2.4 看：`status` / `diff` / `log` / `show` / `blame`

```bash
# —— diff：看「改了什么」——
git diff                        # 工作区 vs 暂存区（还没 add 的改动）
git diff --staged               # 暂存区 vs 上次提交（即将提交的改动）⭐ 提交前必看
git diff HEAD                   # 工作区+暂存区 vs 上次提交（本次所有改动）
git diff main feature           # 比较两个分支的差异
git diff --stat                 # 只显示「哪些文件改了多少行」的统计

# —— log：看「历史」——
git log                         # 完整历史（作者、时间、说明）
git log --oneline               # 一行一条，简洁
git log --oneline --graph --all --decorate   # ⭐ 树形图，看分叉合并（= git lg）
git log -p                      # 显示每次提交的具体改动
git log --stat                  # 显示每次提交改了哪些文件
git log --author="张三"          # 只看某人的提交
git log --since="2 weeks ago" --until="1 day ago"  # 按时间过滤
git log --grep="订单"            # 按提交说明搜索
git log -S "sendMessage"        # ⭐ 搜索「哪次提交引入/删除了这段代码」（找 bug 引入点神器）
git log -- file1.java           # 只看某个文件的历史

# —— show：看「某次提交的详情」——
git show 3c4d5e6                # 显示该提交的说明 + 具体改动
git show HEAD                   # 显示最新提交
git show HEAD~2                 # 倒数第 3 次提交（HEAD~1 = 上一次）
git show HEAD:src/Main.java     # 看某个文件在某个版本时的内容

# —— blame：看「每一行是谁写的」——
git blame Main.java             # 逐行显示「这行是哪个提交、谁、什么时候写的」
git blame -L 20,40 Main.java    # 只看 20-40 行
git blame -w Main.java          # 忽略空白改动（避免格式化提交刷屏）
```

> 💡 **实战场景**：线上出 bug，你知道是某个方法引起的 → `git log -S "方法名"` 找到引入它的提交 → `git show` 看当时改了什么 → `git blame` 找到责任人。**三步定位，比翻聊天记录快一万倍。**

### 2.5 分支：建、切、合、删

```bash
# —— 查看 ——
git branch                      # 本地分支（* 表示当前所在分支）
git branch -a                   # 所有分支（含远程分支 remotes/origin/xxx）
git branch -v                   # 显示每个分支的最新提交

# —— 新建与切换 ——
git branch feature-login                 # 只新建，不切过去
git switch feature-login                 # 切换到已有分支（新命令，推荐）
git switch -c feature-login              # ⭐ 新建并切换（= 旧命令 git checkout -b）
git switch -c hotfix v1.2.0              # 基于某个 tag/commit 新建分支

# —— 合并 ——
git switch main                          # 先切回目标分支
git merge feature-login                  # 把 feature-login 合并进 main
git merge --no-ff feature-login          # 强制生成一个 merge commit（保留「曾经有分支」的痕迹）
git merge --abort                        # 合并冲突太多，放弃合并、回到合并前

# —— 删除 ——
git branch -d feature-login              # 删除已合并的分支（安全，未合并会拒绝）
git branch -D feature-login              # 强制删除（⚠️ 未合并也删，靠 reflog 还能救）
git push origin --delete feature-login   # 删除远程分支
```

> ⚠️ **`checkout` 的老问题**：它一个命令身兼「切分支、恢复文件、切 commit」三职，容易误操作（比如 `git checkout .` 会**丢掉所有未提交改动**）。Git 2.23 起拆成了两个更安全的命令：
> - **`git switch`** —— 只管切分支
> - **`git restore`** —— 只管恢复文件
> 新项目一律用这两个，语义清晰、不易误伤。

### 2.6 远程协作：`remote` / `fetch` / `pull` / `push`

```bash
# —— 远程仓库管理 ——
git remote -v                                     # 查看远程仓库地址
git remote add origin git@github.com:me/x.git     # 添加远程仓库（origin 是默认名字）
git remote set-url origin git@github.com:me/y.git # 改远程地址（换了仓库/从HTTPS换SSH）
git remote remove origin                          # 删除远程关联

# —— 拉取：fetch vs pull 的区别（重要）——
git fetch origin                # ⭐ 只下载远程更新，【不合并】到本地（安全，先看再决定）
git pull                        # = fetch + merge（下载并自动合并进当前分支）
git pull --rebase               # = fetch + rebase（下载并把你的提交挪到最新处，历史更线性）

# —— 推送 ——
git push                        # 推当前分支到跟踪的远程分支
git push -u origin feature-x    # 首次推送新分支并建立跟踪
git push origin --tags          # 推送所有本地标签
git push --force-with-lease     # ⭐ 安全的强推：如果远程有别人的新提交就拒绝（比 -f 安全）
```

> ⚠️ **`git pull` 的隐藏风险**：它会自动 merge，可能产生一堆「Merge branch 'main' of ...」的垃圾提交。**推荐做法**：要么先 `git fetch` 看一眼再决定，要么配置成 rebase：
> ```bash
> git config --global pull.rebase true   # 让 pull 默认走 rebase（历史干净）
> ```

**PR / MR 标准协作流程**（公司里天天用）：

```bash
git switch -c feature/order-export      # 1. 从 main 拉一个新分支
# ...写代码、commit...
git fetch origin                        # 2. 推送前先同步远程（避免落后）
git rebase origin/main                  # 3. 把 main 最新改动变基到自己分支（解决冲突在本地）
git push -u origin feature/order-export # 4. 推送分支
# 5. 到 GitHub/GitLab 网页上发起 Pull Request / Merge Request
# 6. Code Review 通过 → 由平台合并进 main（或点 Squash and merge 压成一个提交）
git switch main && git pull             # 7. 本地切回 main 并拉取最新
git branch -d feature/order-export      # 8. 删掉已完成的分支
```

### 2.7 撤销与回退：一张场景对照表（最实用）

> **Git 里「撤销」有七八种做法，选错就出事。** 先看表，再动手。

| 场景 | 命令 | 是否危险 |
|---|---|---|
| 改了文件，**还没 `add`**，想还原 | `git restore <file>` | ✅ 安全（丢弃本地改动） |
| 改了文件，想全部还原 | `git restore .` | ⚠️ 丢弃所有未暂存改动 |
| 已 `add`，想**撤出暂存区**（改动保留） | `git restore --staged <file>` | ✅ 安全 |
| 已 `commit`，想**改内容或改说明**（未 push） | `git commit --amend` | ⚠️ 改写历史 |
| 已 `commit`，想撤销但**保留改动** | `git reset --soft HEAD~1` | ⚠️ 改写历史 |
| 已 `commit`，想撤销且**丢弃改动** | `git reset --hard HEAD~1` | ❌ **危险！改动永久丢失** |
| 已 `push` 的提交要撤销 | `git revert <commit>` | ✅ 安全（生成反向提交） |
| 误删分支 / 误 reset | `git reflog` 找回 | ✅ 安全（见 3.4） |
| 想丢弃**某个文件**的所有本地改动 | `git restore <file>` | ⚠️ 该文件改动丢失 |

**三种 `reset` 的区别（务必分清）**：

```bash
git reset --soft HEAD~1   # 撤销提交，改动【保留在暂存区】（想重新提交）
git reset --mixed HEAD~1  # 撤销提交，改动【保留在工作区】（默认模式，想重新挑着 add）
git reset --hard HEAD~1   # 撤销提交，改动【直接丢弃】⚠️⚠️ 危险
```

> 💡 **记忆法**：`soft` 只动 HEAD（最轻）、`mixed` 动 HEAD + 暂存区（中等）、`hard` 动 HEAD + 暂存区 + 工作区（最狠）。
> ✅ **铁律：已经 push 的公共提交，永远用 `revert`，绝不用 `reset` + 强推。**

**`--amend` 的正确用法**（改最后一次提交）：

```bash
git add forgotten-file.java
git commit --amend                      # 把漏掉的文件补进上一次提交
git commit --amend -m "新的提交说明"      # 只改提交说明
# ⚠️ --amend 会生成【新的】commit（哈希变了），所以只能用于【还没 push】的提交
```

### 2.8 `stash`：临时存现场

**场景**：手上功能写了一半，突然要修线上紧急 bug，但又不想提交半成品。

```bash
git stash                     # 把当前所有改动「存起来」，工作区回到干净状态
git stash -u                  # 连【未跟踪的新文件】也一起存（默认不存新文件！）
git stash -m "订单导出-半成品"  # 存的时候带个说明（推荐，否则以后不知道存了啥）
git stash list                # 查看所有 stash（stash@{0} 是最新的）
git stash pop                 # 恢复最近的 stash 并【删除】它
git stash apply stash@{1}     # 恢复指定的 stash 但【保留】它（可反复用）
git stash drop stash@{1}      # 删除指定 stash
git stash clear               # 清空所有 stash
git stash show -p stash@{0}   # 看某个 stash 存了哪些改动
```

> ⚠️ **`stash` 不包含未跟踪文件（除非加 `-u`）**——很多人 `stash` 完发现新建的文件还在，就是这个原因。
> ⚠️ **`stash` 不是备份**，它只存在本地且容易被误清空。重要的东西还是用提交/分支。

### 2.9 `tag`：给版本贴标签

**类比**：`tag` 就是**书签**——commit 哈希太长记不住，给它起个名字 `v1.0.0`。

```bash
git tag                                  # 列出所有标签
git tag v1.0.0                           # 轻量标签（只是个指针，不推荐正式发版用）
git tag -a v1.0.0 -m "订单服务 1.0 正式版"  # ⭐ 附注标签（含作者、时间、说明，发版用这个）
git tag -a v1.0.0 9f8e7d4 -m "补打历史版本"  # 给历史某个 commit 补打标签
git show v1.0.0                          # 查看标签详情
git push origin v1.0.0                   # 推送单个标签
git push origin --tags                   # 推送所有标签（⚠️ 会推所有本地标签）
git tag -d v1.0.0                        # 删除本地标签
git push origin --delete v1.0.0          # 删除远程标签
```

### 2.10 团队工作流怎么选

| 工作流 | 分支模型 | 适合场景 | 缺点 |
|---|---|---|---|
| **Git Flow** | `main` + `develop` + `feature` + `release` + `hotfix` | 有明确发版周期的产品（如客户端） | 分支多、流程重 |
| **GitHub Flow** | `main` + `feature` 分支 + PR | **持续部署的 Web 服务（主流）** | 要求 main 始终可发布 |
| **GitLab Flow** | `main` + 环境分支（staging/prod） | 多环境部署 | 需要维护环境分支 |
| **主干开发（Trunk-Based）** | 只有 `main`，小步快跑 | 高频发布、强 CI/CD 的团队 | 对测试/自动化要求高 |

> ✅ **给多数后端团队的建议**：**GitHub Flow**——`main` 永远可发布，任何改动都走「拉分支 → PR → Code Review → 合并」。
> **分支命名规范**：`feature/xxx`、`bugfix/xxx`、`hotfix/xxx`、`release/1.2.0`。

---

## 三、进阶篇：高手的操作与救援

### 3.1 `merge` vs `rebase`：两种「合代码」的姿势

这是 Git 里最容易被问、也最容易用错的一对概念。

**`merge`（合并）**：把两条线用一个**新的合并提交**接起来。

```
      D ── E ──┐
     /          ↓
A ── B ── C ── M(merge commit)      ← 保留了「曾经分叉」的事实
```

**`rebase`（变基）**：把你的提交**「摘下来」，重新接到目标分支的最新处**，一条直线。

```
A ── B ── C ── D' ── E'             ← 看不出曾经分过叉，历史像从未分叉
```

| | `merge` | `rebase` |
|---|---|---|
| 提交历史 | 保留分叉，多出 merge commit（**真实**） | 一条直线（**整洁**，但是改写的） |
| 冲突解决次数 | **只解一次**（在合并点） | **可能每个提交都要解一次** |
| 是否改写历史 | ❌ 不改 | ✅ **改写**（提交哈希全变） |
| 适用分支 | **公共分支**（main/develop） | **个人分支**（还没 push / 只有自己在用） |
| 风险 | 历史乱，但不丢东西 | 误用在公共分支 → 同事历史错乱 |

> ✅ **一句话决策**：
> - **往公共分支合代码 → 用 `merge`**（或平台上的 Merge Request）
> - **更新自己的个人分支 → 用 `rebase`**（保持线性，避免垃圾 merge 提交）
> - **已经 push 给别人的分支 → 不要 rebase**（要合就 merge）

**典型用法：让自己的分支跟上 main 的最新进度**

```bash
git switch feature-x
git fetch origin
git rebase origin/main     # 把 feature-x 的提交「重放」到 main 最新处
# 有冲突就解决 → git add → git rebase --continue
# 想放弃 → git rebase --abort
git push --force-with-lease   # ⚠️ rebase 改写了历史，推送需要强推（用 --force-with-lease 更安全）
```

### 3.2 交互式 rebase：`git rebase -i`（整理提交的艺术）

**场景**：你在一堆「wip」「改一下」「再改一下」的垃圾提交之后，想合并成一个干净的提交再提 PR。

```bash
git rebase -i HEAD~4     # 整理最近 4 个提交
```

执行后会打开编辑器，列出这 4 个提交（**从上到下是从旧到新**）：

```
pick 3c4d5e6 feat: 新增订单导出
pick 9f8e7d4 wip
pick a1b2c3f 改一下
pick 7d8e9f0 再改一下
```

把 `pick` 改成下面的指令，保存退出即可：

| 指令 | 作用 | 场景 |
|---|---|---|
| `pick` | 保留该提交（默认） | 不改动 |
| **`squash`**（或 `s`） | **合并进上一个提交**，并合并提交说明 | 把「wip」揉进正式提交 ⭐ |
| **`reword`**（或 `r`） | 保留改动，但**改提交说明** | 说明写错了 |
| **`edit`**（或 `e`） | 停下来，允许你修改这次提交的内容 | 要补文件/改代码 |
| **`drop`**（或 `d`） | **删除该提交** | 提交多余了 |
| `fixup`（或 `f`） | 同 squash，但**丢弃**这条的提交说明 | 只想合改动、不要说明 |

**实操示例：把 4 个提交压成 1 个**

```
pick   3c4d5e6 feat: 新增订单导出
squash 9f8e7d4 wip
squash a1b2c3f 改一下
squash 7d8e9f0 再改一下
```

保存退出后，Git 会让你编辑合并后的提交说明 → 写一句干净的 `feat(order): 新增订单导出接口` → 完成。

> ⚠️ **交互式 rebase 会改写哈希**，只能用于**还没 push 或只有自己在用的分支**。
> 💡 **顺序也可以调**：在编辑器中把行的上下顺序换一下，提交顺序就变了（Git 会重放）。冲突时按提示 `--continue` / `--abort`。

### 3.3 `cherry-pick`：只摘一个提交

**场景**：`feature-a` 上有个 bug 修复，你也需要用到 `feature-b` 上，但又不想合整个分支。

```bash
git switch feature-b
git cherry-pick 9f8e7d4              # 把指定提交「复制」到当前分支（生成一个新的哈希）
git cherry-pick 9f8e7d4 a1b2c3f      # 一次摘多个
git cherry-pick 9f8e7d4..7d8e9f0     # 摘一个区间（不含起点）
git cherry-pick -n 9f8e7d4           # -n = 只改工作区不自动提交（想改点东西再提交）
git cherry-pick --continue           # 冲突解决后继续
git cherry-pick --abort              # 放弃
```

**典型用途**：
- 把某个 hotfix 从 main 同步到 release 分支；
- 把误提到错误分支的提交「搬」到正确分支（配合 `git reset` 从原分支删掉）。

> ⚠️ **cherry-pick 会产生「内容相同但哈希不同」的提交**——如果之后两个分支再合并，可能出现重复内容或冲突。**能用 merge/rebase 就别用 cherry-pick**，它属于「精准外科手术」。

### 3.4 `reflog` 救援实录：代码「丢了」怎么救回来

**这是进阶篇最值钱的一节。** 记住一句话：**只要提交过，就几乎不可能真丢**。

**场景一：`git reset --hard` 之后后悔了**

```bash
git reflog
# 输出（从上到下是从近到远）：
# a1b2c3f HEAD@{0}: reset: moving to HEAD~1     ← 你刚才的「危险操作」
# 9f8e7d4 HEAD@{1}: commit: feat: 新增订单导出   ← 被 reset 掉的提交，在这里！
git reset --hard 9f8e7d4     # 直接回到那个提交，满血复活 ✅
```

**场景二：误删了分支**

```bash
git reflog
# 找到该分支最后一次提交的哈希，例如 3c4d5e6
git switch -c feature-login 3c4d5e6   # 用那个哈希重新建分支，分支回来了 ✅
```

**场景三：rebase 搞砸了，想回到 rebase 之前**

```bash
git reflog
# 找到 rebase 开始前的 HEAD，例如：
# 7d8e9f0 HEAD@{5}: rebase (start): checkout origin/main
git reset --hard 7d8e9f0     # 回到 rebase 之前 ✅
```

**场景四：`commit --amend` 之后想找回 amend 前的版本**

```bash
git reflog
# 3c4d5e6 HEAD@{1}: commit (amend): ...   ← amend 前的那次提交
git reset --hard HEAD@{1}
```

> ✅ **保命口诀**：**「出事了先别慌，`git reflog` 看一眼」**。
> ⚠️ reflog 默认保留 90 天（不可达对象 30 天后可能被 GC）。所以**发现误操作要尽快救**，别拖几个月。

### 3.5 冲突解决：完整流程

**冲突什么时候发生？** 两个人改了**同一个文件的同一块区域**，Git 无法自动判断该保留谁。

**冲突文件里会出现三段标记**：

```
<<<<<<< HEAD                    ← 以下是【当前分支】的内容
    int total = price * count;
=======                         ← 分隔线
    int total = price * count * discount;
>>>>>>> feature-discount        ← 以上是【要合进来】的内容
```

**解决步骤（通用）**：

```bash
# 1. 冲突时 git status 会显示 both modified
git status

# 2. 打开冲突文件，把 <<<<<<< ======= >>>>>>> 三段标记删掉，改成你想要的最终代码
#    （IDE 里一般有「Accept Current / Accept Incoming / Accept Both」按钮）

# 3. 标记为已解决
git add <冲突文件>

# 4. 继续流程（取决于你当时在做什么）
git commit            # merge 冲突 → 直接 commit 完成合并
git rebase --continue # rebase 冲突 → 继续
git cherry-pick --continue
```

**冲突太多想放弃重来**：

```bash
git merge --abort        # 放弃合并
git rebase --abort       # 放弃变基
git cherry-pick --abort  # 放弃摘樱桃
git reset --hard ORIG_HEAD   # 兜底：回到操作前的状态
```

**减少冲突的实用技巧**：
1. **勤同步**：每天开工先 `git fetch` + rebase 一次 main，别攒到最后；
2. **小步提交**：提交越小、改动越聚焦，冲突越少；
3. **统一格式化**：团队统一 IDE 格式化规则 + `.editorconfig`，避免「只有空格变化」的假冲突；
4. **`git rerere`**：Git 能**记住你解过的冲突**，下次同样的冲突自动解决：
   ```bash
   git config --global rerere.enabled true   # 开启「冲突复用」
   ```

### 3.6 `.gitignore` 与 `.gitattributes`

**`.gitignore`：告诉 Git「这些文件别管」**

```gitignore
# —— Java / Maven ——
target/
*.class
*.jar
!.mvn/wrapper/maven-wrapper.jar   # ! 表示「例外：这个 jar 要提交」

# —— IDE ——
.idea/
*.iml
*.ipr
*.iws
.vscode/

# —— 日志与临时文件 ——
*.log
logs/
*.tmp
*.bak

# —— 系统文件 ——
.DS_Store          # macOS
Thumbs.db          # Windows

# —— 敏感信息（绝对不能提交！）——
*.env
application-local.yml
*.pem
*.key
```

**语法要点**：

| 写法 | 含义 |
|---|---|
| `target/` | 忽略所有名为 target 的目录（**结尾斜杠表示目录**） |
| `*.log` | 忽略所有 .log 文件 |
| `!important.log` | **例外**：不忽略这个文件（`!` 取反） |
| `/build` | 只忽略**根目录**下的 build（开头斜杠锚定根） |
| `doc/*.txt` | 忽略 doc 下一层的 txt（不递归子目录） |
| `doc/**/*.txt` | 忽略 doc 下**任意层级**的 txt |
| `# 注释` | 注释 |

> ⚠️ **最大的坑：`.gitignore` 只对「还没被跟踪的文件」生效**。
> 如果某个文件**已经被提交过**，再加进 `.gitignore` 是没用的，必须先从版本库移除：
> ```bash
> git rm -r --cached target/     # 从版本库删除（--cached 表示【保留本地文件】）
> git commit -m "chore: 移除误提交的 target 目录"
> ```

**`.gitattributes`：按文件类型设置 Git 行为**

```gitattributes
# 统一换行符（跨平台协作必备）
* text=auto

# 指定某些文件必须用 LF（如 shell 脚本，Windows 换行会导致执行报错）
*.sh text eol=lf

# 二进制文件不做换行转换、不显示 diff
*.png binary
*.jpg binary
*.xlsx binary

# 让 GitHub 把某类文件识别为某语言（影响仓库语言统计）
*.md linguist-documentation
```

### 3.7 Git LFS：管理大文件

**问题**：Git 存的是「每次提交的完整快照」，一个 100MB 的设计稿改 10 次，`.git` 就膨胀 1GB，克隆要半小时。

**解决**：**Git LFS（Large File Storage）**——大文件本体存在单独的服务器上，Git 仓库里只存一个「指针文件」（几行文本）。

```bash
git lfs install                          # 安装 LFS（每台机器一次）
git lfs track "*.psd"                    # 让 Git 用 LFS 管理 psd 文件（会生成/修改 .gitattributes）
git lfs track "*.zip" "*.mp4"
git add .gitattributes                   # ⚠️ 一定要把 .gitattributes 一起提交
git add design.psd && git commit -m "design: 新增首页设计稿"
git lfs ls-files                         # 看哪些文件被 LFS 管理
```

> ⚠️ **LFS 必须「提前配置」**：如果一个 100MB 文件已经被普通提交了，再装 LFS 也**不会**自动瘦身历史，得用 `git lfs migrate import --include="*.psd"` 重写历史。
> 💡 **GitHub 免费 LFS 额度只有 1GB**，超出要付费；大文件建议直接用对象存储（MinIO/OSS）。

### 3.8 子模块与子树：一个仓库引用另一个仓库

**场景**：项目 A 需要复用项目 B 的代码，但 B 也在独立迭代。

| 方案 | 命令 | 特点 |
|---|---|---|
| **submodule（子模块）** | `git submodule add <url> libs/b` | A 里只存 B 的**「某个提交的引用」**，代码不同步进来；克隆要加 `--recurse-submodules` |
| **subtree（子树）** | `git subtree add --prefix=libs/b <url> main --squash` | B 的代码**真的复制进 A**，A 是自包含的；但 A 会变大 |

```bash
# —— submodule 常用命令 ——
git clone --recurse-submodules <url>          # 克隆时连子模块一起拉
git submodule update --init --recursive       # 已有仓库补拉子模块
git submodule update --remote                 # 把子模块更新到远程最新
git submodule status                          # 查看子模块状态

# —— subtree 常用命令 ——
git subtree add   --prefix=libs/b <url> main --squash   # 添加子树
git subtree pull  --prefix=libs/b <url> main --squash   # 更新子树
git subtree push  --prefix=libs/b <url> feature         # 把子树改动推回上游
```

> ✅ **怎么选**：需要**独立版本管理、可能被别人引用** → submodule；只想**静态复用一份代码、不关心上游历史** → subtree。
> ⚠️ **submodule 是出了名的「坑多」**（忘记 init、切分支后子模块状态错乱），团队用之前一定要统一文档。

### 3.9 Git Hooks：在关键时刻自动执行脚本

**Hooks = 钩子**，Git 在特定动作前后自动执行的脚本，放在 `.git/hooks/` 下。常用两个：

| Hook | 触发时机 | 典型用途 |
|---|---|---|
| **`pre-commit`** | `commit` 之前 | 代码格式化、静态检查、跑单测（不合格就拒绝提交） |
| **`commit-msg`** | 写完提交说明后 | 校验提交信息是否符合规范（如必须 `feat:`/`fix:` 开头） |
| **`pre-push`** | `push` 之前 | 跑测试、检查是否有调试代码 |

**注意**：`.git/hooks/` **不会随仓库提交**（它是本地目录），所以团队协作要用工具自动安装：

```bash
# 方案一：Husky（前端常用，Java 项目也能用）
npm install husky --save-dev
npx husky init

# 方案二：pre-commit（Python 生态，跨语言通用）
pip install pre-commit
pre-commit install

# 方案三：自己写一个（最简单）
cat > .git/hooks/pre-commit <<'EOF'
#!/bin/sh
# 提交前检查是否有 console.log / System.out.println 调试代码
if git diff --cached | grep -qE '^\+.*(console\.log|System\.out\.println)'; then
  echo "❌ 检测到调试代码，请先删除再提交"
  exit 1
fi
EOF
chmod +x .git/hooks/pre-commit
```

### 3.10 仓库瘦身：`.git` 太大怎么办

```bash
git count-objects -vH            # 看 .git 目录到底多大
git gc --aggressive --prune=now # 手动触发垃圾回收（压缩对象、清理不可达对象）
git prune                        # 清理不可达对象

# 如果历史里有误提交的大文件（如 100MB 的 zip），需要重写历史
# 推荐用官方工具 git-filter-repo（比旧的 filter-branch 快得多、安全得多）
pip install git-filter-repo
git filter-repo --path big-file.zip --invert-paths   # 从所有历史中彻底删除该文件
# ⚠️ 重写历史后必须 force push，且所有协作者都要重新 clone
```

### 3.11 翻车救援手册（贴在工位上）

| 翻车现场 | 救援命令 |
|---|---|
| 改了代码想全部丢弃 | `git restore .` |
| `add` 错了想撤出 | `git restore --staged <file>` |
| `commit` 说明写错了 | `git commit --amend -m "新说明"` |
| `commit` 漏了文件 | `git add <file> && git commit --amend --no-edit` |
| 想撤销上次 commit 但留改动 | `git reset --soft HEAD~1` |
| 想撤销上次 commit 且丢改动 | `git reset --hard HEAD~1` |
| 已经 push 了要撤销 | `git revert <commit>` |
| 误删分支 | `git reflog` → `git switch -c 分支名 <哈希>` |
| reset/rebase 搞砸了 | `git reflog` → `git reset --hard HEAD@{n}` |
| 合并到一半想放弃 | `git merge --abort` |
| 提交到错误分支了 | 正确分支 `git cherry-pick <哈希>` → 原分支 `git reset --hard HEAD~1` |
| push 被拒（远程有新提交） | `git pull --rebase` 后再 push |
| 想找回被覆盖的本地文件 | `git reflog` 或 `git fsck --lost-found` |
| 提交里混进了密钥/密码 | ①**立即到平台作废该密钥** ②`git filter-repo` 清理历史 ③force push ④通知团队重克隆 |

> ⚠️ **关于密钥泄露**：**第一优先级永远是「去平台把密钥作废/轮换」**，而不是急着清理 Git 历史。密钥一旦 push 到远程（尤其公开仓库），就必须视为已泄露——网上有大量爬虫专扫 GitHub 的 key。

---

## 四、IDEA 中使用 Git（图形界面实操）

> IDEA 把 Git 的命令都做成了可视化操作。**但记住：界面点按钮 ≠ 不用懂原理**——上面所有命令对应的菜单项，我在下面都标了出来，方便你「界面 ↔ 命令」对照理解。

### 4.1 前置配置（先配好，后面才顺）

**① 指定 Git 可执行文件**

`Settings`（macOS 是 `IntelliJ IDEA → Settings`，快捷键 `⌘,` / `Ctrl+Alt+S`）→ `Version Control` → `Git`
- 在 **Path to Git executable** 里选择本机 `git` 路径（IDEA 通常能自动探测到，点 `Test` 验证）
- 看到 `Git version x.x.x` 即配置成功

**② 绑定 GitHub / GitLab 账号**

`Settings → Version Control → GitHub` → `Add Account`
- 支持三种方式：**Log In via GitHub**（浏览器授权，最省事）/ **Token**（推荐，用 Personal Access Token）/ **Password**
- 配好后可以直接在 IDEA 里创建仓库、发起 PR、管理 Issue

**③ 检查提交作者信息**

`Settings → Version Control → Git → 右下角` 或直接看终端 `git config user.name`。
如果显示的不是你，说明全局配置没做（见 2.1 节），会导致提交记录挂到别人名下。

**④ 建议打开的设置**

| 设置项 | 位置 | 建议 |
|---|---|---|
| 提交界面用经典版 | `Version Control → Commit` → 取消勾选 `Use non-modal commit interface` | 习惯传统提交面板的人 |
| 文件编码 UTF-8 | `Editor → File Encodings` → 全部选 `UTF-8` | 防止中文乱码 |
| 显示行内 blame | 编辑器左侧边栏右键 → `Configure Gutter Icons` | 一眼看到每行最后是谁改的 |

### 4.2 界面总览：四个地方要认准

| 位置 | 怎么打开 | 作用 |
|---|---|---|
| **Git 工具窗口** | `⌘9` / `Alt+9`（或 `View → Tool Windows → Git`） | 看本地改动、Log 历史、分支、Shelf |
| **右下角分支切换器** | 点窗口右下角的分支名 | 切分支、新建分支、合并、rebase |
| **左侧行号区（Gutter）** | 默认显示 | 蓝色竖条=本行有改动；点它可看 diff / blame |
| **底部状态栏** | 默认显示 | 当前分支名、是否有未推送提交 |

**Git 工具窗口的三个 Tab**：

```
┌─────────────────────────────────────────────┐
│  Local Changes │  Log │  Shelf │  Console   │
├─────────────────────────────────────────────┤
│  Local Changes：本次改动的文件（可勾选提交）      │
│  Log          ：提交历史（可右键做回退/合并）     │
│  Shelf        ：IDEA 特有的「搁置」功能（≈stash）│
│  Console      ：执行过的 Git 命令回显（学习神器） │
└─────────────────────────────────────────────┘
```

> 💡 **Console 是最好的老师**：你在界面上每点一次按钮，它都会把对应的 Git 命令打印出来。**想学命令，就盯着 Console 看**。

### 4.3 提交代码：Commit 面板

**操作路径**：改完代码 → `⌘K` / `Ctrl+K`（或 `Git → Commit`）

**面板里要做的 5 件事**：

1. **勾选要提交的文件**——只想提交部分文件就只勾它们（对应 `git add <file>`）
2. **检查每个文件的 diff**——点文件名右侧的箭头，看具体改了哪几行（**提交前必看！**）
3. **写 Commit Message**——顶部输入框，建议按 Conventional Commits 规范
4. **选择提交方式**：
   - `Commit` —— 只提交到本地（对应 `git commit`）
   - `Commit and Push...` —— 提交并推送（对应 `git commit && git push`）
5. **可选高级操作**（点齿轮/更多按钮）：
   - `Amend` —— 修补上一次提交（对应 `git commit --amend`）
   - `Sign-off` —— 添加签名
   - `Run Git hooks` —— 是否执行钩子

**提交时的几个实用按钮**：

| 按钮 | 作用 | 对应命令 |
|---|---|---|
| 勾选框 | 选要提交的文件 | `git add <file>` |
| 文件名右侧箭头 | 展开看 diff | `git diff` |
| 蓝色箭头（↗） | 只提交该文件的**部分改动** | `git add -p` |
| `Rollback`（右键文件） | 丢弃该文件的改动 | `git restore <file>` |
| 顶部 `Amend` | 修补上次提交 | `git commit --amend` |

**自定义 Commit Message 模板**（团队统一格式）：

`Settings → Version Control → Commit → Commit Message Template`，填入：

```
<type>(<scope>): <subject>

# 请按规范填写：
#   feat: 新功能   fix: 修bug   docs: 文档   refactor: 重构
#   perf: 性能     test: 测试   chore: 构建/依赖
# 例如：feat(order): 新增订单批量导出接口
```

之后每次打开提交面板，输入框都会自动带出这段模板。

### 4.4 查看历史：Log 面板

**操作路径**：`⌘9` / `Alt+9` 打开 Git 工具窗口 → 点 `Log` Tab

**Log 面板能看到什么**：

- 左侧：**分支/标签列表**（点 `All` 看所有分支，点某个分支只看它）
- 中间：**提交树形图**（能看到分叉与合并，对应 `git log --graph`）
- 右侧：**选中提交的文件列表 + diff**

**常用操作（右键提交）**：

| 菜单项 | 作用 | 对应命令 |
|---|---|---|
| `Show Diff` | 看这次提交改了什么 | `git show <commit>` |
| `Copy Revision Number` | 复制完整哈希 | — |
| `Create Branch` | 基于此提交建分支 | `git branch x <commit>` |
| `Checkout Revision` | 切到这个提交（⚠️ 分离头指针） | `git checkout <commit>` |
| `Cherry-Pick` | 把这个提交摘到当前分支 | `git cherry-pick <commit>` |
| `Revert Commit` | 生成反向提交撤销它 | `git revert <commit>` |
| `Reset Current Branch to Here` | 把当前分支回退到这里 | `git reset` |

**看「某一行是谁写的」**：

在编辑器**左侧行号区右键** → `Annotate with Git Blame`
- 每行左侧会显示：提交哈希（缩写）+ 作者 + 时间
- 鼠标悬停能看到完整提交信息
- 右键某一行 → `Show Diff` / `Copy Revision Number` 等

**看某个文件的历史**：

右键文件 → `Git → Show History`（看该文件的所有提交）
右键文件 → `Git → Compare with...`（和某个版本/分支对比）

### 4.5 分支操作

**新建 / 切换**：
- 点**右下角分支名** → `New Branch`（新建）→ 输入名字 → 勾选 `Checkout branch` 即新建并切换
- 或 `Git 工具窗口 → Branches → New Branch`

**切换分支**：右下角分支名 → 在弹出的列表里点目标分支

**合并**：右下角分支名 → 选 `main` → `Merge into Current`
- 对应命令：`git switch feature && git merge main`

**变基（Rebase）**：右下角分支名 → 选 `main` → `Rebase Current onto Selected`
- 对应命令：`git rebase main`
- ⚠️ IDEA 会提示这是「改写历史」的操作，公共分支别用

**`Update Project`（拉取远程更新）**：

`⌘T` / `Ctrl+T`（或 `Git → Update Project`），弹出框里选：

| 选项 | 含义 | 建议 |
|---|---|---|
| **Merge** | 拉取并合并（可能产生 merge commit） | 团队要求保留分叉时 |
| **Rebase** | 拉取并把本地提交变基到最新 | ⭐ **推荐**，历史干净 |
| **Reset** | 丢弃本地改动，强制和远程一致 | ⚠️ 危险 |
| `Stash` / `Shelve` | 先搁置本地改动再拉取 | 本地有未提交改动时勾选 |

**`Push`**：`⌘⇧K` / `Ctrl+Shift+K`（或 `Git → Push`）
- 弹窗里能看到「要推送哪些提交」，确认后点 `Push`
- 若远程有新提交，IDEA 会提示 `Push Rejected` → 先 `Update Project` 再推

### 4.6 解决冲突：三栏合并工具

**冲突发生时 IDEA 会自动弹出 `Merge Conflicts` 对话框**，列出所有冲突文件，每个文件有三个选项：
- `Accept Yours` —— 全部用我的
- `Accept Theirs` —— 全部用对方的
- `Merge...` —— **打开三栏合并工具**（推荐）

**三栏合并工具怎么看**：

```
┌──────────────────┬──────────────────┬──────────────────┐
│   Left（我的）    │  Result（结果）   │  Right（对方的）  │
│  当前分支的版本    │  最终要保存的内容  │  要合进来的版本    │
├──────────────────┼──────────────────┼──────────────────┤
│  ─ 高亮=冲突块    │   ◄ 点箭头搬过来   │  ─ 高亮=冲突块    │
│  ─ 绿=新增        │                  │  ─ 绿=新增        │
│  ─ 灰=未变        │                  │  ─ 红=删除        │
└──────────────────┴──────────────────┴──────────────────┘
```

- 点击中间的 `»` / `«` 箭头，把某一侧的内容**采纳到 Result 栏**
- 也可以直接在 Result 栏手动编辑
- 全部解决后点 `Apply` → 回到提交/合并流程

> ✅ **处理原则**：不要无脑点 `Accept Yours/Theirs`——**要理解两边各自的意图**，把「双方都要保留的改动」合并到一起。实在拿不准，找改动的那位同事当面聊 5 分钟，比对着屏幕猜半小时快。

### 4.7 回退与撤销（IDEA 版对照表）

| 想干什么 | IDEA 操作 | 对应命令 |
|---|---|---|
| 丢弃某个文件的改动 | 右键文件 → `Git → Rollback` | `git restore <file>` |
| 撤销上一次提交（保留改动） | Log → 右键上次提交 → `Reset Current Branch to Here` → 选 `Soft` | `git reset --soft HEAD~1` |
| 撤销上一次提交（丢弃改动） | 同上 → 选 `Hard` ⚠️ | `git reset --hard HEAD~1` |
| 撤销某次提交（安全） | Log → 右键该提交 → `Revert Commit` | `git revert <commit>` |
| 修改上一次提交信息 | Commit 面板 → 勾 `Amend` → 改说明 → Commit | `git commit --amend` |
| 把某个提交搬到当前分支 | Log → 右键 → `Cherry-Pick` | `git cherry-pick` |
| 误操作后找回 | `Git → Show Git Reflog`（或 `⌘9 → Log → 顶部 Reflog`） | `git reflog` |
| 撤销 rebase/merge | Log 顶部 `Reset Current Branch to Here` + reflog 定位 | `git reset --hard` |

> 💡 **`Reset Current Branch to Here` 的三种模式**（弹窗里选）：
> - **Soft** —— 保留改动在暂存区（想重新提交）
> - **Mixed** —— 保留改动在工作区（默认，想重新挑着 add）
> - **Hard** —— 直接丢弃改动（⚠️ 危险，但能靠 reflog 救）

### 4.8 `Shelve` vs `Stash`：IDEA 的两个「暂存」功能

IDEA 有两套暂存机制，新手常搞混：

| | **Stash**（Git 原生） | **Shelve**（IDEA 特有） |
|---|---|---|
| 存在哪 | Git 仓库里（`git stash`） | IDEA 自己的 Shelf 里 |
| 能否用命令行看到 | ✅ `git stash list` | ❌ 只有 IDEA 认识 |
| 能否跨机器/分享 | ✅ 可以（本质是 Git 对象） | ❌ 不行，只在本机 IDEA |
| 功能 | 基础 | **更强**：可选择性搁置部分文件、可同时存在多个 Shelf、可随时查看 diff |
| 推荐场景 | 需要和命令行/同事共享 | **纯本地临时切换任务**（推荐日常用） |

**操作**：
- Stash：`Git → Uncommitted Changes → Stash Changes...`
- Shelve：`Git 工具窗口 → Shelf Tab → Shelve Changes...`，恢复用 `Unshelve`

> 💡 **日常建议用 Shelve**（更灵活、可命名、可部分搁置）；**需要和命令行/同事协作时用 Stash**。

### 4.9 `.gitignore` 与 `.idea` 目录：IDEA 项目必看

**`.idea` 目录是 IDEA 的项目配置**，里面文件分两类：

| 文件 | 是否该提交 | 原因 |
|---|---|---|
| `workspace.xml` | ❌ **绝对不提交** | 存你的窗口布局、最近打开文件，纯个人配置 |
| `modules.xml` / `*.iml` | ❌ 一般不提交 | 模块配置，不同人导入方式不同 |
| `vcs.xml` | ⚠️ 看团队约定 | 版本控制映射，有些团队提交 |
| `codeStyles/` / `inspectionProfiles/` | ✅ **建议提交** | 统一团队的代码风格和检查规则 |
| `dictionaries/` | ✅ 可提交 | 团队统一词典 |

**推荐的 `.gitignore`**：

```gitignore
# IDEA
.idea/workspace.xml
.idea/usage.statistics.xml
.idea/shelf/
.idea/tasks.xml
*.iml

# 如果团队要共享代码风格，可以只忽略个人配置，保留 codeStyles：
# .idea/*
# !.idea/codeStyles/
# !.idea/inspectionProfiles/
```

**在 IDEA 里生成 `.gitignore`**：
- 新建文件时选 `File → New → .gitignore File`（需装 `.ignore` 插件）
- 或用 `File → New → File` 直接建，IDEA 会识别为 ignore 文件并高亮语法

**如果 `.idea/workspace.xml` 已经被误提交了**：

```bash
git rm --cached .idea/workspace.xml    # 从版本库移除但保留本地文件
# 然后加进 .gitignore 并提交
```

### 4.10 常用快捷键与效率技巧

| 快捷键（macOS / Windows） | 功能 |
|---|---|
| `⌘K` / `Ctrl+K` | 打开 Commit 面板 |
| `⌘⇧K` / `Ctrl+Shift+K` | Push |
| `⌘T` / `Ctrl+T` | Update Project（拉取远程） |
| `⌘9` / `Alt+9` | 打开 Git 工具窗口 |
| `⌘⇧` + `` ` `` / `Ctrl+Shift+`` ` `` | 打开分支切换弹窗 |
| `⌃V` / `Alt+`` ` `` | 打开 VCS 快捷操作弹窗 |
| `⌘D` / `Ctrl+D` | 在 diff 窗口里看下一个改动 |
| `⌘⇧V`（Log 面板） | 查看某提交的 diff |

**三个效率技巧**：

1. **提交前用 `Local Changes` 逐个文件检查 diff**——比事后 debug 便宜一百倍；
2. **善用 `Git → Show Git Reflog`**——IDEA 里也能看 reflog，误操作不用切终端；
3. **看 `Console` Tab**——每点一次按钮就学一条命令，一个月就能脱离鼠标。

### 4.11 IDEA 常见报错与解决

| 报错 | 原因 | 解决 |
|---|---|---|
| `Please tell me who you are` | 没配 user.name/email | `git config --global user.name/email` |
| `Could not read from remote repository` | SSH key 没配 / 权限不足 | 配 SSH key（见 2.1）；或改用 HTTPS + Token |
| `Push rejected: non-fast-forward` | 远程有别人的新提交 | 先 `Update Project`（Merge/Rebase）再 push |
| `fatal: refusing to merge unrelated histories` | 两个无共同祖先的仓库要合并 | `git pull origin main --allow-unrelated-histories` |
| 中文文件名显示成 `\346\226\207` | `core.quotepath` 默认 true | `git config --global core.quotepath false` |
| 中文乱码（diff/提交信息） | 编码不是 UTF-8 | `Editor → File Encodings` 全设 UTF-8；`git config --global i18n.commitEncoding utf-8` |
| `You are in 'detached HEAD' state` | 直接 checkout 了某个 commit | 想保留改动就 `git switch -c 新分支名`；不想保留就切回分支 |
| 提示 `LF will be replaced by CRLF` | 跨平台换行符不一致 | 配 `core.autocrlf`（见 2.1）+ 用 `.gitattributes` |
| 提交里混进了 `target/`、`.idea/` | 没配 `.gitignore` | `git rm -r --cached target/` + 补 `.gitignore` |
| 文件已改但 IDEA 不显示在改动列表 | IDEA 索引缓存问题 | `File → Invalidate Caches → Invalidate and Restart` |
| 分支切换后代码没变 | 有未提交改动被 IDE 提示拦截 | 先 Commit / Shelve，再切分支 |

---

## 五、踩坑清单（速查表）

> 这些都是真实踩过、或者在 Code Review 里反复纠正的问题。**建议单独存一份，出问题时对照查。**

### 5.1 原理认知类坑

| ❌ 错误认知 | ✅ 正确理解 |
|---|---|
| 「Git 存的是每次改动的差异」 | Git 存的是**每次提交的完整快照**（内部去重压缩） |
| 「分支是代码的副本」 | 分支只是**一个指向 commit 的 41 字节指针**，所以建分支是毫秒级 |
| 「`.gitignore` 加进去文件就不被跟踪了」 | 只对**未跟踪文件**生效；已提交的要先 `git rm --cached` |
| 「删了分支，代码就没了」 | commit 对象还在，`reflog` 能找回（默认 90 天） |
| 「`git pull` 就等于 `git fetch`」 | `pull` = `fetch` + `merge`，会自动合并，有产生垃圾提交的风险 |
| 「提交信息随便写写就行」 | 提交信息是**团队最重要的文档**，`update`/`修改` 等于没写 |

### 5.2 日常操作类坑

| 坑 | 后果 | 正确做法 |
|---|---|---|
| `git add .` 一把梭 | 把 `target/`、`.idea/`、本地配置一起提交 | 先 `git status` 确认，或用 `git add -p` 挑着提 |
| `git commit -am` 提交新文件 | **新文件不会被提交**（`-a` 只对已跟踪文件生效） | 新文件必须先 `git add` |
| `git stash` 后发现新文件还在 | 默认**不包含未跟踪文件** | 用 `git stash -u` |
| 提交前不看 `git diff --staged` | 把调试代码、密码、日志一起提交了 | 提交前必看：`git diff --staged` |
| 在 `main` 分支直接改代码 | 一不留神把半成品提交到主干 | **永远先拉分支**：`git switch -c feature/xxx` |
| 提交信息写 `update`、`提交` | 历史无法追溯，Code Review 没法看 | 遵循 Conventional Commits |

### 5.3 危险操作类坑（重点）

| 危险操作 | 风险 | 安全替代 |
|---|---|---|
| `git reset --hard` | **未提交的改动永久丢失** | 先 `git stash` 保底；或用 `--soft` |
| `git push -f` 到公共分支 | **抹掉同事的提交**，团队炸锅 | 用 `git push --force-with-lease`；公共分支用 `revert` |
| 对已 push 的分支做 `rebase` | 历史改写，同事拉代码全线冲突 | 只对**个人未共享**分支 rebase |
| `git checkout .` / `git restore .` | 丢弃所有未提交改动 | 动手前先 `git stash` 或提交 |
| `git clean -fd` | **删除所有未跟踪文件**（新建的文件全没了） | 先 `git clean -nd`（dry-run）看会删什么 |
| 在 detached HEAD 状态下提交 | 提交不属于任何分支，容易「丢失」 | 先 `git switch -c 新分支名` |
| 把密钥/密码提交进仓库 | 视为已泄露，可能被爬虫扫到 | 用环境变量/配置中心；万一提交了**先去平台作废密钥** |

### 5.4 IDEA 使用类坑

| 坑 | 正确做法 |
|---|---|
| 把 `.idea/workspace.xml` 提交了 | 加进 `.gitignore`，`git rm --cached` 移除 |
| 切换分支时 IDEA 报错/卡住 | 先 Commit 或 Shelve 本地改动，再切分支 |
| 合并冲突无脑点 `Accept Yours` | 打开三栏 Merge 工具，理解双方意图后再合 |
| 不知道界面操作对应什么命令 | 看 `Git 工具窗口 → Console` Tab，每步都打印命令 |
| 误操作后只会重新 clone | 用 `Git → Show Git Reflog` 找回 |
| `target/` 已提交后才加 `.gitignore` | 无效，必须 `git rm -r --cached target/` 再提交 |

### 5.5 团队协作类坑

| 坑 | 正确做法 |
|---|---|
| 分支命名随意（`test`、`aaa`） | 统一规范：`feature/xxx`、`bugfix/xxx`、`hotfix/xxx` |
| 一个 PR 改了 50 个文件 | 小步提交、单一职责，PR 越小越好 Review |
| 长期不同步主干 | 每天开工先 `git fetch` + rebase，避免最后大爆炸 |
| 直接 push 到 main | 开启分支保护（Branch Protection），强制走 PR + Review |
| 没有 `.gitattributes` | 跨平台协作时换行符导致「整个文件都变了」 |

---

## 六、动手路线（照着练一遍就会了）

> **光看不动手等于没看。** 下面这套练习 1-2 小时能做完，做完你对 Git 的理解会超过 80% 的人。

### 第一阶段：跑通基础流程（30 分钟）

```bash
mkdir git-practice && cd git-practice
git init
echo "# 我的 Git 练习" > README.md
git add README.md && git commit -m "docs: 初始化仓库"

echo "第一行代码" > main.java
git status                    # 观察：Untracked
git add main.java && git status   # 观察：Staged
git commit -m "feat: 新增 main.java"

git log --oneline             # 看历史
git lg                        # 用别名看树形历史（若配了）
```

- [ ] 观察 `git status` 在「未跟踪 → 已暂存 → 已提交」三种状态下的输出差异
- [ ] 用 `git cat-file -p HEAD` 打印提交对象，找到里面的 `tree` 和 `parent`

### 第二阶段：分支与合并（30 分钟）

```bash
git switch -c feature-a            # 建分支并切换
echo "功能A" >> main.java
git commit -am "feat: 实现功能A"

git switch main                    # 切回主干
echo "主干改动" >> README.md
git commit -am "docs: 更新说明"

git merge feature-a                # 合并（体验一次冲突或快进合并）
git log --oneline --graph --all    # 看合并后的树形结构
git branch -d feature-a            # 删掉已完成分支
```

- [ ] 制造一次**冲突**：在 `main` 和分支上改同一行，然后 merge，手动解决
- [ ] 体验 `git merge --abort` 放弃合并

### 第三阶段：救援演练（20 分钟，最重要）

```bash
git reset --hard HEAD~1        # 故意「删掉」一个提交
git reflog                     # 找到被删的哈希
git reset --hard <哈希>         # 救回来 ✅

git switch -c temp && git branch -D temp   # 建了又删的分支
git reflog                     # 找到 temp 最后提交
git switch -c temp <哈希>       # 分支复活 ✅
```

- [ ] 用 reflog 救回一个被 `reset --hard` 删掉的提交
- [ ] 用 reflog 救回一个被删掉的分支

### 第四阶段：IDEA 实操（30 分钟）

- [ ] 在 IDEA 里 `File → New → Project from Version Control` 克隆一个 GitHub 仓库
- [ ] 改一行代码 → `⌘K` 提交 → `⌘⇧K` 推送，全程盯着 `Console` Tab 看命令
- [ ] 右下角建一个新分支 → 改代码 → 提交 → 合并回 main
- [ ] 故意制造冲突 → 用三栏 Merge 工具解决
- [ ] Log 面板右键一个提交 → 试 `Revert Commit` 和 `Reset Current Branch to Here`
- [ ] 用 `Annotate with Git Blame` 看某一行是谁写的

### 第五阶段：进阶技巧（20 分钟）

```bash
# 用交互式 rebase 把 3 个乱提交压成 1 个
git rebase -i HEAD~3          # 把后两个改成 squash

# cherry-pick
git switch main
git cherry-pick <某个提交哈希>
```

- [ ] 用 `rebase -i` 把 `wip`/`改一下`/`再改一下` 压成一个规范提交
- [ ] 用 `cherry-pick` 把一个提交从 A 分支搬到 B 分支

---

## 七、一句话总结

> **Git 的全部秘密，就是「三个对象（blob/tree/commit）+ 一个指针（HEAD）+ 一个快照模型」。**
> 命令只是这套模型的操作接口——**理解了模型，命令就能自己推导**；
> 理解了 `reflog`，你就再也不怕「代码丢了」；
> 理解了「已 push 用 revert、未 push 用 reset」，你就不会把同事坑到炸毛。

---

## 关联笔记

- [[18_开发工具链]] — Git / Maven / Arthas / JMeter 速览版（本篇是 Git 的详细展开）
- [[MOC_技术库]] — 技术库总入口
- [[00_Java 后端学习路线与知识体系]] — 后端学习路线总览
- [[22_从零搭建芋道式脚手架框架]] — 工程化与多模块项目管理
- [[17_Docker容器排错]] — 容器化部署（CI/CD 中 Git 的下游环节）
- [[29_Linux运维与性能诊断实战]] — 命令行基础（Git 命令行的底层功底）

