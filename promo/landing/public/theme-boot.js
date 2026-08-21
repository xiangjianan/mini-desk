// 落地页明暗主题与色系防闪烁:与主应用同策略,以 head 中的同步外链脚本引入,
// 在首帧渲染前根据 localStorage 恢复用户选择;默认深色 + 极光色系(原版视觉)。
// 不可内联 —— 线上 CSP 为 script-src 'self',内联脚本会被浏览器拦截。
try {
  var saved = null;
  try {
    saved = JSON.parse(localStorage.getItem("mini-desk-landing-prefs") || "null");
  } catch (e) {}
  var theme = saved && saved.theme === "light" ? "light" : "dark";
  var palettes = ["aurora", "ocean", "sunset", "violet"];
  var palette = saved && palettes.indexOf(saved.palette) >= 0 ? saved.palette : "aurora";
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.setAttribute("data-palette", palette);
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "light" ? "#f5f6fa" : "#07090f");
} catch (e) {}
