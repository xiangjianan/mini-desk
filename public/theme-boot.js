// 在 JS bundle 执行前提前应用持久化主题,避免 loading 与最终主题之间的明暗闪烁。
// 必须以 head 中的同步外链脚本引入(不带 defer),确保在首帧渲染前执行;
// 不可内联 —— 线上 CSP 为 script-src 'self',内联脚本会被浏览器拦截。
try {
  var saved = localStorage.getItem("mini-desk-state-v1");
  if (saved) {
    var theme = JSON.parse(saved).theme;
    if (theme === "dark" || theme === "light") {
      document.documentElement.setAttribute("data-theme", theme);
      // 同步 standalone 标题栏底色，避免安装态首帧出现默认色闪烁；
      // 取值与 src/state/theme-color.ts 的映射保持一致（有测试守护）。
      var themeColorMeta = document.querySelector('meta[name="theme-color"]');
      if (themeColorMeta) {
        themeColorMeta.setAttribute("content", theme === "dark" ? "#1c1c1e" : "#f5f5f7");
      }
    }
  }
} catch (e) {
}
