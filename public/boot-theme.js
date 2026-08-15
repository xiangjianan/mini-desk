// Loaded as a blocking script from <head>, before the JS bundle executes:
// pre-applies the persisted theme so the boot skeleton and the final render
// never flash the wrong color scheme. Kept external (not inline) because the
// CSP in public/_headers sets `script-src 'self'` without 'unsafe-inline'.
(function () {
  "use strict";
  try {
    var saved = localStorage.getItem("mini-desk-state-v1");
    if (saved) {
      var theme = JSON.parse(saved).theme;
      if (theme === "dark" || theme === "light") {
        document.documentElement.setAttribute("data-theme", theme);
      }
    }
  } catch (e) {
    // Malformed state or unavailable storage — fall through to the light boot
    // skeleton; the app applies the persisted theme once it mounts.
  }
})();
