import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ruleBodies } from "./helpers/css-rules";

function expectSelectorBody(styles: string, selector: string, text: string): void {
  expect(ruleBodies(styles, selector).some((body) => body.includes(text))).toBe(true);
}

describe("workbench style contract", () => {
  it("keeps image sorting motion above the workbench hover transition", () => {
    const desk = readFileSync(resolve(__dirname, "../desk.css"), "utf8");
    for (const phase of ["move", "enter-active", "leave-active"]) {
      expectSelectorBody(desk, `.workbench-shell .image-card.image-reorder-${phase}`, "transform 0.22s");
    }
  });

  it("moves focus reminders and their region during the exit fade", () => {
    const styles = readFileSync(resolve(__dirname, "../styles.css"), "utf8");
    expect(ruleBodies(styles, ".today-focus-move-leave-active").join("\n")).toMatch(/position:\s*absolute/);
    expectSelectorBody(styles, ".today-focus-item", "position: relative");
    expectSelectorBody(styles, ".today-focus-move-leave-active", "pointer-events: none");
    expectSelectorBody(styles, ".today-focus-item.today-focus-move-leave-to", "opacity: 0");
    expect(styles.indexOf(".today-focus-item.today-focus-move-leave-to")).toBeGreaterThan(styles.indexOf(".today-focus-item.is-done"));
    const panel = readFileSync(resolve(__dirname, "../components/TodoPanel.vue"), "utf8");
    expect(panel).toContain('<Transition name="todo-focus-reveal" :duration="180"');
    expect(panel).toContain('@before-leave="positionLeavingFocusElement"');
    expect(panel).toContain('@leave-cancelled="clearLeavingFocusPosition"');
  });

  it("insets the notebook scroll viewport and its mirror equally to preserve vertical whitespace", () => {
    const styles = readFileSync(resolve(__dirname, "../desk.css"), "utf8");
    expectSelectorBody(styles, ".workbench-shell .text-editor-frame", "padding-block: 12px");
    expectSelectorBody(styles, ".workbench-shell .text-editor-frame > .text-mirror", "top: 12px");
    expectSelectorBody(styles, ".workbench-shell .text-editor-frame > .text-mirror", "bottom: 12px");
    expectSelectorBody(styles, ".workbench-shell .text-editor-frame > .text-mirror", "height: calc(100% - 24px)");
    expectSelectorBody(styles, ".workbench-shell .text-editor-textarea", "padding: 0 16px");
    expectSelectorBody(styles, ".workbench-shell .text-mirror", "padding: 0 16px");
  });

  it("uses a rail-free rounded surface model instead of boxed borders", () => {
    const styles = readFileSync(resolve(__dirname, "../styles.css"), "utf8");

    expect(ruleBodies(styles, ".workbench-shell").join("\n")).not.toContain("grid-template-columns: 56px");
    // viewport-fit=cover（index.html）下用安全区内边距防刘海遮挡；无刘海设备 inset 为 0 等效 padding: 0。
    expectSelectorBody(styles, ".workbench-shell", "padding: env(safe-area-inset-top, 0px)");
    expectSelectorBody(styles, ".workbench-main", "border-radius: 0");
    expectSelectorBody(styles, ".workbench-main", "grid-template-rows: 52px minmax(0, 1fr)");
    expectSelectorBody(styles, ".workbench-main", "transition:\n    grid-template-rows 200ms var(--motion-ease),\n    background-color var(--motion-slow) ease,\n    box-shadow var(--motion-slow) ease");
    expectSelectorBody(styles, ".workbench-main.is-header-hidden", "grid-template-rows: 0px minmax(0, 1fr)");
    expectSelectorBody(styles, ".workbench-command-bar", "padding: 0 16px");
    expectSelectorBody(styles, ".workbench-grid", "background: transparent");
    expect(ruleBodies(styles, ".workbench-zone").join("\n")).not.toContain("border: 1px solid var(--border)");
    expectSelectorBody(styles, ".workbench-zone", "border-radius: calc(var(--radius) + 4px)");
    expectSelectorBody(styles, ".workbench-zone", "padding: 12px");
    expectSelectorBody(styles, ".workbench-zone", "background: var(--material-surface)");
    expectSelectorBody(styles, ".workbench-zone", "inset 0 0 0 1px color-mix(in srgb, var(--border) 72%, transparent)");
    expectSelectorBody(styles, ".workbench-zone > .panel", "border-radius: var(--radius)");
    expectSelectorBody(styles, ".workbench-zone > .space-panel", "box-shadow: none");
    expectSelectorBody(styles, ".workbench-zone > .image-panel", "box-shadow: none");
    expectSelectorBody(styles, ".workbench-zone > .todo-panel", "box-shadow: none");
    expectSelectorBody(styles, ".workbench-zone > .text-panel", "box-shadow: none");
    expectSelectorBody(styles, ".workbench-zone > .image-panel", "border-radius: var(--radius)");
    expectSelectorBody(styles, ".workbench-zone > .todo-panel", "border-radius: var(--radius)");
    expectSelectorBody(styles, ".workbench-zone-notes", "gap: 16px");
    expectSelectorBody(styles, "button.quick-button", "border: 0");
    expectSelectorBody(styles, "button.space-tab", "border: 0");
    expectSelectorBody(styles, "button.quick-menu-button", "border: 0");
    expectSelectorBody(styles, ".image-panel", "border-left: 0");
    expectSelectorBody(styles, ".image-panel", "border-right: 0");
    expectSelectorBody(styles, ".image-panel", "border-bottom: 0");
    expectSelectorBody(styles, ".image-panel", "box-shadow: none");
    expectSelectorBody(styles, ".workbench-zone > .image-panel", "box-shadow: none");
    expectSelectorBody(styles, ".workbench-zone-notes > .quick-block", "background: color-mix(in srgb, var(--card) 92%, transparent)");
    expectSelectorBody(styles, ".workbench-zone-notes > .quick-block", "border-radius: var(--radius) !important");
    expectSelectorBody(styles, ".workbench-zone-notes > .quick-block:only-child", "height: 100%");
    expectSelectorBody(styles, ".image-panel > .panel-header", "border-top-left-radius: var(--radius)");
    expectSelectorBody(styles, ".workbench-zone-notes > .quick-block > .panel-header", "border-top-left-radius: var(--radius)");
    expectSelectorBody(styles, ".workbench-zone-notes > .quick-block > .panel-header", "border-top-right-radius: var(--radius)");
    expectSelectorBody(styles, ".todo-panel", "border-top-left-radius: var(--radius)");
    expectSelectorBody(styles, ".todo-panel > .today-focus-section", "border-top-left-radius: var(--radius)");
    expectSelectorBody(styles, ".todo-panel > .today-focus-section .today-focus-heading", "border-top-left-radius: var(--radius)");
    expect(styles).not.toMatch(/\.todo-panel > \.todo-sections\s*\{[^}]*border-top-left-radius/s);
    expect(styles).not.toMatch(/\.todo-panel > \.todo-sections > \.todo-section:first-child \.todo-heading\s*\{[^}]*border-top-left-radius/s);
    expectSelectorBody(styles, ".image-card", "border: 1px solid color-mix(in srgb, var(--border) 64%, transparent)");
    expectSelectorBody(styles, ".image-card", "box-shadow: none");
    expectSelectorBody(styles, "button.image-card", "border: 1px solid color-mix(in srgb, var(--border) 64%, transparent)");
    expectSelectorBody(styles, ".image-index", "border-right: 0");
  });

  it("keeps legacy native button styling from overriding circular icon buttons", () => {
    const styles = readFileSync(resolve(__dirname, "../styles.css"), "utf8");
    const bareButtonBodies = ruleBodies(styles, "button");

    expect(bareButtonBodies.join("\n")).not.toMatch(/\b(border|background|border-radius|min-height|padding):/);
    // The global rule must exclude .icon-button so its 50% radius can win
    // without !important (the old data-slot exclusion served the deleted shadcn set).
    expectSelectorBody(styles, "button:not(.icon-button)", "border: 0");
    expect(ruleBodies(styles, "button:not(.icon-button)").join("\n")).not.toContain("background:");
    expect(styles).not.toContain("button:not(.icon-button):hover");
    expectSelectorBody(styles, "button:not(.icon-button)", "min-height: 30px");
  });

  it("centers the custom GIF dialog in a modal above workspace content", () => {
    const menu = readFileSync(resolve(__dirname, "../components/SettingsMenu.vue"), "utf8");

    expect(menu).toContain('class="quick-dialog gif-theme-custom-modal"');
    expect(menu).toContain(':z-index="CONTEXT_MENU_Z_INDEX + 1"');
  });

  it("reserves the companion GIF trigger size before the asset loads", () => {
    const styles = readFileSync(resolve(__dirname, "../styles.css"), "utf8");

    expectSelectorBody(styles, ".focus-companion img", "width: 50px");
    expectSelectorBody(styles, ".focus-companion img", "height: 50px");
    expect(ruleBodies(styles, ".focus-companion img").join("\n")).not.toContain("width: auto");
    expect(ruleBodies(styles, ".focus-companion img").join("\n")).not.toContain("height: auto");
  });

  it("shows a pointer cursor over the companion GIF (it opens area tips on click)", () => {
    const styles = readFileSync(resolve(__dirname, "../styles.css"), "utf8");

    expectSelectorBody(styles, ".focus-companion-gif", "cursor: pointer");
  });

  it("lifts the command bar above the preview modal layer while the image preview is open", () => {
    const styles = readFileSync(resolve(__dirname, "../styles.css"), "utf8");

    // 预览所在的 .n-modal-container 全局抬到 z-index 10000；空间切换等内联弹层
    // 渲染在命令栏（z-index 4200，自成层叠上下文）里，不整体抬升就会被磨砂
    // 预览盖住 —— 与 reveal-zone / settings-dropdown 的既有 10100 修复同一模式。
    expectSelectorBody(styles, "body:has(.image-preview) .workbench-command-bar", "z-index: 10100");
  });

  it("normalizes retained Naive UI and panel internals through shared tokens", () => {
    const styles = readFileSync(resolve(__dirname, "../styles.css"), "utf8");

    expectSelectorBody(styles, ".n-button", "--n-border-radius: var(--radius)");
    expectSelectorBody(styles, ".n-button:not(.n-button--primary-type):not(.n-button--error-type)", "--n-color: var(--button) !important");
    expectSelectorBody(styles, ".n-dropdown-menu", "border: 1px solid var(--border) !important");
    expectSelectorBody(styles, ".n-dropdown-menu", "background: var(--material-elevated) !important");
    expectSelectorBody(styles, ".n-dropdown-menu", "color: var(--popover-foreground) !important");
    expectSelectorBody(styles, ".n-dropdown-menu", "box-shadow: var(--shadow-soft) !important");
    expectSelectorBody(styles, ".n-modal .n-card", "border: 1px solid var(--border) !important");
    expectSelectorBody(styles, ".n-modal .n-card", "background: var(--material-elevated) !important");
    expectSelectorBody(styles, ".n-modal .n-card", "color: var(--popover-foreground) !important");
    expectSelectorBody(styles, ".panel-header", "border-bottom: 0");
    expectSelectorBody(styles, ".panel-header", "box-shadow: inset 0 -1px color-mix(in srgb, var(--border) 55%, transparent)");
    expectSelectorBody(styles, ".panel-header", "background: color-mix(in srgb, var(--card) 96%, var(--muted-surface))");
    expectSelectorBody(styles, ".todo-item", "border-color: var(--border)");
    expectSelectorBody(styles, ".todo-item", "border-radius: var(--radius)");
    expectSelectorBody(styles, ".todo-item::after", "border-bottom: 1px solid var(--border)");
    expectSelectorBody(styles, ".quick-button", "border-radius: var(--radius)");
    expectSelectorBody(styles, ".companion-popover-shell.n-popover", "border: 1px solid var(--border) !important");
    expectSelectorBody(styles, ".companion-popover-shell.n-popover", "background: var(--popover) !important");
    // 悬浮投影走 --shadow-float token（浅色多层柔和不发黑），不再是无阴影。
    expectSelectorBody(styles, ".companion-popover-shell.n-popover", "box-shadow: var(--shadow-float) !important");
    expectSelectorBody(styles, ".companion-popover-arrow", "border: 1px solid var(--border) !important");
    expectSelectorBody(styles, ".companion-meta-row", "display: inline-flex");
    expectSelectorBody(styles, ".companion-meta-row", "align-items: center");
    expectSelectorBody(styles, ".companion-meta-row", "justify-self: start");
    expectSelectorBody(styles, ".companion-meta-row", "flex-wrap: nowrap");
    expectSelectorBody(styles, ".companion-meta-row", "white-space: nowrap");
    expect(ruleBodies(styles, ".companion-signature").join("\n")).not.toContain("color:");
    expect(ruleBodies(styles, ".companion-signature").join("\n")).not.toContain("font-size:");
    expect(ruleBodies(styles, ".companion-popover-shell.n-popover").join("\n")).not.toContain("#111");
    expect(ruleBodies(styles, ".companion-popover-arrow").join("\n")).not.toContain("#111");
  });

  it("keeps preview, workspace tabs, and top actions aligned to the compact workbench layout", () => {
    const styles = readFileSync(resolve(__dirname, "../styles.css"), "utf8");

    expectSelectorBody(styles, ".image-preview", "left: var(--image-preview-left, clamp(220px, 18vw, 320px))");
    expectSelectorBody(styles, ".image-preview", "right: 0");
    expect(ruleBodies(styles, ".image-preview").join("\n")).not.toContain("width: 90vw");
    expectSelectorBody(styles, ".preview-stage img", "max-width: 100%");
    expectSelectorBody(styles, ".preview-stage img", "width: auto");
    expectSelectorBody(styles, ".preview-stage img", "height: auto");
    expectSelectorBody(styles, ".preview-stage img", "min-width: 0");
    expectSelectorBody(styles, ".preview-stage img", "min-height: 0");
    expect(ruleBodies(styles, ".preview-stage img").join("\n")).not.toContain("justify-self: stretch");
    expect(ruleBodies(styles, ".preview-stage img").join("\n")).not.toContain("align-self: stretch");
    expectSelectorBody(styles, ".preview-stage img", "max-width: 100%");
    expectSelectorBody(styles, ".preview-stage img", "max-height: 100%");
    expectSelectorBody(styles, ".preview-stage img", "object-fit: contain");
    expectSelectorBody(styles, ".preview-main", "grid-template-rows: minmax(0, 1fr)");
    expectSelectorBody(styles, ".preview-actions", "position: absolute");
    expectSelectorBody(styles, ".preview-actions", "bottom: 14px");
    expectSelectorBody(styles, ".preview-toolbar-button:focus-visible", "outline: 0");
    expectSelectorBody(styles, ".preview-toolbar-button:focus-visible", "box-shadow: none");
    expectSelectorBody(styles, ".image-editor--preview .image-editor-stage", "width: 100%");
    expectSelectorBody(styles, ".image-editor--preview .image-editor-stage", "height: 100%");
    expectSelectorBody(styles, ".image-editor--preview .image-editor-canvas-wrap", "max-width: 100%");
    expectSelectorBody(styles, ".image-editor--preview .image-editor-canvas-wrap", "max-height: 100%");
    expectSelectorBody(styles, ".image-editor-source", "max-width: 100%");
    expectSelectorBody(styles, ".image-editor-source", "max-height: 100%");
    expectSelectorBody(styles, ".image-editor-canvas", "max-width: 100%");
    expectSelectorBody(styles, ".image-editor-canvas", "max-height: 100%");
    expectSelectorBody(styles, ".image-editor-stage", "overflow: visible");
    expectSelectorBody(styles, ".image-editor-crop-actions", "transform: translate(8px, 8px)");
    expectSelectorBody(styles, ".image-editor-tool[data-tooltip]:hover::after", "content: attr(data-tooltip)");
    expectSelectorBody(styles, ".workbench-grid", "position: relative");
    expectSelectorBody(styles, ".workbench-grid", "grid-template-columns: minmax(100px, 0.382fr) minmax(100px, 0.618fr) minmax(100px, 0.618fr) minmax(100px, 1fr)");
    expectSelectorBody(styles, ".workbench-grid", "gap: 14px");
    expectSelectorBody(styles, ".workbench-grid", "padding: 14px");
    expectSelectorBody(styles, ".workbench-grid", "grid-row: 2");
    expectSelectorBody(styles, ".workbench-header-reveal-zone", "position: absolute");
    expectSelectorBody(styles, ".workbench-header-reveal-zone", "z-index: 4500");
    expectSelectorBody(styles, ".workbench-header-reveal-zone", "top: 0");
    expectSelectorBody(styles, ".workbench-header-reveal-zone", "left: 50%");
    expectSelectorBody(styles, ".workbench-header-reveal-zone", "width: 160px");
    expectSelectorBody(styles, ".workbench-header-reveal-zone", "height: 40px");
    expectSelectorBody(styles, ".workbench-header-reveal", "position: absolute");
    expectSelectorBody(styles, ".workbench-header-reveal", "top: 1px");
    expectSelectorBody(styles, ".workbench-header-reveal", "left: 16px");
    expectSelectorBody(styles, ".workbench-header-reveal", "width: 128px");
    expectSelectorBody(styles, ".workbench-header-reveal", "height: 32px");
    expectSelectorBody(styles, ".workbench-header-reveal", "border-radius: 0");
    expectSelectorBody(styles, ".workbench-header-reveal", "background: transparent");
    expectSelectorBody(styles, ".workbench-header-reveal", "box-shadow: none");
    expectSelectorBody(styles, ".workbench-header-reveal::before", "content: none");
    expectSelectorBody(styles, ".workbench-header-reveal:hover", "background: transparent");
    expectSelectorBody(styles, ".workbench-header-reveal:hover", "cursor: pointer");
    expectSelectorBody(styles, ".workbench-header-reveal:hover", "transform: translateY(0)");
    expectSelectorBody(styles, ".workbench-header-reveal-enter-active", "transform 100ms var(--motion-ease)");
    expectSelectorBody(styles, ".workbench-header-reveal-enter-from", "transform: translateY(-32px)");
    expectSelectorBody(styles, ".workbench-header-reveal-leave-to", "transform: translateY(-16px)");
    expectSelectorBody(styles, ".workbench-header-reveal-enter-from:hover", "transform: translateY(-32px)");
    expectSelectorBody(styles, ".workbench-header-reveal-leave-to:hover", "transform: translateY(-16px)");
    expectSelectorBody(styles, ".workbench-header-enter-active", "transition:");
    expectSelectorBody(styles, ".workbench-header-enter-from", "transform: translateY(-100%)");
    expectSelectorBody(styles, ".workbench-resizer", "position: absolute");
    expectSelectorBody(styles, ".workbench-resizer", "cursor: col-resize");
    expectSelectorBody(styles, ".workbench-resizer::before", "left: 50%");
    expectSelectorBody(styles, ".workbench-resizer::before", "transform: translateX(-50%)");
    expectSelectorBody(styles, "button.workbench-resizer", "background: transparent");
    expectSelectorBody(styles, "button.workbench-resizer", "cursor: col-resize");
    expectSelectorBody(styles, "button.workbench-resizer", "padding: 0");
    expectSelectorBody(styles, ".space-tabs-scrollbar", "width: 100%");
    expectSelectorBody(styles, ".space-tabs-scrollbar", "max-width: 100%");
    expect(ruleBodies(styles, ".space-tabs-scrollbar").join("\n")).not.toContain("calc(100% - 101px)");
    expectSelectorBody(styles, ".workbench-command-actions", "align-items: center");
    expectSelectorBody(styles, ".workbench-header-hide-button:hover", "cursor: pointer");
    expectSelectorBody(styles, ".settings-trigger", "height: 32px");
    expectSelectorBody(styles, ".settings-btn.icon-button", "width: 32px");
    expectSelectorBody(styles, ".settings-btn.icon-button", "height: 32px");
    expectSelectorBody(styles, ".settings-btn.icon-button", "border-radius: 50% !important");
    expectSelectorBody(styles, ".settings-btn.icon-button", "--n-border-radius: 50% !important");
    expectSelectorBody(styles, ".settings-btn.icon-button .n-icon", "font-size: 16px");
    expectSelectorBody(styles, ".settings-btn.icon-button svg", "stroke-width: 1.8");
    expectSelectorBody(styles, ".icon-button", "border-radius: 50%");
    expectSelectorBody(styles, ".icon-button", "cursor: pointer");
    expectSelectorBody(styles, ".n-button.icon-button", "border-radius: 50% !important");
    expectSelectorBody(styles, ".icon-button .n-icon", "font-size: 16px");
    expectSelectorBody(styles, ".icon-button svg", "font-size: 16px");
    expectSelectorBody(styles, ".icon-button svg", "stroke-width: 1.8");
    expectSelectorBody(styles, "button.quick-menu-button", "background: transparent");
    expectSelectorBody(styles, "button.todo-section-menu-button", "background: transparent");
    expectSelectorBody(styles, "button.quick-menu-button", "border-radius: 50%");
    expectSelectorBody(styles, "button.todo-section-menu-button", "border-radius: 50%");
    expectSelectorBody(styles, ".quick-menu-button", "width: 34px");
    expectSelectorBody(styles, ".quick-menu-button", "height: 34px");
    expectSelectorBody(styles, ".todo-section-menu-button", "width: 34px");
    expectSelectorBody(styles, ".todo-section-menu-button", "height: 34px");
    expectSelectorBody(styles, ".quick-menu-button:hover", "background: transparent");
    expectSelectorBody(styles, ".todo-section-menu-button:hover", "background: transparent");
    expectSelectorBody(styles, ".todo-collapse-button", "background: transparent");
    expectSelectorBody(styles, "button.todo-collapse-button", "background: transparent");
    expectSelectorBody(styles, ".todo-collapse-button", "border-radius: 50%");
    expectSelectorBody(styles, "button.todo-collapse-button", "border-radius: 50%");
    expectSelectorBody(styles, ".todo-collapse-button", "--n-color: transparent !important");
    expectSelectorBody(styles, ".todo-collapse-button", "--n-color-hover: transparent !important");
    expectSelectorBody(styles, ".workbench-header-hide-button", "border-radius: 50%");
    expectSelectorBody(styles, ".workbench-header-hide-button svg", "stroke-width: 1.5");
    expectSelectorBody(styles, ".workbench-header-reveal svg", "stroke-width: 1.5");
    expectSelectorBody(styles, ".panel.is-focused", "box-shadow: none");
    expectSelectorBody(styles, ".todo-section.is-focused::before", "content: none");
    expectSelectorBody(styles, ".todo-panel", "border-left: 0");
    expectSelectorBody(styles, ".todo-panel", "border-right: 0");
    expectSelectorBody(styles, ".todo-panel", "box-shadow: none");
    expectSelectorBody(styles, ".todo-section", "border-left: 0");
    expectSelectorBody(styles, ".todo-section", "border-right: 0");
    expectSelectorBody(styles, ".todo-section", "box-shadow: none");
  });

  it("keeps reminders and notification actions readable with shared visual tokens", () => {
    const styles = readFileSync(resolve(__dirname, "../styles.css"), "utf8");

    expect(ruleBodies(styles, ".todo-item .n-checkbox-box--checked")).toHaveLength(1);
    expect(ruleBodies(styles, ".today-focus-item .n-checkbox-box--checked")).toHaveLength(1);
    expectSelectorBody(styles, ".todo-item .n-checkbox-box--checked", "--n-color-checked: #22c55e !important");
    expectSelectorBody(styles, ".today-focus-item .n-checkbox-box--checked", "--n-color-checked: #22c55e !important");
    expectSelectorBody(styles, ".today-focus-item.is-done", "opacity: 1");
    expectSelectorBody(styles, ".todo-item.is-done .n-checkbox", "opacity: 0.78");
    expectSelectorBody(styles, ".today-focus-item.is-done .n-checkbox", "opacity: 0.78");
    expectSelectorBody(styles, ".todo-item.is-done .todo-star-button.is-starred", "opacity: 0.78");
    expectSelectorBody(styles, ".today-focus-item.is-done .todo-star-button.is-starred", "opacity: 0.78");
    expectSelectorBody(styles, ".notify-floating-date-picker", "--notify-date-column-width: 332px");
    expectSelectorBody(styles, ".notify-floating-date-picker", "--notify-time-column-width: 114px");
    expectSelectorBody(styles, ".notify-floating-date-picker", "grid-template-columns: var(--notify-date-column-width) var(--notify-time-column-width)");
    expectSelectorBody(styles, ".notify-floating-date-picker", "border: 0");
    expectSelectorBody(styles, ".notify-floating-date-picker", "border-radius: var(--radius)");
    expectSelectorBody(styles, ".notify-floating-date-picker", "box-shadow: var(--shadow-soft)");
    expectSelectorBody(styles, ".notify-floating-date-picker", "padding-top: 8px");
    expectSelectorBody(styles, ".notify-date-picker.n-date-panel", "background: transparent !important");
    expectSelectorBody(styles, ".notify-date-picker .n-date-panel-calendar", "background: transparent !important");
    expectSelectorBody(styles, ".notify-time-columns", "grid-template-columns: 1fr 1fr");
    expectSelectorBody(styles, ".notify-time-panel", "border-radius: var(--radius)");
    expectSelectorBody(styles, ".notify-time-column", "overflow-y: auto");
    expectSelectorBody(styles, ".notify-time-column", "overscroll-behavior: contain");
    expectSelectorBody(styles, ".notify-time-column", "-webkit-overflow-scrolling: touch");
    expectSelectorBody(styles, ".notify-panel-actions", "justify-content: flex-end");
    expectSelectorBody(styles, ".notify-time-preview", "height: 26px");
    expectSelectorBody(styles, ".notify-time-option", "height: 26px");
    expectSelectorBody(styles, ".notify-panel-action", "height: 26px");
    expectSelectorBody(styles, ".notify-panel-action", "min-width: 48px");
    expectSelectorBody(styles, ".notify-panel-action", "white-space: nowrap");
    expectSelectorBody(styles, ".quick-dialog-action.n-button", "--n-color: var(--button) !important");
    expectSelectorBody(styles, ".quick-dialog-action.n-button", "--n-border: 1px solid var(--line-control) !important");
    expectSelectorBody(styles, ".quick-dialog-submit.n-button", "--n-color-hover: var(--button-hover) !important");
    expectSelectorBody(styles, ".quick-dialog-submit.n-button", "--n-text-color: var(--primary) !important");
    expectSelectorBody(styles, ".quick-dialog-submit.n-button:hover:not(.n-button--disabled)", "background: var(--button-hover) !important");
    expectSelectorBody(styles, ".n-time-picker-panel .n-button--primary-type", "--n-text-color: var(--primary-foreground) !important");
    expectSelectorBody(styles, ".n-time-picker-panel .n-button--primary-type", "color: var(--primary-foreground) !important");
  });

  it("keeps shortcut help key pills visually tied to the shared keyboard", () => {
    const styles = readFileSync(resolve(__dirname, "../styles.css"), "utf8");
    const activeKeycap = ruleBodies(styles, ".shortcut-keyboard-diagram--shared .shortcut-keycap--active").join("\n");
    const keyPill = ruleBodies(styles, ".shortcut-key-pill").join("\n");
    const gesturePill = ruleBodies(styles, ".shortcut-gesture-pill").join("\n");

    expect(activeKeycap).toContain("background: color-mix(in srgb, var(--line-focus) 18%, var(--button))");
    expect(keyPill).toContain("background: color-mix(in srgb, var(--line-focus) 18%, var(--button))");
    expect(keyPill).toContain("border-color: color-mix(in srgb, var(--line-focus) 42%, var(--line-subtle))");
    // 手势药丸（含 ⌘/右键 等无法全量映射键帽的组合）与键位药丸同一浅蓝底，不允许样式分叉。
    expect(gesturePill).toContain("background: color-mix(in srgb, var(--line-focus) 18%, var(--button))");
    expect(gesturePill).toContain("border-color: color-mix(in srgb, var(--line-focus) 42%, var(--line-subtle))");
  });

  it("centers reminder star icons and unifies thin scrollbars", () => {
    const styles = readFileSync(resolve(__dirname, "../styles.css"), "utf8");

    expectSelectorBody(styles, ".todo-star-button", "display: inline-flex");
    expectSelectorBody(styles, ".todo-star-button", "align-items: center");
    expectSelectorBody(styles, ".todo-star-button", "justify-content: center");
    expectSelectorBody(styles, ".todo-star-button", "font-size: 12px");
    expectSelectorBody(styles, ".todo-star-button", "line-height: 1");

    expect(styles).toContain("@keyframes starred-text-flow");

    expectSelectorBody(styles, ".todo-notify-button", "border-radius: 50%");
    expectSelectorBody(styles, ".todo-notify-button", "width: 26px");
    expectSelectorBody(styles, ".todo-notify-button", "height: 26px");
    expectSelectorBody(styles, ".todo-notify-button", "margin-right: 2px");
    expectSelectorBody(styles, "button.todo-notify-button", "border-radius: 50%");
    expectSelectorBody(styles, ".todo-notify-button.has-time", "border-radius: 999px");
    expectSelectorBody(styles, ".todo-notify-button.has-time", "height: 26px");
    expectSelectorBody(styles, ".todo-notify-button.has-time", "background: transparent");
    expectSelectorBody(styles, ".todo-notify-button.has-time", "box-shadow: none");
    expect(ruleBodies(styles, ".todo-notify-button.has-time").join("\n")).not.toContain("var(--primary)");
    expectSelectorBody(styles, ".todo-star-button", "border-radius: 50%");
    expectSelectorBody(styles, ".todo-star-button", "width: 26px");
    expectSelectorBody(styles, ".todo-star-button", "height: 26px");
    expectSelectorBody(styles, ".todo-star-button", "margin-left: 2px");
    expectSelectorBody(styles, "button.todo-star-button", "border-radius: 50%");

    expectSelectorBody(styles, ":root", "--scrollbar-size: 2px");
    expectSelectorBody(styles, ":root", "--scrollbar-thumb: color-mix(in srgb, var(--line-control) 30%, transparent)");
    expectSelectorBody(styles, ":root", "--scrollbar-thumb-hover: color-mix(in srgb, var(--line-control) 46%, transparent)");
    // Chrome 121+ 里非 auto 的 scrollbar-width/color 会让 ::-webkit-scrollbar 失效，
    // 原生条退化成系统 thin 条（约 8px，比 NScrollbar 轨道粗一倍）——记事本 textarea、
    // 提醒多列容器等原生滚动条全部中招。全局只留 webkit 伪元素画条，标准属性退到
    // @supports 回退块给 Firefox；* 规则不得再声明任何 scrollbar 标准属性。
    expect(ruleBodies(styles, "*")[0]).not.toContain("scrollbar");
    expect(styles).toContain("@supports not selector(::-webkit-scrollbar)");
    expect(styles).toContain("scrollbar-width: thin");
    expect(styles).toContain("scrollbar-color: var(--scrollbar-thumb) transparent");
    expectSelectorBody(styles, ".space-tabs:hover", "scrollbar-width: auto");
    expectSelectorBody(styles, ".n-scrollbar", "--n-scrollbar-width: var(--scrollbar-size) !important");
    expectSelectorBody(styles, ".n-scrollbar", "--n-scrollbar-height: var(--scrollbar-size) !important");
    expectSelectorBody(styles, ".n-scrollbar-rail__scrollbar", "background: var(--scrollbar-thumb) !important");
    expectSelectorBody(styles, "*::-webkit-scrollbar-thumb", "cursor: pointer");
    expectSelectorBody(styles, ".n-scrollbar-rail__scrollbar", "cursor: pointer");
    expectSelectorBody(styles, ".n-scrollbar-rail__scrollbar:hover", "background: var(--scrollbar-thumb-hover) !important");
    expectSelectorBody(styles, ".todo-list-scrollbar", "--n-scrollbar-width: var(--scrollbar-size) !important");
    expectSelectorBody(styles, ".today-focus-scrollbar", "--n-scrollbar-width: var(--scrollbar-size) !important");
  });

  it("scrolls single-column reminders together and multiple columns independently", () => {
    const styles = readFileSync(resolve(__dirname, "../styles.css"), "utf8");
    const todo = readFileSync(resolve(__dirname, "../components/TodoPanel.vue"), "utf8");

    expectSelectorBody(styles, ".todo-column", "overflow-y: auto");
    expectSelectorBody(styles, ".todo-section", "overflow: visible");
    expectSelectorBody(styles, ".todo-section.is-compact", "flex: 0 0 auto");
    expectSelectorBody(styles, ".todo-section > .todo-heading", "position: sticky");
    expectSelectorBody(styles, ".todo-section > .todo-heading", "top: 0");
    expectSelectorBody(styles, ".todo-list-shell", "grid-template-rows: 1fr");
    expectSelectorBody(styles, ".todo-list-shell.is-hidden", "grid-template-rows: 0fr");
    expect(todo).toContain('class="todo-content-scroll" :class="{ \'is-multi-column\': columnCount > 1 }"');
    expectSelectorBody(styles, ".todo-content-scroll", "overflow: hidden");
    expectSelectorBody(styles, ".todo-sections", "grid-template-rows: minmax(0, 1fr)");
    expectSelectorBody(styles, ".todo-column", "overflow-y: auto");
    expectSelectorBody(styles, ".todo-column", "min-height: 0");
    expect(todo).not.toContain("<NScrollbar");
  });

  it("lets collapsed reminder sections follow the content height transition", () => {
    const desk = readFileSync(resolve(__dirname, "../desk.css"), "utf8");
    const selector = ".workbench-shell .todo-section.is-compact.is-collapsed";
    expectSelectorBody(desk, selector, "flex: 0 0 auto");
    expectSelectorBody(desk, selector, "min-height: var(--desk-group-heading-height)");
    expect(ruleBodies(desk, selector).some(body => /flex:\s*0\s+0\s+54px/.test(body))).toBe(false);
  });

  it("renders reminder lists in explicit independent columns (not CSS multicol)", () => {
    const styles = readFileSync(resolve(__dirname, "../styles.css"), "utf8");

    // 显式分列:每列是独立的 .todo-column flex 容器,列表按 column 字段归入;
    // 列数由 JS 写到 .todo-sections 的内联 grid-template-columns。
    expect(styles).toContain(".todo-sections.is-multi-column");
    expect(styles).toContain(".todo-column");
    // 多列模式下列宽由内联 repeat() 控制(不再用 CSS 多列 / 容器查询)。
    expect(styles).not.toContain("column-width: 340px");
    expect(styles).not.toContain("break-inside: avoid");
    expect(styles).not.toContain("@container (min-width: 680px)");
    expect(styles).not.toContain("grid-auto-rows: minmax(0, 1fr)");
  });

  it("separates the rounded focus list with spacing instead of a divider", () => {
    const styles = readFileSync(resolve(__dirname, "../styles.css"), "utf8");

    expectSelectorBody(styles, ".todo-content-scroll > .todo-focus-region > .today-focus-section", "margin: 6px 0 12px");
    expectSelectorBody(styles, ".todo-content-scroll > .todo-focus-region > .today-focus-section", "border-radius: var(--radius)");
    expect(styles).not.toMatch(/\.todo-section:first-child \.todo-heading\s*\{[^}]*border-top/);
  });

  it("keeps smart-paste controls neutral until hover and menu entries on the clipboard icon", () => {
    const desk = readFileSync(resolve(__dirname, "../desk.css"), "utf8");
    const space = readFileSync(resolve(__dirname, "../components/SpacePanel.vue"), "utf8");
    const text = readFileSync(resolve(__dirname, "../components/TextPanel.vue"), "utf8");
    const todo = readFileSync(resolve(__dirname, "../components/TodoPanel.vue"), "utf8");

    // 便签头部「智能粘贴」按钮：使用 desk-ai-button 中性灰 token；
    // 彩色流动不再常驻（markup 不带任何 flow 类），只在 :hover 时由 desk.css 恢复。
    expect(space).toContain('class="desk-ai-action desk-ai-button desk-smart-paste"');
    expect(space).not.toContain('class="smart-paste-icon-flow"');
    expect(space).not.toContain("polish-menu-flow");
    expectSelectorBody(desk, ".workbench-shell .desk-ai-button", "color: var(--muted)");
    expectSelectorBody(desk, ".workbench-shell .desk-ai-button:hover", "color: var(--primary)");
    // 悬浮动效：便签头部智能粘贴入口
    // 图标循环变色、文字渐变滚动；平时保持中性灰。
    expect(desk).toContain("@keyframes smart-paste-icon-flow");
    expectSelectorBody(desk, ".workbench-shell .desk-ai-button:hover .n-icon", "animation: smart-paste-icon-flow 4.8s linear infinite");
    expectSelectorBody(desk, ".workbench-shell .desk-smart-paste:hover > span", "animation: starred-text-flow 4.8s linear infinite");
    // 智能粘贴使用带星星的共享剪贴板图标。
    expect(text).toContain('key: "smart-paste", disabled: !menu.value?.canPaste, icon: renderIcon(SmartPasteIcon)');
    expect(todo).not.toContain("ColorWandOutline");
    expect(text).not.toContain("ColorWandOutline");
    // 菜单标签的渐变流动文字仍由 contextMenu.ts 渲染，样式类保留。
    expect(readFileSync(resolve(__dirname, "../utils/contextMenu.ts"), "utf8")).toContain("polish-menu-flow");
    const quick = readFileSync(resolve(__dirname, "../components/QuickButtons.vue"), "utf8");
    // 快捷区和提醒列表普通粘贴不使用智能处理的悬浮动效。
    expect(quick).toContain('class="icon-button desk-paste-button"');
    expect(todo).toContain('class="icon-button desk-paste-button"');
    expect(quick).not.toContain("desk-ai-button");
    expect(todo).not.toContain("desk-ai-button");
    expect(quick).not.toContain("ColorWandOutline");
    // 智能粘贴使用共享星星剪贴板，文字渐变走共享 render-label。
    expect(quick).toContain('key: "smart-paste", icon: renderIcon(SmartPasteIcon)');
    expect(quick).toContain(':polish-labels="true"');
    const contextMenu = readFileSync(resolve(__dirname, "../components/ContextMenu.vue"), "utf8");
    expect(contextMenu).toContain(':render-label="polishLabels ? renderPolishMenuLabel : undefined"');
    // 防重态：进行中 cursor:wait + 降透明度（与便签入口同款）。
    expectSelectorBody(desk, ".workbench-shell .desk-ai-button:disabled", "cursor: wait");
  });

  it("keeps single-row large buttons and bounds wrapping text pills", () => {
    const desk = readFileSync(resolve(__dirname, "../desk.css"), "utf8");
    expectSelectorBody(desk, ".workbench-shell button.quick-button", "min-height: 44px");
    expectSelectorBody(desk, ".workbench-shell button.quick-button", "padding: 8px 12px");
    expectSelectorBody(desk, ".workbench-shell button.quick-button", "min-height var(--motion-medium) var(--motion-ease)");
    expectSelectorBody(desk, ".workbench-shell .quick-block.is-compact .quick-buttons", "display: flex");
    expectSelectorBody(desk, ".workbench-shell .quick-block.is-compact .quick-buttons", "flex-wrap: wrap");
    expectSelectorBody(desk, ".workbench-shell .quick-block.is-compact button.quick-button", "width: fit-content");
    expectSelectorBody(desk, ".workbench-shell .quick-block.is-compact button.quick-button", "max-width: min(100%, 240px)");
    expectSelectorBody(desk, ".workbench-shell .quick-block.is-compact button.quick-button", "border-radius: 999px");
    expectSelectorBody(desk, ".workbench-shell .quick-block.is-compact .quick-button-icon", "background: transparent");
    expectSelectorBody(desk, ".workbench-shell .quick-block.is-compact .quick-button-icon", "width: 16px");
  });

  it("keeps mirror typography paired with the transparent textarea (no drift)", () => {
    const styles = [
      readFileSync(resolve(__dirname, "../styles.css"), "utf8"),
      readFileSync(resolve(__dirname, "../desk.css"), "utf8"),
    ].join("\n");
    const textareaBodies = ruleBodies(styles, ".text-editor-textarea");
    const mirrorBodies = ruleBodies(styles, ".text-mirror");
    for (const body of textareaBodies) {
      if (/padding|line-height|font|letter-spacing|tab-size|white-space|overflow-wrap/.test(body)) {
        expect(mirrorBodies).toContain(body);
      }
    }
    // 规则级对称配对：任何一侧带排版声明的规则，选择器列表必须同时出现另一侧，
    // 否则某个布局变体（.workspace-panel / .workbench-shell 前缀规则）下两层错位。
    const typography = /padding|line-height|font|letter-spacing|tab-size|white-space|overflow-wrap|word-break|word-spacing|text-indent|direction/;
    const commentFree = styles.replace(/\/\*[\s\S]*?\*\//g, "");
    const unpaired: string[] = [];
    for (const match of commentFree.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!typography.test(match[2])) continue;
      const selectors = match[1].split(",").map((item) => item.trim());
      const hasTextarea = selectors.some((selector) => selector.includes(".text-editor-textarea"));
      const hasMirror = selectors.some((selector) => selector.includes(".text-mirror"));
      if (hasTextarea !== hasMirror) unpaired.push(selectors.join(", "));
    }
    expect(unpaired).toEqual([]);
    expectSelectorBody(styles, ".text-editor-textarea", "color: transparent");
    expectSelectorBody(styles, ".text-editor-textarea", "caret-color: var(--text)");
    expectSelectorBody(styles, ".text-editor-textarea", "overscroll-behavior: none");
    expectSelectorBody(styles, ".text-editor-textarea", "display: block");
    expectSelectorBody(styles, ".text-mirror", "position: absolute");
    expectSelectorBody(styles, ".text-mirror", "pointer-events: none");
    // 选区必须半透明且字色透明：不透明选区底会盖住镜像层的格式标注（高亮/划线/文字色）。
    expectSelectorBody(styles, ".text-editor-textarea::selection", "color: transparent");
    expectSelectorBody(styles, ".text-editor-textarea::selection", "color-mix(in srgb, var(--primary) 26%, transparent)");
  });

  it("never paints the focus ring on quick add buttons after dialog focus restore", () => {
    const styles = readFileSync(resolve(__dirname, "../styles.css"), "utf8");
    const desk = readFileSync(resolve(__dirname, "../desk.css"), "utf8");

    // NModal 关闭时 vueuc FocusTrap 把焦点还原给打开弹窗的加号按钮
    // （returnFocusOnDeactivated 默认 true，NModal 不透传关闭项）；回车提交后
    // 紧跟的程序化 focus 命中 :focus-visible，两套全局焦点指示都会画到加号按钮上：
    // desk.css 的 .workbench-shell button:focus-visible 实线环 + styles.css 的
    // 全局 :focus-visible box-shadow 光晕（24% 浅蓝）。这些加号按钮的键盘焦点反馈已有配色变化
    // （recolor），两套指示必须一并豁免——基座规则（styles.css）与 workbench
    // 覆写（desk.css，特异性压过全局环）缺一不可。
    expectSelectorBody(styles, ".quick-add-button:focus-visible", "outline: none");
    expectSelectorBody(styles, ".quick-add-button:focus-visible", "box-shadow: none");
    expectSelectorBody(styles, ".quick-tag-add-button:focus-visible", "outline: none");
    expectSelectorBody(styles, ".quick-tag-add-button:focus-visible", "box-shadow: none");
    expectSelectorBody(desk, ".workbench-shell .quick-add-button:focus-visible", "outline: none");
    expectSelectorBody(desk, ".workbench-shell .quick-add-button:focus-visible", "box-shadow: none");
    expectSelectorBody(desk, ".workbench-shell .quick-tag-add-button:focus-visible", "outline: none");
    expectSelectorBody(desk, ".workbench-shell .quick-tag-add-button:focus-visible", "box-shadow: none");
  });
});
