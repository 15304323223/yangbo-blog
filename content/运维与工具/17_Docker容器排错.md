---
title: "Docker 容器排错（原理 → 应用 → 进阶）"
---
# Docker 容器排错（原理 → 应用 → 进阶）

> **一句话概括**：Docker 就是**集装箱**——把你的应用和它需要的一切（代码、运行时、库、配置）打包成一个标准箱子，无论搬到哪台机器上，开箱即用，不再"我这能跑你那儿不行"。
>
> **适合谁**：用过 Docker 跑过容器，但容器起不来只会重启、看到报错一头雾水、分不清"容器内端口"和"宿主机端口"的人。
> **怎么读**：应用篇的"诊断三板斧"是日常救命工具；六个常见问题覆盖了 90% 的坑；案例篇的 Yudao 启动顺序问题是真实踩过的坑。

---

## 零、先建立整体印象：把它想象成"集装箱"

| 传统部署 | Docker 部署 | 好处 |
|---|---|---|
| **在服务器上手动装 JDK、MySQL、Redis** | **写一个 Dockerfile，打包成镜像，一键运行** | 环境完全一致，不再"我这能跑" |
| **换台机器要重新配环境** | **镜像搬到哪，环境就在哪** | 开发/测试/生产完全一致 |
| **多个应用抢端口、抢依赖版本** | **每个应用一个独立容器，互不干扰** | 隔离性好 |

**关键概念**：
- **镜像（Image）**：集装箱的"设计图纸"，只读模板
- **容器（Container）**：按图纸造出来的"箱子"，可以运行、可以改、可以删
- **镜像分层**：像叠千层饼，每层只记录变化，相同层可以共享（省空间）

---

## 一、原理篇：容器 vs 虚拟机

| | 虚拟机（VM） | Docker 容器 |
|---|---|---|
| **启动速度** | 分钟级（要启动完整操作系统） | 秒级（共享宿主机内核） |
| **资源占用** | 大（每个 VM 几个 GB） | 小（镜像几十 MB~几百 MB） |
| **隔离级别** | 强（硬件级隔离） | 进程级隔离（Namespace + Cgroup） |
| **性能** | 有虚拟化损耗 | 接近原生 |

> 💡 **容器不是虚拟机**：容器没有自己的操作系统内核，它用的是宿主机的内核，只是被"骗"以为自己在一个独立环境里（Namespace）。所以容器启动快、资源省，但隔离性不如 VM。

---

## 二、应用篇：诊断三板斧 + 六大常见问题

### 2.1 诊断三板斧（遇到任何问题先执行这三步）

```bash
# ① 看状态：哪些容器在跑？哪些挂了？
docker ps -a
# 关注 STATUS 列：
#   Up        = 正常运行
#   Exited    = 已退出，看退出码（0=正常结束，1=报错，137=OOM 被杀）
#   Restarting = 反复重启，大概率启动就报错

# ② 看日志：容器里打印了什么？
docker logs --tail 100 <容器名或ID>      # 看最后 100 行
docker logs -f <容器名或ID>               # 实时跟踪（像 tail -f）
docker logs --since 30m <容器名或ID>      # 只看最近 30 分钟的

# ③ 看配置和资源：容器到底怎么配的？
docker inspect <容器名或ID>               # 完整配置 JSON：挂载、网络、环境变量、内存限制
docker stats                             # 实时看所有容器的 CPU / 内存 / 网络 / IO
```

> 💡 **口诀：状态 → 日志 → 配置，三板斧下来 90% 的问题能定位。**

---

### 2.2 问题一：容器启动后立即退出（Exited / Restarting）

**现象**：`docker ps` 看到 STATUS 是 `Exited (0)` 或反复 `Restarting`。

**根本原因**：
> **容器 ≈ 主进程。主进程结束，容器就结束。**

如果你的启动命令是后台运行的（如 `service nginx start`、`nohup java -jar app.jar &`），主进程瞬间结束，容器跟着退出。

**排查步骤**：
```bash
# ① 看日志确认
docker logs <容器ID>
# 如果看到"进程启动成功"然后就没输出了 → 大概率是后台化了

# ② 进已停止的容器看（用 docker run 的替代入口）
docker run --rm -it <镜像名> sh
# 手动执行你的启动命令，看是不是前台阻塞的
```

**解法**：启动命令必须是**前台阻塞**的：
```dockerfile
# ❌ 错误：后台运行，主进程瞬间结束
CMD service nginx start

# ✅ 正确：前台运行，主进程一直占着
CMD nginx -g 'daemon off;'

# ✅ Java 应用默认就是前台运行的，不用改
CMD java -jar app.jar
```

### 2.3 问题二：端口冲突 / 绑定失败

**现象**：`Bind for 0.0.0.0:8080 failed: port is already allocated`

**排查**：
```bash
# 宿主机上谁占了 8080？
lsof -i:8080
# 或
netstat -tunlp | grep 8080
```

**关键区分**：
```
-p 宿主机端口:容器内端口

例：-p 8081:8080
     ↑ 宿主机上用 8081 访问
           ↑ 容器内部应用监听 8080
```
> ⚠️ **容器内端口和宿主机端口是两回事**。你的 Java 应用监听 8080，但你可以映射到宿主机的 8081、8082……

**解法**：
```bash
# 换宿主机端口
docker run -p 8081:8080 myapp

# 或者停掉占用 8080 的进程
```

### 2.4 问题三：挂载权限 / 文件找不到

**现象**：`permission denied`、`No such file or directory`

**排查步骤**：
```bash
# ① 看容器挂载配置
docker inspect <ID> | grep -A 20 Mounts

# ② 进容器里手动验证
docker exec -it <ID> sh
ls -la /app/data    # 看路径是否存在、权限是否正确
```

**常见根因**：
1. **路径写错**：用了相对路径 → 改用绝对路径
2. **SELinux 限制**（CentOS 常见）：加 `:Z` 让 Docker 自动改 SELinux 标签
   ```bash
   docker run -v /host/data:/app/data:Z myapp
   ```
3. **用户 ID 不匹配**：容器内以 uid 1000 运行，但挂载目录是 root 的 → 改目录权限

### 2.5 问题四：镜像拉取慢 / 超时

**现象**：`docker pull` 卡死或超时。

**根因**：默认 registry（Docker Hub）在国外。

**解法**：
```bash
# 编辑 /etc/docker/daemon.json
{
  "registry-mirrors": [
    "https://docker.mirrors.ustc.edu.cn",
    "https://hub-mirror.c.163.com"
  ]
}

# 重启 Docker
sudo systemctl restart docker

# 验证
docker info | grep -A 5 "Registry Mirrors"
```

### 2.6 问题五：容器 OOM 被 Kill

**现象**：STATUS `OOMKilled (137)`。

**排查**：
```bash
docker inspect <ID> | grep OOMKilled    # 看是不是被 OOM 杀的
docker stats                            # 看内存使用峰值
```

**根因**：容器内存限制（`-m 512m`）+ JVM 堆内存（`-Xmx1g`）双层限制。JVM 以为自己有 1G，但容器只给 512M，超过就被 Linux OOM Killer 干掉。

**解法**：
```bash
# ① 调高容器内存限制
docker run -m 1g myapp

# ② JVM 用百分比而不是固定值（让 JVM 感知容器内存上限）
java -XX:MaxRAMPercentage=75.0 -jar app.jar
# 堆上限 = 容器限制的 75%，给元空间、栈、堆外留 25%
```
> ⚠️ **JDK 8u191+ 默认开启容器支持**，能自动感知容器内存。但老版本或没开 `-XX:+UseContainerSupport` 的，JVM 读的是宿主机内存，容易超卖。

### 2.7 问题六：容器间网络不通

**现象**：A 容器调 B 容器，连不上或超时。

**排查**：
```bash
docker network ls                    # 看有哪些网络
docker network inspect app-net       # 看某个网络里有哪些容器
```

**根因**：默认的 `bridge` 网络里，容器之间**不能用容器名互访**（只能用 IP，但 IP 会变）。

**解法**：
```bash
# ① 创建自定义网络
docker network create app-net

# ② 启动容器时加入这个网络
docker run --name mysql --network app-net -e MYSQL_ROOT_PASSWORD=root mysql:8
docker run --name myapp --network app-net myapp

# ③ 现在 myapp 里可以用 "mysql" 当主机名访问（DNS 自动解析）
# jdbc:mysql://mysql:3306/mydb
```

> 💡 `docker-compose` 会自动创建一个默认网络，同 compose 文件里的服务天然可以用服务名互访。这是推荐做法。

---

## 三、案例篇：Yudao-cloud 服务反复 Restarting

**现象**：`docker-compose up` 后 gateway 服务 STATUS 一直 `Restarting`。

**排查过程**：
```bash
# ① 看日志
docker logs gateway
# 报错：Application run failed ... DataSource URL ... connection refused

# ② 看状态
docker ps -a
# MySQL 容器 STATUS 是 "Starting"，还没完全就绪
# gateway 已经启动并在连数据库 → 连不上 → 崩溃 → Docker 自动重启 → 循环
```

**根因**：`docker-compose.yml` 里虽然写了 `depends_on`，但 `depends_on` **只等容器启动，不等服务就绪**。MySQL 容器刚起来，数据库还没初始化完，gateway 就开始连，连不上就崩。

**解法**：
```yaml
services:
  mysql:
    image: mysql:8
    healthcheck:                    # ① 给 MySQL 加健康检查
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 5s
      timeout: 3s
      retries: 5

  gateway:
    build: ./gateway
    depends_on:
      mysql:
        condition: service_healthy   # ② 等 MySQL 健康后才启动 gateway
```

> 💡 **经验**：`depends_on` 默认不靠谱，生产环境一定要加 `healthcheck` + `condition: service_healthy`。

---

## 四、速查命令表

| 目的 | 命令 |
|---|---|
| 看全部容器（含已退出） | `docker ps -a` |
| 看容器日志 | `docker logs -f --tail 200 <id>` |
| 实时跟踪日志 | `docker logs -f <id>` |
| 进正在运行的容器 | `docker exec -it <id> sh`（或 `bash`） |
| 看资源占用（CPU/内存/IO） | `docker stats` |
| 看容器完整配置 | `docker inspect <id>` |
| 清理已退出的容器 | `docker container prune` |
| 清理悬空镜像（无标签） | `docker image prune` |
| 查看镜像历史层 | `docker history <镜像名>` |
| 复制文件进/出容器 | `docker cp <id>:/app/file.log ./` |

---

## 关联
- JVM 容器内存配置见 [[02_JVM 原理与调优]]
- 压测与性能调优见 [[18_开发工具链]]
- 芋道框架 Docker 部署见 [[22_从零搭建芋道式脚手架框架]]
