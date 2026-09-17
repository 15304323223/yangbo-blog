/**
 * sync-content.js —— 把 Obsidian 的 Java 笔记同步到本站 content 目录
 *
 * 设计原则：
 *   1. 白名单 —— 只读取 01_技术库_Java开发，绝不动日记 / 投资库等其他私密目录
 *   2. 幂等 —— 用内容哈希比对，只更新有变化的文件，可反复运行
 *   3. 不破坏原文 —— 只清理 Obsidian 专属语法和已知失效链接
 *
 * 用法:
 *   node sync-content.js            正式同步
 *   node sync-content.js --dry-run  演练，只报告不写入
 *
 * 如需换 Vault 路径，改下面的 VAULT_SRC 即可。
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ==================== 配置 ====================

// Obsidian 笔记源目录（只同步这一个子目录）
const VAULT_SRC = 'C:/Users/EDY/Documents/Obsidian Vault/01_技术库_Java开发';

// 本站内容目录
const CONTENT_DST = path.join(__dirname, 'content');

// 同步清单输出位置（.quartz-cache 已在 .gitignore 中）
const MANIFEST_PATH = path.join(__dirname, '.quartz-cache', 'sync-manifest.json');

// 顶层目录名 → 站点里的显示名（去掉编号前缀，导航更清爽）
const TOP_DIR_MAP = {
  '00_学习路线总览': '学习路线',
  '01_Java基础': 'Java 基础',
  '02_框架与持久层': '框架与持久层',
  '03_缓存与中间件': '缓存与中间件',
  '04_分布式与微服务': '分布式与微服务',
  '05_运维与工具': '运维与工具',
  '06_前端与安全': '前端与安全',
  '07_架构实战': '架构实战',
  '08_大模型与AI': '大模型与 AI',
  '09_书籍笔记_BookNotes': '技术书籍笔记',
};

// 不发布的文件（按文件名匹配）
const EXCLUDE_FILES = new Set([]);

// 失效双链修复表：[笔记里写的, 实际文件名]
const LINK_FIXES = [
  ['《重构：改善既有代码的设计》笔记', '《重构》笔记'],
  ['《深入理解 Java 虚拟机》笔记', '《深入理解Java虚拟机》笔记'],
  ['《Java 性能权威指南》笔记', '《Java性能权威指南》笔记'],
  ['11_SpringBoot 核心', '05_SpringBoot 核心'],
];

// 跨库引用整行清理（本站只收录 Java 内容）
const DROP_LINE_PATTERNS = [/^\s*-\s*\[\[MOC_投资书籍\]\].*$/gm];

// ==================== 工具 ====================

const hash = (s) => crypto.createHash('md5').update(s).digest('hex');

/** 递归收集 .md 文件 */
function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === '.obsidian' || e.name.startsWith('.')) continue;
      walk(p, acc);
    } else if (e.name.endsWith('.md')) {
      acc.push(p);
    }
  }
  return acc;
}

/** 清理 Obsidian 专属语法 */
function transform(content) {
  let t = content;

  // 修复笔记里把标签误写成行内代码的笔误：#技术/xxx` → #技术/xxx
  t = t.replace(/(#[^\s#\[\]()]+)`/g, '$1');

  // 修复失效双链
  for (const [wrong, right] of LINK_FIXES) {
    t = t.split(`[[${wrong}`).join(`[[${right}`);
  }

  // 移除跨库引用行
  for (const re of DROP_LINE_PATTERNS) t = t.replace(re, '');
  t = t.replace(/\n{3,}/g, '\n\n');

  // 清理行尾空格 + 统一换行为 LF
  t = t.replace(/[ \t]+$/gm, '').replace(/\r\n/g, '\n');

  return t;
}

/** 补全 frontmatter，保证 title / tags 完整 */
function ensureFrontmatter(content, relPath) {
  const baseName = path.basename(relPath, '.md');

  // 标题优先取正文第一个 H1，否则用文件名（去掉编号前缀）
  let title = baseName.replace(/^\d+_/, '').trim();
  const h1 = content.match(/^#\s+(.+)$/m);
  if (h1) title = h1[1].trim();

  // 收集 #技术/xxx 形式的标签
  const tags = new Set();
  (content.match(/#技术\/[^\s#\[\]()]+/g) || []).forEach((t) => tags.add(t.slice(1)));

  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);

  if (fmMatch) {
    const fmBlock = fmMatch[1];
    if (/^title\s*:/m.test(fmBlock)) return content; // 已有 title，不动

    const insert = [];
    if (tags.size && !/^tags\s*:/m.test(fmBlock)) insert.push(`tags: ${[...tags].join(' ')}`);
    insert.push(`title: ${JSON.stringify(title)}`);

    return content.replace(/^---\n([\s\S]*?)\n---/, `---\n$1\n${insert.join('\n')}\n---`);
  }

  // 没有 frontmatter，补一个
  const lines = ['---', `title: ${JSON.stringify(title)}`];
  if (tags.size) lines.push(`tags: ${[...tags].join(' ')}`);
  lines.push('---', '');
  return lines.join('\n') + content;
}

// ==================== 主流程 ====================

function main() {
  const dryRun = process.argv.includes('--dry-run');

  if (!fs.existsSync(VAULT_SRC)) {
    console.error('✗ 笔记源目录不存在: ' + VAULT_SRC);
    console.error('  请修改脚本顶部的 VAULT_SRC 为你的 Obsidian 库路径');
    process.exit(1);
  }

  const files = walk(VAULT_SRC);
  const stats = { written: 0, unchanged: 0, excluded: 0 };
  const manifest = [];

  for (const src of files) {
    const rel = path.relative(VAULT_SRC, src).split(path.sep).join('/');

    if (EXCLUDE_FILES.has(path.basename(src))) {
      stats.excluded++;
      continue;
    }

    // 目标路径：替换顶层目录名
    const parts = rel.split('/');
    if (parts.length > 1 && TOP_DIR_MAP[parts[0]]) parts[0] = TOP_DIR_MAP[parts[0]];
    const dstRel = parts.join('/');
    const dst = path.join(CONTENT_DST, dstRel);

    // 转换内容
    let content = fs.readFileSync(src, 'utf8');
    content = transform(content);
    content = ensureFrontmatter(content, rel);

    const newHash = hash(content);
    manifest.push({ src: rel, dst: dstRel, hash: newHash });

    // 内容未变则跳过
    if (fs.existsSync(dst) && hash(fs.readFileSync(dst, 'utf8')) === newHash) {
      stats.unchanged++;
      continue;
    }

    if (!dryRun) {
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.writeFileSync(dst, content, 'utf8');
    }
    stats.written++;
  }

  if (!dryRun) {
    fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
    fs.writeFileSync(
      MANIFEST_PATH,
      JSON.stringify(
        { syncedAt: new Date().toISOString(), count: manifest.length, files: manifest },
        null,
        2,
      ),
      'utf8',
    );
  }

  console.log('=== 同步完成 ===' + (dryRun ? '（演练模式，未写入）' : ''));
  console.log('源文件总数  :', files.length);
  console.log('新写入/更新 :', stats.written);
  console.log('未变化跳过  :', stats.unchanged);
  console.log('主动排除    :', stats.excluded);
}

main();
