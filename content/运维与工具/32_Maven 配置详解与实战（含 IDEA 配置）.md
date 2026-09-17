---
title: "Maven 配置详解与实战（settings.xml / pom.xml / 多环境 / 私服 / IDEA）"
---
# Maven 配置详解与实战（settings.xml / pom.xml / 多环境 / 私服 / IDEA）

> **一句话概括**：Maven 是 Java 世界的「标准化厨房 + 中央仓库」——你说要什么食材（依赖），它自动把食材**连带着配料一起备齐**（依赖传递），并按**固定流程**（生命周期）把菜做出来。而「配置」就是**告诉它去哪买菜、用谁的账号买、按什么口味做**。
>
> **适合谁**：只会 `mvn clean package` 但说不清 `settings.xml` 和 `pom.xml` 的分工、依赖冲突只会百度删 jar、多环境打包靠手工改配置、私服 `401` 报错查半天、面试被问「`dependencyManagement` 和 `dependencies` 什么区别」答不上来的人。
> **怎么读**：**零（建立印象）→ 一（原理，别跳过）→ 二（配置篇，全篇重点 ⭐）→ 三（命令应用）→ 四（进阶与排错）→ 五（IDEA 配置）→ 六（踩坑速查）→ 七（动手路线）**。
> 如果你的问题只是「命令怎么敲」，直接跳第三章；如果是「配置怎么写」，**第二章是全篇核心**。

---

## 零、先建立整体印象：把 Maven 想象成「标准化厨房 + 中央仓库」

### 0.1 没有 Maven 的世界长什么样

Maven 出现之前（Ant 时代），一个 Java 项目是这样开工的：

```
1. 上官网下载 spring.jar、commons-lang.jar、log4j.jar ...
2. 手动丢进项目的 lib/ 目录
3. 发现 spring 还依赖 commons-logging → 再去找
4. 找到两个不同版本的 log4j，不知道该留哪个
5. 同事拉下代码，发现 lib/ 里缺了 3 个 jar，编译报错
6. 想打包 → 手动写脚本：编译到哪、jar 放哪、依赖怎么打进去
```

| 痛点 | Ant 时代 | Maven 时代 |
|---|---|---|
| 找依赖 | 手动下载、手动放 lib | **写一行坐标，自动下载** |
| 传递依赖 | 自己查文档、自己补 | **自动把依赖的依赖也拉下来** |
| 版本管理 | 一个 jar 到处是副本 | **统一由坐标锁定版本** |
| 构建流程 | 每人一套脚本 | **统一生命周期**（compile/package/deploy） |
| 团队一致 | 「我这能跑你那儿不行」 | **同一份 pom，人人可复现** |

**一句话**：Maven 把「构建」从「手工劳动」变成了「**声明式配置**」——你只描述「要什么」（pom.xml），Maven 负责「怎么做」。

### 0.2 一个类比：Maven 就是「标准化厨房 + 中央仓库」

| 厨房场景 | Maven 里的对应 |
|---|---|
| **菜单**（写明要哪些菜、什么口味） | **`pom.xml`**（项目的依赖与构建配置） |
| **买菜渠道 + 会员卡**（去哪买、用什么账号） | **`settings.xml`**（仓库地址、镜像、账号密码） |
| **食材市场**（连锁总仓 + 楼下便利店 + 家里冰箱） | **中央仓库 + 私服 + 本地仓库** |
| **食材编号**（如「有机鸡蛋·大号·A 级」） | **坐标 GAV**（groupId·artifactId·version） |
| **做菜的固定步骤**（洗→切→炒→装盘） | **生命周期**（compile→test→package→install→deploy） |
| **厨房小家电**（榨汁机、空气炸锅） | **插件**（compiler、surefire、jar、spring-boot） |

**记住这张表，后面每节都能对号入座。**

### 0.3 全景图：一次 `mvn package` 到底发生了什么

```
                    ┌─────────────────────────────────────────────┐
                    │            settings.xml（全局配置）            │
                    │  本地仓库路径 / 镜像 / 私服账号 / JDK / 代理    │
                    └───────────────────┬─────────────────────────┘
                                        │ 决定「去哪拿、用什么身份拿」
                                        ▼
   pom.xml                     ┌──────────────────┐
 ┌───────────┐                 │   本地仓库        │  ~/.m2/repository
 │ 依赖声明   │ ───需要哪些───► │ （自己家冰箱）     │
 │ 构建配置   │                 └────────┬─────────┘
 │ 插件配置   │                          │ 没有？
 └───────────┘                          ▼
                              ┌──────────────────┐
                              │   私服 Nexus     │  （公司楼下便利店）
                              │  缓存 + 自研包    │
                              └────────┬─────────┘
                                       │ 还没有？
                                       ▼
                              ┌──────────────────┐
                              │   中央仓库        │  repo.maven.apache.org
                              │  （连锁总仓）      │  ← 通常用阿里云镜像加速
                              └──────────────────┘
```

> 💡 **一句话记忆**：
> - **`pom.xml` 管「项目要什么」**（依赖 + 构建 + 插件）
> - **`settings.xml` 管「机器怎么拿」**（仓库地址 + 账号 + 镜像 + 本地路径）
> - **`settings.xml` 是全局的（一台机器一份），`pom.xml` 是项目级的（每个项目一份）**

---

## 一、原理篇：Maven 的五个核心概念

> 这一章是全篇地基。**Maven 的配置项看似零散，其实全都能从这五个概念推导出来。**

### 1.1 坐标（GAV）：Maven 世界的「身份证」

Maven 里任何一个 jar（无论官方还是自研），都用三个字段唯一标识：

| 字段 | 含义 | 示例 | 类比 |
|---|---|---|---|
| **groupId** | 组织/公司/团队 | `org.springframework.boot` | 「厂家」 |
| **artifactId** | 项目/模块名 | `spring-boot-starter-web` | 「产品名」 |
| **version** | 版本号 | `3.2.5` | 「批次/型号」 |
| packaging | 打包类型（可省略，默认 jar） | `jar` / `war` / `pom` | 「包装形式」 |
| classifier | 附属分类（可省略） | `sources` / `javadoc` | 「附件」 |

```xml
<dependency>
  <groupId>org.springframework.boot</groupId>      <!-- 厂家 -->
  <artifactId>spring-boot-starter-web</artifactId><!-- 产品 -->
  <version>3.2.5</version>                         <!-- 型号 -->
</dependency>
```

**坐标在仓库里的实际路径**（理解这个，就懂了「为什么改个版本号要重新下载」）：

```
~/.m2/repository/org/springframework/boot/spring-boot-starter-web/3.2.5/spring-boot-starter-web-3.2.5.jar
└─── 本地仓库 ──┘ └─ groupId 点变斜杠 ─┘└── artifactId ──┘└version┘└──── 文件名 = artifactId-version.jar ────┘
```

> ✅ **所以**：`groupId` 用**反写域名**（`com.公司.项目`）是行业惯例——正好对应仓库目录结构，且天然避免命名冲突。

### 1.2 仓库三级：本地 → 私服 → 中央

Maven 找 jar 的顺序是**「从近到远、找到即止」**：

| 层级 | 位置 | 类比 | 特点 |
|---|---|---|---|
| **① 本地仓库** | `~/.m2/repository`（可配） | 家里冰箱 | 最快，只在本地 |
| **② 私服（Nexus/Artifactory）** | 公司内网 | 楼下便利店 | **缓存中央仓库**（快）+ **存放公司自研包** |
| **③ 中央仓库** | `repo.maven.apache.org` | 连锁总仓 | 全球唯一，但**国内直连极慢** |

**为什么公司一定要搭私服？** 两个理由：

1. **加速**：第一次从中央仓库拉一次，之后全公司都从私服拿，**不再走公网**；
2. **存放自研包**：公司内部的 `com.company:user-sdk` 不可能发到中央仓库，只能放私服。

> ⚠️ **一个高频误解**：**「镜像（mirror）」和「私服仓库（repository）」不是一回事**。
> - **mirror** = 「**拦截**某个仓库的请求，改去另一个地址」（如把 central 拦截到阿里云）
> - **repository** = 「**额外增加**一个可以去拿包的地方」（如公司私服）
> 详见 2.2.2 与 2.2.5。

### 1.3 依赖传递与仲裁：为什么会有「依赖冲突」

**依赖传递**：你引入 A，A 依赖 B，B 依赖 C —— Maven **自动把 B 和 C 也拉下来**。

```
你的项目
   └── A 1.0
        └── B 2.0
             └── C 3.0      ← 你从没写过 C，但它在你的 classpath 里
```

**问题来了**：如果另一条路径也依赖 C，但版本不同呢？

```
你的项目
   ├── A 1.0 ──► B 2.0 ──► C 3.0     （路径长度 3）
   └── D 1.0 ─────────────► C 1.0     （路径长度 2）
```

**Maven 的两条仲裁规则**（**必须背下来**）：

| 规则 | 说明 | 上面的例子 |
|---|---|---|
| **① 最短路径优先** | 路径短的胜出 | 选 **C 1.0**（路径 2 < 3） |
| **② 路径长度相同 → 先声明优先** | pom 里写在前面的胜出 | 谁先写选谁 |

> 💡 **划重点**：**解决冲突不是「改版本号」，而是「调整声明顺序」或「用 `<exclusions>` 直接排除」**。
> `mvn dependency:tree` 会打印出 `omitted for conflict with x.x.x`，那就是**被仲裁掉**的版本——这是查冲突的第一利器。

**依赖范围（scope）：决定这个 jar 在哪些阶段生效**

| scope | 编译 | 测试 | 运行 | 打进包 | 典型场景 |
|---|---|---|---|---|---|
| **compile**（默认） | ✅ | ✅ | ✅ | ✅ | `spring-core` |
| **provided** | ✅ | ✅ | ❌ | ❌ | `servlet-api`（Tomcat 已提供）、`lombok` |
| **runtime** | ❌ | ✅ | ✅ | ✅ | MySQL 驱动、JDBC 实现 |
| **test** | ❌ | ✅ | ❌ | ❌ | JUnit、Mockito |
| **system** | ✅ | ✅ | ❌ | ❌ | 本地 jar（**不推荐**，要写绝对路径） |
| **import** | — | — | — | — | **只用于 `<dependencyManagement>`**，导入 BOM |

> ⚠️ **最常见的坑**：`lombok` 必须写 `provided`（或 `optional`），否则会被打进最终 jar，污染依赖方。
> ⚠️ **另一个坑**：`scope=test` 的依赖在 `src/main` 里用不了——很多人写单测时才发现「编译不过」。

### 1.4 生命周期：三套流程 + 一串阶段

Maven 有**三套相互独立**的生命周期：

| 生命周期 | 作用 | 常用阶段 |
|---|---|---|
| **clean** | 清理构建产物 | `clean`（删 target） |
| **default**（核心） | 构建、测试、打包、部署 | `validate → compile → test → package → verify → install → deploy` |
| **site** | 生成项目文档站点 | `site` |

**default 生命周期里最常用的 7 个阶段**：

| 阶段 | 干什么 | 产物 |
|---|---|---|
| `validate` | 校验项目配置 | — |
| `compile` | 编译主代码 | `target/classes/` |
| `test` | 跑单元测试 | 测试报告 |
| `package` | 打包 | `target/xxx.jar` |
| `verify` | 集成测试校验 | — |
| `install` | 装进**本地仓库** | `~/.m2/repository/...` |
| `deploy` | 发布到**远程仓库**（私服） | 私服上的包 |

> ⚠️ **最关键的机制：执行后面任何一步，都会自动先执行它前面的所有步骤。**
> 所以 `mvn install` 实际上跑了 `validate → compile → test → package → install`——**这就是为什么你只想打包却被迫跑了半天测试**（用 `-DskipTests` 跳过）。

**阶段 ≠ 命令**：`mvn clean package` 是「先跑 clean 生命周期的 clean 阶段，再跑 default 生命周期的 package 阶段」。

### 1.5 插件与目标：真正干活的不是 Maven，是插件

**Maven 内核其实只做三件事**：读 pom、管依赖、调度生命周期。**真正干活的是插件（plugin）。**

```
mvn package
   │
   ├─ compile 阶段 → maven-compiler-plugin:compile     （编译）
   ├─ test    阶段 → maven-surefire-plugin:test        （跑测试）
   └─ package 阶段 → maven-jar-plugin:jar              （打成 jar）
                  → spring-boot-maven-plugin:repackage（打成可执行 fat jar）
```

| 概念 | 说明 |
|---|---|
| **plugin（插件）** | 一个工具包，如 `maven-compiler-plugin` |
| **goal（目标）** | 插件里的一个具体动作，如 `compiler:compile` |
| **执行绑定（execution）** | 把「goal」绑定到「生命周期阶段」上，到点自动执行 |
| **`<pluginManagement>`** | **只声明版本和配置，不实际引入**（供子模块继承） |
| **`<plugins>`** | **真正引入并生效** |

**手动执行某个 goal（不绑生命周期）**：

```bash
mvn dependency:tree            # 插件 maven-dependency-plugin 的 tree 目标
mvn help:effective-pom         # 插件 maven-help-plugin 的 effective-pom 目标
mvn compiler:compile           # 单独执行编译
```

> 💡 **记忆法**：**生命周期是「时间轴」，插件是「工具」，goal 是「工具的一个动作」**。配置里写 `<execution>` 就是把「某工具的动作」钉在「时间轴的某个点」上。

### 1.6 配置文件全景：三个地方，各管一段

| 文件 | 位置 | 作用域 | 管什么 |
|---|---|---|---|
| **`settings.xml`** | `~/.m2/settings.xml`（用户级）<br>`$MAVEN_HOME/conf/settings.xml`（全局级） | 整台机器 | 本地仓库路径、**镜像**、**私服账号**、代理、JDK、默认激活的 profile |
| **`pom.xml`** | 项目根目录 | 单个项目 | 坐标、**依赖**、**构建配置**、**插件**、多环境 profile、发布地址 |
| **`.mvn/`** | 项目根目录 | 单个项目 | `maven.config`（固化命令行参数）、`jvm.config`（JVM 参数）、wrapper（`mvnw`） |

**优先级**：`用户级 settings.xml` **覆盖** `全局级 settings.xml`；`pom.xml` 里的配置**不能**覆盖 `settings.xml` 里已写死的 `localRepository`、`mirrors` 等（但 profile 可以叠加）。

> ✅ **一句话分工**：
> - **换电脑要改的**（仓库地址、账号、JDK）→ 放 **`settings.xml`**
> - **跟着项目走的**（依赖、插件、多环境）→ 放 **`pom.xml`**

---

## 二、配置篇 ⭐（全篇重点）

> 这一章逐段拆解两个配置文件。**每个配置项都标了「干什么、什么时候需要、写错了会怎样」**，可以直接当手册查。

### 2.1 `settings.xml` 完整详解

#### 2.1.1 文件在哪、谁的优先级高

| 位置 | 作用域 | 说明 |
|---|---|---|
| `$MAVEN_HOME/conf/settings.xml` | **全局**（整台机器所有用户） | 一般不动它 |
| `~/.m2/settings.xml` | **用户级**（当前用户） | ⭐ **只改这个** |

**优先级规则**：
- 两个文件**同时存在时，内容会「合并」**，**用户级的值覆盖全局级**；
- 但**不是字段级覆盖**——比如全局配了 mirror A、用户级配了 mirror B，**两个 mirror 都会生效**（可能冲突）；
- ✅ **最佳实践**：**只维护 `~/.m2/settings.xml`**，全局的保持默认，避免「两个文件互相打架」。

**找不到文件？** 直接新建即可（目录不存在就 `mkdir -p ~/.m2`）。

#### 2.1.2 `<localRepository>`：本地仓库路径

```xml
<settings>
  <!-- 默认是 ~/.m2/repository；改成自定义路径（如放到大盘、避免占满系统盘） -->
  <localRepository>/data/maven-repo</localRepository>
</settings>
```

| 要点 | 说明 |
|---|---|
| 默认值 | `~/.m2/repository`（Windows：`C:\Users\你\.m2\repository`） |
| 何时改 | C 盘/系统盘空间紧张、想多个项目共用一份缓存、想放到 SSD 加速 |
| ⚠️ 坑 | **路径不要用中文、不要有空格**；改了之后 IDEA 里也要同步改（见 5.1） |
| 💡 技巧 | 团队可用同一个网络盘共享本地仓库——**但不推荐**（并发写会损坏） |

#### 2.1.3 `<mirrors>`：镜像（加速的关键）⭐

**什么是镜像**：**拦截**对某个仓库的请求，改去你指定的地址下载。

```xml
<mirrors>
  <mirror>
    <id>aliyun-central</id>                    <!-- 镜像的唯一标识（随便起，但别和 servers 的 id 冲突） -->
    <name>阿里云公共仓库</name>
    <url>https://maven.aliyun.com/repository/public</url>  <!-- 真正的下载地址 -->
    <mirrorOf>central</mirrorOf>               <!-- ⭐ 拦截哪个仓库（见下表） -->
  </mirror>
</mirrors>
```

**`<mirrorOf>` 的取值规则（最容易配错的地方）**：

| 写法 | 含义 | 使用场景 |
|---|---|---|
| `central` | 只拦截中央仓库 | ⭐ **最常见**，只给 central 加速，不影响私服 |
| `*` | 拦截**所有**仓库 | ⚠️ **危险**：会连公司私服请求一起劫持 |
| `external:*` | 拦截所有「非 localhost / 非 file://」的仓库 | 保留本地仓库不受影响 |
| `repo1,repo2` | 只拦截指定 id 的仓库 | 精确控制 |
| `*,!company-repo` | 拦截所有，**但排除** `company-repo` | ⭐ **有私服时的正确写法** |

**国内常用镜像地址**：

| 镜像 | url |
|---|---|
| **阿里云公共仓库**（推荐，聚合了 central + jcenter） | `https://maven.aliyun.com/repository/public` |
| 阿里云中央仓库 | `https://maven.aliyun.com/repository/central` |
| 腾讯云 | `https://mirrors.cloud.tencent.com/nexus/repository/maven-public/` |
| 华为云 | `https://repo.huaweicloud.com/repository/maven/` |

> ⚠️ **经典翻车现场**：把 `<mirrorOf>` 写成 `*`，同时又配了公司私服。
> 结果：**所有请求都被劫持到阿里云**，公司自研包 `com.company:xxx` 在阿里云根本不存在 → 报 `Could not find artifact`。
> ✅ **两种正确解法**：
> 1. **排除法**：`<mirrorOf>*,!company-repo</mirrorOf>`（把私服 id 排除掉）
> 2. **代理法（更推荐）**：把 mirror 直接指向公司 Nexus 的 group 仓库 `<mirrorOf>*</mirrorOf>`，让 Nexus 自己去代理 central——**这样自研包和公共包都走 Nexus，一次配置解决**。

#### 2.1.4 `<servers>`：私服/仓库的账号密码

**什么时候需要**：拉取或发布公司私服的包，需要认证。

```xml
<servers>
  <server>
    <id>nexus-releases</id>            <!-- ⚠️ 必须和 pom.xml 里 repository 的 id 【完全一致】 -->
    <username>deploy-user</username>
    <password>你的密码</password>
  </server>
  <server>
    <id>nexus-snapshots</id>
    <username>deploy-user</username>
    <password>你的密码</password>
  </server>
</servers>
```

**三种密码写法**：

| 写法 | 安全性 | 说明 |
|---|---|---|
| 明文 `<password>xxx</password>` | ❌ 最差 | 密码直接暴露在文件里 |
| **加密**（Maven 自带） | ✅ 推荐 | 见下方命令 |
| 环境变量 | ✅ 可用 | CI 环境常用 |

**加密密码（Maven 3.6+ 自带）**：

```bash
mvn --encrypt-master-password      # 1. 生成主密码（会提示输入，输出一串密文）
# 把输出的密文写进 ~/.m2/settings-security.xml：
# <settingsSecurity><master>{密文}</master></settingsSecurity>

mvn --encrypt-password             # 2. 生成密码密文（会提示输入真实密码）
# 把输出的 {密文} 填到 settings.xml 的 <password> 里
```

> ⚠️ **最常见的 401 报错原因**：`servers` 里的 `<id>` 和 pom 里 `<repository>` 的 `<id>` **不一致**——Maven 靠 id 匹配账号，对不上就认证失败。
> ⚠️ **`settings.xml` 不要提交到 Git**（里面有密码）。CI 环境用环境变量或密钥管理。

#### 2.1.5 `<proxies>`：走公司代理上网时用

```xml
<proxies>
  <proxy>
    <id>company-proxy</id>
    <active>true</active>                 <!-- 是否启用 -->
    <protocol>http</protocol>             <!-- 代理协议：http / https -->
    <host>proxy.company.com</host>
    <port>8080</port>
    <username>代理账号</username>          <!-- 代理需要认证时才写 -->
    <password>代理密码</password>
    <nonProxyHosts>localhost|127.0.0.1|*.company.com</nonProxyHosts>
    <!-- ⚠️ 内网地址一定要加进 nonProxyHosts，否则连私服也走代理 → 拉不到包 -->
  </proxy>
</proxies>
```

> 💡 **判断依据**：如果你在公司内网能上网但需要配代理，Maven 也得配；否则会出现「浏览器能访问、Maven 拉不下来」。

#### 2.1.6 `<profiles>` + `<activeProfiles>`：在 settings 里配 JDK 和仓库

**profile 的本质**：一组「可开关的配置」。`settings.xml` 和 `pom.xml` 里都能写 profile，但用途不同：

| 位置 | 典型用途 |
|---|---|
| **`settings.xml` 的 profile** | 配 **JDK 版本**、**额外仓库地址**（跟机器/网络环境有关） |
| **`pom.xml` 的 profile** | 配 **多环境参数**（dev/test/prod 的数据库地址等，跟项目有关） |

**示例：在 settings.xml 里统一指定 JDK 版本**

```xml
<profiles>
  <profile>
    <id>jdk17</id>
    <activation>
      <activeByDefault>true</activeByDefault>   <!-- 默认激活 -->
      <jdk>17</jdk>                             <!-- 或者：JDK 17 时自动激活 -->
    </activation>
    <properties>
      <maven.compiler.source>17</maven.compiler.source>
      <maven.compiler.target>17</maven.compiler.target>
      <maven.compiler.release>17</maven.compiler.release>
      <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
    </properties>
  </profile>
</profiles>

<activeProfiles>
  <activeProfile>jdk17</activeProfile>          <!-- 显式激活上面这个 profile -->
</activeProfiles>
```

**示例：在 settings.xml 里加一个额外仓库**

```xml
<profile>
  <id>company-repos</id>
  <repositories>
    <repository>
      <id>company-repo</id>              <!-- ⚠️ 这个 id 要和 mirrors 的 !排除、servers 的 id 对应上 -->
      <url>http://nexus.company.com/repository/maven-public/</url>
      <releases><enabled>true</enabled></releases>
      <snapshots><enabled>true</enabled></snapshots>   <!-- 允许下载 SNAPSHOT 包 -->
    </repository>
  </repositories>
  <pluginRepositories>
    <pluginRepository>
      <id>company-repo</id>
      <url>http://nexus.company.com/repository/maven-public/</url>
    </pluginRepository>
  </pluginRepositories>
</profile>
```

#### 2.1.7 其余常用开关

```xml
<settings>
  <interactiveMode>true</interactiveMode>   <!-- 是否允许和用户交互（默认 true，CI 环境可设 false） -->
  <offline>false</offline>                  <!-- ⭐ 离线模式：true = 只从本地仓库拿，不联网（断网/加速时用） -->
  <usePluginRegistry>false</usePluginRegistry>  <!-- 已过时，保持 false -->
</settings>
```

> 💡 **`<offline>true</offline>` 的实战价值**：**确认所有依赖都已在本地时**，打开它可以避免每次都去检查远程更新，构建更快、且不受网络抖动影响。
> 对应命令行参数：`mvn -o package`（`-o` = offline）。

#### 2.1.8 完整可用的 `settings.xml` 模板（可直接抄）

```xml
<?xml version="1.0" encoding="UTF-8"?>
<settings xmlns="http://maven.apache.org/SETTINGS/1.0.0"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
          xsi:schemaLocation="http://maven.apache.org/SETTINGS/1.0.0
                              https://maven.apache.org/xsd/settings-1.0.0.xsd">

  <!-- ① 本地仓库位置（可选，不写则默认 ~/.m2/repository） -->
  <localRepository>${user.home}/.m2/repository</localRepository>

  <interactiveMode>true</interactiveMode>
  <offline>false</offline>

  <!-- ② 私服账号（id 必须与 pom 里 repository 的 id 一致） -->
  <servers>
    <server>
      <id>nexus-releases</id>
      <username>deploy</username>
      <password>********</password>
    </server>
    <server>
      <id>nexus-snapshots</id>
      <username>deploy</username>
      <password>********</password>
    </server>
  </servers>

  <!-- ③ 镜像：给中央仓库加速（有私服时用 *,!company-repo 排除） -->
  <mirrors>
    <mirror>
      <id>aliyun-central</id>
      <name>阿里云公共仓库</name>
      <url>https://maven.aliyun.com/repository/public</url>
      <mirrorOf>central</mirrorOf>
    </mirror>
  </mirrors>

  <!-- ④ JDK 与编码（避免「编译版本不对」的问题） -->
  <profiles>
    <profile>
      <id>jdk17</id>
      <activation>
        <activeByDefault>true</activeByDefault>
      </activation>
      <properties>
        <maven.compiler.source>17</maven.compiler.source>
        <maven.compiler.target>17</maven.compiler.target>
        <maven.compiler.release>17</maven.compiler.release>
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
        <project.reporting.outputEncoding>UTF-8</project.reporting.outputEncoding>
      </properties>
    </profile>
  </profiles>

  <activeProfiles>
    <activeProfile>jdk17</activeProfile>
  </activeProfiles>

</settings>
```

**验证配置是否生效**（两个必会命令）：

```bash
mvn help:effective-settings    # 打印「最终生效」的 settings（合并了全局+用户级后的结果）
mvn help:effective-pom         # 打印「最终生效」的 pom（含 parent 继承、profile 合并后的结果）
```

> ✅ **配置不生效时，第一个动作就是跑 `help:effective-settings`**——它告诉你 Maven 实际读到了什么，比猜快一万倍。

---

### 2.2 `pom.xml` 完整详解

> `pom.xml`（Project Object Model）是 Maven 的**项目说明书**。下面按「一个 pom 从开头到结尾会遇到的所有元素」逐段讲。
> 💡 **关于元素顺序**：Maven 3 对顺序只**告警不报错**，Maven 4 起会强制校验。按下面这个通行顺序书写最保险。

#### 2.2.1 骨架：一个完整 pom 长什么样

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0
                             https://maven.apache.org/xsd/maven-4.0.0.xsd">

  <modelVersion>4.0.0</modelVersion>   <!-- 固定写 4.0.0，别改 -->

  <!-- ① 坐标：我是谁 -->
  <groupId>com.company.order</groupId>
  <artifactId>order-service</artifactId>
  <version>1.0.0-SNAPSHOT</version>
  <packaging>jar</packaging>           <!-- jar(默认) / war / pom(聚合或父模块) -->

  <!-- ② 继承：我的父是谁（可选） -->
  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.2.5</version>
    <relativePath/>                    <!-- 空值 = 强制从仓库找父 pom，不从上级目录找 -->
  </parent>

  <!-- ③ 属性：定义可复用的变量 -->
  <properties> ... </properties>

  <!-- ④ 依赖管理：只锁版本，不引入 -->
  <dependencyManagement> ... </dependencyManagement>

  <!-- ⑤ 依赖：真正引入 -->
  <dependencies> ... </dependencies>

  <!-- ⑥ 额外仓库 -->
  <repositories> ... </repositories>
  <pluginRepositories> ... </pluginRepositories>

  <!-- ⑦ 构建：插件、资源、产物名 -->
  <build> ... </build>

  <!-- ⑧ 发布目标：deploy 时传到哪 -->
  <distributionManagement> ... </distributionManagement>

  <!-- ⑨ 多环境 profile -->
  <profiles> ... </profiles>

</project>
```

#### 2.2.2 坐标与打包类型

```xml
<groupId>com.company.order</groupId>     <!-- 组织：反写域名 + 业务线 -->
<artifactId>order-service</artifactId>   <!-- 项目名：小写 + 中划线 -->
<version>1.0.0-SNAPSHOT</version>        <!-- 版本：见 4.2 SNAPSHOT vs RELEASE -->
<packaging>jar</packaging>              <!-- jar / war / pom -->
```

| `<packaging>` | 用途 | 典型 |
|---|---|---|
| `jar`（默认） | 打成 jar 包 | Spring Boot 服务、工具库 |
| `war` | 打成 war 包 | 部署到外部 Tomcat 的传统 Web 项目 |
| `pom` | **不产出构件**，只做「聚合」或「父模块」 | 多模块的父 pom（见 2.7） |

> ⚠️ **`<packaging>pom</packaging>` 的模块执行 `mvn package` 不会生成 jar**——这是正常现象，别以为是构建失败。

#### 2.2.3 `<parent>`：继承父 pom

**三种典型父 pom**：

| 父 pom | 作用 |
|---|---|
| `spring-boot-starter-parent` | Spring Boot 官方父 pom：**锁定了所有官方依赖的版本** + 预配置了常用插件 |
| 公司统一父 pom（`com.company:company-parent`） | 统一全公司的依赖版本、插件配置、编码、JDK |
| 自己项目的父模块 | 多模块项目的根 pom |

**`<relativePath/>` 的作用**（容易踩坑）：

```xml
<parent>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-starter-parent</artifactId>
  <version>3.2.5</version>
  <relativePath/>     <!-- ⭐ 空值表示：不要在本地上级目录找，直接去仓库下载 -->
</parent>
```

> ⚠️ **不写 `<relativePath/>` 的坑**：Maven 默认会先去 `../pom.xml` 找父 pom。如果你本地恰好有个同名但版本不同的项目，**会优先用本地的**，导致「我明明升级了版本却不生效」。
> ✅ **引入外部父 pom 时，一律加 `<relativePath/>`**。

**关于 Spring Boot 父 pom 的一个进阶选择**：如果公司已有统一父 pom（不能改继承关系），可以用 **`import` 方式**替代继承：

```xml
<dependencyManagement>
  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-dependencies</artifactId>
      <version>3.2.5</version>
      <type>pom</type>
      <scope>import</scope>     <!-- ⭐ import 只在 dependencyManagement 里有效 -->
    </dependency>
  </dependencies>
</dependencyManagement>
```

#### 2.2.4 `<properties>`：属性与版本集中管理

```xml
<properties>
  <!-- ① 编码（避免中文乱码） -->
  <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
  <project.reporting.outputEncoding>UTF-8</project.reporting.outputEncoding>

  <!-- ② 编译版本（三选一，推荐 release） -->
  <maven.compiler.source>17</maven.compiler.source>
  <maven.compiler.target>17</maven.compiler.target>
  <maven.compiler.release>17</maven.compiler.release>   <!-- ⭐ JDK9+ 推荐用 release -->

  <!-- ③ 统一管理依赖版本（自定义属性名，引用时用 ${}） -->
  <hutool.version>5.8.27</hutool.version>
  <mybatis-plus.version>3.5.7</mybatis-plus.version>
</properties>
```

引用方式：

```xml
<dependency>
  <groupId>cn.hutool</groupId>
  <artifactId>hutool-all</artifactId>
  <version>${hutool.version}</version>   <!-- ⭐ 引用属性 -->
</dependency>
```

> ✅ **为什么要把版本抽成属性**：**升级时只改一处**。一个项目里 Hutool 出现在 5 个模块，抽成属性后改一行即可，避免「有的模块是 5.8.20、有的是 5.8.27」。
> 💡 **另一个隐藏用法**：属性可以在**命令行覆盖**，非常适合 CI：
> ```bash
> mvn package -Dhutool.version=5.8.30    # 临时改属性值
> ```

#### 2.2.5 `<dependencies>` vs `<dependencyManagement>`（必考）

这是 Maven 里**最容易被问、也最容易搞混**的一对。

```xml
<!-- ① dependencyManagement：只【声明版本】，不真正引入依赖 -->
<dependencyManagement>
  <dependencies>
    <dependency>
      <groupId>cn.hutool</groupId>
      <artifactId>hutool-all</artifactId>
      <version>5.8.27</version>      <!-- 这里锁版本 -->
    </dependency>
  </dependencies>
</dependencyManagement>

<!-- ② dependencies：真正【引入】依赖 -->
<dependencies>
  <dependency>
    <groupId>cn.hutool</groupId>
    <artifactId>hutool-all</artifactId>
    <!-- 不写 version！自动继承上面管理的版本 -->
  </dependency>
</dependencies>
```

| | `<dependencies>` | `<dependencyManagement>` |
|---|---|---|
| 是否真正引入依赖 | ✅ 是（会下载并进入 classpath） | ❌ 否（只锁版本，不引入） |
| 子模块是否继承 | ✅ 会继承（**父模块 dependencies 里的依赖，子模块全都有**） | ✅ 会继承版本号 |
| 典型用途 | 引入本项目实际要用的依赖 | **父 pom 统一锁版本** |
| 子模块要不要写 version | 要（除非父模块已用 dependencyManagement 锁过） | — |

> ⚠️ **最经典的误用**：把一堆依赖写进**父 pom 的 `<dependencies>`**，结果**所有子模块都被迫引入**这些依赖——哪怕某个子模块根本用不到，jar 也会进它的 classpath。
> ✅ **正确姿势**：
> - **父 pom 的 `<dependencyManagement>`** → 锁版本（子模块按需引用）
> - **父 pom 的 `<dependencies>`** → 只放**所有子模块都必然需要**的东西（如 `lombok`、`spring-boot-starter-test`）

**依赖排除与可选依赖**：

```xml
<dependency>
  <groupId>com.company</groupId>
  <artifactId>user-sdk</artifactId>
  <version>1.0.0</version>

  <!-- 排除它传递进来的某个依赖（最常见：排除冲突的旧版本、排除有漏洞的 jar） -->
  <exclusions>
    <exclusion>
      <groupId>commons-logging</groupId>     <!-- ⚠️ 排除时【不需要写 version】 -->
      <artifactId>commons-logging</artifactId>
    </exclusion>
  </exclusions>

  <!-- 可选依赖：我用，但不传递给我的下游 -->
  <optional>true</optional>
</dependency>
```

| 关键字 | 语义 | 类比 |
|---|---|---|
| `<exclusions>` | **我不要**某个传递依赖 | 「这份套餐里不要香菜」 |
| `<optional>true</optional>` | **我要，但别传给别人** | 「我自己加辣，但不影响别人」 |

> 💡 **`<optional>` 的经典场景**：一个 ORM 框架同时支持 MySQL 和 Oracle，它不能替使用者决定用哪个，就把两个驱动都设为 `optional`，让使用者自己选。

#### 2.2.6 `<repositories>`：额外仓库（pom 级）

```xml
<repositories>
  <repository>
    <id>company-repo</id>                <!-- ⚠️ 与 settings.xml 的 servers / mirrorOf 对应 -->
    <name>公司私服</name>
    <url>http://nexus.company.com/repository/maven-public/</url>
    <releases>
      <enabled>true</enabled>            <!-- 是否允许下载正式版 -->
      <updatePolicy>daily</updatePolicy> <!-- 检查更新频率：always/daily/never/interval:X -->
    </releases>
    <snapshots>
      <enabled>true</enabled>            <!-- 是否允许下载快照版（默认 false！） -->
      <updatePolicy>always</updatePolicy>
    </snapshots>
  </repository>
</repositories>

<pluginRepositories>
  <!-- 插件仓库，结构同上。公司自研插件才需要配 -->
</pluginRepositories>
```

> ⚠️ **高频坑**：**`<snapshots><enabled>` 默认是 `false`**。所以从私服拉 `1.0.0-SNAPSHOT` 包时，如果没显式打开，会报「找不到」。**用 SNAPSHOT 就必须配这一段。**
> ✅ **更好的做法**：把仓库配置放到 **`settings.xml` 的 profile** 里（见 2.1.6），这样所有项目通用，不用每个 pom 都写一遍。

#### 2.2.7 `<build>`：构建配置

```xml
<build>
  <!-- ① 最终产物名（默认是 artifactId-version） -->
  <finalName>order-service</finalName>   <!-- 打包出来就是 order-service.jar，不带版本号 -->

  <!-- ② 资源文件与变量替换（多环境核心，见 2.3） -->
  <resources>
    <resource>
      <directory>src/main/resources</directory>
      <filtering>true</filtering>        <!-- ⭐ true = 允许资源文件里用 ${} 占位符被替换 -->
      <includes>
        <include>**/*.yml</include>
        <include>**/*.properties</include>
      </includes>
    </resource>
  </resources>

  <!-- ③ 插件管理：只声明版本和配置，不激活（供子模块继承） -->
  <pluginManagement>
    <plugins> ... </plugins>
  </pluginManagement>

  <!-- ④ 插件：真正生效 -->
  <plugins>
    <plugin>
      <groupId>org.apache.maven.plugins</groupId>
      <artifactId>maven-compiler-plugin</artifactId>
      <version>3.13.0</version>
      <configuration>
        <release>17</release>
        <encoding>UTF-8</encoding>
      </configuration>
    </plugin>
  </plugins>
</build>
```

**`<pluginManagement>` vs `<plugins>`** —— 和 `dependencyManagement` vs `dependencies` 是同一套逻辑：

| | `<plugins>` | `<pluginManagement>` |
|---|---|---|
| 是否生效 | ✅ 立即生效 | ❌ 只声明，不生效 |
| 子模块 | 继承并生效 | 继承**版本与配置**，子模块要自己写 `<plugin>` 才生效 |

#### 2.2.8 `<distributionManagement>`：`deploy` 时传到哪

```xml
<distributionManagement>
  <!-- 正式版（version 不含 SNAPSHOT）传到这 -->
  <repository>
    <id>nexus-releases</id>              <!-- ⚠️ 必须与 settings.xml 的 <server><id> 完全一致 -->
    <name>Release Repository</name>
    <url>http://nexus.company.com/repository/maven-releases/</url>
  </repository>

  <!-- 快照版（version 含 -SNAPSHOT）传到这 -->
  <snapshotRepository>
    <id>nexus-snapshots</id>
    <name>Snapshot Repository</name>
    <url>http://nexus.company.com/repository/maven-snapshots/</url>
  </snapshotRepository>
</distributionManagement>
```

> ⚠️ **Nexus 的 release 仓库默认禁止重复发布同一版本**——第二次 `deploy` 同一个 `1.0.0` 会报 `400 Bad Request`。**这是设计如此**（正式版不可变），要重发得先升级版本号，或在 Nexus 里开启「允许 redeploy」。

#### 2.2.9 `<modules>`：多模块聚合

```xml
<packaging>pom</packaging>      <!-- ⚠️ 聚合模块必须是 pom -->
<modules>
  <module>order-api</module>     <!-- 相对路径，子模块目录名 -->
  <module>order-biz</module>
  <module>order-web</module>
</modules>
```

> 💡 **聚合（aggregation）vs 继承（inheritance）是两个概念**，很多人混为一谈：
> - **聚合**：父模块通过 `<modules>` **一次性构建所有子模块**（父 → 子的「管理」关系）
> - **继承**：子模块通过 `<parent>` **继承父模块的配置**（子 → 父的「继承」关系）
> 实践中**父模块通常两者都有**（既是聚合根，又是配置父），但它们**互相独立**——一个模块可以不继承却参与聚合，反之亦然。

---

### 2.3 多环境配置实战（dev / test / prod）

**目标**：同一份代码，打包成开发、测试、生产三个环境的包，**不手工改配置**。

有**两套主流做法**，先看对比再选：

| | **方案 A：Maven profile + 资源过滤** | **方案 B：Spring Boot profile（推荐）** |
|---|---|---|
| 核心思路 | Maven 打包时把 `application.yml` 里的 `${}` 占位符**替换**成对应环境的值 | 所有环境的配置**都打进包里**，**启动时**用 `spring.profiles.active` 选择加载哪个 |
| 配置存哪 | 值写在 **`pom.xml` 的 profile** 里 | 值写在 **`application-{env}.yml`** 里 |
| 一个包能否跑多环境 | ❌ 不能（包已固化了某个环境） | ✅ **能**（同一个包，改启动参数即可） |
| 适合 | 传统项目、配置项少 | **Spring Boot 项目（现代主流）** |
| 风险 | 生产密码写进 pom（**可能被提交到 Git**） | 敏感配置外置到配置中心/环境变量 |

#### 方案 A：Maven profile + 资源过滤

**① `pom.xml` 里定义 profile**：

```xml
<profiles>
  <!-- 开发环境（默认激活） -->
  <profile>
    <id>dev</id>
    <activation>
      <activeByDefault>true</activeByDefault>   <!-- 不指定 -P 时默认用这个 -->
    </activation>
    <properties>
      <profile.active>dev</profile.active>
      <db.url>jdbc:mysql://127.0.0.1:3306/order_dev</db.url>
      <db.username>root</db.username>
    </properties>
  </profile>

  <!-- 测试环境 -->
  <profile>
    <id>test</id>
    <properties>
      <profile.active>test</profile.active>
      <db.url>jdbc:mysql://10.0.0.5:3306/order_test</db.url>
      <db.username>order_test</db.username>
    </properties>
  </profile>

  <!-- 生产环境 -->
  <profile>
    <id>prod</id>
    <properties>
      <profile.active>prod</profile.active>
      <db.url>jdbc:mysql://db.prod.internal:3306/order</db.url>
      <db.username>order_prod</db.username>
    </properties>
  </profile>
</profiles>
```

**② `application.yml` 里用占位符**：

```yaml
spring:
  datasource:
    url: ${db.url}            # ← 打包时会被替换成对应环境的真实地址
    username: ${db.username}
  profiles:
    active: ${profile.active}
```

**③ 打开资源过滤（否则 `${}` 不会被替换）**：

```xml
<build>
  <resources>
    <resource>
      <directory>src/main/resources</directory>
      <filtering>true</filtering>   <!-- ⭐ 关键：开启过滤才会替换占位符 -->
    </resource>
  </resources>
</build>
```

**④ 打包时指定环境**：

```bash
mvn clean package -P dev     # 打开发包
mvn clean package -P prod    # 打生产包
mvn clean package -P prod -DskipTests   # 生产包并跳过测试
```

> ⚠️ **方案 A 的三个坑**：
> 1. **忘记开 `<filtering>true</filtering>`** → 占位符原样保留，启动报 `Could not resolve placeholder`；
> 2. **资源过滤会误伤二进制文件**（如 `*.png`、`*.xlsx` 里的 `${}` 被当成占位符破坏文件）→ 必须用 `<includes>` 只过滤 `*.yml` / `*.properties`；
> 3. **生产密码写进 pom 并提交到 Git** → 严重安全事故。

#### 方案 B：Spring Boot profile（推荐）

**① 目录结构**：

```
src/main/resources/
├── application.yml            # 公共配置 + 指定默认激活哪个环境
├── application-dev.yml        # 开发环境
├── application-test.yml       # 测试环境
└── application-prod.yml       # 生产环境
```

**② `application.yml` 里指定默认环境**：

```yaml
spring:
  profiles:
    active: @profiles.active@    # ⚠️ 注意用的是 @ 不是 $ —— 见下方说明
```

**③ pom 里定义 profile 只负责「传一个环境名」**：

```xml
<profiles>
  <profile>
    <id>dev</id>
    <activation><activeByDefault>true</activeByDefault></activation>
    <properties><profiles.active>dev</profiles.active></properties>
  </profile>
  <profile>
    <id>prod</id>
    <properties><profiles.active>prod</profiles.active></properties>
  </profile>
</profiles>
```

**④ 打包**：

```bash
mvn clean package -P prod
# 或者启动时直接指定（包不用重打，这就是方案 B 的最大优势）
java -jar order-service.jar --spring.profiles.active=prod
```

> ⚠️ **超经典坑：`${}` 和 `@` 的区别**
> 当项目继承 `spring-boot-starter-parent` 时，父 pom 把资源过滤的分隔符配置成了 **`@`**（为了避免和 Spring 的 `${}` 占位符冲突）。
> - 所以 Maven 要替换的变量写成 **`@profiles.active@`**；
> - 写成 `${profiles.active}` 会被 Spring 当成自己的占位符，**解析失败**。
> ✅ 如果你没继承 Spring Boot 父 pom，默认分隔符才是 `${}`。**记住这个差异，能省半天排查时间。**

**⑤ 更安全的做法：敏感配置外置**

```bash
# 生产环境的密码不写进任何文件，用环境变量传入
export DB_PASSWORD=xxxxxx
java -jar order-service.jar --spring.profiles.active=prod
```

```yaml
# application-prod.yml
spring:
  datasource:
    password: ${DB_PASSWORD}    # 从环境变量读取，不落盘、不进 Git
```

> ✅ **企业级最佳实践**：**Maven 只负责「打一个通用包」，环境差异全部交给 Spring Boot profile + 配置中心（Nacos/Apollo）+ 环境变量**。这样同一个包可以在任何环境跑，符合「一次构建、多处部署」的原则。

### 2.4 私服（Nexus）完整配置：拉取 + 发布

**完整链路**：`settings.xml` 配账号 → `pom.xml` 配发布地址 → `mvn deploy`。

**① `settings.xml` 配账号**（id 要与 pom 里一致）：

```xml
<servers>
  <server>
    <id>nexus-releases</id>
    <username>deploy</username>
    <password>********</password>
  </server>
  <server>
    <id>nexus-snapshots</id>
    <username>deploy</username>
    <password>********</password>
  </server>
</servers>
```

**② `pom.xml` 配发布目标**（见 2.2.8）：

```xml
<distributionManagement>
  <repository>
    <id>nexus-releases</id>          <!-- ⭐ 和上面 servers 的 id 一一对应 -->
    <url>http://nexus.company.com/repository/maven-releases/</url>
  </repository>
  <snapshotRepository>
    <id>nexus-snapshots</id>
    <url>http://nexus.company.com/repository/maven-snapshots/</url>
  </snapshotRepository>
</distributionManagement>
```

**③ 执行发布**：

```bash
mvn clean deploy                       # 自动判断：version 含 SNAPSHOT → 传 snapshots；否则 → 传 releases
mvn clean deploy -DskipTests           # 跳过测试（CI 里常用）
mvn deploy:deploy-file \               # 上传一个【已存在的 jar】（第三方包/手工上传）
  -Dfile=xxx.jar \
  -DgroupId=com.company -DartifactId=xxx -Dversion=1.0.0 \
  -Dpackaging=jar \
  -Durl=http://nexus.company.com/repository/maven-releases/ \
  -DrepositoryId=nexus-releases
```

**④ 顺便附上源码和文档**（别人用你的包时能看源码）：

```xml
<build>
  <plugins>
    <plugin>
      <groupId>org.apache.maven.plugins</groupId>
      <artifactId>maven-source-plugin</artifactId>
      <executions>
        <execution>
          <id>attach-sources</id>
          <goals><goal>jar-no-fork</goal></goals>   <!-- deploy 时自动附带 -sources.jar -->
        </execution>
      </executions>
    </plugin>
  </plugins>
</build>
```

**常见私服报错对照**：

| 报错 | 原因 | 解决 |
|---|---|---|
| `401 Unauthorized` | servers 的 id 与 pom 的 repository id 不一致 / 密码错 | 检查两处 id 是否**逐字符相同** |
| `400 Bad Request` | 往 release 仓库重复发布同一版本 | 升版本号；或 Nexus 开启 redeploy |
| `Could not find artifact com.company:xxx` | ① mirror 写成 `*` 劫持了私服请求 ② 私服里确实没有 | 改 `mirrorOf` 为 `*,!company-repo`；确认包已发布 |
| `Connection refused` / 超时 | 内网地址走了代理 | 把内网域名加进 `<nonProxyHosts>` |
| `Return code is: 405` | 用了错误的 HTTP 方法（多为 URL 写错，如漏了 `/repository/`） | 核对 Nexus 仓库 URL |

### 2.5 JDK 版本的 4 种配置方式（附优先级）

**「编译版本不对」是 Maven 最常见的问题之一**——报错形如 `class file has wrong version 61.0, should be 55.0`。根源是「编译用的 JDK 版本」和「运行/依赖要求的版本」不一致。

| 方式 | 写法 | 说明 |
|---|---|---|
| **① properties（source/target）** | `<maven.compiler.source>17</maven.compiler.source>`<br>`<maven.compiler.target>17</maven.compiler.target>` | 最常见，但**不检查 API 兼容性** |
| **② properties（release）⭐** | `<maven.compiler.release>17</maven.compiler.release>` | **JDK 9+ 推荐**：同时约束语法和 API，避免「在高版本 JDK 上编译、低版本跑不了」 |
| **③ compiler 插件配置** | `<plugin>maven-compiler-plugin`<br>`<configuration><release>17</release>` | 优先级**高于** properties |
| **④ Spring Boot 父 pom** | `<java.version>17</java.version>` | Spring Boot 父 pom 会把它映射到 compiler 插件 |

**优先级**：`插件 configuration` > `properties`（`maven.compiler.*`）> Spring Boot 父 pom 的默认值。

**`source/target` vs `release` 的关键差异**（很多人踩过）：

```xml
<!-- ❌ 只写 source/target：用 JDK 17 编译，但可能调用了 JDK 17 才有的 API，
     目标环境是 JDK 8 时 → 运行时 NoSuchMethodError -->
<maven.compiler.source>8</maven.compiler.source>
<maven.compiler.target>8</maven.compiler.target>

<!-- ✅ 写 release：编译器会【同时校验 API 是否存在于该版本】，
     用了 JDK 8 没有的 API 会直接【编译期报错】，把问题提前暴露 -->
<maven.compiler.release>8</maven.compiler.release>
```

> ✅ **结论：JDK 9 及以上，一律用 `<maven.compiler.release>`。**

**排查「编译版本不对」的三步**：

```bash
mvn -version                              # 1. 确认 Maven 用的 JDK 版本（看 Java version）
java -version                             # 2. 确认运行环境的 JDK 版本
mvn help:effective-pom | grep -A2 compiler   # 3. 确认最终生效的编译配置
```

> ⚠️ **注意**：`mvn -version` 显示的 JDK 是 **`JAVA_HOME` 指向的那个**，不一定等于你 IDE 里配的 JDK。**这是「IDE 里能编译、命令行编译失败」的典型原因。**

### 2.6 常用插件配置速查

#### ① `maven-compiler-plugin`（编译）

```xml
<plugin>
  <groupId>org.apache.maven.plugins</groupId>
  <artifactId>maven-compiler-plugin</artifactId>
  <version>3.13.0</version>
  <configuration>
    <release>17</release>
    <encoding>UTF-8</encoding>
    <!-- 保留方法参数名（Spring/MyBatis 反射拿参数名时需要） -->
    <parameters>true</parameters>
    <!-- 编译时显示警告 -->
    <showWarnings>true</showWarnings>
  </configuration>
</plugin>
```

#### ② `maven-surefire-plugin`（测试）

```xml
<plugin>
  <artifactId>maven-surefire-plugin</artifactId>
  <version>3.2.5</version>
  <configuration>
    <skipTests>${skipTests}</skipTests>   <!-- 配合 -DskipTests 使用 -->
    <excludes>
      <exclude>**/*IntegrationTest.java</exclude>   <!-- 打包时排除集成测试 -->
    </excludes>
  </configuration>
</plugin>
```

#### ③ `spring-boot-maven-plugin`（打成可执行 jar）⭐

```xml
<plugin>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-maven-plugin</artifactId>
  <configuration>
    <mainClass>com.company.order.OrderApplication</mainClass>   <!-- 多主类时必须指定 -->
    <excludes>
      <!-- ⭐ 必须排除 lombok：它只在编译期用，不该打进运行包 -->
      <exclude>
        <groupId>org.projectlombok</groupId>
        <artifactId>lombok</artifactId>
      </exclude>
    </excludes>
  </configuration>
  <executions>
    <execution>
      <goals><goal>repackage</goal></goals>   <!-- 把普通 jar 重打成 fat jar -->
    </execution>
  </executions>
</plugin>
```

> ⚠️ **不排除 lombok 的后果**：打出来的 jar 里含 lombok，虽然多数情况不影响运行，但**体积变大且可能与其他依赖冲突**。IDEA 也会提示 `Lombok needs to be excluded`。

#### ④ 其他常用插件一览

| 插件 | 作用 | 典型场景 |
|---|---|---|
| `maven-jar-plugin` | 打普通 jar，可配 `Main-Class` | 非 Spring Boot 项目 |
| `maven-assembly-plugin` | 打「含全部依赖」的 fat jar（自定义结构） | 需要自定义目录结构的发布包 |
| `maven-shade-plugin` | 打 fat jar + **重定位包名**（解决依赖冲突） | 中间件 SDK、需避免依赖冲突的库 |
| `maven-resources-plugin` | 资源拷贝与过滤 | 自定义资源目录 |
| `flatten-maven-plugin` | **把 `${revision}` 等变量固化**到发布的 pom | 多模块统一版本号 |
| `maven-source-plugin` | 附带 `-sources.jar` | 发布 SDK 供他人调试 |
| `maven-javadoc-plugin` | 附带 `-javadoc.jar` | 发布开源库 |
| `maven-deploy-plugin` | 控制 deploy 行为（如跳过） | CI 分阶段构建 |

**`assembly` vs `shade` 怎么选**：

| | assembly | shade |
|---|---|---|
| 产出 | 一个 fat jar（**依赖包名原样**） | 一个 fat jar（**依赖包名可重定位**） |
| 冲突处理 | 依赖冲突原样带进去（可能踩雷） | **可以把依赖改到自己的包名下**，彻底隔离 |
| 适合 | 内部应用（自己控制全部依赖） | **对外发布的 SDK / 中间件** |

### 2.7 多模块项目：父 pom 标准模板

**目录结构**（芋道等主流脚手架都长这样）：

```
order-parent/                     ← 父模块（packaging=pom）
├── pom.xml                       ← 统一锁版本、统一插件
├── order-api/                    ← 对外接口 + DTO（被其他服务依赖）
│   └── pom.xml
├── order-biz/                    ← 业务逻辑（依赖 api）
│   └── pom.xml
└── order-web/                    ← 启动模块 + Controller（依赖 biz）
    └── pom.xml
```

**父 pom 模板**：

```xml
<project>
  <modelVersion>4.0.0</modelVersion>
  <groupId>com.company</groupId>
  <artifactId>order-parent</artifactId>
  <version>1.0.0-SNAPSHOT</version>
  <packaging>pom</packaging>                 <!-- ⭐ 父模块必须 pom -->

  <modules>                                  <!-- 聚合：一次构建全部 -->
    <module>order-api</module>
    <module>order-biz</module>
    <module>order-web</module>
  </modules>

  <properties>
    <maven.compiler.release>17</maven.compiler.release>
    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
    <spring-boot.version>3.2.5</spring-boot.version>
    <hutool.version>5.8.27</hutool.version>
  </properties>

  <!-- ⭐ 只锁版本，不引入（子模块按需引用） -->
  <dependencyManagement>
    <dependencies>
      <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-dependencies</artifactId>
        <version>${spring-boot.version}</version>
        <type>pom</type>
        <scope>import</scope>                <!-- 导入官方 BOM，一次锁好所有 Spring 依赖 -->
      </dependency>
      <dependency>
        <groupId>cn.hutool</groupId>
        <artifactId>hutool-all</artifactId>
        <version>${hutool.version}</version>
      </dependency>
      <!-- 本项目的子模块之间互相依赖，也在这里锁版本 -->
      <dependency>
        <groupId>com.company</groupId>
        <artifactId>order-api</artifactId>
        <version>${project.version}</version>
      </dependency>
    </dependencies>
  </dependencyManagement>

  <!-- ⭐ 只放【所有子模块都需要】的依赖 -->
  <dependencies>
    <dependency>
      <groupId>org.projectlombok</groupId>
      <artifactId>lombok</artifactId>
      <scope>provided</scope>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-test</artifactId>
      <scope>test</scope>
    </dependency>
  </dependencies>

  <build>
    <pluginManagement>                       <!-- 只声明，子模块按需启用 -->
      <plugins>
        <plugin>
          <groupId>org.apache.maven.plugins</groupId>
          <artifactId>maven-compiler-plugin</artifactId>
          <version>3.13.0</version>
          <configuration><release>17</release></configuration>
        </plugin>
      </plugins>
    </pluginManagement>
  </build>
</project>
```

**子模块 pom**（继承父模块）：

```xml
<project>
  <modelVersion>4.0.0</modelVersion>
  <parent>
    <groupId>com.company</groupId>
    <artifactId>order-parent</artifactId>
    <version>1.0.0-SNAPSHOT</version>
    <!-- 子模块继承【本地父模块】时，不要写 <relativePath/>（默认就能找到 ../pom.xml） -->
  </parent>

  <artifactId>order-biz</artifactId>       <!-- 子模块只需写 artifactId（groupId/version 继承） -->

  <dependencies>
    <dependency>
      <groupId>com.company</groupId>
      <artifactId>order-api</artifactId>   <!-- 不写 version，继承父模块的 dependencyManagement -->
    </dependency>
  </dependencies>
</project>
```

> ⚠️ **多模块的经典坑**：
> 1. **子模块依赖另一个子模块时找不到** → 先在根目录 `mvn install`（把兄弟模块装进本地仓库），或用 `mvn -pl order-web -am package`（`-am` 会自动一起构建依赖模块）；
> 2. **`${project.version}` 在子模块里拿不到预期值** → 用 `${revision}` + `flatten-maven-plugin` 统一版本；
> 3. **父模块的 `<dependencies>` 塞太多** → 所有子模块被迫引入（见 2.2.5）。

---

## 三、应用篇：命令速查

> 这一章是「照着敲就能干活」的部分。**每条命令都标了什么时候用。**

### 3.1 构建类命令

```bash
mvn clean                     # 删掉 target 目录（清理上次构建产物）
mvn compile                   # 只编译主代码 → target/classes
mvn test                      # 编译 + 跑单元测试
mvn package                   # 编译 + 测试 + 打包 → target/xxx.jar
mvn install                   # package + 装进【本地仓库】（供其他项目引用）
mvn deploy                    # install + 发布到【远程仓库/私服】
mvn clean package             # ⭐ 最常用：先清理再打包
mvn clean install -DskipTests # ⭐ 最常用：清理 + 安装到本地 + 跳过测试
mvn clean deploy -P prod      # 打生产包并发布
```

### 3.2 依赖排查类命令 ⭐（排错必备）

```bash
# ① 看依赖树（查冲突的第一利器）
mvn dependency:tree
mvn dependency:tree -Dverbose                        # 显示【被仲裁掉】的依赖（含 omitted for conflict）
mvn dependency:tree -Dincludes=org.slf4j:slf4j-api   # 只看某个 jar 是从哪条路径引进来的
mvn dependency:tree -Dscope=compile                  # 只看某个 scope
mvn dependency:tree -DoutputFile=deps.txt            # 输出到文件（依赖多时方便搜）

# ② 分析「声明了但没用」和「用了但没声明」的依赖
mvn dependency:analyze
# 输出 Used undeclared dependencies（用了但没声明 → 靠传递依赖在跑，随时可能崩）
# 输出 Unused declared dependencies（声明了但没用 → 可以删）

# ③ 清理本地仓库里的某个依赖（下载损坏时用）
mvn dependency:purge-local-repository                # 清空并重新下载本项目依赖
mvn dependency:purge-local-repository -Dinclude=org.slf4j   # 只清指定 groupId

# ④ 强制更新 SNAPSHOT 依赖
mvn clean install -U           # -U = 强制检查更新（别人刚推的 SNAPSHOT 拉不下来时用）
```

### 3.3 多模块构建

```bash
mvn clean install                                    # 在【根目录】执行：按依赖顺序构建全部模块
mvn -pl order-web package                            # 只构建 order-web 模块
mvn -pl order-web -am package                        # ⭐ 同时构建 order-web 及其【依赖的模块】(-am = also make)
mvn -pl order-web -amd package                       # 同时构建依赖 order-web 的模块 (-amd = also make dependents)
mvn -pl order-api,order-biz package                  # 指定多个模块（逗号分隔）
mvn -rf :order-biz                                   # 从某个模块开始继续构建（-rf = resume from，失败后重跑）
```

> 💡 **`-pl` + `-am` 是日常提效组合**：改了一个子模块，只想构建它和它依赖的东西，不用全量构建。

### 3.4 查看与调试

```bash
mvn help:effective-pom        # ⭐ 打印【最终生效】的 pom（含 parent 继承、profile 合并）
mvn help:effective-settings   # ⭐ 打印【最终生效】的 settings（排查配置不生效必用）
mvn help:describe -Dplugin=compiler   # 查某个插件有哪些目标、参数
mvn -X clean package          # ⭐ Debug 模式：打印海量日志（排查「为什么拉不到包」）
mvn -e clean package          # 显示完整错误堆栈（比默认更详细）
mvn -v / mvn -version         # 看 Maven 版本 + 用的 JDK
```

### 3.5 命令行参数速查表

| 参数 | 含义 | 典型用法 |
|---|---|---|
| `-DskipTests` | **编译测试代码但不执行** | `mvn package -DskipTests` |
| `-Dmaven.test.skip=true` | **连测试代码都不编译** | 测试代码本身编译不过时用 |
| `-P<profile>` | 激活指定 profile | `mvn package -P prod` |
| `-U` | 强制更新 SNAPSHOT / 检查远程更新 | `mvn install -U` |
| `-o` | 离线模式（只用本地仓库） | `mvn package -o` |
| `-X` | Debug 日志 | `mvn -X clean` |
| `-e` | 显示完整错误 | `mvn -e clean` |
| `-q` | 静默模式（只输出错误） | CI 中减少日志 |
| `-T 1C` | 多线程构建（1C = 每个 CPU 核一个线程） | `mvn -T 1C clean install` |
| `-pl` | 指定模块 | `mvn -pl order-web package` |
| `-am` | 同时构建依赖的模块 | `mvn -pl order-web -am package` |
| `-rf` | 从失败处继续 | `mvn -rf :order-biz install` |
| `-f` | 指定 pom 文件 | `mvn -f order/pom.xml package` |
| `-s` | 指定 settings.xml | `mvn -s /path/to/settings.xml package` |
| `-D<属性>=值` | 覆盖 pom 里的属性 | `mvn package -Dhutool.version=5.8.30` |

> ⚠️ **`-DskipTests` 和 `-Dmaven.test.skip=true` 的区别**（常被问到）：
> - `-DskipTests`：**编译测试代码，但不运行**（能发现测试代码的编译错误）
> - `-Dmaven.test.skip=true`：**测试代码不编译也不运行**（更快，但测试代码写错了也发现不了）
> **日常用 `-DskipTests`；CI 的「快速打包」阶段可以用后者。**

---

## 四、进阶篇：冲突、版本与排错

### 4.1 依赖冲突解决实战（四步法）

**症状**：运行时抛 `NoSuchMethodError`、`ClassNotFoundException`、`NoClassDefFoundError`、`AbstractMethodError`——**编译能过、一跑就炸**，十有八九是依赖冲突。

**四步法**：

```bash
# 第 1 步：确认到底有几个版本
mvn dependency:tree -Dverbose | grep "出问题的类所在的jar"
# 看到形如：omitted for conflict with 1.2.3  → 就是被仲裁掉的版本

# 第 2 步：找出它是从哪条路径引进来的
mvn dependency:tree -Dincludes=冲突的groupId:artifactId
# 输出会显示完整的引入路径，例如：
# [INFO] com.company:order:jar:1.0
# [INFO] +- com.a:lib-a:jar:1.0
# [INFO] |  \- commons-logging:commons-logging:jar:1.1   ← 从这里进来的

# 第 3 步：确认实际生效的版本
mvn help:effective-pom | grep -A3 "冲突的artifactId"
```

**第 4 步：三种修法（按推荐顺序）**：

```xml
<!-- 修法 ① 排除传递依赖（最推荐，精准） -->
<dependency>
  <groupId>com.a</groupId>
  <artifactId>lib-a</artifactId>
  <version>1.0</version>
  <exclusions>
    <exclusion>
      <groupId>commons-logging</groupId>
      <artifactId>commons-logging</artifactId>
    </exclusion>
  </exclusions>
</dependency>

<!-- 修法 ② 显式声明想要的版本（利用「最短路径优先」抢占） -->
<dependency>
  <groupId>commons-logging</groupId>
  <artifactId>commons-logging</artifactId>
  <version>1.2</version>     <!-- 直接声明 = 路径最短 = 胜出 -->
</dependency>

<!-- 修法 ③ 用 dependencyManagement 统一锁版本（项目级根治） -->
<dependencyManagement>
  <dependencies>
    <dependency>
      <groupId>commons-logging</groupId>
      <artifactId>commons-logging</artifactId>
      <version>1.2</version>   <!-- 所有传递进来的这个依赖，统一被锁定为 1.2 -->
    </dependency>
  </dependencies>
</dependencyManagement>
```

> ✅ **最佳实践**：**在父 pom 的 `<dependencyManagement>` 里统一锁死所有关键依赖的版本**。这样无论哪条路径引进来的，版本都是统一的——**从根上消灭冲突**。

### 4.2 SNAPSHOT vs RELEASE（版本语义）

| | **RELEASE（正式版）** | **SNAPSHOT（快照版）** |
|---|---|---|
| 版本号 | `1.0.0` | `1.0.0-SNAPSHOT` |
| 含义 | **不可变**，发布后永不改变 | **可变**，每次构建都可能不同 |
| 本地更新 | 只下载一次，之后不再检查 | 每次构建都会**检查远程是否有新版本** |
| 发布到 | `maven-releases` 仓库 | `maven-snapshots` 仓库 |
| 用于 | 正式交付、对外发布 | **团队内部联调、迭代开发** |
| 仓库默认是否允许下载 | ✅ 允许 | ❌ **默认禁止**（要显式配 `<snapshots><enabled>true</enabled>`） |

> ⚠️ **SNAPSHOT 的两个坑**：
> 1. **拉不到**：仓库没开 `<snapshots><enabled>true</enabled>`（见 2.2.6）；
> 2. **拉到旧的**：Maven 有更新策略缓存（默认 `daily`），当天不会重复检查。**别人刚推的包你拉不到 → 加 `-U`**：
> ```bash
> mvn clean install -U
> ```

> ✅ **发布纪律**：**正式交付/上生产，版本号里绝不能带 `-SNAPSHOT`**。SNAPSHOT 意味着「内容可能随时变」，用它上生产等于埋雷。

### 4.3 BOM：统一依赖版本的正规姿势

**BOM（Bill of Materials）= 一份「版本清单」pom**，本身不含代码，只声明「这一套依赖应该用什么版本」。

**两种用法**：

```xml
<!-- 用法一：继承（Spring Boot 项目最常见） -->
<parent>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-starter-parent</artifactId>
  <version>3.2.5</version>
</parent>

<!-- 用法二：import 导入（不能改继承关系时用） -->
<dependencyManagement>
  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-dependencies</artifactId>
      <version>3.2.5</version>
      <type>pom</type>
      <scope>import</scope>     <!-- ⭐ import 只在 dependencyManagement 里有效 -->
    </dependency>
  </dependencies>
</dependencyManagement>
```

**公司自研 BOM 的写法**（把公司内部所有 SDK 版本集中管理）：

```xml
<!-- company-bom/pom.xml -->
<project>
  <groupId>com.company</groupId>
  <artifactId>company-bom</artifactId>
  <version>1.0.0</version>
  <packaging>pom</packaging>          <!-- ⭐ BOM 必须是 pom -->
  <dependencyManagement>
    <dependencies>
      <dependency><groupId>com.company</groupId><artifactId>user-sdk</artifactId><version>2.1.0</version></dependency>
      <dependency><groupId>com.company</groupId><artifactId>order-sdk</artifactId><version>1.5.2</version></dependency>
    </dependencies>
  </dependencyManagement>
</project>
```

> 💡 **BOM 的价值**：业务项目只需要 `import` 一个 `company-bom`，所有内部 SDK 的版本就统一了，**升级时只改 BOM 一处**。

### 4.4 构建加速 6 招

| 招数 | 做法 | 效果 |
|---|---|---|
| **① 跳过测试** | `-DskipTests` | 最直接，省掉测试时间 |
| **② 多线程构建** | `mvn -T 1C clean install` | 多模块项目提速明显（1C = 每核 1 线程） |
| **③ 离线模式** | `mvn -o package` | 依赖都在本地时，避免联网检查 |
| **④ 只构建变更模块** | `mvn -pl order-web -am package` | 不用全量构建 |
| **⑤ 配置国内镜像** | settings.xml 配阿里云 | **首次下载速度提升 10 倍以上** |
| **⑥ 用 `mvnw` 固化版本** | 项目里带 Maven Wrapper | 团队 Maven 版本一致，避免环境差异 |

**Maven Wrapper（`mvnw`）**——推荐所有项目都加：

```bash
mvn wrapper:wrapper            # 生成 mvnw / mvnw.cmd / .mvn/wrapper/
./mvnw clean package           # 用项目自带的 Maven 版本构建（不依赖本机装了什么版本）
```

> 💡 **为什么需要 `mvnw`**：团队成员本机 Maven 版本可能不同（3.6 / 3.8 / 3.9），行为有差异。**`mvnw` 让项目自带一个指定版本的 Maven**，做到「一次配置、人人一致」——CI 里尤其重要。

### 4.5 报错手册（按报错信息查）

| 报错信息 | 原因 | 解决 |
|---|---|---|
| `Could not resolve dependencies for project ...` | 依赖拉不下来 | ① 检查网络/镜像 ② `mvn -U` 强制更新 ③ 确认私服里有这个包 |
| `Could not find artifact com.company:xxx:jar:1.0` | 私服没有 / mirror 劫持 | 检查 `mirrorOf` 是否写成 `*` 把私服也劫持了 |
| `Non-resolvable parent POM` | 父 pom 找不到 | 外部父 pom 加 `<relativePath/>`；内部父 pom 检查相对路径 |
| `The POM for ... is missing, no dependency information available` | jar 下载不完整（多为网络中断） | 删掉本地对应目录重新下载，或 `mvn dependency:purge-local-repository` |
| `class file has wrong version 61.0, should be 55.0` | **编译 JDK 版本不一致** | 统一用 `<maven.compiler.release>`；检查 `JAVA_HOME` 与 IDEA 的 JDK |
| `Source option 5 is no longer supported` | 没配编译版本，Maven 用了默认的老版本 | 显式配 `<maven.compiler.release>17</maven.compiler.release>` |
| `Fatal error compiling: invalid target release: 17` | 当前 JDK 低于 17 | 换 JDK 或降低目标版本 |
| `401 Unauthorized` | 私服账号错 / id 不匹配 | 检查 `servers` 的 id 与 `repository` 的 id 是否一致 |
| `400 Bad Request` (deploy) | 往 release 仓库重复发布同版本 | 升级版本号 |
| `OutOfMemoryError: Java heap space` | Maven 自身内存不够 | `export MAVEN_OPTS="-Xmx2g -XX:MaxMetaspaceSize=512m"` |
| `Could not transfer ... Connection timed out` | 网络/代理问题 | 检查 `<proxies>` 和 `nonProxyHosts` |
| `Malformed POM ... expected START_TAG` | pom 元素顺序或 XML 语法错 | 检查标签是否闭合、顺序是否合理（Maven 4 会严格校验） |
| 编译通过但运行 `NoSuchMethodError` | **依赖冲突**（见 4.1） | `mvn dependency:tree -Dverbose` 定位并排除 |

> 💡 **万能排查动作**：**加 `-X` 看详细日志**。
> ```bash
> mvn -X clean package 2>&1 | grep -i "could not\|error\|download"
> ```

---

## 五、IDEA 中的 Maven 配置（图形界面实操）

> IDEA 内置了 Maven，但**默认用的是 IDEA 自带的 Maven 和自带的 settings.xml**——这是「命令行能构建、IDEA 拉不到包」的头号原因。这一章教你把两者对齐。

### 5.1 核心配置：Settings → Build Tools → Maven

**路径**：`Settings`（macOS 是 `IntelliJ IDEA → Settings`，`⌘,` / `Ctrl+Alt+S`）→ `Build, Execution, Deployment` → `Build Tools` → `Maven`

| 配置项 | 默认值 | ✅ 推荐设置 | 说明 |
|---|---|---|---|
| **Maven home path** | `Bundled (Maven 3)` | **本机安装的 Maven**（或保持 Bundled） | Bundled 版本较旧；用本机 Maven 与命令行一致 |
| **User settings file** | IDEA 自带的一份 | ⭐ **勾选 `Override`，指向 `~/.m2/settings.xml`** | **最关键的一项**——不指过去，你的镜像和私服配置全部无效 |
| **Local repository** | 自动读取 | 自动（从 settings.xml 读） | 一般不用手改；若改了 settings.xml 记得点刷新 |
| **Work offline** | 不勾 | 按需 | 对应 `-o`，依赖齐了可以勾上加速 |
| **Always update snapshots** | 不勾 | 用 SNAPSHOT 时勾 | 对应 `-U`，避免拉到旧的 SNAPSHOT |
| **Thread count** | 1 | `1C` | 对应 `-T 1C`，多模块提速 |
| **Execute goals recursively** | 勾选 | 勾选 | 多模块项目递归执行 |

> ⚠️ **最常见的坑**：`User settings file` 那一栏没有勾 `Override`，IDEA 用的是自带的空 settings.xml → **你精心配的阿里云镜像和私服账号完全不生效**，所有依赖都从中央仓库慢慢拉，或者干脆拉不到公司内部包。

### 5.2 `Maven → Importing`：导入相关

| 配置项 | 推荐 | 说明 |
|---|---|---|
| **JDK for importer** | 与你项目一致的 JDK | 影响 IDEA 解析 pom 时用的 JDK |
| **VM options for importer** | `-Xmx1024m` | 大项目导入时内存不够会失败 |
| **Automatically download** | 勾 `Sources`（看源码方便） | 自动下载依赖的源码包 |
| **Generate sources and update folders** | 按需 | 用了注解处理器（如 MapStruct）时需要 |

### 5.3 `Maven → Runner`：执行相关

| 配置项 | 推荐 | 说明 |
|---|---|---|
| **VM Options** | `-Dfile.encoding=UTF-8 -Dmaven.test.skip=true` | 防中文乱码；打包时跳过测试 |
| **Environment variables** | 按需 | 如 `MAVEN_OPTS=-Xmx2g` |
| **JRE** | 项目一致的 JDK | **别用 IDEA 自带的 JBR**，可能与项目 JDK 不一致 |

### 5.4 Maven 工具窗口（右侧边栏）

点右侧竖排的 **`Maven`** 图标（或 `View → Tool Windows → Maven`），能看到：

```
┌────────────────────────────────────┐
│ order-parent                       │  ← 项目名
│  ├─ Lifecycle                      │  ← ⭐ 双击即可执行
│  │   ├─ clean                      │
│  │   ├─ validate                   │
│  │   ├─ compile                    │
│  │   ├─ test                       │
│  │   ├─ package                    │
│  │   ├─ verify                     │
│  │   ├─ install                    │
│  │   └─ deploy                     │
│  ├─ Plugins                        │  ← 展开看插件，可双击执行 goal
│  ├─ Dependencies                   │  ← ⭐ 看依赖树（不用敲命令）
│  └─ Profiles                       │  ← ⭐ 勾选激活 profile（多环境切换）
└────────────────────────────────────┘
```

**四个高频操作**：

| 操作 | 怎么做 | 对应命令 |
|---|---|---|
| **刷新依赖**（Reimport） | 工具窗顶部 🔄 图标 | — |
| **执行某个阶段** | 双击 `Lifecycle` 下的阶段 | `mvn package` |
| **切换环境** | 展开 `Profiles`，勾选 `prod` | `mvn package -P prod` |
| **看依赖树** | 展开 `Dependencies` | `mvn dependency:tree` |

> 💡 **`Dependencies` 面板是 IDEA 的隐藏福利**：**红色下划线**表示冲突或找不到；直接右键冲突的依赖 → `Exclude`，IDEA 会自动帮你在 pom 里写好 `<exclusions>`。

### 5.5 其他必须配的 IDEA 设置

**① 项目 SDK 与语言级别**（编译版本不对的元凶之一）

`File → Project Structure`（`⌘;` / `Ctrl+Alt+Shift+S`）：
- `Project` → **SDK** 选对 JDK（如 17）、**Language level** 选对应版本
- `Modules` → 每个模块的 `Sources` 页确认 Language level

**② 注解处理（Lombok / MapStruct 必需）**

`Settings → Build, Execution, Deployment → Compiler → Annotation Processors` → 勾选 **`Enable annotation processing`**
- 同时确认装了 **Lombok 插件**（`Settings → Plugins` 搜 Lombok）

**③ 文件编码**

`Settings → Editor → File Encodings` → 三处全设 **UTF-8**：
- Global Encoding、Project Encoding、Default encoding for properties files

**④ 自动导入 pom 变更**

`Settings → Build Tools → Maven → Importing` → 勾 **`Import Maven projects automatically`**（或顶部弹出的 `Load Maven Changes` 提示点一下）

### 5.6 IDEA 常见 Maven 问题

| 问题 | 原因 | 解决 |
|---|---|---|
| 依赖标红，但命令行能构建 | IDEA 索引没更新 / settings 没对齐 | ① Maven 面板点 🔄 Reimport ② 检查 5.1 的 User settings file ③ `File → Invalidate Caches → Invalidate and Restart` |
| 拉不到公司内部包 | IDEA 用了自带 settings.xml | 勾 `Override` 指向 `~/.m2/settings.xml`（见 5.1） |
| 多模块项目某个模块没被识别 | 模块未加入 Maven 管理 | 右键该模块的 `pom.xml` → `Add as Maven Project` |
| 改了 pom 不生效 | 没重新导入 | 点顶部 `Load Maven Changes`，或右键 pom → `Maven → Reload project` |
| 编译报「无效的目标发行版」 | Project SDK / Language level 与 pom 不一致 | 按 5.5 ① 对齐三处：pom、Project Structure、Maven Importer |
| Lombok 的 `@Data` 飘红 | 没开注解处理 / 没装插件 | 按 5.5 ② 开启 |
| 控制台中文乱码 | 编码不统一 | Runner VM Options 加 `-Dfile.encoding=UTF-8` + 5.5 ③ |
| `mvn` 命令找不到 | 终端没配 PATH | macOS/Linux 配 `~/.zshrc`；或用 IDEA 的 Maven 面板（不依赖 PATH） |
| 构建很慢 | 每次全量 + 联网检查 | 勾 `Work offline` + 设 `Thread count=1C` |

---

## 六、踩坑清单（速查表）

### 6.1 配置类坑

| 坑 | 后果 | 正确做法 |
|---|---|---|
| `mirrorOf` 写成 `*` 又配了私服 | 所有请求被劫持到镜像，**自研包拉不到** | 用 `*,!company-repo`，或把 mirror 指向公司 Nexus |
| `servers` 的 id 与 `repository` 的 id 不一致 | `401 Unauthorized` | 两处 id **逐字符一致** |
| 忘记配 `<snapshots><enabled>true</enabled>` | SNAPSHOT 依赖拉不到 | 仓库配置里显式打开 |
| 父 pom 用外部包但没写 `<relativePath/>` | 可能误用本地同名 pom | 引入外部父 pom 一律加 `<relativePath/>` |
| 生产密码写进 pom 并提交 Git | **安全事故** | 用环境变量/配置中心；settings.xml 加 `.gitignore` |
| 资源过滤没配 `<includes>` | 二进制文件（png/xlsx）被破坏 | 只过滤 `*.yml` / `*.properties` |
| 忘了开 `<filtering>true</filtering>` | 占位符不替换，启动报错 | 确认 resources 配了 filtering |
| IDEA 没勾 `Override` settings file | 所有配置不生效 | 见 5.1 |

### 6.2 依赖类坑

| 坑 | 后果 | 正确做法 |
|---|---|---|
| `lombok` 没写 `provided` | 被打进最终包 | `<scope>provided</scope>` |
| 父 pom 的 `<dependencies>` 塞太多 | **所有子模块被迫引入** | 父 pom 用 `<dependencyManagement>` 锁版本 |
| 混用 `dependencies` 和 `dependencyManagement` | 不该引入的模块也被塞 jar | 分清楚：management 只锁版本 |
| 排除依赖时写了 `<version>` | 语法冗余（Maven 会警告） | `<exclusion>` 里**不写 version** |
| `scope=test` 的依赖在 main 里用 | 编译不过 | 换 scope 或重构 |
| 编译过、运行 `NoSuchMethodError` | 依赖冲突 | `mvn dependency:tree -Dverbose` 定位（见 4.1） |

### 6.3 版本与构建类坑

| 坑 | 后果 | 正确做法 |
|---|---|---|
| 用 `source/target` 而非 `release` | 高版本 API 在低版本环境运行时炸 | JDK9+ 用 `<maven.compiler.release>` |
| `mvn -version` 的 JDK ≠ IDEA 的 JDK | 「IDE 能编译、命令行失败」 | 统一 `JAVA_HOME` 与 IDEA 设置 |
| 正式交付用了 `-SNAPSHOT` 版本 | 内容可能随时变，埋雷 | 上生产必须是 RELEASE 版本 |
| 往 release 仓库重复发同版本 | `400 Bad Request` | 升版本号 |
| 多模块子模块互相依赖构建失败 | 找不到兄弟模块 | `mvn install` 或 `mvn -pl xxx -am package` |
| 每次构建都联网检查更新 | 慢 | 配镜像 + 用 `-o` 或勾 `Work offline` |

### 6.4 IDEA 使用类坑

| 坑 | 正确做法 |
|---|---|
| 依赖标红就删本地仓库 | 先 Reimport；不行再 `Invalidate Caches`；最后才清仓库 |
| 改完 pom 直接跑 | 先点 `Load Maven Changes` |
| 多环境切换靠手改 yml | 用 Maven 面板的 `Profiles` 勾选，或 `-P` 参数 |
| 用 IDEA 自带 JBR 跑 Maven | Runner 的 JRE 选项目一致的 JDK |
| 装了 Lombok 插件但没开注解处理 | 两个都要做 |

---

## 七、动手路线（照着练一遍就会了）

### 第一阶段：把配置跑通（30 分钟）

- [ ] 新建/编辑 `~/.m2/settings.xml`，配好**阿里云镜像** + **JDK 17 profile**（抄 2.1.8 的模板）
- [ ] 执行 `mvn help:effective-settings`，**确认镜像和 profile 都生效了**
- [ ] 在 IDEA 里把 `User settings file` 勾 `Override` 指向它，点 `Test` 验证

### 第二阶段：读懂 pom（30 分钟）

- [ ] 找一个 Spring Boot 项目，执行 `mvn help:effective-pom > eff.txt`，打开看**继承来的配置长什么样**
- [ ] 在 `dependencies` 里故意**不写 version**，验证能否从 `dependencyManagement` 继承
- [ ] 用 `mvn dependency:tree` 看依赖树，找到至少一个 `omitted for conflict`

### 第三阶段：依赖冲突实战（30 分钟）

- [ ] 故意引入两个会冲突的依赖（或找一个真实冲突）
- [ ] 用 `mvn dependency:tree -Dverbose -Dincludes=xxx` **定位引入路径**
- [ ] 用 `<exclusions>` 排除，验证问题消失
- [ ] 改用 `dependencyManagement` 统一锁版本，体会「根治」的感觉

### 第四阶段：多环境打包（30 分钟）

- [ ] 建 `application-dev.yml` / `application-prod.yml`
- [ ] pom 里加两个 profile，用 `@profiles.active@` 传环境名
- [ ] `mvn clean package -P prod`，解压 jar 确认加载的是 prod 配置
- [ ] 对比：用 `java -jar xxx.jar --spring.profiles.active=dev` 验证「一个包跑多环境」

### 第五阶段：多模块 + 私服（30 分钟）

- [ ] 搭一个 `parent + api + biz + web` 四模块项目，父 pom 用 `<dependencyManagement>` 锁版本
- [ ] 验证 `mvn -pl order-web -am package` 能只构建需要的模块
- [ ] 如果有 Nexus：配好 `servers` + `distributionManagement`，跑一次 `mvn clean deploy`

---

## 八、一句话总结

> **Maven 的配置只有两个文件、三件事**：
> **`settings.xml` 管「去哪拿、用什么身份拿」**（本地仓库 / 镜像 / 账号 / 代理 / JDK）；
> **`pom.xml` 管「要什么、怎么构建」**（依赖 / 插件 / 多环境 / 发布）；
> **两者靠 `<id>` 对齐**——`servers` 的 id、`repository` 的 id、`mirrorOf` 的排除项，**对不上就是各种 401 和「找不到包」**。
> 而依赖冲突的根治方案只有一个：**在父 pom 的 `<dependencyManagement>` 里统一锁死版本**。

---

## 关联笔记

- [[18_开发工具链]] — Git / Maven / Arthas / JMeter 速览版（本篇是 Maven 的详细展开）
- [[31_Git 原理、应用与进阶（含 IDEA 实战）]] — Git 专篇（代码版本管理，与 Maven 常配合使用）
- [[MOC_技术库]] — 技术库总入口
- [[00_Java 后端学习路线与知识体系]] — 后端学习路线总览
- [[22_从零搭建芋道式脚手架框架]] — 多模块脚手架搭建（Maven 多模块的完整实战）
- [[17_Docker容器排错]] — 容器化部署（CI/CD 中 Maven 构建的下游环节）

