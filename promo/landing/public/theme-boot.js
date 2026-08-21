// 落地页防主题闪烁:与主应用同策略,以 head 中的同步外链脚本引入,
// 在首帧渲染前根据 localStorage 或系统偏好确定明暗。
// 不可内联 —— 线上 CSP 为 script-src 'self',内联脚本会被浏览器拦截。
try {
  var saved = localStorage.getItem("mini-desk-landing-theme");
  var theme =
    saved === "light" || saved === "dark"
      ? saved
      : window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
  document.documentElement.setAttribute("data-theme", theme);
} catch (e) {}
