// 落地页明暗主题防闪烁:与主应用同策略,以 head 中的同步外链脚本引入,首帧渲染前执行。
// 默认跟随系统 prefers-color-scheme;用户手动切换后,以 localStorage 覆盖值为准。
// 不可内联 —— 线上 CSP 为 script-src 'self',内联脚本会被浏览器拦截。
try {
  var saved = null;
  try {
    saved = localStorage.getItem("mini-desk-landing-theme");
  } catch (e) {}
  var theme =
    saved === "light" || saved === "dark"
      ? saved
      : window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
  document.documentElement.setAttribute("data-theme", theme);
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "light" ? "#f5f6fa" : "#07090f");
} catch (e) {}
