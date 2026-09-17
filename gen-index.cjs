/**
 * gen-index.cjs —— 生成首页与分类索引页
 *
 * 为什么要这个脚本：
 *   卡片链接过去是手写的笔记名（如 "Java 基础"、"MOC_技术库"），
 *   但 Quartz 会把路径 slug 化 —— 小写化 + 空格转 "-"，
 *   于是 "Java 基础" 实际是 "java-基础"、"MOC_技术库" 实际是 "moc_技术库"。
 *   手写名字和真实 URL 不一致 => 点进去 404。
 *
 *   现在所有链接都由脚本按同一套 slug 规则算出来，并对照 public/ 产物校验，
 *   以后增删笔记只要重跑本脚本即可，不会再断。
 *
 * 用法:
 *   node gen-index.cjs            生成首页 + 分类页
 *   node gen-index.cjs --check    只校验已有链接，不写入
 */

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const CONTENT = path.join(ROOT, "content");
const PUB = path.join(ROOT, "public");

// ==================== 分类展示信息 ====================
// 无法自动生成语义描述，这里手工维护。key 必须是 content 下的目录名。
const CAT_META = {
  "分布式与微服务": {
    icon: "🌐",
    desc: "SpringCloud 与 Dubbo、高并发高可用设计、Flowable 工作流，以及 Yudao-cloud 后端手册",
  },
  "Java 基础": {
    icon: "☕",
    desc: "语言核心、JVM 原理、JUC 并发、设计模式、分布式锁、接口幂等、线上诊断",
  },
  "技术书籍笔记": {
    icon: "📖",
    desc: "《代码整洁之道》《重构》《Effective Java》《深入理解 Java 虚拟机》《Java 性能权威指南》",
  },
  "框架与持久层": {
    icon: "🧩",
    desc: "SpringBoot 自动配置、MyBatis、MySQL 与 SQL 优化、PostgreSQL、达梦、分库分表",
  },
  "缓存与中间件": {
    icon: "⚡",
    desc: "Redis 实战、Caffeine 本地缓存、Kafka / RabbitMQ、Zookeeper、XXL-JOB",
  },
  "运维与工具": {
    icon: "🔧",
    desc: "Docker 排错、Linux 性能诊断、Git 原理与实战、Maven 配置详解",
  },
  "前端与安全": {
    icon: "🔐",
    desc: "Vue 与 ElementUI、Spring Security / OAuth2 / JWT、Minio 对象存储",
  },
  "大模型与 AI": {
    icon: "🤖",
    desc: "大模型部署与应用、Spring AI 接入实战",
  },
  学习路线: {
    icon: "🎯",
    desc: "Java 后端六阶段学习路线与知识体系总览",
  },
  架构实战: {
    icon: "🏗️",
    desc: "从零搭建芋道式脚手架，把零散技术点串成一个能跑的系统",
  },
};

// ==================== 工具 ====================

/** Quartz 的 slug 规则：小写 + 空白转 "-" */
const slug = (s) => s.toLowerCase().replace(/\s+/g, "-");

/** 一个 content 相对路径 -> 站点 URL 片段（不含 baseUrl，不带 .html） */
function toSlugPath(relMd) {
  return relMd
    .split("/")
    .map((seg) => (seg.endsWith(".md") ? slug(seg.slice(0, -3)) : slug(seg)))
    .join("/");
}

/** 读取笔记标题：优先 frontmatter title，回退到文件名 */
function readTitle(absPath, relMd) {
  const raw = fs.readFileSync(absPath, "utf8");
  const fm = raw.match(/^---\n([\s\S]*?)\n---/);
  if (fm) {
    const m = fm[1].match(/^title:\s*(.+)$/m);
    if (m) {
      let t = m[1].trim().replace(/^["']|["']$/g, "");
      // 去掉正文里重复的 "（原理 → 应用 → 进阶）" 之类后缀，列表里更清爽
      return t;
    }
  }
  return path.basename(relMd, ".md").replace(/^\d+_/, "");
}

/** 递归收集 md，返回 { rel, abs } */
function walkMd(dir, base, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name.startsWith(".")) continue;
      walkMd(p, base, acc);
    } else if (e.name.endsWith(".md")) {
      acc.push({ rel: path.relative(base, p).split(path.sep).join("/"), abs: p });
    }
  }
  return acc;
}

// ==================== 扫描 ====================

function scan() {
  const all = walkMd(CONTENT, CONTENT);
  // 首页 + 分类索引页由本脚本生成，不计入笔记统计
  const notes = all.filter((f) => path.basename(f.rel) !== "index.md");

  const cats = [];
  for (const e of fs.readdirSync(CONTENT, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith(".")) continue;
    const inCat = notes.filter((f) => f.rel.startsWith(e.name + "/"));
    if (inCat.length === 0) continue;
    cats.push({ name: e.name, slug: slug(e.name), notes: inCat });
  }
  cats.sort((a, b) => b.notes.length - a.notes.length);

  return { notes, cats };
}

/** 统计：篇数 / 双链 / 字数 */
function stats(notes) {
  let links = 0;
  let chars = 0;
  for (const n of notes) {
    const raw = fs.readFileSync(n.abs, "utf8");
    links += (raw.match(/\[\[[^\]]+\]\]/g) || []).length;
    // 连续空白压成一个空格再计数，接近真实阅读字数
    const body = raw.replace(/^---\n[\s\S]*?\n---\n/, "").replace(/\s+/g, " ");
    chars += body.length;
  }
  return { count: notes.length, links, chars };
}

// ==================== 生成分类索引页 ====================

function genCategoryPage(cat) {
  const lines = [
    "---",
    `title: ${JSON.stringify(cat.name)}`,
    "---",
    "",
    `<div class="cat-head"><span class="cat-total">${cat.notes.length} 篇笔记</span></div>`,
    "",
  ];

  // 按子目录分组；直接在分类根下的归为「本类笔记」
  const groups = new Map();
  for (const n of cat.notes) {
    const rest = n.rel.slice(cat.name.length + 1);
    const seg = rest.includes("/") ? rest.split("/")[0] : "";
    if (!groups.has(seg)) groups.set(seg, []);
    groups.get(seg).push(n);
  }

  const top = [];
  const subs = [];
  for (const [k, v] of groups) (k === "" ? top : subs).push([k, v]);

  if (top.length) {
    lines.push("## 本类笔记", "");
    for (const n of top[0][1]) {
      lines.push(`- [[${n.rel.slice(0, -3)}|${readTitle(n.abs, n.rel)}]]`);
    }
    lines.push("");
  }

  for (const [sub, list] of subs) {
    lines.push(`## ${sub}`, "");
    for (const n of list) {
      lines.push(`- [[${n.rel.slice(0, -3)}|${readTitle(n.abs, n.rel)}]]`);
    }
    lines.push("");
  }

  lines.push("---", "", "[← 返回首页](../)");
  return lines.join("\n") + "\n";
}

// ==================== 生成首页 ====================

function genHome(cats, st) {
  const wan = Math.round(st.chars / 10000);

  const L = [];
  L.push("---");
  L.push("title: 后端技术沉淀");
  L.push("---");
  L.push("");
  L.push('<div class="hero">');
  L.push('  <span class="hero-eyebrow">Obsidian × Quartz · 持续更新</span>');
  L.push('  <h1 class="hero-title">后端技术沉淀</h1>');
  L.push(
    '  <p class="hero-lead">把散落在 Obsidian 里的 Java 笔记，整理成一份可以随时翻阅的知识地图。</p>'
  );
  L.push(
    '  <p class="hero-desc">每篇都按「<strong>原理 → 应用 → 进阶</strong>」三层来写：先讲清楚它是什么、为什么这样设计，再给能直接抄的代码，最后说清楚生产环境上会踩哪些坑。</p>'
  );
  L.push('  <div class="hero-actions">');
  L.push(`    <a class="btn btn-primary" href="${toSlugPath("MOC_技术库.md")}">浏览全站地图 →</a>`);
  L.push('    <a class="btn" href="https://github.com/15304323223/yangbo-blog">GitHub</a>');
  L.push("  </div>");
  L.push('  <div class="hero-stats">');
  L.push(
    `    <div class="stat"><span class="stat-num">${st.count}</span><span class="stat-label">篇笔记</span></div>`
  );
  L.push(
    `    <div class="stat"><span class="stat-num">${cats.length}</span><span class="stat-label">大主题</span></div>`
  );
  L.push(
    `    <div class="stat"><span class="stat-num">${st.links}</span><span class="stat-label">条双向链接</span></div>`
  );
  L.push(
    `    <div class="stat"><span class="stat-num">${wan}</span><span class="stat-label">万字内容</span></div>`
  );
  L.push("  </div>");
  L.push("</div>");
  L.push("");
  L.push("## 从这里开始");
  L.push("");
  L.push('<div class="card-grid">');
  L.push(`  <a class="card" href="${toSlugPath("MOC_技术库.md")}">`);
  L.push(
    '    <span class="card-head"><span class="card-title">🗺️ 全站导航地图</span></span>'
  );
  L.push('    <span class="card-desc">按主题串起所有笔记，迷路时先看这里</span>');
  L.push("  </a>");
  L.push(
    `  <a class="card" href="${toSlugPath("技术书籍笔记/MOC_技术书籍.md")}">`
  );
  L.push(
    '    <span class="card-head"><span class="card-title">📚 技术书籍笔记</span></span>'
  );
  L.push('    <span class="card-desc">经典技术书的提炼，回答「为什么这么设计」</span>');
  L.push("  </a>");
  L.push(
    `  <a class="card" href="${toSlugPath("学习路线/00_Java 后端学习路线与知识体系.md")}">`
  );
  L.push('    <span class="card-head"><span class="card-title">🧭 学习路线</span></span>');
  L.push('    <span class="card-desc">六阶段成长路径，适合系统性地补齐短板</span>');
  L.push("  </a>");
  L.push("</div>");
  L.push("");
  L.push("## 内容分类");
  L.push("");
  L.push('<div class="card-grid">');
  for (const c of cats) {
    const meta = CAT_META[c.name] || { icon: "📄", desc: "" };
    L.push(`  <a class="card" href="${c.slug}/">`);
    L.push(
      `    <span class="card-head"><span class="card-title">${meta.icon} ${c.name}</span><span class="card-count">${c.notes.length}</span></span>`
    );
    if (meta.desc) L.push(`    <span class="card-desc">${meta.desc}</span>`);
    L.push("  </a>");
  }
  L.push("</div>");
  L.push("");
  L.push("## 关于内容来源");
  L.push("");
  L.push(
    "笔记在 Obsidian 中撰写和维护，通过同步脚本编译到本站。写作时优先考虑**中文技术阅读习惯**：每个概念先给类比建立直觉，再展开原理，最后落到可执行的代码和排查手段。"
  );
  L.push("");
  L.push(
    "如果某篇内容对你有帮助，或者发现了错误，欢迎到 [GitHub](https://github.com/15304323223/yangbo-blog) 提 Issue。"
  );
  return L.join("\n") + "\n";
}

// ==================== 校验 ====================

/** 对照 public/ 产物检查首页所有 href 是否真的存在 */
function verifyLinks(indexMd, cats) {
  const hrefs = [...indexMd.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  const problems = [];

  for (const h of hrefs) {
    if (/^https?:\/\//.test(h)) continue;
    const clean = h.replace(/\/$/, ""); // 目录链接去掉尾斜杠
    const html = path.join(PUB, clean + ".html");
    const dirIndex = path.join(PUB, clean, "index.html");
    if (!fs.existsSync(html) && !fs.existsSync(dirIndex)) {
      problems.push(h);
    }
  }

  for (const c of cats) {
    const p = path.join(PUB, c.slug, "index.html");
    if (!fs.existsSync(p)) problems.push(c.slug + "/ （分类页缺失，需先构建）");
  }
  return problems;
}

// ==================== 主流程 ====================

function main() {
  const checkOnly = process.argv.includes("--check");
  const { notes, cats } = scan();
  const st = stats(notes);

  console.log("=== 扫描结果 ===");
  console.log("笔记篇数 :", st.count);
  console.log("分类数量 :", cats.length);
  console.log("双向链接 :", st.links);
  console.log("正文字数 :", st.chars, "(约 " + Math.round(st.chars / 10000) + " 万字)");
  console.log("");
  cats.forEach((c) => console.log("  " + c.name.padEnd(14) + c.notes.length + " 篇  -> " + c.slug + "/"));

  const home = genHome(cats, st);

  console.log("\n=== 首页链接校验 ===");
  const problems = verifyLinks(home, cats);
  if (problems.length) {
    problems.forEach((p) => console.log("  ✗ 无效链接: " + p));
  } else {
    const hrefs = [...home.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).filter((h) => !/^https?:/.test(h));
    console.log("  ✓ " + hrefs.length + " 个内部链接全部有效");
    hrefs.forEach((h) => console.log("      " + h));
  }

  if (checkOnly) return;

  fs.writeFileSync(path.join(CONTENT, "index.md"), home, "utf8");
  console.log("\n已写入 content/index.md");

  for (const c of cats) {
    const p = path.join(CONTENT, c.name, "index.md");
    fs.writeFileSync(p, genCategoryPage(c), "utf8");
  }
  console.log("已写入 " + cats.length + " 个分类索引页");
}

main();
