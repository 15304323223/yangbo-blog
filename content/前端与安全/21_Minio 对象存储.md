---
title: "Minio 对象存储（原理 → 应用 → 进阶）"
---
# Minio 对象存储（原理 → 应用 → 进阶）

> **一句话概括**：Minio 是一个**你自己能搭建的"阿里云 OSS"**——存图片、视频、文档这些非结构化数据，接口和 AWS S3 一模一样，代码写好了随时可以切到阿里云或腾讯云，不被绑架。
>
> **适合谁**：项目里要存文件，不知道用本地磁盘、FastDFS 还是 Minio，或者面试被问到"对象存储和文件系统有什么区别"的人。
> **怎么读**：原理篇理解"对象存储是什么"；应用篇代码直接可抄；进阶篇的前端直传和分片上传是生产必备。

---

## 零、先建立整体印象：把它想象成"自助仓储仓库"

| 传统方式 | 对应技术 | 问题 |
|---|---|---|
| **把东西堆自己家地下室** | 本地磁盘 / NAS | 满了怎么办？换硬盘麻烦；多台机器不共享 |
| **租个带目录柜的仓库** | 文件系统（FTP/Samba） | 目录层级深，找东西慢；不好扩展 |
| **租个现代化自助仓库** | **对象存储（Minio/OSS）** | 给一个钥匙（URL）就能存取；无限扩展；自带防盗 |

**对象存储的核心特点**：
- **扁平命名**：`Bucket → Object`，没有目录层级（虽然可以模拟 `/a/b/c.jpg`，但本质还是扁平 key）
- **元数据丰富**：每个对象可以带一堆自定义属性（Content-Type、自定义标签）
- **不可修改**：对象一旦上传，只能覆盖，不能"改中间某段"（和文件系统的随机写不同）

---

## 一、原理篇

### 1.1 三种存储类型对比

| 类型 | 像什么 | 优点 | 缺点 | 适用 |
|---|---|---|---|---|
| **块存储** | 裸硬盘 | 速度快、直接挂载 | 无文件系统，应用自己管 | 数据库底层（EBS） |
| **文件存储** | NFS / Samba | 有目录树，POSIX 兼容 | 扩展性差、目录深了慢 | 办公共享盘 |
| **对象存储** ⭐ | Minio / OSS / S3 | 无限扩展、HTTP 访问、元数据丰富 | 不能随机修改、延迟高于块存储 | **图片/视频/备份/附件** |

### 1.2 Minio 的核心能力

**① 兼容 S3 API**：
这是 Minio 最大的价值——你写的代码可以同时跑在 Minio、阿里云 OSS、AWS S3、腾讯云 COS 上，**随时能换供应商，不被绑架**。

**② 纠删码（Erasure Code）**：
传统多副本：存 3 份，用 3 倍空间，坏 2 份还能恢复。
纠删码：把数据切成 N 片，再生成 M 片校验码。总共存 N+M 片，**只要任意 N 片在就能恢复原始数据**。
- 例：4+2 纠删码，总空间 1.5 倍（比 3 副本省 50%），容忍任意 2 盘损坏
- 面试话术："纠删码用计算换空间，同样可靠性下存储成本比多副本低"

**③ 分布式**：
多节点多盘部署，自动数据分布、自动纠删、自动后台修复。单机也能跑（开发测试用），生产建议 4 节点以上。

---

## 二、应用篇（代码，照着抄）

### 2.1 Spring Boot 集成

```yaml
# application.yml
minio:
  endpoint: http://localhost:9000       # Minio API 地址（注意是 9000 不是 9001）
  access-key: minioadmin                # 账号
  secret-key: minioadmin                # 密码
  bucket: attachments                   # 默认桶名
```

```java
@Configuration
public class MinioConfig {

    @Bean
    public MinioClient minioClient(MinioProperties props) {
        return MinioClient.builder()
            .endpoint(props.getEndpoint())
            .credentials(props.getAccessKey(), props.getSecretKey())
            .build();
    }
}

@Service
public class FileService {

    @Autowired
    private MinioClient minioClient;

    private final String bucket = "attachments";

    /**
     * 上传文件
     * @param inputStream 文件流
     * @param filename    文件名（如 "avatar/123.png"）
     * @param size        文件大小（字节）
     */
    public void upload(InputStream inputStream, String filename, long size) throws Exception {
        // ① 检查桶是否存在，不存在就创建
        boolean exists = minioClient.bucketExists(BucketExistsArgs.builder().bucket(bucket).build());
        if (!exists) {
            minioClient.makeBucket(MakeBucketArgs.builder().bucket(bucket).build());
        }

        // ② 上传对象
        minioClient.putObject(PutObjectArgs.builder()
            .bucket(bucket)
            .object(filename)                          // 对象 key，可以带 "/" 模拟目录
            .stream(inputStream, size, -1)             // -1 = 未知大小，用分块上传
            .contentType("application/octet-stream")   // 自动识别或手动指定
            .build());
    }

    /**
     * 下载文件
     */
    public InputStream download(String filename) throws Exception {
        return minioClient.getObject(GetObjectArgs.builder()
            .bucket(bucket)
            .object(filename)
            .build());
    }
}
```

### 2.2 临时访问 URL（Presigned URL）—— 安全直传/直下的核心

**场景**：前端要上传头像，但你不希望把 Minio 的 access-key/secret-key 发给前端。

**解法**：后端生成一个**带签名的临时 URL**（有效期 10 分钟），前端拿这个 URL 直传 Minio，后端只负责"发门票"。

```java
/**
 * 生成临时上传 URL（前端直传）
 * @param filename 对象 key
 * @param expiry   有效期（分钟）
 */
public String generateUploadUrl(String filename, int expiryMinutes) throws Exception {
    return minioClient.getPresignedObjectUrl(GetPresignedObjectUrlArgs.builder()
        .bucket(bucket)
        .object(filename)
        .method(Method.PUT)                           // PUT = 上传
        .expiry(expiryMinutes, TimeUnit.MINUTES)      // 10 分钟后失效
        .build());
}

/**
 * 生成临时下载 URL（前端直下）
 */
public String generateDownloadUrl(String filename, int expiryMinutes) throws Exception {
    return minioClient.getPresignedObjectUrl(GetPresignedObjectUrlArgs.builder()
        .bucket(bucket)
        .object(filename)
        .method(Method.GET)                           // GET = 下载
        .expiry(expiryMinutes, TimeUnit.MINUTES)
        .build());
}
```

**前端直传流程**：
```
1. 用户选文件 → 前端把文件名发给后端
2. 后端生成 presigned PUT URL → 返回给前端
3. 前端直接用 XMLHttpRequest / axios PUT 到 Minio（不经过应用服务器）
4. 前端告诉后端"传完了" → 后端把文件元数据（key/大小/URL）落库
```

> 💡 **好处**：应用服务器只处理了"发 URL"和"记元数据"，文件流量完全不经过应用服务器 → **省带宽、省性能、更安全**。

---

## 三、进阶篇（生产必备 + 面试）

### 3.1 大文件分片上传

**场景**：上传一个 2GB 的视频，一次传容易断、容易超时。

**流程**：
```
1. 前端把文件切成 5MB 一片
2. 每片向后端申请一个 presigned PUT URL
3. 前端逐片直传到 Minio
4. 所有片传完后，后端调 Minio 的 composeObject 合并成完整文件
5. 记录分片信息，支持断点续传（下次只传没传完的片）
```

### 3.2 安全 checklist

| 项 | 正确做法 | 错误做法 |
|---|---|---|
| 密钥管理 | 只存在后端，绝不暴露给前端 | 把 access-key 写进前端代码 |
| 访问控制 | Bucket 默认私有，用 presigned URL 临时授权 | Bucket 设 public-read，任何人都能遍历 |
| 最小权限 | 给应用配单独的 access-key，只授权必要 Bucket | 用 root 账号 |
| 过期时间 | presigned URL 设 5~15 分钟 | 设永久有效 |
| 上传校验 | 后端校验文件类型（白名单）、大小限制 | 只信任前端传的 Content-Type |

### 3.3 Minio vs 其他对象存储

| | Minio | 阿里云 OSS | FastDFS |
|---|---|---|---|
| **部署** | 自建，开源免费 | 云服务，按量付费 | 自建，老牌 |
| **S3 兼容** | ✅ 完全兼容 | ✅ 兼容 | ❌ 不兼容 |
| **生态** | 好（K8s 原生支持） | 最好（阿里全家桶） | 弱 |
| **适用** | **私有云、开发测试、不想被云厂商绑架** | 生产环境、省去运维 | 老项目维护 |

> 💡 **选型建议**：新项目直接 Minio（开发）+ 云上备线（生产可切 OSS）；已经被阿里生态绑定的直接用 OSS。

### 3.4 常见坑

- **端口搞混**：Minio API 是 **9000**，控制台是 **9001**。代码里配成 9001 会连不上。
- **权限 403**：Bucket Policy 没配对，或 access-key 没权限。用 `mc admin` 检查。
- **大文件超时**：默认 client 超时很短，上传大文件要调 `MinioClient` 的超时参数。
- **跨域 CORS**：前端直传时浏览器会拦跨域请求 → 在 Minio 控制台或 `mc` 命令配置允许的来源域名。
- **与业务数据库配合**：文件本身存 Minio，但**文件元数据**（文件名、大小、类型、归属用户、Minio key）一定要落 MySQL/DM，方便查询和管理。

---

## 关联
- 文件元数据落库见 [[07_MySQL 与 SQL 优化]] / [[09_达梦 DM 数据库]]
- 前端直传配合 Vue 见 [[19_前端 Vue 与 ElementUI]]
- 安全认证见 [[20_Spring Security 与 OAuth2-JWT 安全认证]]
