/**
 * 内容防护 —— 标准档
 *
 * 拦截范围：
 *   - 右键菜单（代码块内放行，方便复制代码）
 *   - 文本选择 / 拖拽（代码块与输入框放行）
 *   - 复制、剪切
 *   - 快捷键：Ctrl/Cmd + S、U、P、C、X，F12，Ctrl+Shift+I / J / C
 *   - 图片拖拽另存
 *   - 打印（配合 custom.scss 的 @media print）
 *
 * 已知局限（无解，别抱幻想）：
 *   静态站点必须把内容发给浏览器才能显示，所以关掉 JS、用 curl、
 *   或者直接看网页源码，都能拿到原文。这里只是提高普通访客的门槛。
 *
 * 自己调试时的开关：
 *   任意页面 URL 加 ?unlock  -> 关闭防护并记住（localStorage）
 *   加 ?lock                 -> 重新开启
 */
(function () {
  "use strict";

  // ---- 紧急开关 ----
  try {
    var q = new URLSearchParams(location.search);
    if (q.has("unlock")) localStorage.setItem("contentProtect", "off");
    if (q.has("lock")) localStorage.removeItem("contentProtect");
    if (localStorage.getItem("contentProtect") === "off") return;
  } catch (e) {
    /* localStorage 不可用时忽略，继续启用防护 */
  }

  var CODE_SEL = "pre, code";

  function isElement(node) {
    return !!node && node.nodeType === 1;
  }

  /** 输入框/可编辑区域：一律放行，否则搜索框没法用 */
  function isEditable(el) {
    if (!isElement(el)) return false;
    var t = el.tagName;
    return t === "INPUT" || t === "TEXTAREA" || el.isContentEditable === true;
  }

  /** 节点是否位于代码块内（代码块允许选中和复制） */
  function inCode(node) {
    if (!node) return false;
    if (node.nodeType === 3) node = node.parentElement; // 文本节点
    if (!isElement(node) || !node.closest) return false;
    return !!node.closest(CODE_SEL);
  }

  /** 当前选区是否落在代码块内 */
  function selectionInCode() {
    var sel = window.getSelection && window.getSelection();
    if (!sel || sel.isCollapsed || !sel.anchorNode) return false;
    return inCode(sel.anchorNode);
  }

  var stop = function (e) {
    e.preventDefault();
    e.stopPropagation();
  };

  // 用捕获阶段，确保先于站点自身的脚本执行
  var OPT = true;

  // 1) 右键菜单：代码块内放行
  document.addEventListener(
    "contextmenu",
    function (e) {
      if (isEditable(e.target) || inCode(e.target)) return;
      stop(e);
    },
    OPT
  );

  // 2) 开始选择文本：代码块与输入框放行
  document.addEventListener(
    "selectstart",
    function (e) {
      if (isEditable(e.target) || inCode(e.target)) return;
      stop(e);
    },
    OPT
  );

  // 3) 复制 / 剪切：选区在代码块内，或在输入框里，才放行
  ["copy", "cut"].forEach(function (type) {
    document.addEventListener(
      type,
      function (e) {
        if (isEditable(e.target) || selectionInCode()) return;
        stop(e);
      },
      OPT
    );
  });

  // 4) 快捷键
  document.addEventListener(
    "keydown",
    function (e) {
      var mod = e.ctrlKey || e.metaKey;
      if (!mod && e.key !== "F12") return;
      var k = (e.key || "").toLowerCase();

      // 保存网页 / 查看源码 / 打印
      if (mod && (k === "s" || k === "u" || k === "p")) return stop(e);
      // 开发者工具
      if (k === "f12") return stop(e);
      if (mod && e.shiftKey && (k === "i" || k === "j" || k === "c")) return stop(e);
      // 复制 / 剪切：代码块内不拦
      if (mod && (k === "c" || k === "x")) {
        if (isEditable(e.target) || selectionInCode()) return;
        return stop(e);
      }
    },
    OPT
  );

  // 5) 拖拽：图片另存、把文字拖走的常见路径
  document.addEventListener(
    "dragstart",
    function (e) {
      if (isEditable(e.target) || inCode(e.target)) return;
      stop(e);
    },
    OPT
  );

  // 6) 打印（Ctrl+P 已在上面拦掉，这里挡住脚本调用和浏览器菜单）
  try {
    window.print = function () {};
  } catch (e) {}
})();
