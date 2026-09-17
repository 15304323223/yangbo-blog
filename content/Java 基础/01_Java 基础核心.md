---
title: "Java 基础核心（原理 → 应用 → 进阶）"
---
# Java 基础核心（原理 → 应用 → 进阶）

> **一句话概括**：Java 最底层的几件事——**对象怎么"生"出来的、字符串凭什么搞特殊、泛型为什么运行时看不见、出了事怎么兜住**。看着散，其实是所有高级话题的地基。
>
> **适合谁**：能写增删改查，但被问到"`new` 一个对象发生了什么"、"`Integer` 128 为什么不等于 128"就卡住的人。
> **怎么读**：每节按「生活类比 → 大白话 → 专业术语 → 代码」四步走，代码注释是重点。
>
> 📖 **相关专篇**：语言版本特性（Lambda / Stream / record / 文本块 / 虚拟线程 / 模式匹配）见 [[33_Java 8、17、21 特性全解]]。

---

## 零、先建立整体印象：把它想象成"一家快递驿站"

Java 基础概念很散，用**小区门口的快递驿站**串起来：

| 驿站里 | 对应 Java | 一句话 |
|---|---|---|
| **包裹** | 对象 | 你 `new` 出来的东西 |
| **仓库货架区** | 堆（Heap） | 对象存放的主战场 |
| **包裹面单** | 对象头 | 记着是谁的件、中转过几次、有没有加锁 |
| **常用件专属格子** | 字符串常量池 | 高频名字不重复建，一格复用 |
| **被撕掉的类型栏** | 泛型擦除 | 运输途中类型信息就没了 |
| **破损件处理流程** | 异常体系 | 小破损走流程，楼塌了救不了 |
| **取件码 / 身份证** | `hashCode` / `equals` | 先按码找货架，再验明正身 |

**记住这个类比，后面每节都能对号入座。**

---

## 一、原理篇

### 1.1 一次 `new Object()` 发生了什么

**类比**：驿站收到包裹要上架——查这类件接不接 → 货架腾地方 → 摆上去 → 贴面单 → 按客户要求特殊处理。

```
① 类加载检查：元空间（存类信息的地方）有没有它的"档案"？没有就先走加载→验证→准备→解析→初始化
② 分配内存：在堆里划一块地（两种划法见下表）
③ 零值初始化：字段刷成出厂设置 int=0 / boolean=false / 引用=null（所以没赋值的字段也有值）
④ 设置对象头：贴面单
⑤ 执行 <init>：轮到你的构造器，字段才变成你写的值
```

| 分配方式 | 适用 | 人话 |
|---|---|---|
| **指针碰撞** Bump the Pointer | 内存规整，用过与空闲分居两侧 | 货架排得整齐，往后接着摆，动一个指针 |
| **空闲列表** Free List | 内存碎片化，用过与空闲混在一起 | 东一块西一块空着，得翻本子找哪个洞塞得下 |

> ⚠️ **并发问题**：十个快递员同时上架都去动那根指针，肯定打架。
> **解法：TLAB**（线程本地分配缓冲）——**给每个线程预先划一小片专属区域**，先在自己那片里分配，满了才去动公共指针并加锁，把分配的锁竞争降到接近零。

**对象头里装什么**（面试高频）：**Mark Word**（哈希码、GC 分代年龄、锁标志位：无锁/偏向/轻量/重量）+ **Klass Pointer**（类型指针，指向它是哪个类的实例，JVM 靠它回答 `obj.getClass()`）+ 实例数据 + **对齐填充**（对象大小补到 **8 字节整数倍**，CPU 按 8 字节读最舒服）。

**指针压缩**（`UseCompressedOops`）：64 位机引用本该占 8 字节，太浪费；JVM 在**堆 < 32G 时默认开启**，压成 32 位（4 字节）。
> 💡 **经验**：所以堆"要不要超 32G"不只看够不够用。**一旦突破 32G，压缩失效，同样的对象要多占约 20%~40% 内存**，很多团队卡在 31G 就是这个原因。

### 1.2 字符串常量池

**类比**：驿站每天都有印着"顺丰""京东"的袋子，每个都现做成本爆炸 → 准备一排常用名字的专属格子，谁用这个名字就指向同一格。

**为什么 String 设计成不可变**（`private final byte[] value`，JDK 9 起是 `byte[]`，之前 `char[]`）：
- **线程安全**：内容永不变，多线程随便读，读不到"改到一半"的状态
- **可缓存 hashCode**：算一次存着，当 `HashMap` key 时性能极好
- **常量池能复用**：内容不变，才敢让千万个引用共享一份
- **安全**：类名、网络地址、文件路径若可变，被人中途改掉就出大事

**三个位置别记混**：

```java
String s1 = "a";               // 字面量：直接进常量池（位于元空间）
String s2 = new String("a");   // new：一定在堆里新建对象（常量池里可能也已有 "a"）
String s3 = s2.intern();       // intern()：把堆对象"登记入池"
                               //   JDK 7+ 起池里存的是【指向堆对象的引用】，不再复制一份
System.out.println(s1 == s2);  // false —— 一个在池里一个在堆里，不是同一个
System.out.println(s1 == s3);  // true  —— 入池时发现 "a" 已存在，直接返回池里那个
```

**拼接的两条规则**：
```java
String a = "a" + "b";   // ✅ 编译期常量折叠：两个都是字面量，编译完就是 "ab"，只 1 个对象
String x = "a";
String b = x + "b";     // ⚠️ 有变量参与 → 走 StringBuilder（多一个 StringBuilder + 一个 String）
```

> 💡 **循环拼接必须手动用 `StringBuilder`**：`for(...) s += i;` 会产生 N 个 StringBuilder + N 个 String；`for(...) sb.append(i);` 全程只用一个。

### 1.3 泛型与擦除

**类比**：面单上写着"易碎：玻璃杯"，但中转运输时类型栏被撕掉了，搬运工只看得见"这是个包裹"。**类型信息只在交件和收件两端有效。**

**大白话**：泛型是**编译器给你的一双眼睛**——写码时就告诉你"苹果塞不进装橘子的箱子"。**但编译完这双眼睛就没了**（类型擦除）。

```java
List<String> list = new ArrayList<>();
// list.add(123);   // ❌ 编译期就报错，泛型第一价值：把错误提前到写代码时
System.out.println(list.getClass());   // class java.util.ArrayList —— 拿不到 "String" 了
```

**擦除规则**：`<T>` 无界 → 擦成 **Object**；`<T extends Number>` 有界 → 擦成上限 **Number**。

**桥接方法**（bridge method）：父类擦除后是 `set(Object)`，子类写的是 `set(String)`，签名不同算不上重写，多态就断了。于是编译器**在字节码里偷偷塞一个桥方法**（`javap -c` 能看到）：
```java
public void set(Object s) { this.set((String) s); }   // 转接插头：接 Object，强转后转调子类那个
```
**一句话**：它是编译器补的"转接插头"，保证擦除后多态依然成立。

**通配符与 PECS**：

| 写法 | 名字 | 能力 | 记忆 |
|---|---|---|---|
| `<? extends T>` | 上界通配符 | **只读**，取出来当 T 用，不能 add | 它是**生产者**，我找它**要** → **P**E |
| `<? super T>` | 下界通配符 | **只写**，能 add T 及子类，取出来只当 Object | 它是**消费者**，我往它那**塞** → **C**S |

> **为什么 `<? extends T>` 不能 add？** `List<? extends Number>` 可能是 `List<Integer>` 也可能是 `List<Double>`，你 `add(1)` 时编译器不知道实际是哪个——干脆禁止。
> **反过来 `<? super Integer>` 一定能 add Integer**：它要么是 `List<Integer>`/`List<Number>`/`List<Object>`，Integer 装得下任何一个。

### 1.4 异常体系

**类比**：包裹破损（贴异常标签，走流程，能补救） vs 楼塌了（不是你能处理的）。

```
Throwable
├── Error          系统级，无力回天，【不要捕获】：OutOfMemoryError / StackOverflowError / NoClassDefFoundError
└── Exception      程序自己能处理
    ├── RuntimeException（unchecked，编译不强制处理）：NPE / 下标越界 / 参数不合法
    └── 受检异常 checked（编译期强制 try-catch 或 throws）：IOException / SQLException
```

> ⚠️ **别捕获 Error，更别 `catch (Exception e) {}` 吞异常**——线上最难排查的问题，日志里往往干干净净。

**`finally` 的经典陷阱**：
```java
public static int test() {
    int i = 1;
    try { return i; }      // ① 执行到这，JVM 先把值 1 暂存到一个槽位
    finally { i = 2; }     // ② finally 确实在 return 前执行，但改的是变量 i，不是那个暂存槽
}                          // ③ 真正返回的是暂存的 1
// 结果：test() 返回 1，不是 2
```
> ⚠️ **但引用类型要小心**：`return` 的是对象时，拷贝的是地址，`finally` 里改它的**内部字段是生效的**。
> 💡 **结论：永远别在 `finally` 里写 `return`**，它会把 try 里的异常一起吞掉，是明确的坏味道。

---

## 二、应用篇（代码）

### 2.1 `equals` / `hashCode` 契约（必须同时重写）

**人话**：取件码（`hashCode`）决定包裹在**几号货架**；核对身份证（`equals`）决定**是不是你的件**。

**为什么必须一起重写？** 两个内容相同的 `User(id=1)`，只重写 `equals` 让它们相等，但 `hashCode` 沿用默认（按内存地址算）→ **货架号不同**：
```
map.put(userA, "VIP");
map.get(userB);   // ❌ 去另一个货架找，返回 null —— 对象"凭空丢失"
```

**契约三条**：① equals 相等 → hashCode 必须相等；② hashCode 相等 → equals 不一定相等（哈希碰撞，正常）；③ equals 要自反、对称、传递、一致。

```java
@Override
public boolean equals(Object o) {
    if (this == o) return true;                  // ① 先比地址：同一对象直接返回，最快路径
    if (!(o instanceof User u)) return false;    // ② 类型不对直接否（JDK 16+ 模式匹配，判断+强转一句搞定）
    return id != null && id.equals(u.id);        // ③ 只比业务主键别比全部字段：name 会改，改了就"认不出自己"
}
@Override
public int hashCode() {
    return Objects.hash(id);                     // ④ 必须用和 equals 完全相同的字段集；对 null 安全（算作 0）
}
```

> 💡 **IDEA `Alt+Insert` 自动生成时，务必保证两个方法选的字段一模一样。**

### 2.2 try-with-resources（自动关闭）

**人话**：数据库连接、文件流这种"用完必须还"的资源，Java 7 起可以自动还。

```java
try (Connection c = ds.getConnection();                  // ① 拿连接
     PreparedStatement ps = c.prepareStatement(sql)) {   // ② 拿语句（依赖 ①，写在后面）
    return ps.executeQuery();                            // ③ 正常业务
}   // ④ 自动 close，按声明【逆序】：先关 ps 再关 c；即使 ③ 抛异常也保证关闭，不泄漏连接
```
> ✅ **比手写 `finally` 强的隐藏好处**：业务代码和 `close()` 都抛异常时，`close` 的异常会被**作为"被抑制的异常"挂到主异常上**（`addSuppressed`）；老写法里它会**覆盖**真正的错误信息，排查时两眼一抹黑。

### 2.3 泛型方法 + 通配符（PECS 标准写法）

```java
//          ┌─ <T> 声明这是个泛型方法
//          │        ┌─ 从 list 里【读】出来当 T → 生产者 → extends
//          │        │                    ┌─ 把元素【喂给】cmp 比较 → 消费者 → super
public <T> T max(List<? extends T> list, Comparator<? super T> cmp) { ... }
// 口诀：Producer extends, Consumer super
```

**不这么写会怎样**（都写死成 `List<T>` + `Comparator<T>`）：
- ❌ 调用方传 `List<Integer>` 想返回 `Number` 就不行了，太死板
- ❌ `Comparator<Object>`（啥都能比）反而传不进来，白瞎了灵活性
> 💡 **JDK 源码就是这么写的**，`Collections.max` / `Collections.sort` 全遵循 PECS，照抄这个签名风格准没错。

### 2.4 排序：链式比较器

```java
// 先按年龄升序，同龄再按姓名升序（方法引用比 lambda 简洁）
list.sort(Comparator.comparing(User::getAge).thenComparing(User::getName));
list.sort(Comparator.comparing(User::getAge).reversed());   // 倒序
// null 值放最后，别抛 NPE
list.sort(Comparator.comparing(User::getAge, Comparator.nullsLast(Comparator.naturalOrder())));
```
> ⚠️ **坑**：`User::getAge` 返回 `int` 基本类型，列表里有 null 年龄会直接 NPE，用 `nullsLast` 包一层。

---

## 三、进阶篇（面试深挖）

### 3.1 Integer 缓存：128 为什么不等于 128

```java
Integer a = 127, b = 127;
System.out.println(a == b);   // true  ✅ 同一个缓存对象
Integer c = 128, d = 128;
System.out.println(c == d);   // false ❌ 超出缓存范围，各自 new 了新对象
```
**原因**：`Integer.valueOf()` 内部有 `IntegerCache`，**默认缓存 -128 ~ 127**（可用 `-XX:AutoBoxCacheSize` 调大上限），区间内装箱直接返回缓存对象。

> ✅ **铁律：包装类型比较永远用 `equals`，别用 `==`。**
> ⚠️ **更隐蔽的坑**：`Integer` 与 `int` 用 `==` 比较时包装类会**自动拆箱**，比的是值——`Integer c=128; int d=128; c==d` 是 `true`。**只有一边是基本类型时才"碰巧安全"**，别依赖它。

### 3.2 String 不可变，到底好在哪（三连答）
1. **安全**：类加载靠类名、连接靠 URL、路径靠字符串，可变就等于安全防线被拆。
2. **哈希稳定**：hashCode 算一次缓存永不重算，这是 String 当 `HashMap` key 的最佳理由。
3. **常量池复用**：不可变才敢共享一份，省内存。

### 3.3 fail-fast vs fail-safe

| | `ArrayList` | `CopyOnWriteArrayList` |
|---|---|---|
| 策略 | **fail-fast** 快速失败 | **fail-safe** 安全失败 |
| 遍历中删除 | 立刻抛 `ConcurrentModificationException`（CME） | 不抛，正常跑完 |
| 原理 | 内部 `modCount` 计数，一发现被改就报警 | 写时**复制整个新数组**，读的还是旧快照 |
| 代价 | 无额外开销 | 每次写都复制数组，**写多会频繁 GC** |
| 数据新鲜度 | 实时 | **可能是旧的**（刚加的元素这轮遍历看不到） |

> ⚠️ **foreach 里删元素会抛 CME**：`for (String s : list) if (s.isEmpty()) list.remove(s);` ❌；改用 `list.removeIf(String::isEmpty)` ✅（内部就是迭代器）。

### 3.4 HashMap 的两个经典设计

**① 容量为什么是 2 的幂？** `index = (n - 1) & hash` —— 本该是 `hash % n`，但 n 为 2 的幂时位与等价取模（n=16 → n-1=15=0b1111，就是取 hash 低 4 位）。
**两个好处**：位运算远快于取模；**扩容时元素要么留原位、要么移动 2 的幂次距离**（翻倍后高位多 1 位，只影响那一位），不必重算所有哈希。

**② JDK 1.8 优化了什么？**

| 优化点 | 1.7 | 1.8 |
|---|---|---|
| 链表过长 | 只能拉长链表，查找退化 O(n) | 链表 **> 8 且数组 ≥ 64** 时转**红黑树**，查找 O(log n) |
| 扩容时插入方式 | **头插** | **尾插** |
| 头插的后果 | 多线程扩容链表可能**成环**，下次 get 死循环、CPU 100% | 保序、**不成环**（但 HashMap 依然非线程安全） |

> ⚠️ 转红黑树要求"链表 > 8 **且**数组 ≥ 64"。数组还小（< 64）时 HashMap 会**优先扩容而非树化**——扩容能直接把长链表打散，更划算。

### 3.5 重写 equals 不重写 hashCode 的后果
- **表面现象**：`map.get(等价对象)` 返回 `null`，对象"凭空消失"。
- **真实原因**：两个内容相等的对象算出不同桶下标，被放进 HashMap 不同位置。
> 💡 这是 HashMap 相关 bug 里占比最高的一类，**排查口诀：先看 equals 和 hashCode 是不是配对重写的。**

### 3.6 `volatile` 不保证原子性

```java
volatile int i = 0;
i++;                  // ❌ 加了 volatile 照样丢数据
AtomicInteger n = new AtomicInteger(0);
n.incrementAndGet();  // ✅ CAS 原子操作，一步完成读-改-写
```
**为什么？** `i++` 看着一句，实际**三步**：① 从主存读 i → ② 加 1 → ③ 写回主存。`volatile` 只保证**可见性**（改完立刻刷主存、读时从主存取），**保证不了这三步不被插队**。详见 [[03_JUC 详细讲解]]。

---

## 关联
- 对象的内存布局、GC 怎么回收它们 → [[02_JVM 原理与调优]]
- 并发下怎么安全共享对象、锁与线程池 → [[03_JUC 详细讲解]]
