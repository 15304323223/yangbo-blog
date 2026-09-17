---
title: "Spring Security 与 OAuth2-JWT 安全认证（原理 → 应用 → 进阶）"
---
# Spring Security 与 OAuth2-JWT 安全认证（原理 → 应用 → 进阶）

> **一句话概括**：Spring Security 是一套**小区门禁系统**——认证是"验你的业主卡"（确认你是谁），授权是"你能进哪栋楼"（确认你能做什么）。JWT 是"无状态的业主卡"（自己带着信息走），OAuth2 是"委托别人发卡"（比如用微信登录）。
>
> **适合谁**：配过 Spring Security 但只会复制粘贴配置，说不清 Session/JWT/OAuth2 有什么区别、JWT 怎么退出登录、过滤器链怎么执行的人。
> **怎么读**：原理篇的三种方案对比是地基；应用篇 SecurityFilterChain + JWT 代码直接可抄；进阶篇的"JWT 无法主动吊销"是面试必考。

---

## 零、先建立整体印象：把它想象成"小区门禁系统"

| 门禁环节 | 对应概念 | 一句话 |
|---|---|---|
| **门口的保安验身份证** | 认证（Authentication） | 确认"你是谁" |
| **门禁卡能刷开哪几栋楼** | 授权（Authorization） | 确认"你能做什么" |
| **传统的门卡（物业电脑里记着你的信息）** | Session-Cookie | 服务端存会话，有状态 |
| **自己带信息的智能卡（卡里直接写着你的名字和房号）** | JWT | 无状态，服务端不存 |
| **让微信帮你验证身份，然后给你一张临时访客卡** | OAuth2 | 第三方授权委托 |
| **每栋楼的刷卡机** | Spring Security 过滤器链 | 层层检查，不符合就拦 |

---

## 一、原理篇

### 1.1 认证 vs 授权（别混）

- **认证（Authentication）**：验身份。查你的账号密码对不对、JWT 签名有没有被篡改、微信有没有确认你是你。
- **授权（Authorization）**：验权限。确认你是业主后，看你能不能进地下车库、能不能进物业管理处。

**关系**：必须先认证，才能授权。不知道你是谁，就没法决定你能干什么。

### 1.2 三种主流方案对比

| 方案 | 原理 | 优点 | 缺点 | 适用 |
|---|---|---|---|---|
| **Session-Cookie** | 服务端存会话（session），浏览器存 cookie ID | 简单、可控、能主动注销 | 有状态、分布式要共享 session、跨域麻烦 | 传统单体、同域应用 |
| **JWT** ⭐ | token 自包含用户信息，服务端不存 | 无状态、易水平扩展、天然跨域 | **无法主动吊销**、token 大了耗带宽 | **前后端分离、微服务、移动端** |
| **OAuth2** | 委托第三方授权（微信/钉钉/Google） | 用户不用在你这注册密码 | 流程复杂、依赖第三方 | 开放平台、SSO、第三方登录 |

> 💡 **简历项目用 JWT**：前后端分离 + 微服务架构下，JWT 是最自然的选择。

### 1.3 Spring Security 过滤器链

请求进来到达你的 Controller 之前，要经过一溜过滤器：

```
请求进来
  ↓
SecurityContextPersistenceFilter     # ① 从 session/token 恢复登录状态
  ↓
UsernamePasswordAuthenticationFilter # ② 处理登录表单（用户名+密码）
  ↓
JwtAuthenticationFilter（自定义）    # ③ 解析 JWT，把用户信息塞进上下文
  ↓
AuthorizationFilter                  # ④ 检查权限：@PreAuthorize 在这里生效
  ↓
到达你的 Controller
```

> 💡 **自定义过滤器插在哪**：JWT 解析过滤器要插在 `UsernamePasswordAuthenticationFilter` **之前**——登录接口本身不需要 JWT，但其他所有接口都需要先解析 JWT。

### 1.4 密码存储：为什么必须用 BCrypt

**绝对不能做的事**：
- ❌ 存明文密码：数据库泄露 = 所有密码泄露
- ❌ 用 MD5/SHA1：彩虹表秒破，**不算加密**

**正确做法**：
```java
// BCrypt：每次哈希自动加盐，结果里自带盐值，不可逆
BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
String hashed = encoder.encode("password123");   // 存数据库
boolean match = encoder.matches("password123", hashed);   // 登录时校验
```
- **自动加盐**：每次 `encode` 生成的盐不同，同样密码哈希结果不同
- **慢哈希**：故意算得慢（几百毫秒），暴力破解成本高
- **不可逆**：数学上无法从哈希反推原文

---

## 二、应用篇（代码，照着抄）

### 2.1 SecurityFilterChain（Spring Security 6 新写法）

```java
@Configuration
public class SecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http,
                                            JwtAuthenticationFilter jwtFilter) throws Exception {
        return http
            // ① 关闭 CSRF：前后端分离 + JWT 在请求头里，不需要 cookie 的 CSRF 防护
            .csrf(csrf -> csrf.disable())

            // ② 配置哪些路径不用登录就能访问
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/auth/login", "/public/**").permitAll()  // 登录和公开接口放行
                .requestMatchers("/admin/**").hasRole("ADMIN")                 // 管理员接口要 ADMIN 角色
                .anyRequest().authenticated())                                 // 其他都要登录

            // ③ 关闭 Session：我们用 JWT，不需要服务端存会话
            .sessionManagement(session ->
                session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))

            // ④ 插入自定义 JWT 过滤器：在正式登录过滤器之前解析 token
            .addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter.class)

            .build();
    }
}
```

### 2.2 JWT 生成与校验

**生成 token（登录成功后）**：
```java
public String generateToken(User user) {
    Date now = new Date();
    Date expiry = new Date(now.getTime() + 2 * 60 * 60 * 1000);   // 2 小时后过期

    return Jwts.builder()
        .subject(user.getUsername())               // 主题：用户名
        .claim("userId", user.getId())             // 自定义声明：用户 ID
        .claim("roles", user.getRoles())           // 角色列表
        .issuedAt(now)                             // 签发时间
        .expiration(expiry)                        // 过期时间（必须设！）
        .signWith(secretKey, Jwts.SIG.HS256)       // 用 HS256 签名（密钥要保密！）
        .compact();
}
```

**校验 token（过滤器里）**：
```java
@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        // ① 从请求头取 token
        String header = request.getHeader("Authorization");
        if (header == null || !header.startsWith("Bearer ")) {
            chain.doFilter(request, response);   // 没 token，放行让后面的过滤器处理（可能是公开接口）
            return;
        }

        String token = header.substring(7);   // 去掉 "Bearer "

        try {
            // ② 解析并验签
            Claims claims = Jwts.parser()
                .verifyWith(secretKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();

            // ③ 构造 Authentication 塞进上下文，后续 @PreAuthorize 就能取到用户信息
            String username = claims.getSubject();
            List<String> roles = claims.get("roles", List.class);

            UsernamePasswordAuthenticationToken auth =
                new UsernamePasswordAuthenticationToken(
                    username, null,
                    roles.stream().map(SimpleGrantedAuthority::new).toList()
                );

            SecurityContextHolder.getContext().setAuthentication(auth);

        } catch (JwtException e) {
            // token 无效或过期
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            return;
        }

        chain.doFilter(request, response);
    }
}
```

### 2.3 OAuth2 授权码流程（微信登录）

**场景**：用户不想在你这注册账号，想直接用微信扫码登录。

**流程四步**：
```
1. 用户点击"微信登录"
   ↓
2. 你的系统把用户重定向到微信授权页：
   https://open.weixin.qq.com/connect/qrconnect?
     appid=你的应用ID
     &redirect_uri=你的回调地址
     &response_type=code
     &scope=snsapi_login

3. 用户扫码确认 → 微信重定向回你的回调地址，带一个【授权码 code】
   https://your-site.com/callback?code=xxx

4. 你的系统拿 code 调微信接口换 【access_token + 用户信息】
   然后在自己的系统里创建/绑定用户，发 JWT 给前端
```

> 💡 **为什么用授权码而不是直接换 token？** 安全。`code` 只能换一次、有时效、且通过后端服务器交换，不怕前端泄露。

---

## 三、进阶篇（面试深挖）

### 3.1 JWT 的致命弱点：无法主动吊销

**问题**：用户退出登录了，但 JWT 还在有效期内（比如还有 1 小时），持有 token 的人仍然能访问。

**解法三选一**：

| 方案 | 原理 | 代价 |
|---|---|---|
| **短过期 + refresh token** | access_token 设 15 分钟~2 小时，refresh_token 设 7~30 天存 HttpOnly Cookie | 需要刷新机制，实现稍复杂 |
| **Redis 黑名单** | 退出时把 token 的 `jti`（唯一 ID）塞 Redis，校验时先查黑名单 | 又变成"有状态"了，背离 JWT 初衷 |
| **静默接受** | token 不过期，等自然过期 | 安全风险高，不适合敏感系统 |

> ✅ **推荐方案 1**：access_token 短过期（2 小时）+ refresh_token 长过期（7 天）。用户体验好（2 小时内不用刷新），安全性高（ stolen token 2 小时后就失效）。

### 3.2 刷新 token 机制

```
前端请求接口 → 后端返回 401（access_token 过期）
   ↓
前端自动带 refresh_token 调 /auth/refresh
   ↓
后端校验 refresh_token 没过期 + 没被轮换过 → 发新的 access_token + refresh_token
   ↓
前端用新 token 重试原请求（用户无感知）
```

### 3.3 OAuth2 四种模式

| 模式 | 流程 | 适用 | 安全 |
|---|---|---|---|
| **授权码** ⭐ | 前端拿 code → 后端换 token | **Web 应用、第三方登录** | 最高 |
| **简化模式** | 前端直接拿 token（无 code 环节） | 纯前端应用 | 低，已废弃 |
| **密码模式** | 用户直接把账号密码给你，你去换 token | 绝对可信的第一方应用 | 中 |
| **客户端凭证** | 应用自己调自己，无用户参与 | 服务间调用 | 中 |

> 💡 **面试常问**："微信登录用的是哪种 OAuth2 模式？" → **授权码模式**。

### 3.4 Spring Security 6 的变化

| 老写法（Security 5 / Boot 2） | 新写法（Security 6 / Boot 3） |
|---|---|
| `authorizeRequests()` | `authorizeHttpRequests()` |
| `antMatchers("/api/**")` | `requestMatchers("/api/**")` |
| `WebSecurityConfigurerAdapter` | 废弃，改用 `SecurityFilterChain` Bean |
| `@EnableGlobalMethodSecurity` | `@EnableMethodSecurity` |

> ⚠️ **升级 Spring Boot 3 时，Security 配置必须重写**，老配置类直接失效。

### 3.5 常见坑

- **密钥硬编码**：`secretKey` 写死在代码里 → 泄露后所有 token 可被伪造。**应放配置中心或环境变量。**
- **token 不过期**：不设 `expiration` → token 永久有效， stolen 后永远可用。
- **权限注解不生效**：忘了加 `@EnableMethodSecurity`，或方法不是 public / 不是 Spring 代理的。
- **CORS 与鉴权顺序**：CORS 预检请求（OPTIONS）没有 Authorization 头，会被鉴权拦截 → 在 SecurityFilterChain 里放行 OPTIONS。
- **Role 前缀**：`hasRole("ADMIN")` 实际上检查的是 `ROLE_ADMIN`，数据库里存的角色名要注意前缀。

---

## 关联
- 芋道框架的认证配置见 [[22_从零搭建芋道式脚手架框架]]
- 微服务网关鉴权见 [[14_微服务 SpringCloud 与 Dubbo]]
- 前端 JWT 拦截器见 [[19_前端 Vue 与 ElementUI]]
