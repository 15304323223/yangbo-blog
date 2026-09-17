/**
 * 访问量统计 —— 基于不蒜子（busuanzi）
 *
 * 显示两处：
 *   1. 页脚：全站访客数（UV）+ 全站访问量（PV）
 *   2. 文章元信息行（.content-meta）：本篇阅读量
 *
 * 关键实现点（别改错）：
 *   - 本文件以 data-persist 注入 head，Quartz 的 SPA 导航不会重复执行它，
 *     所以这里自己监听 document 的 "nav" 事件来重新挂载并重新计数。
 *     （若去掉 data-persist，导航时脚本会被反复执行，监听器会无限累积。）
 *   - 不蒜子只认固定 id：busuanzi_container_* / busuanzi_value_*，
 *     必须先把容器元素插进 DOM，再加载它的脚本，否则它找不到元素。
 *   - 脚本加载失败或 10 秒内没回填数字，就整块移除，不留空壳。
 *
 * 不统计的场景：本地预览（localhost / 127.0.0.1 / 内网 IP），避免污染线上数据。
 */
(function () {
  "use strict";

  var BSZ_SRC = "https://busuanzi.ibruce.info/busuanzi/2.3/busuanzi.pure.mini.js";
  var TIMEOUT = 10000; // 10 秒还没拿到数字就放弃
  var POLL = 400;

  /** 本地预览不计数，否则会把 127.0.0.1 的数据混进来 */
  function isLocal() {
    var h = location.hostname;
    return (
      h === "localhost" ||
      h === "127.0.0.1" ||
      h === "0.0.0.0" ||
      h === "::1" ||
      /^192\.168\./.test(h) ||
      /^10\./.test(h) ||
      location.protocol === "file:"
    );
  }

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  /** 数字回填前保持隐藏，回填后淡入；超时则移除整块 */
  function revealWhenFilled(container, valueId) {
    var start = Date.now();
    var timer = setInterval(function () {
      var v = document.getElementById(valueId);
      var ok = v && v.textContent.replace(/\s/g, "") !== "";
      if (ok) {
        clearInterval(timer);
        container.classList.add("is-ready");
      } else if (Date.now() - start > TIMEOUT) {
        clearInterval(timer);
        if (container.parentNode) container.parentNode.removeChild(container);
      }
    }, POLL);
  }

  // ---------- 1. 页脚：全站统计 ----------
  var ICON_USER =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
  var ICON_EYE =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';

  function mountFooterStats() {
    var footer = document.querySelector("footer");
    if (!footer) return;

    // 幂等：先把上一页残留的清掉
    var prev = footer.querySelector("#site-stats");
    if (prev) prev.remove();

    var wrap = el("div", "site-stats");
    wrap.id = "site-stats";

    // 访客数（UV）
    var uv = el("span", "stat-item");
    uv.id = "busuanzi_container_site_uv";
    uv.appendChild(el("span", "stat-icon", ICON_USER));
    uv.appendChild(el("span", "stat-label", "访客数"));
    var uvVal = el("span", "stat-num");
    uvVal.id = "busuanzi_value_site_uv";
    uv.appendChild(uvVal);
    wrap.appendChild(uv);

    // 总访问量（PV）
    var pv = el("span", "stat-item");
    pv.id = "busuanzi_container_site_pv";
    pv.appendChild(el("span", "stat-icon", ICON_EYE));
    pv.appendChild(el("span", "stat-label", "总访问量"));
    var pvVal = el("span", "stat-num");
    pvVal.id = "busuanzi_value_site_pv";
    pv.appendChild(pvVal);
    wrap.appendChild(pv);

    footer.insertBefore(wrap, footer.firstChild);

    revealWhenFilled(uv, "busuanzi_value_site_uv");
    revealWhenFilled(pv, "busuanzi_value_site_pv");
  }

  // ---------- 2. 文章：本篇阅读量 ----------
  function mountArticleStats() {
    var meta = document.querySelector(".content-meta");
    if (!meta) return;

    // 首页不放「阅读量」，hero 区已有全站统计，重复且无意义
    var slug = document.body && document.body.dataset ? document.body.dataset.slug : "";
    if (slug === "index") return;

    var prev = meta.querySelector("#busuanzi_container_page_pv");
    if (prev) prev.remove();

    var wrap = el("span", "page-pv");
    wrap.id = "busuanzi_container_page_pv";
    var val = el("span", "page-pv-num");
    val.id = "busuanzi_value_page_pv";
    val.setAttribute("data-flag-title", document.title);
    wrap.appendChild(document.createTextNode("阅读量 "));
    wrap.appendChild(val);
    meta.appendChild(wrap);

    revealWhenFilled(wrap, "busuanzi_value_page_pv");
  }

  // ---------- 3. 加载不蒜子 ----------
  function loadBusuanzi() {
    if (isLocal()) return;

    var old = document.getElementById("busuanzi-script");
    if (old && old.parentNode) old.parentNode.removeChild(old);

    var s = document.createElement("script");
    s.id = "busuanzi-script";
    s.async = true;
    s.src = BSZ_SRC + "?t=" + Date.now();
    document.head.appendChild(s);
  }

  function render() {
    if (isLocal()) return;
    mountFooterStats();
    mountArticleStats();
    loadBusuanzi();
  }

  // 首次加载
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render, { once: true });
  } else {
    render();
  }

  // SPA 导航（本脚本因 data-persist 不会被重新执行，所以必须自己监听）
  document.addEventListener("nav", function () {
    // 等 Quartz 替换完 body 再挂载
    setTimeout(render, 0);
  });
})();
