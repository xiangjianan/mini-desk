// 在 JS bundle 执行前提前应用持久化主题,避免 loading 与最终主题之间的明暗闪烁。
// 必须以 head 中的同步外链脚本引入(不带 defer),确保在首帧渲染前执行;
// 不可内联 —— 线上 CSP 为 script-src 'self',内联脚本会被浏览器拦截。
try {
  var saved = localStorage.getItem("mini-desk-state-v1");
  if (saved) {
    var theme = JSON.parse(saved).theme;
    if (theme === "dark" || theme === "light") {
      document.documentElement.setAttribute("data-theme", theme);
    }
  }
} catch (e) {
}
