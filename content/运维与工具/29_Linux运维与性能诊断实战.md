---
title: "Linux 运维与性能诊断实战（从命令到排查，后端工程师必备）"
---
# Linux 运维与性能诊断实战（从命令到排查，后端工程师必备）

> **一句话概括**：后端工程师不需要成为运维专家，但必须能在 Linux 上「活得下去」——会部署应用、会查日志、会排查性能问题、会处理常见故障。CPU 飙高、内存泄漏、磁盘满了、网络不通，这些问题线上天天遇到，不会排查就是「睁眼瞎」。
>
> **适合谁**：只会用 Windows、上了 Linux 就慌、排查问题全靠 Google、面试被问「线上 CPU 100% 怎么排查」「怎么看应用日志」答不出具体命令的人。

---

## 零、先建立印象：把 Linux 想象成「医院体检」

| 医院体检 | Linux 排查 |
|---|---|
| **量体温** | `top` / `htop` 看 CPU 和内存 |
| **量血压** | `free` 看内存使用 |
| **验血** | `iostat` 看磁盘 IO |
| **心电图** | `vmstat` 看系统整体状态 |
| **B 超** | `netstat` / `ss` 看网络连接 |
| **病历本** | `/var/log/` 下的各种日志 |
| **开药** | 修改配置、重启服务、清理磁盘 |

> 💡 **排查思路**：先整体（top/vmstat），再局部（具体进程/具体资源），最后定位（日志/配置/代码）。不要一上来就猜，用数据说话。

---

## 一、系统资源排查四大件

### 1.1 CPU 排查

```bash
# 1. top：实时查看系统整体状态
top
# 常用快捷键：
#   P：按 CPU 使用率排序
#   M：按内存使用率排序
#   T：按运行时间排序
#   1：显示每个 CPU 核心的使用情况
#   k：杀死进程（输入 PID）
#   q：退出

# 2. htop：top 的增强版（更直观，颜色显示）
htop
# 需要安装：yum install htop / apt install htop

# 3. 查看 CPU 信息
lscpu                    # CPU 架构、核心数、线程数
cat /proc/cpuinfo        # 详细 CPU 信息
nproc                    # CPU 核心数

# 4. 查看某个进程的 CPU 使用
top -p <pid>             # 只看指定进程
ps -p <pid> -o %cpu,%mem,cmd  # 查看进程 CPU 和内存占比

# 5. CPU 飙高排查流程
# ① top 找高 CPU 进程
# ② top -Hp <pid> 找该进程下高 CPU 线程
# ③ jstack <pid> 看 Java 线程栈（Java 应用）
# ④ 定位到具体代码
```

**CPU 使用率解读：**
| 指标 | 说明 |
|---|---|
| `us` | 用户态 CPU（应用代码） |
| `sy` | 内核态 CPU（系统调用） |
| `wa` | IO 等待（磁盘/网络 IO 太高，CPU 在等） |
| `id` | 空闲 |
| `st` | 被虚拟化偷走的（虚拟机特有） |

> 💡 **关键**：`us` 高 = 应用代码问题（死循环、大量计算）；`sy` 高 = 系统调用频繁（频繁创建线程、大量 IO）；`wa` 高 = 磁盘/网络 IO 瓶颈，不是 CPU 本身的问题。

### 1.2 内存排查

```bash
# 1. free：查看内存使用
free -h                  # 人类可读格式（GB/MB）
# 输出：
#               total        used        free      shared  buff/cache   available
# Mem:           15Gi       3.5Gi       8.2Gi       1.0Gi       3.8Gi        10Gi
# Swap:         2.0Gi          0B       2.0Gi

# 关键指标：
#   used：已使用（不含 buff/cache）
#   buff/cache：缓冲区和缓存（可回收，不算真正占用）
#   available：可用内存（≈ free + buff/cache 可回收部分）
#   Swap：交换分区（用了说明内存不够了，性能会下降）

# 2. 查看进程内存使用
ps aux --sort=-%mem | head -20   # 按内存使用率排序，前 20
top -o %MEM                       # top 按内存排序

# 3. 查看内存详细信息
cat /proc/meminfo                 # 详细内存信息
vmstat 1 5                        # 每 1 秒输出一次，共 5 次（虚拟内存统计）

# 4. Java 应用内存排查
jmap -heap <pid>                  # 查看 JVM 堆内存使用
jmap -dump:live,format=b,file=/tmp/heap.hprof <pid>  # 导出堆转储
jstat -gc <pid> 1000 10          # 每 1 秒输出一次 GC 情况，共 10 次

# 5. OOM Killer 排查（系统内存不足时内核会杀进程）
dmesg | grep -i "out of memory"  # 查看 OOM 记录
dmesg | grep -i "killed process"
```

> ⚠️ **常见误区**：`free` 命令看到 `free` 很小就以为内存不够了。不对！Linux 会把空闲内存拿来做 buff/cache（提升 IO 性能），这部分内存是可以回收的。真正要看 `available`，这个才是真正可用的内存。

### 1.3 磁盘排查

```bash
# 1. df：查看磁盘空间使用
df -h                              # 人类可读格式
df -i                              # 查看 inode 使用（小文件太多会耗尽 inode）

# 2. du：查看目录/文件大小
du -sh /path/to/dir               # 查看目录总大小
du -h --max-depth=1 /path         # 查看目录下一级各子目录大小
du -ah /path | sort -rh | head -20  # 找最大的 20 个文件/目录

# 3. iostat：磁盘 IO 性能
iostat -x 1 5                      # 每 1 秒输出一次，共 5 次（详细 IO 统计）
# 关键指标：
#   %util：磁盘利用率（接近 100% 说明磁盘瓶颈）
#   await：IO 平均等待时间（高说明磁盘慢）
#   r/s, w/s：每秒读写次数
#   rMB/s, wMB/s：每秒读写量

# 4. 查找大文件
find / -type f -size +100M 2>/dev/null  # 找大于 100M 的文件
find /var/log -type f -name "*.log" -exec ls -lh {} \;  # 找日志文件

# 5. 磁盘满了快速清理
# 清理日志（先确认日志不需要了）
echo "" > /path/to/large.log      # 清空文件内容（不删除文件，保持文件句柄）
rm -f /path/to/old.log            # 删除文件
# 清理 yum/apt 缓存
yum clean all                      # CentOS
apt clean                          # Ubuntu
# 清理 journal 日志
journalctl --vacuum-time=7d       # 只保留 7 天的 journal 日志
```

> ⚠️ **经典坑**：磁盘满了，`df` 显示 100%，但 `du` 找不到大文件。原因：有进程持有已删除文件的句柄，文件删了但空间没释放。解法：`lsof | grep deleted` 找到持有已删除文件的进程，重启该进程。

### 1.4 网络排查

```bash
# 1. 查看网络连接
ss -tlnp                           # 查看所有监听的 TCP 端口（推荐，比 netstat 快）
ss -tunap                          # 查看所有 TCP/UDP 连接
netstat -tlnp                      # 传统方式（有些系统没有 ss）

# 2. 查看端口占用
lsof -i :8080                      # 查看 8080 端口被哪个进程占用
ss -tlnp | grep 8080

# 3. 网络连通性测试
ping <host>                        # 测试网络连通性（ICMP）
ping -c 4 <host>                   # 只发 4 个包
telnet <host> <port>               # 测试端口连通性
curl -v http://<host>:<port>      # 测试 HTTP 接口连通性
nc -zv <host> <port>               # 测试端口连通性（netcat）

# 4. 域名解析
nslookup <domain>                  # 域名解析
dig <domain>                       # 更详细的域名解析
cat /etc/resolv.conf               # 查看 DNS 配置

# 5. 查看网络流量
iftop                              # 实时查看网络流量（按连接）
nethogs                            # 按进程查看网络流量
sar -n DEV 1 5                     # 查看网卡流量统计

# 6. 查看路由表
ip route                           # 查看路由表
route -n                           # 传统方式

# 7. 防火墙
firewall-cmd --list-ports          # CentOS 查看开放端口
firewall-cmd --add-port=8080/tcp --permanent  # 开放端口
firewall-cmd --reload              # 重载防火墙
ufw status                         # Ubuntu 查看防火墙状态
```

---

## 二、进程与服务管理

### 2.1 进程管理

```bash
# 1. 查看进程
ps aux                             # 查看所有进程
ps -ef | grep java                 # 查找 Java 进程
ps -p <pid> -o pid,ppid,%cpu,%mem,cmd  # 查看指定进程详情

# 2. 进程树
pstree -p                          # 以树状结构显示进程
pstree -ap <pid>                   # 显示指定进程的子进程

# 3. 杀死进程
kill <pid>                         # 发送 SIGTERM（优雅终止，进程可以处理）
kill -9 <pid>                      # 发送 SIGKILL（强制杀死，不可忽略）
killall <process_name>             # 按进程名杀死所有进程
pkill -f <pattern>                 # 按命令行模式匹配杀死进程

# 4. 进程优先级
nice -n 10 java -jar app.jar      # 以低优先级启动进程
renice -n 5 -p <pid>              # 修改运行中进程的优先级

# 5. 后台运行
nohup java -jar app.jar > app.log 2>&1 &   # 后台运行，输出重定向到文件
# nohup：忽略 SIGHUP 信号（终端关闭不影响）
# &：后台运行
# > app.log 2>&1：标准输出和错误输出都重定向到 app.log
```

### 2.2 服务管理（systemd）

```bash
# 1. 服务基本操作
systemctl start <service>          # 启动服务
systemctl stop <service>           # 停止服务
systemctl restart <service>        # 重启服务
systemctl reload <service>         # 重载配置（不中断服务）
systemctl status <service>         # 查看服务状态
systemctl enable <service>         # 设置开机自启
systemctl disable <service>        # 取消开机自启
systemctl is-enabled <service>     # 查看是否开机自启

# 2. 查看服务列表
systemctl list-units --type=service           # 查看所有运行中的服务
systemctl list-unit-files --type=service      # 查看所有服务文件
systemctl --failed                             # 查看启动失败的服务

# 3. 查看服务日志
journalctl -u <service>            # 查看指定服务的日志
journalctl -u <service> -f         # 实时跟踪日志
journalctl -u <service> --since "1 hour ago"  # 查看最近 1 小时的日志
journalctl -u <service> -n 100     # 查看最近 100 行

# 4. 自定义服务（以 Java 应用为例）
# /etc/systemd/system/myapp.service
[Unit]
Description=My Java Application
After=network.target

[Service]
Type=simple
User=appuser
WorkingDirectory=/opt/myapp
ExecStart=/usr/bin/java -jar /opt/myapp/app.jar --spring.profiles.active=prod
ExecStop=/bin/kill -15 $MAINPID
Restart=on-failure
RestartSec=10
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target

# 然后：
systemctl daemon-reload            # 重载服务配置
systemctl start myapp              # 启动
systemctl enable myapp             # 开机自启
```

---

## 三、日志排查

### 3.1 日志查看命令

```bash
# 1. 实时查看日志
tail -f app.log                    # 实时跟踪文件末尾
tail -F app.log                    # 同上，但文件被删除/重建后会自动重新打开（更可靠）
less +F app.log                    # less 的实时跟踪模式（按 Ctrl+C 退出跟踪，q 退出）

# 2. 查看文件内容
cat app.log                        # 一次性输出全部内容（大文件别用）
less app.log                       # 分页查看（推荐）
# less 常用操作：
#   空格：下一页
#   b：上一页
#   /keyword：搜索
#   n：下一个搜索结果
#   N：上一个搜索结果
#   G：跳到末尾
#   g：跳到开头
#   q：退出

head -n 50 app.log                 # 查看前 50 行
tail -n 50 app.log                 # 查看后 50 行
tail -n +100 app.log               # 从第 100 行开始显示

# 3. 搜索日志
grep "ERROR" app.log               # 搜索包含 ERROR 的行
grep -i "error" app.log            # 忽略大小写搜索
grep -n "ERROR" app.log            # 显示行号
grep -c "ERROR" app.log            # 统计匹配行数
grep -A 5 "ERROR" app.log          # 显示匹配行及后 5 行
grep -B 5 "ERROR" app.log          # 显示匹配行及前 5 行
grep -C 5 "ERROR" app.log          # 显示匹配行及前后各 5 行
grep -v "DEBUG" app.log            # 排除包含 DEBUG 的行
grep -E "ERROR|WARN" app.log       # 正则匹配（ERROR 或 WARN）

# 4. 多文件日志
tail -f app.log error.log          # 同时跟踪多个文件
grep "ERROR" /var/log/*.log        # 在多个文件中搜索
find /var/log -name "*.log" -exec grep -l "ERROR" {} \;  # 找包含 ERROR 的日志文件

# 5. 日志统计
awk '{print $1}' app.log | sort | uniq -c | sort -rn | head -10  # 统计 IP 出现次数（日志第一列是 IP）
awk '{print $9}' access.log | sort | uniq -c | sort -rn            # 统计 HTTP 状态码
grep "ERROR" app.log | awk -F: '{print $1}' | sort | uniq -c       # 按错误类型统计
```

### 3.2 常见日志位置

```bash
/var/log/messages                   # 系统全局日志（CentOS）
/var/log/syslog                     # 系统全局日志（Ubuntu）
/var/log/secure                     # 安全相关日志（登录、SSH、sudo）
/var/log/cron                       # 定时任务日志
/var/log/boot.log                   # 启动日志
/var/log/dmesg                      # 内核启动日志（硬件、驱动）
/var/log/nginx/                     # Nginx 日志
/var/log/mysql/                     # MySQL 日志
/var/log/redis/                     # Redis 日志
/var/log/journal/                   # systemd journal 日志
```

---

## 四、性能排查完整流程

### 4.1 CPU 100% 排查

```bash
# 步骤 1：找高 CPU 进程
top
# 按 P 排序，找到 CPU 最高的进程，记下 PID

# 步骤 2：找高 CPU 线程
top -Hp <pid>
# 找到 CPU 最高的线程 ID（TID），记下

# 步骤 3：线程 ID 转 16 进制
printf "%x\n" <tid>
# 比如输出 0x1234

# 步骤 4：抓线程栈（Java 应用）
jstack <pid> | grep -A 20 "0x1234"
# 看这个线程在执行什么代码，定位问题

# 步骤 5：如果不是 Java 应用
perf top -p <pid>                  # 查看进程的函数级 CPU 占用
strace -p <pid>                    # 跟踪系统调用
```

### 4.2 内存泄漏排查

```bash
# 步骤 1：确认内存趋势
free -h
# 观察 available 是否持续下降，buff/cache 是否可回收

# 步骤 2：找高内存进程
ps aux --sort=-%mem | head -10

# 步骤 3：Java 应用导出堆转储
jmap -dump:live,format=b,file=/tmp/heap_$(date +%Y%m%d_%H%M%S).hprof <pid>

# 步骤 4：用 MAT（Memory Analyzer Tool）分析堆转储
# 看哪些对象占内存最多、谁引用了它们、有没有内存泄漏

# 步骤 5：实时监控 GC
jstat -gcutil <pid> 1000
# 观察 Old 区使用率是否持续上涨、Full GC 频率和耗时
```

### 4.3 磁盘满了排查

```bash
# 步骤 1：确认哪个分区满了
df -h

# 步骤 2：找大目录
du -h --max-depth=1 / | sort -rh | head -10
# 逐层往下找，定位到具体目录

# 步骤 3：找大文件
find / -type f -size +100M 2>/dev/null | xargs ls -lh

# 步骤 4：如果 df 满了但 du 找不到大文件
# 可能是已删除文件被进程持有
lsof | grep deleted
# 找到后重启对应进程释放空间

# 步骤 5：清理
# 日志：echo "" > large.log（清空不删文件）
# 缓存：yum clean all / apt clean
# journal：journalctl --vacuum-time=7d
```

### 4.4 接口响应慢排查

```bash
# 步骤 1：确认是网络慢还是应用慢
curl -o /dev/null -s -w "DNS: %{time_namelookup}s\nConnect: %{time_connect}s\nTTFB: %{time_starttransfer}s\nTotal: %{time_total}s\n" http://<host>:<port>/api

# 步骤 2：看应用日志有没有报错/慢查询
tail -f app.log | grep -E "ERROR|timeout|slow"

# 步骤 3：看数据库慢查询
# MySQL：show processlist; 看有没有长时间运行的查询
# 慢查询日志：/var/log/mysql/slow.log

# 步骤 4：看应用线程状态
jstack <pid> | grep -A 10 "BLOCKED\|WAITING"
# 看线程是不是在等锁、等数据库连接、等下游响应

# 步骤 5：看连接池状态
# 数据库连接池：监控活跃连接数、等待队列
# HTTP 连接池：监控连接数、等待时间
```

---

## 五、常用运维操作速查

### 5.1 文件操作

```bash
# 复制、移动、删除
cp -r src dst                      # 递归复制目录
mv old new                         # 移动/重命名
rm -rf dir                         # 递归强制删除（危险！）
rm -f file                         # 强制删除文件

# 压缩解压
tar -czf file.tar.gz dir/          # 打包并 gzip 压缩
tar -xzf file.tar.gz               # 解压 gzip 压缩包
tar -cjf file.tar.bz2 dir/         # 打包并 bzip2 压缩
zip -r file.zip dir/                # zip 压缩
unzip file.zip                      # zip 解压

# 权限
chmod 755 file                      # 修改权限（rwxr-xr-x）
chown user:group file               # 修改属主和属组
chown -R user:group dir/            # 递归修改
```

### 5.2 文本处理三剑客

```bash
# grep：搜索
grep "pattern" file                 # 搜索
grep -rn "pattern" dir/             # 递归搜索目录，显示行号
grep -v "pattern" file              # 排除匹配行

# sed：流编辑
sed -n '10,20p' file                # 显示第 10-20 行
sed -i 's/old/new/g' file           # 全局替换（直接修改文件）
sed -i '10d' file                    # 删除第 10 行
sed -i '10a\new line' file          # 第 10 行后插入新行

# awk：文本处理
awk '{print $1, $3}' file           # 打印第 1 和第 3 列
awk -F: '{print $1}' /etc/passwd    # 用 : 分隔，打印第 1 列
awk '$9 == 200 {count++} END {print count}' access.log  # 统计状态码 200 的请求数
```

### 5.3 其他实用命令

```bash
# 时间和日期
date                                # 当前时间
date -d "2024-01-01" +%s           # 日期转时间戳
date -d @1704067200                 # 时间戳转日期

# 历史命令
history                             # 查看历史命令
history | grep "docker"             # 搜索历史命令
!123                                # 执行第 123 条历史命令
!!                                  # 执行上一条命令

# 查看系统信息
uname -a                            # 内核信息
cat /etc/os-release                 # 操作系统版本
hostname                            # 主机名
uptime                              # 系统运行时间和负载
w                                   # 当前登录用户和他们在做什么

# 定时任务
crontab -l                          # 查看当前用户的定时任务
crontab -e                          # 编辑定时任务
crontab -r                          # 删除所有定时任务

# 环境变量
env                                 # 查看所有环境变量
echo $PATH                          # 查看 PATH
export VAR=value                    # 设置环境变量（当前会话）
# 永久设置：写入 ~/.bashrc 或 /etc/profile
```

---

## 六、面试口述总结

> **线上 CPU 100% 怎么排查？**
> 先用 `top` 找高 CPU 进程，再用 `top -Hp <pid>` 找高 CPU 线程，把线程 ID 转 16 进制，然后 `jstack <pid>` 抓线程栈，定位到具体代码。常见原因：死循环、正则回溯、频繁 GC、大量计算。
>
> **磁盘满了怎么排查？**
> `df -h` 看哪个分区满了，`du` 找大目录，`find` 找大文件。如果 `df` 满了但 `du` 找不到大文件，用 `lsof | grep deleted` 找已删除但被进程持有的文件，重启进程释放空间。
>
> **怎么查看应用日志？**
> `tail -f` 实时跟踪，`less` 分页查看，`grep` 搜索关键词。Java 应用日志一般在应用目录下的 logs/ 文件夹，或者用 `journalctl -u <service>` 查看 systemd 管理的服务日志。
>
> **内存泄漏怎么排查？**
> `free -h` 看内存趋势，`jstat -gcutil` 监控 GC，`jmap -dump` 导出堆转储，用 MAT 分析哪些对象占内存最多、谁引用了它们。观察 Old 区是否持续上涨、Full GC 是否频繁。
>
> **接口响应慢怎么排查？**
> 先用 `curl -w` 看是 DNS 慢、连接慢还是 TTFB 慢。TTFB 慢说明是应用/数据库慢。看应用日志有没有报错/慢查询，`jstack` 看线程是不是在等锁/等数据库连接/等下游响应，数据库看 `show processlist` 和慢查询日志。

---

## 七、关联笔记

- [[25_Arthas线上诊断与性能调优]] — Java 应用诊断神器
- [[26_生产故障排查方法论与复盘]] — 故障排查方法论
- [[02_JVM 原理与调优]] — JVM 内存、GC、调优
- [[18_开发工具链]] — Git、Maven 等开发工具
