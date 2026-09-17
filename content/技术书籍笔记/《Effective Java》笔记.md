---
tags:
  - 技术/书籍
  - 技术/java
date: 2026-09-16
created: 2026-09-16 14:30
source: 《Effective Java》(第 3 版) — Joshua Bloch 提炼
title: "《Effective Java》笔记"
---

# 《Effective Java》笔记

> **一句话概括**：这是**Java 语言作者（Josh Bloch 是 `Collection` 框架和 `java.math` 的作者）写的「90 条最佳实践清单」**——它告诉你「Java 该怎么写才对」，每条都是踩过坑之后的结论。
>
> **适合谁**：会写 Java 但总在「细节」上翻车、`equals`/`hashCode` 老写错、不知道什么时候用 `Optional`、被 `static` 和构造器搞晕的人。
> **怎么读**：**不用从头读**。它是**参考手册**——按需翻对应条目，或者**当 code review 清单用**。
> **与已有笔记的关系**：[[《代码整洁之道》笔记]] 讲「通用整洁」，本书讲「**Java 特有的规矩**」。

---

## 零、先建立整体印象：一张「避坑地图」

全书 90 条，按主题分 11 章。**这一节先给你「最容易踩的 10 个坑」**：

| # | 坑 | 正确做法 | 本书条目 |
|---|---|---|---|
| 1 | 用构造器传一堆参数 | 用**建造者模式** | 条目 2 |
| 2 | 到处写 `new`，不控制实例 | 考虑**静态工厂方法** | 条目 1 |
| 3 | 单例写得不安全 / 能被反射破坏 | **枚举单例** | 条目 3 |
| 4 | 重写 `equals` 忘了 `hashCode` | **两个一起重写** | 条目 11 |
| 5 | `toString` 没重写，日志看不懂 | **永远重写 `toString`** | 条目 12 |
| 6 | 到处传 `null` / 返回 `null` | **`Optional` / 空集合** | 条目 54、55 |
| 7 | 用 `float`/`double` 算钱 | **`BigDecimal` / `int` 分** | 条目 60 |
| 8 | 用原始类型（`List` 而非 `List<String>`） | **泛型 + 通配符** | 条目 26~31 |
| 9 | 用 `synchronized` 同步一切 | **`ConcurrentHashMap` / 原子类** | 条目 78~81 |
| 10 | 实现 `Serializable` 当家常便饭 | **非必要不序列化** | 条目 85~90 |

> 💡 **一句话记住**：**「Java 的坑都在细节里，这本书就是那份『细节清单』。」**

---

## 一、创建与销毁对象（条目 1~9）

### 1.1 条目 1：用静态工厂方法替代构造器

```java
// ❌ 用构造器：名字看不出来干什么，参数含义靠猜
public class User {
    public User(String name, boolean isVip) { ... }
}
new User("张三", true);   // true 是什么意思？VIP？启用？

// ✅ 用静态工厂方法：名字自带说明
public class User {
    private User(String name, boolean vip) { ... }

    public static User of(String name) { return new User(name, false); }
    public static User vip(String name) { return new User(name, true); }
    public static User anonymous() { return new User("游客", false); }
}
User.vip("张三");        // 一眼看懂
```

**静态工厂方法的四大优势**：

| 优势 | 说明 |
| ---- | ---- |
| **有名字** | `User.vip()` 比 `new User(name, true)` 清楚 |
| **不必每次创建新对象** | 可以缓存（如 `Boolean.valueOf()`） |
| **可以返回任意子类型** | 返回值可以是接口，实现类对外隐藏（如 `Collections.unmodifiableList()`） |
| **返回类型可随参数变化** | 如 `EnumSet.of()` 根据元素个数返回不同实现 |

> ⚠️ **缺点**：① 如果类只有私有构造器，**不能被子类继承**；② 不容易在 API 文档里被找到（习惯上叫 `of`/`valueOf`/`getInstance`/`newInstance`/`create`）。

### 1.2 条目 2：遇到多个构造器参数时用「建造者模式」 ⭐

```java
// ❌ 反例（书里称为「重叠构造器模式」）：参数一多就失控
public class NutritionFacts {
    public NutritionFacts(int servingSize, int servings) { ... }
    public NutritionFacts(int servingSize, int servings, int calories) { ... }
    public NutritionFacts(int servingSize, int servings, int calories,
                          int fat, int sodium) { ... }
    // ... 参数还会继续加
}
// 调用时：全是数字，顺序错了编译器也不报错
new NutritionFacts(240, 8, 100, 0, 35, 27, 0, 0);
```

```java
// ✅ 正例：建造者模式——「链式 + 命名 + 可选」
public class NutritionFacts {
    private final int servingSize;   // 必填
    private final int servings;      // 必填
    private final int calories;      // 可选
    private final int fat;           // 可选

    public static class Builder {
        private final int servingSize;   // 必填参数，构造器传入
        private final int servings;
        private int calories = 0;        // 可选参数，给默认值
        private int fat = 0;

        public Builder(int servingSize, int servings) {
            this.servingSize = servingSize;
            this.servings = servings;
        }
        public Builder calories(int val) { calories = val; return this; }
        public Builder fat(int val)      { fat = val;      return this; }

        public NutritionFacts build() { return new NutritionFacts(this); }
    }

    private NutritionFacts(Builder b) { ... }
}

// 调用：清晰、安全、可选参数自由组合
new NutritionFacts.Builder(240, 8)
        .calories(100)
        .fat(35)
        .build();
```

> 💡 **什么时候用建造者**：**参数超过 4 个**，或者有多个可选参数。参数少（≤3）还是用构造器/静态工厂更简洁。
> 📌 **Lombok 的 `@Builder`** 就是这一条目的自动化——**知道它背后是什么，面试才讲得出**。

### 1.3 条目 3：用私有构造器或枚举强化单例

```java
// 方案一：静态常量（简单，但能被反射破坏）
public class Singleton {
    public static final Singleton INSTANCE = new Singleton();
    private Singleton() { }
}

// 方案二：静态工厂（可改实现，仍然能被反射破坏）
public class Singleton {
    private static final Singleton INSTANCE = new Singleton();
    private Singleton() { }
    public static Singleton getInstance() { return INSTANCE; }
}

// 方案三（⭐ 本书推荐）：枚举单例——最简单、天然防反射、防反序列化
public enum Singleton {
    INSTANCE;

    public void doSomething() { ... }
}
```

> ⚠️ **为什么枚举是最好的**：Java 规范保证**枚举实例在反序列化时不会创建新对象**，且**构造器无法被反射调用**（`Constructor.newInstance()` 对枚举会抛异常）。**前两种方案都能被反射或有额外防护才能防住。**

### 1.4 条目 6：避免创建不必要的对象

```java
// ❌ 每次调用都 new 一个——尤其如果在循环里，性能杀手
public boolean isBabyBoomer(Date birthDate) {
    Calendar gmtCal = Calendar.getInstance(TimeZone.getTimeZone("GMT"));
    // ...
}

// ✅ 静态初始化一次，复用
private static final Date BOOM_START = ...;
private static final Date BOOM_END = ...;

public boolean isBabyBoomer(Date birthDate) {
    return birthDate.compareTo(BOOM_START) >= 0
        && birthDate.compareTo(BOOM_END) < 0;
}
```

**更重要的是「优先用基本类型而不是包装类型」**：

```java
// ❌ 反例：自动装箱在循环里创建了 2^31 个多余对象，慢得离谱
Long sum = 0L;
for (long i = 0; i < Integer.MAX_VALUE; i++) {
    sum += i;      // ⚠️ 每次 += 都会 new Long！
}

// ✅ 正例：用基本类型
long sum = 0L;
for (long i = 0; i < Integer.MAX_VALUE; i++) {
    sum += i;
}
```

> ⚠️ **书里的经典案例**：上面那个 `Long sum` 的版本比 `long sum` **慢约 6 倍**，而且**「无意识地创建对象」比「显式 new」更危险**。

### 1.5 条目 7：消除过期的对象引用（内存泄漏！）

```java
// ❌ 反例：自己实现栈，pop 后没有清空引用 → 内存泄漏
public class Stack {
    private Object[] elements;
    private int size = 0;

    public Object pop() {
        if (size == 0) throw new EmptyStackException();
        return elements[--size];     // ⚠️ 引用还留着，GC 回收不掉
    }
}

// ✅ 正例：清空引用
public Object pop() {
    if (size == 0) throw new EmptyStackException();
    Object result = elements[--size];
    elements[size] = null;           // ✅ 帮助 GC
    return result;
}
```

**Java 里常见的内存泄漏来源**：

| 来源 | 说明 |
| ---- | ---- |
| **过期引用** | 如上例的「自己管理的容器」 |
| **缓存** | 对象放进 `Map` 后永不移除（应设 TTL 或用 `WeakHashMap`） |
| **监听器/回调** | 注册后不注销（尤其静态列表持有） |
| **ThreadLocal** | 线程池场景下不 `remove()`（⚠️ 芋道项目高频坑） |
| **静态集合** | `static List` 一直加不加清 |

> 📌 **关联**：`ThreadLocal` 泄漏见 [[异步任务]]（TTL 部分）和 [[03_JUC 详细讲解]]。

### 1.6 条目 8、9：避免 `finalize` 和 `cleaner`

> **书里的态度非常明确**：**「`finalize()` 是危险、不可预测、非必要地危险、性能极差的——不要用。」**
> - 执行时机不确定（可能永远不执行）
> - 让 GC 效率变差（对象至少要多活一轮）
> - 抛出异常会被忽略（连个日志都没有）
>
> **正确做法**：需要释放资源就实现 `AutoCloseable`，用 **`try-with-resources`**。

```java
// ✅ 资源必须这么释放
try (Connection conn = dataSource.getConnection();
     PreparedStatement ps = conn.prepareStatement(SQL)) {
    // 用资源
}   // 自动 close（即使抛异常）
```

---

## 二、所有对象通用的方法（条目 10~14）⭐⭐

> **这一章是最容易出 bug 的地方**——`equals`、`hashCode`、`toString`、`clone`、`compareTo` 的约定。

### 2.1 条目 10：重写 `equals` 要遵守「五条约定」

| 约定 | 含义 | 违反后果 |
| ---- | ---- | ---- |
| **自反性** | `x.equals(x)` 必须为 `true` | 集合查找失败 |
| **对称性** | `x.equals(y)` 为 true ⟺ `y.equals(x)` 为 true | 行为诡异 |
| **传递性** | `x=y, y=z` ⟹ `x=z` | 集合行为不可预测 |
| **一致性** | 只要对象没变，多次调用结果一致 | 并发下出问题 |
| **非空性** | `x.equals(null)` 必须为 `false` | NPE |

### 2.2 条目 11：重写 `equals` 必须同时重写 `hashCode` ⭐⭐

```java
// ❌ 反例：只重写 equals，没重写 hashCode
public class User {
    private String name;
    private int age;

    @Override
    public boolean equals(Object o) {
        if (!(o instanceof User)) return false;
        User u = (User) o;
        return age == u.age && Objects.equals(name, u.name);
    }
    // ⚠️ 没有 hashCode！
}

// 后果：
Map<User, String> map = new HashMap<>();
map.put(new User("张三", 25), "工程师");
map.get(new User("张三", 25));     // ❌ 返回 null！明明 equals 相等
```

> 💡 **原因**：`HashMap` 先用 `hashCode` 找「桶」，再用 `equals` 找「具体元素」。**两个 `equals` 相等的对象，`hashCode` 必须相等**（反之不一定）——否则它们会被放到不同的桶里，永远找不到。

```java
// ✅ 正例：一起重写（手写版）
@Override
public int hashCode() {
    int result = Integer.hashCode(age);
    result = 31 * result + Objects.hashCode(name);   // 31 是奇素数，习惯用法
    return result;
}

// ✅ 更省事的现代写法
@Override
public int hashCode() {
    return Objects.hash(name, age);
}

// ✅✅ 最佳：用 record（JDK 16+）——自动生成 equals/hashCode/toString
public record User(String name, int age) { }
```

### 2.3 条目 12：始终重写 `toString`

> **理由**：不重写的话，日志里打印出来是 `User@1b6d3586`——**排查问题时会疯掉**。

```java
@Override
public String toString() {
    return String.format("User{name='%s', age=%d}", name, age);
}
```

> 💡 **Lombok 的 `@Data` / `@ToString`** 自动生成。**但注意**：实体类 `toString` 别把敏感字段（密码、身份证）打进去。

### 2.4 条目 14：考虑实现 `Comparable`

```java
// ✅ 用 Comparator 静态方法链（现代写法）
public record User(String name, int age) implements Comparable<User> {
    @Override
    public int compareTo(User o) {
        return Comparator.comparing(User::name)
                .thenComparingInt(User::age)
                .compare(this, o);
    }
}
```

> ⚠️ **书里提醒的坑**：**「别用 `compare` 的返回值判断是否相等」**——`compareTo` 返回 0 不保证 `equals` 为 true。尤其 `BigDecimal`：`new BigDecimal("1.0")` 和 `new BigDecimal("1.00")` 用 `equals` 不等，用 `compareTo` 相等。

---

## 三、Lambda 与 Stream（条目 42~48）

### 3.1 条目 42：Lambda 优于匿名类

```java
// ❌ 反例：匿名类冗长
Collections.sort(list, new Comparator<String>() {
    @Override
    public int compare(String s1, String s2) {
        return Integer.compare(s1.length(), s2.length());
    }
});

// ✅ 正例：Lambda
list.sort(Comparator.comparingInt(String::length));
```

### 3.2 条目 43：方法引用优于 Lambda

| Lambda | 方法引用 | 类型 |
| ---- | ---- | ---- |
| `x -> Math.abs(x)` | `Math::abs` | 静态 |
| `x -> obj.foo(x)` | `obj::foo` | 绑定实例 |
| `x -> x.foo()` | `Class::foo` | 非绑定实例 |
| `() -> new Foo()` | `Foo::new` | 构造器 |

> 💡 **什么时候还是用 Lambda**：当方法引用**读起来不清楚**时（比如你觉得 `Math::abs` 需要想一下才懂，那就用 Lambda）。

### 3.3 条目 45~48：谨慎使用 Stream

| 条目 | 要点 |
| ---- | ---- |
| **45** | **Stream 不能滥用**——简单循环用 `for` 更清楚；Stream 适合「元素序列的转换/过滤/聚合」 |
| **46** | **优先用无副作用的函数**——`forEach` 里改外部变量是反模式 |
| **47** | **返回 `Collection` 而非 `Stream`**——`Stream` 不能复用（只能消费一次） |
| **48** | **并行 Stream 要谨慎**——默认 `ForkJoinPool`，共享线程池可能相互影响；且只有在「数据量大 + 无状态 + 无依赖」时才有效 |

```java
// ❌ 反例：并行 Stream 用错了地方（数据小、有顺序依赖）
list.parallelStream().forEach(System.out::println);   // 输出顺序乱，还不如串行快

// ✅ 正例：CPU 密集型、大数据量、无依赖
long count = bigList.parallelStream()
        .filter(this::isExpensive)
        .count();
```

> ⚠️ **书里的警告**：**「并行 Stream 是性能陷阱」**——它默认用 `ForkJoinPool.commonPool()`，**在 Web 应用里这个池会被共享**，一个慢任务能拖垮所有并行流。真要用心须**自己指定线程池**。

---

## 四、方法与泛型（条目 49~68）

### 4.1 条目 49、50：参数校验 + 防御性拷贝

```java
// ✅ 条目 49：公共方法应在开头校验参数
public void transfer(Account from, Account to, BigDecimal amount) {
    Objects.requireNonNull(from, "from 不能为 null");
    if (amount.signum() <= 0) {
        throw new IllegalArgumentException("金额必须为正数: " + amount);
    }
    // ...
}
```

```java
// ✅ 条目 50：需要时做防御性拷贝（保护内部状态）
public final class Period {
    private final Date start;
    private final Date end;

    public Period(Date start, Date end) {
        this.start = new Date(start.getTime());   // ✅ 拷贝进来的
        this.end = new Date(end.getTime());
        if (this.start.compareTo(this.end) > 0) {
            throw new IllegalArgumentException();
        }
    }

    public Date start() {
        return new Date(start.getTime());         // ✅ 拷贝出去的
    }
}
```

> 💡 **为什么需要**：`Date` 是**可变类**——如果不拷贝，调用方改了传入的 `Date`，就把你的内部状态改了。

### 4.2 条目 54、55：`Optional` 与「别返回 null」

```java
// ❌ 反例：返回 null，调用方忘了判空 → NPE
public User findUser(Long id) {
    return userMapper.selectById(id);      // 查不到返回 null
}

// ✅ 正例一：返回 Optional（明确告诉调用方「可能没有」）
public Optional<User> findUser(Long id) {
    return Optional.ofNullable(userMapper.selectById(id));
}

// ✅ 正例二：返回空集合而非 null
public List<Order> findOrders(Long userId) {
    List<Order> orders = orderMapper.selectByUserId(userId);
    return orders != null ? orders : Collections.emptyList();
}
```

> ⚠️ **`Optional` 的三个禁忌**（书里强调）：
> ① **别用在字段上**（它不可序列化）
> ② **别用在方法参数上**（参数用「重载」解决）
> ③ **别用 `Optional.get()` 不判断**（那就白用了，应该用 `orElse`/`orElseThrow`）

### 4.3 条目 60：需要精确答案时避免 `float` 和 `double` ⭐

```java
// ❌ 反例：算钱用 double
System.out.println(1.03 - 0.42);       // 0.6100000000000001 ⚠️
System.out.println(1.00 - 9 * 0.10);   // 0.09999999999999998 ⚠️

// 经典场景：凑不出 1 块钱
double funds = 1.00;
int itemsBought = 0;
for (double price = 0.10; funds >= price; price += 0.10) {
    funds -= price;      // 期望买 4 件，实际买 3 件！
    itemsBought++;
}
```

```java
// ✅ 方案一：用 BigDecimal（最正规）
BigDecimal funds = new BigDecimal("1.00");
BigDecimal price = new BigDecimal("0.10");
while (funds.compareTo(price) >= 0) { funds = funds.subtract(price);  }

// ✅ 方案二：用 long 表示「分」（性能更好）
long fundsInCents = 100;
long priceInCents = 10;
```

> ⚠️ **注意 `BigDecimal` 的构造器坑**：**一定要用字符串构造器** `new BigDecimal("0.1")`，别用 `new BigDecimal(0.1)`（后者直接把浮点误差带进来了）。

### 4.4 条目 61：基本类型优先于装箱基本类型

```java
// ❌ 反例：混用 Integer 和 int，触发拆箱 → NPE
Map<String, Integer> map = ...;
int value = map.get("key");      // ⚠️ key 不存在返回 null → 拆箱 NPE

// ✅ 正例：判空 + 默认值
int value = map.getOrDefault("key", 0);
```

> ⚠️ **三大危害**：① **拆箱 NPE**；② **性能差**（反复创建对象）；③ **`==` 比较出错**（见 [[《深入理解Java虚拟机》笔记]] 的 IntegerCache 坑）。

### 4.5 条目 64：通过接口引用对象

```java
// ❌ 反例：声明成实现类，以后想换实现要改 N 处
ArrayList<String> list = new ArrayList<>();

// ✅ 正例：声明成接口
List<String> list = new ArrayList<>();
```

### 4.6 条目 65：接口优先于反射

> **反射的代价**：① 失去编译期检查；② 代码冗长；③ **性能差**（每次调用都要解析）。
> **正确用法**：**用反射「创建对象」，用接口「调用方法」**——只在创建时反射一次，之后走接口正常调用。

```java
// ✅ 反射只用于「实例化」，之后用接口
Class<?> clazz = Class.forName(className);
PaymentService service = (PaymentService) clazz.getDeclaredConstructor().newInstance();
service.pay(order);        // 后续都是接口调用，无反射开销
```

### 4.7 条目 26~31：泛型要点速查

| 条目 | 要点 |
| ---- | ---- |
| **26** | **别用原始类型**（`List` 而非 `List<String>`）——会失去泛型检查 |
| **27** | **消除非受检警告**（别用 `@SuppressWarnings` 掩盖问题） |
| **28** | **列表优先于数组**——数组是协变的（`Object[] = String[]` 合法），会在运行时才发现类型错误 |
| **29** | **优先考虑泛型类型** |
| **30** | **优先考虑泛型方法** |
| **31** | **利用通配符提高 API 灵活性**——⭐ **PECS 原则** |

**PECS 原则（Producer Extends, Consumer Super）**：

```java
// 生产者用 extends（我只从里面「读」元素）
void readAll(List<? extends Number> src) {
    Number n = src.get(0);    // ✅ 能读出来当 Number
    // src.add(1);            // ❌ 不能写（不知道具体是 Integer 还是 Double）
}

// 消费者用 super（我只往里面「写」元素）
void writeAll(List<? super Integer> dest) {
    dest.add(1);              // ✅ 能写 Integer
    // Integer i = dest.get(0); // ⚠️ 读出来只能是 Object
}

// 既读又写 → 别用通配符，直接 List<Integer>
```

> 💡 **一句话记 PECS**：**「往外取用 extends，往里放用 super」**。

---

## 五、并发（条目 78~84）⭐

> **书里的核心观点**：**「并发很难，能不共享就不共享」**。

### 5.1 条目 78：同步访问共享的可变数据

```java
// ❌ 反例：没有同步，主线程可能永远看不到 stopRequested 变 true
public class StopThread {
    private static boolean stopRequested;

    public static void main(String[] args) throws InterruptedException {
        Thread t = new Thread(() -> {
            int i = 0;
            while (!stopRequested) i++;    // ⚠️ 可能永远循环（可见性问题）
        });
        t.start();
        Thread.sleep(1000);
        stopRequested = true;              // 主线程改了，后台线程看不到
    }
}

// ✅ 正例一：加 volatile（保证可见性）
private static volatile boolean stopRequested;

// ✅ 正例二：用 synchronized（读写都加锁）
// ✅ 正例三（推荐）：用 AtomicBoolean
private static final AtomicBoolean stopRequested = new AtomicBoolean(false);
```

### 5.2 条目 79：避免过度同步

> **书里的两条原则**：
> ① **在同步区域内不要做「耗时操作」，更不要调用「外部方法」**（可能死锁）
> ② **永远不要「把锁暴露出去」**（别在同步块里回调用户代码）

```java
// ❌ 反例：在同步块里调用了外部方法（外部方法可能反过来调你 → 死锁）
public synchronized void notifyAllObservers() {
    for (Observer o : observers) {
        o.onChange(this);      // ⚠️ 外部代码在锁内执行
    }
}

// ✅ 正例：先拷贝，出锁再回调
public void notifyAllObservers() {
    List<Observer> snapshot;
    synchronized (this) {
        snapshot = new ArrayList<>(observers);   // 只在锁内做拷贝
    }
    for (Observer o : snapshot) {
        o.onChange(this);                        // 在锁外回调
    }
}
```

### 5.3 条目 81：并发工具优于 `wait` 和 `notify`

> **书里的态度**：**`wait`/`notify` 太底层、太容易错，应该用 `java.util.concurrent`。**

| 需求 | 用 `wait/notify` | 用 JUC（推荐） |
| ---- | ---- | ---- |
| 等待条件 | `while(!cond) wait();` | `CountDownLatch` / `CyclicBarrier` |
| 生产者消费者 | 手写等待/通知 | `BlockingQueue` |
| 计数 | `synchronized` + `int` | `AtomicInteger` / `LongAdder` |
| 并发 Map | `Collections.synchronizedMap` | `ConcurrentHashMap` |

> 📌 **关联**：JUC 完整讲解见 [[03_JUC 详细讲解]]；`volatile` 与内存屏障见 [[《深入理解Java虚拟机》笔记]]。

### 5.4 条目 83：慎用延迟初始化

```java
// ⚠️ 书里的建议：非必要不延迟初始化——因为它增加复杂度且易出并发 bug
// 如果确实需要，有两种正确写法：

// ① 静态字段：用「持有者类模式」（JVM 保证线程安全 + 懒加载）
private static class FieldHolder {
    static final FieldType FIELD = computeFieldValue();
}
static FieldType getField() { return FieldHolder.FIELD; }

// ② 实例字段（需要双重检查）：字段必须 volatile
private volatile FieldType field;
FieldType getField() {
    FieldType result = field;
    if (result == null) {                     // 第一次检查（不加锁）
        synchronized (this) {
            result = field;
            if (result == null) {             // 第二次检查（加锁内）
                field = result = computeFieldValue();
            }
        }
    }
    return result;
}
```

> ⚠️ **为什么必须 `volatile`**：没有它，**可能拿到「构造了一半的对象」**（指令重排导致引用先赋值、字段还没初始化完）。这就是 `volatile` 禁止重排的实际价值。

### 5.5 条目 84：不要依赖线程调度器

> **书里的话**：**「任何依赖线程调度器来保证正确性或性能的程序，都是不可移植的。」**
> - 别用 `Thread.yield()` 协调（不同 JVM 行为不同）
> - 别用「线程优先级」影响正确性
> - **用「可运行线程数不超过处理器数」来控制并发度**

---

## 六、常见「Java 特有的坑」速查表

| 坑 | 正确做法 | 条目 |
| ---- | ---- | ---- |
| `equals` 忘配 `hashCode` | 一起重写 / 用 record | 11 |
| 用 `==` 比较 `Integer` | `equals()` 或 `intValue()` | 61 |
| 用 `float`/`double` 算钱 | `BigDecimal`（字符串构造器） | 60 |
| 返回 `null` 集合 | `Collections.emptyList()` | 54、55 |
| `Comparator` 返回 int 溢出 | 用 `Comparator.comparingInt` | 14 |
| 循环里 `Long sum += i` | 用 `long sum` | 6 |
| 自己的容器 `pop` 忘清引用 | `elements[size] = null` | 7 |
| 在同步块里调外部方法 | 先拷贝再出锁 | 79 |
| 双重检查锁忘 `volatile` | 加 `volatile` | 83 |
| 并行 Stream 用于小数据 | 串行 / 自建线程池 | 48 |
| `new BigDecimal(0.1)` | `new BigDecimal("0.1")` | 60 |

---

## 七、一句话总结 & 全书地图

> **「Java 的坑都在细节里，这 90 条是别人替你踩过之后的正确答案。」**

### 五个核心认知

1. **创建对象的三种姿势**：静态工厂（有名字）、建造者（参数多）、枚举（单例）
2. **`equals`/`hashCode` 是「一个契约的两半」**——必须一起重写
3. **`Optional` 和空集合替代 `null`**——让「可能没有」显式化
4. **精确计算避开浮点**——`BigDecimal`（字符串构造）或 `long` 分
5. **并发优先用 JUC 工具**——别自己写 `wait`/`notify`

### 章节地图（11 章）

| 章 | 主题 | 关键条目 |
| ---- | ---- | ---- |
| 1 | 创建和销毁对象 | 1（静态工厂）、2（建造者）、3（单例）、6（避免多余对象）、7（过期引用） |
| 2 | **所有对象通用方法** ⭐ | 10（equals 契约）、**11（equals+hashCode）**、12（toString） |
| 3 | 类和接口 | 15（最小化可见性）、17（最小化可变性）、23（优先组合） |
| 4 | 泛型 | 26（别用原始类型）、**31（PECS）** |
| 5 | 枚举和注解 | 34（枚举代替 int）、39（注解优于命名模式） |
| 6 | Lambda 与 Stream | 42（Lambda）、**48（慎用并行流）** |
| 7 | 方法 | 49（校验参数）、**50（防御性拷贝）**、**54、55（别返回 null）** |
| 8 | 通用编程 | **60（避免 float/double 算钱）**、**61（基本类型优先）**、64（接口引用） |
| 9 | 异常 | 69（只针对异常情况用异常）、72（标准异常）、**77（别忽略异常）** |
| 10 | **并发** ⭐ | **78（同步共享数据）**、79（避免过度同步）、**81（并发工具）**、83（延迟初始化） |
| 11 | 序列化 | 85（谨慎实现 Serializable） |

### 🧑🎓 怎么读这本书

| 轮次 | 目标 | 读哪些 | 多久 |
| ---- | ---- | ---- | ---- |
| **第 1 轮：先避高频坑** | 不再犯低级错 | 条目 1、2、3、6、7、**10~12**、**54、55、60、61** | 半天 |
| **第 2 轮：语言进阶** | 泛型、Lambda、异常 | 条目 26~31、42~48、69~77 | 1~2 天 |
| **第 3 轮：并发与序列化** | 补齐 | 条目 78~90 | 1 天 |
| **第 4 轮：当清单** | code review 逐条对照 | 全书 | 常翻 |

> ✅ **一句话建议**：**别按顺序读**。**先读第 2 章（对象通用方法）和第 10 章（并发）**——这两章收益最大，也最容易立竿见影。

---

## 关联笔记

- [[《代码整洁之道》笔记]] — 通用代码整洁（本书讲 Java 特有规矩）
- [[《重构》笔记]] — 改善既有代码
- [[01_Java 基础核心]] — Java 语言基础（本书的「进阶版」）
- [[33_Java 8、17、21 特性全解]] — Lambda/Stream/record 的语言特性（本书条目 42~48）的语法基础
- [[03_JUC 详细讲解]] — 第 10 章「并发」的深入
- [[《深入理解Java虚拟机》笔记]] — 装箱缓存、JMM 的底层原理
- [[单元测试]] — 测试相关实践
- [[MOC_技术书籍]] — 技术书籍总索引
- [[MOC_技术库]] — 技术库总索引

---

> 📖 **书籍信息**：《Effective Java》（第 3 版），Joshua Bloch 著，俞黎敏 译，机械工业出版社。
> 注：第 3 版覆盖到 Java 9，其中 `Optional`、Lambda、Stream、模块系统的条目已包含；JDK 17/21 的 record、sealed、虚拟线程可结合 [[33_Java 8、17、21 特性全解]] 阅读。
