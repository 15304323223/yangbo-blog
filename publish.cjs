#!/usr/bin/env node
/**
 * publish.js - 一键把本地博客发布到 GitHub Pages
 *
 * 用法（令牌不会写进磁盘，也不会打印出来）：
 *   set GITHUB_TOKEN=ghp_xxxxxxxx      # Windows CMD
 *   $env:GITHUB_TOKEN="ghp_xxxxxxxx"   # PowerShell
 *   export GITHUB_TOKEN=ghp_xxxxxxxx   # bash
 *   node publish.js
 *
 * 或者直接当参数传：node publish.js ghp_xxxxxxxx
 *
 * 令牌需要 classic token，勾选 repo + workflow 两个权限。
 * 脚本会依次完成：确认/创建仓库 -> 开启 Pages -> 推送代码 -> 等待 Actions 出结果
 */

const https = require("https");
const { spawnSync } = require("child_process");
const path = require("path");

const OWNER = process.env.BLOG_OWNER || "15304323223";
const REPO = process.env.BLOG_REPO || "yangbo-blog";
const BRANCH = process.env.BLOG_BRANCH || "main";
const ROOT = __dirname;

const TOKEN =
  process.argv[2] ||
  process.env.GITHUB_TOKEN ||
  process.env.GH_TOKEN ||
  "";

const CHECK_ONLY = process.argv.includes("--check");
const FORCE = process.argv.includes("--force");

// ---------- 输出工具 ----------
const c = {
  gray: (s) => `\x1b[90m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};
const ok = (s) => console.log("  " + c.green("OK  ") + " " + s);
const no = (s) => console.log("  " + c.red("FAIL") + " " + s);
const skip = (s) => console.log("  " + c.gray("SKIP") + " " + s);
const info = (s) => console.log("  " + c.gray("--  ") + " " + s);
const step = (n, s) => console.log("\n" + c.bold(`[${n}] ${s}`));

// ---------- HTTP ----------
function api(method, apiPath, body) {
  return new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request(
      {
        hostname: "api.github.com",
        path: apiPath,
        method,
        headers: {
          "User-Agent": "yangbo-blog-publisher",
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${TOKEN}`,
          "X-GitHub-Api-Version": "2022-11-28",
          ...(payload
            ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
            : {}),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          let parsed = null;
          try {
            parsed = data ? JSON.parse(data) : null;
          } catch (e) {
            parsed = { raw: data.slice(0, 300) };
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on("error", (e) => resolve({ status: 0, body: { message: e.message } }));
    if (payload) req.write(payload);
    req.end();
  });
}

// ---------- git ----------
function findGit() {
  const candidates = [
    "git",
    "C:/Users/EDY/.workbuddy/binaries/PortableGit/versions/1.2.0/cmd/git.exe",
    "C:/Users/EDY/.workbuddy/binaries/PortableGit/versions/1.2.0/bin/git.exe",
    "C:/Program Files/Git/cmd/git.exe",
    "C:/Program Files/Git/bin/git.exe",
  ];
  for (const bin of candidates) {
    const r = spawnSync(bin, ["--version"], { encoding: "utf8", shell: false });
    if (r.status === 0) return bin;
  }
  return null;
}

let GIT = null;
function git(args, extraEnv) {
  const r = spawnSync(GIT, args, {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, ...(extraEnv || {}) },
  });
  return {
    code: r.status,
    out: (r.stdout || "").trim(),
    err: (r.stderr || "").trim(),
  };
}

// 用环境变量传认证头，不落盘、不进 git config
function authEnv() {
  const basic = Buffer.from(`${OWNER}:${TOKEN}`).toString("base64");
  return {
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
    GIT_CONFIG_VALUE_0: `Authorization: Basic ${basic}`,
    GIT_TERMINAL_PROMPT: "0",
  };
}

// ---------- 主流程 ----------
(async () => {
  console.log(c.bold("\n=== 博客发布工具 ==="));
  console.log(c.gray(`  目标仓库：${OWNER}/${REPO}`));
  console.log(c.gray(`  本地目录：${ROOT}`));
  console.log(c.gray(`  目标地址：https://${OWNER}.github.io/${REPO}/`));

  // --- 环境检查 ---
  step("0", "环境检查");
  GIT = findGit();
  GIT ? ok(`git 可用：${GIT}`) : no("找不到 git");
  if (!GIT) process.exit(1);

  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  branch.out === BRANCH ? ok(`当前分支 ${branch.out}`) : no(`当前分支是 ${branch.out}，期望 ${BRANCH}`);

  const commits = git(["rev-list", "--count", "HEAD"]);
  ok(`本地提交数：${commits.out}`);

  const remote = git(["remote", "get-url", "origin"]);
  remote.code === 0 ? ok(`origin = ${remote.out}`) : no("未配置 origin");

  if (CHECK_ONLY) {
    console.log(c.yellow("\n  --check 模式：仅检查，未做任何改动。\n"));
    process.exit(0);
  }

  if (!TOKEN) {
    console.log(
      c.yellow(
        "\n缺少令牌。请先设置环境变量 GITHUB_TOKEN 再运行：\n" +
          '  PowerShell:  $env:GITHUB_TOKEN="ghp_xxx"; node publish.js\n' +
          '  CMD:         set GITHUB_TOKEN=ghp_xxx && node publish.js\n' +
          '  bash:        export GITHUB_TOKEN=ghp_xxx && node publish.js\n'
      )
    );
    process.exit(1);
  }
  if (!TOKEN.startsWith("ghp_") && !TOKEN.startsWith("github_pat_")) {
    info("提示：令牌前缀看起来不像 classic token，若不是 ghp_ 开头可能缺少 workflow 权限");
  }

  // --- 验证令牌 ---
  step("1", "验证令牌");
  const me = await api("GET", "/user");
  if (me.status !== 200) {
    no(`令牌无效（HTTP ${me.status}）：${me.body && me.body.message}`);
    process.exit(1);
  }
  ok(`身份：${me.body.login}`);
  if (me.body.login.toLowerCase() !== OWNER.toLowerCase()) {
    info(`注意：令牌属于 ${me.body.login}，与仓库所有者 ${OWNER} 不同，将按令牌身份建仓`);
  }

  // --- 创建仓库 ---
  step("2", `确认仓库 ${OWNER}/${REPO}`);
  const existing = await api("GET", `/repos/${OWNER}/${REPO}`);
  if (existing.status === 200) {
    ok("仓库已存在，跳过创建");
  } else if (existing.status === 404) {
    const created = await api("POST", "/user/repos", {
      name: REPO,
      description: "后端技术沉淀 —— 基于 Obsidian 笔记的 Java 后端技术博客（Quartz 驱动）",
      private: false,
      has_issues: true,
      has_wiki: false,
      auto_init: false,
    });
    if (created.status === 201) {
      ok(`已创建：${created.body.html_url}`);
    } else {
      no(`创建失败（HTTP ${created.status}）：${created.body && created.body.message}`);
      info("排查：令牌是否勾选了 repo 权限");
      process.exit(1);
    }
  } else {
    no(`查询仓库失败（HTTP ${existing.status}）：${existing.body && existing.body.message}`);
    process.exit(1);
  }

  // --- 开启 Pages ---
  step("3", "启用 GitHub Pages（Actions 方式）");
  const pages = await api("POST", `/repos/${OWNER}/${REPO}/pages`, { build_type: "workflow" });
  if (pages.status === 201 || pages.status === 204) {
    ok("Pages 已启用，构建源 = GitHub Actions");
  } else if (pages.status === 409) {
    ok("Pages 已启用过，无需重复设置");
  } else {
    info(`自动启用未成功（HTTP ${pages.status}）—— 不影响推送`);
    info("可在仓库 Settings > Pages > Source 里手动选 GitHub Actions");
  }

  // --- 推送 ---
  step("4", `推送 ${BRANCH} 分支`);

  const dirty = git(["status", "--porcelain"]);
  if (dirty.out) {
    info(`检测到未提交改动 ${dirty.out.split("\n").length} 项，正在提交`);
    git(["add", "-A"]);
    const commit = git(
      ["-c", "user.name=yangbo", "-c", "user.email=15304323223@163.com", "commit", "-m", "chore: 发布前自动提交"],
    );
    commit.code === 0 ? ok("已自动提交") : info("无内容可提交");
  } else {
    ok("工作区干净，无需提交");
  }

  info("正在推送（认证信息仅通过环境变量传递，不落盘）...");
  let push = git(["push", "-u", "origin", `${BRANCH}:${BRANCH}`], authEnv());

  if (push.code !== 0) {
    const combined = (push.err + push.out).toLowerCase();
    if (/non-fast-forward|fetch first|rejected/.test(combined)) {
      info("远程已有提交导致冲突（可能建仓时勾选了 README）");
      if (FORCE) {
        info("使用 --force 覆盖远程...");
        push = git(["push", "-u", "--force", "origin", `${BRANCH}:${BRANCH}`], authEnv());
      } else {
        no("推送被拒。远程分支与本地不一致");
        info("解决办法（二选一）：");
        info("  1) 重跑并加 --force 覆盖远程： node publish.js --force");
        info("  2) 先合并远程： git pull --rebase origin " + BRANCH + " 后再运行");
      }
    } else if (/403|workflow|permission/i.test(combined)) {
      no("推送被拒，多半是令牌缺少 workflow 权限");
      info("去 https://github.com/settings/tokens 编辑令牌，勾选 workflow 后重试");
      info("原始输出：" + (push.err || push.out).slice(0, 300));
    } else {
      no("推送失败：" + (push.err || push.out).slice(0, 400));
    }
  } else {
    ok("推送成功");
  }

  const pushed = git(["rev-parse", "HEAD"]);
  info(`HEAD = ${pushed.out.slice(0, 8)}`);

  // --- 等待 Actions ---
  step("5", "等待 GitHub Actions 构建");
  const viewer = `https://github.com/${OWNER}/${REPO}/actions`;
  let runUrl = null;
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 10000));
    const runs = await api("GET", `/repos/${OWNER}/${REPO}/actions/runs?per_page=1&branch=${BRANCH}`);
    if (runs.status !== 200 || !runs.body.workflow_runs || !runs.body.workflow_runs.length) {
      info(`第 ${i + 1} 次查询：尚未产生构建记录`);
      continue;
    }
    const run = runs.body.workflow_runs[0];
    runUrl = run.html_url;
    if (run.status === "completed") {
      if (run.conclusion === "success") {
        ok(`构建成功（用时 ${Math.round((Date.now() - new Date(run.run_started_at)) / 1000)}s）`);
      } else {
        no(`构建结束但结论为 ${run.conclusion}`);
        info(`查看日志：${run.html_url}`);
      }
      break;
    }
    info(`第 ${i + 1} 次查询：${run.status} / ${run.conclusion || "进行中"}`);
  }

  // --- 收尾 ---
  console.log("\n" + c.bold("=== 完成 ==="));
  console.log(`  博客地址：${c.green(`https://${OWNER}.github.io/${REPO}/`)}`);
  console.log(`  Actions ：${runUrl || viewer}`);
  console.log(c.gray(`\n  提示：首次部署需 1-2 分钟生效；若地址 404，稍等片刻再刷新。`));
  console.log(c.gray(`  安全：令牌只用于本次运行，建议用完后在 https://github.com/settings/tokens 撤销。\n`));
})();
