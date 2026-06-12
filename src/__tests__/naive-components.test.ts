import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (file: string) => readFileSync(resolve(root, file), "utf8");

describe("Naive UI component usage", () => {
  it("uses NDropdown for context and settings menus instead of custom menu containers", () => {
    const menuComponents = [
      "src/components/ImagePanel.vue",
      "src/components/QuickButtons.vue",
      "src/components/TodoPanel.vue",
      "src/components/TextPanel.vue",
      "src/components/SettingsMenu.vue",
    ];

    for (const file of menuComponents) {
      const source = read(file);

      expect(source, file).toContain("NDropdown");
      expect(source, file).not.toContain("context-menu");
    }
  });

  it("uses companion bubble feedback instead of a custom toast element", () => {
    const app = read("src/App.vue");
    const styles = read("src/styles.css");

    expect(app).toContain("showBubble");
    expect(app).not.toContain("createDiscreteApi");
    expect(app).not.toContain('class="toast"');
    expect(app).not.toContain('const toast = ref("")');
    expect(styles).not.toContain(".toast");
  });

  it("uses Naive modal primitives only for popup surfaces that still need them", () => {
    const app = read("src/App.vue");
    const preview = read("src/components/ImagePreview.vue");
    const quick = read("src/components/QuickButtons.vue");

    expect(app).not.toContain("NModal");
    expect(app).not.toContain('class="about-modal"');
    expect(app).not.toContain("window.alert");
    expect(preview).toContain("NModal");
    expect(quick).toContain("NModal");
  });

  it("uses Naive popover primitives for the reusable companion bubble", () => {
    const companion = read("src/components/CompanionBubble.vue");
    const companionGifThemes = read("src/state/companionGifThemes.ts");
    const app = read("src/App.vue");
    const settings = read("src/components/SettingsMenu.vue");
    const i18n = read("src/state/i18n.ts");

    expect(companion).toContain("NPopover");
    expect(companion).toContain("NButton");
    expect(companionGifThemes).toContain("kun-dark.gif");
    expect(companionGifThemes).toContain("yunxia-dark.gif");
    expect(companion).toContain("getCompanionGifSrc");
    expect(companion).toContain(":src=\"gifSrc\"");
    expect(app).toContain(":theme=\"state.theme\"");
    expect(app).toContain(':gif-theme="state.companionGifTheme"');
    expect(settings).toContain("companionGifTheme");
    expect(settings).toContain("gifTheme");
    expect(settings).toContain("settings.gifTheme");
    expect(i18n).toContain("GIF 主题");
    expect(settings).toContain("NUpload");
    expect(companion).toContain("gifTheme");
    expect(companion).toContain("shouldRenderGif");
    expect(companion).toContain("popoverKey");
    expect(companion).toContain("POPOVER_DELAY_MS = 200");
    expect(companion).toContain("delayedPopoverVisible");
    expect(companion).toContain('placement="top-end"');
    expect(companion).toContain(':animated="false"');
    expect(companion).not.toContain(':animated="true"');
    expect(companion).toContain(":arrow-point-to-center");
    expect(companion).toContain("'companion-popover-shell'");
    expect(companion).toContain("'is-popover-fading': retainingPopoverContent");
    expect(companion).toContain('arrow-class="companion-popover-arrow"');
    expect(companion).toContain("--n-box-shadow");
    expect(companion).toContain(":show=\"visiblePopover\"");
    expect(companion).not.toContain("content-class=\"companion-popover-shell\"");
    expect(companion).not.toContain("border: '1px solid #111'");
    expect(companion).not.toContain("bubble-box");
    expect(companion).not.toContain("<button");
    expect(settings).not.toContain('type="file"');
  });

  it("routes guidance through the companion bubble instead of hover tooltips", () => {
    const guidedSources = [
      "src/App.vue",
      "src/components/ImagePanel.vue",
      "src/components/QuickButtons.vue",
      "src/components/TodoPanel.vue",
      "src/components/TextPanel.vue",
      "src/components/SettingsMenu.vue",
    ];

    for (const file of guidedSources) {
      const source = read(file);

      expect(source, file).not.toContain("NTooltip");
      expect(source, file).not.toContain('trigger="hover"');
    }

    expect(read("src/App.vue")).toContain("handleGuideFocus");
    expect(read("src/App.vue")).not.toContain("GUIDE_REPEAT_CHANCE");
  });

  it("does not apply the panel border class to split text panels", () => {
    const textPanel = read("src/components/TextPanel.vue");
    const styles = read("src/styles.css");

    expect(textPanel).not.toContain('class="panel text-panel"');
    expect(textPanel).toContain("textPanelClasses");
    expect(styles).toContain(".text-panel");
  });

  it("keeps image preview actions and companion bubble above the preview layer", () => {
    const preview = read("src/components/ImagePreview.vue");
    const styles = read("src/styles.css");
    const i18n = read("src/state/i18n.ts");

    expect(preview).toContain("@contextmenu.prevent");
    expect(preview).toContain(':mask-closable="false"');
    expect(preview).not.toContain('@click.self="requestClose"');
    expect(preview).toContain("preview-toolbar-button");
    expect(preview).not.toContain("preview-close-button");
    expect(preview).not.toContain("preview-nav-stack");
    expect(preview).not.toContain("preview-action-close");
    expect(preview).toContain("preview-nav-button");
    expect(preview).toContain("preview-zoom-button");
    expect(preview).toContain("is-delete");
    expect(preview).toContain('emit("navigate"');
    expect(preview).not.toContain('WHEEL_NAVIGATION_INITIAL_DELAY_MS');
    expect(preview).not.toContain('WHEEL_NAVIGATION_MIN_DELAY_MS');
    expect(preview).toContain("function requestClose");
    expect(preview).toContain("is-closing");
    expect(preview).toContain("uiText.preview.close");
    expect(preview).toContain("uiText.preview.zoomOut");
    expect(preview).toContain("uiText.preview.zoomIn");
    expect(preview).toContain("uiText.preview.previous");
    expect(preview).toContain("uiText.preview.next");
    expect(preview).not.toContain("uiText.common.copy");
    expect(preview).toContain("uiText.common.delete");
    expect(i18n).toContain("取消预览");
    expect(i18n).toContain("缩小图片");
    expect(i18n).toContain("放大图片");
    expect(preview).toContain('@keydown="handleKeydown"');
    expect(preview).toContain("@selectstart.prevent");
    expect(preview).toContain("NDropdown");
    expect(preview).toContain("openMenu");
    expect(preview).toContain('@contextmenu.prevent="openMenu($event, active.id)"');
    expect(preview).toContain('@dblclick.stop.prevent="toggleZoom"');
    expect(preview).not.toContain("@contextmenu.prevent.stop=\"openMenu\"");
    expect(preview).not.toContain("custom-menu");
    expect(preview).not.toContain('id="custom-menu"');
    expect(styles).toMatch(/\.image-preview\s*\{[^}]*top: var\(--image-preview-top, 52px\)/s);
    expect(styles).toMatch(/\.image-preview\s*\{[^}]*left: var\(--image-preview-left, clamp\(220px, 18vw, 320px\)\)/s);
    expect(styles).toMatch(/\.image-preview\s*\{[^}]*right: 0/s);
    expect(styles).toMatch(/\.image-preview\s*\{[^}]*user-select: none/s);
    expect(styles).toMatch(/\.image-preview\s*\{[^}]*-webkit-user-select: none/s);
    expect(styles).not.toMatch(/\.image-preview\s*\{[^}]*width: 90vw/s);
    expect(styles).toContain("backdrop-filter");
    expect(styles).toMatch(/\.image-preview\s*\{[^}]*background: rgba\(255, 255, 255/s);
    expect(styles).toMatch(/html\[data-theme="dark"\] \.image-preview\s*\{[^}]*background: rgba\(0, 0, 0/s);
    expect(styles).toContain("-webkit-backdrop-filter");
    expect(styles).toMatch(/\.image-preview\s*\{[^}]*z-index: 4300/s);
    expect(styles).toMatch(/\.image-preview\s*\{[^}]*animation: image-preview-in 120ms/s);
    expect(styles).toContain("@keyframes image-preview-photo-in");
    expect(styles).toContain(".preview-actions");
    expect(styles).toContain(".preview-toolbar-button");
    expect(styles).not.toContain(".preview-close-button");
    expect(styles).not.toContain(".preview-nav-stack");
    expect(styles).toContain(".preview-nav-button");
    expect(styles).toMatch(/\.preview-actions\s*\{[^}]*display: inline-flex/s);
    expect(styles).toMatch(/\.preview-actions\s*\{[^}]*border-radius: 999px/s);
    expect(styles).toMatch(/\.preview-actions\s*\{[^}]*backdrop-filter: blur\(28px\) saturate\(1\.75\)/s);
    expect(styles).toMatch(/\.preview-toolbar-button\s*\{[^}]*width: 34px/s);
    expect(styles).toMatch(/\.preview-toolbar-button\s*\{[^}]*height: 34px/s);
    expect(styles).toMatch(/\.preview-toolbar-button\s*\{[^}]*background: transparent/s);
    expect(styles).toMatch(/\.preview-toolbar-button\s*\{[^}]*opacity: 0\.76/s);
    expect(styles).toMatch(/\.preview-toolbar-button:disabled\s*\{[^}]*opacity: 0\.22/s);
    expect(styles).toMatch(/\.preview-toolbar-button:disabled\s*\{[^}]*cursor: default/s);
    expect(styles).toMatch(/\.preview-nav-button\.is-previous:active\s*\{[^}]*transform: translateY\(-3px\)/s);
    expect(styles).toMatch(/\.preview-nav-button\.is-next:active\s*\{[^}]*transform: translateY\(3px\)/s);
    expect(styles).toMatch(/\.preview-stage img\s*\{[^}]*max-height: calc\(100vh - var\(--image-preview-top, 52px\) - 96px\)/s);
    expect(styles).toMatch(/\.preview-stage img\s*\{[^}]*transition: transform 180ms cubic-bezier\(0\.2, 0, 0, 1\)/s);
    expect(styles).toContain(`@keyframes image-preview-photo-out {
  from {
    opacity: 1;
  }

  to {
    opacity: 0;
  }
}`);
    expect(styles).toMatch(/body:has\(\.image-preview\) \.image-panel \.n-scrollbar\s*\{[^}]*pointer-events: auto/s);
    expect(styles).toMatch(/\.focus-companion\s*\{[^}]*z-index: 4400/s);
  });

  it("reuses the normal image list while previewing on the right side", () => {
    const image = read("src/components/ImagePanel.vue");
    const preview = read("src/components/ImagePreview.vue");
    const styles = read("src/styles.css");

    expect(image).toContain("activePreviewId");
    expect(image).toContain("'is-active': image.id === activePreviewId");
    expect(preview).not.toContain('class="image-list preview-image-list"');
    expect(preview).not.toContain('class="image-card preview-thumb"');
    expect(preview).not.toContain("preview-sidebar");
    expect(styles).not.toContain(".preview-thumb");
    expect(styles).not.toContain(".preview-sidebar");
    expect(styles).toMatch(/\.image-panel \.image-card\.is-active\s*\{[^}]*border-color: var\(--line-focus\)/s);
    expect(styles).toMatch(/\.image-panel \.image-card\.is-active\s*\{[^}]*box-shadow: none/s);
  });

  it("marks text quick buttons with a copy icon and keeps compact actions in menus", () => {
    const quick = read("src/components/QuickButtons.vue");
    const app = read("src/App.vue");
    const settings = read("src/components/SettingsMenu.vue");
    const todo = read("src/components/TodoPanel.vue");
    const styles = read("src/styles.css");
    const i18n = read("src/state/i18n.ts");

    expect(quick).toContain("CopyOutline");
    expect(quick).toContain("quick-menu-button");
    expect(quick).toContain("uiText.quick.menu");
    expect(quick).toContain("uiText.value.quick.showHidden");
    expect(quick).toContain("uiText.value.quick.hideHidden");
    expect(i18n).toContain("快捷动作菜单");
    expect(quick).toContain("EyeOutline");
    expect(quick).toContain("EyeOffOutline");
    expect(quick).toContain("quick-button-icon");
    expect(app).toContain("WorkbenchShell");
    expect(app).toContain('data-testid="save-status"');
    expect(app).toContain("SunnyOutline");
    expect(app).toContain("MoonOutline");
    expect(todo).toContain("todo-section-menu-button");
    expect(todo).toContain("uiText.todo.menu");
    expect(todo).toContain("uiText.value.todo.clearCompleted");
    expect(todo).toContain("TrashOutline");
    expect(settings).toContain("NIcon");
    expect(settings).toContain("NBadge");
    expect(settings).toContain("SettingsOutline");
    expect(settings).not.toContain("⚙");
    expect(settings).not.toContain("circle");
    expect(settings).not.toContain("settings-wrap");
    expect(quick).not.toContain(">+</NButton>");
    expect(todo).not.toContain("↘");
    expect(styles).toMatch(/\.settings-btn\s*\{[^}]*border-radius: 50%/s);
    expect(styles).toMatch(/\.workbench-command-actions\s*\{[^}]*gap: 8px/s);
  });

  it("keeps header text unboxed while header controls use rounded soft edges", () => {
    const styles = read("src/styles.css");

    expect(styles).toMatch(/\.panel-header,[\s\S]*?\.todo-heading\s*\{[^}]*align-items: stretch/s);
    expect(styles).toMatch(/\.panel-header,[\s\S]*?\.todo-heading\s*\{[^}]*gap: 0/s);
    expect(styles).toMatch(/\.panel-header,[\s\S]*?\.todo-heading\s*\{[^}]*padding: 0 8px 0 10px/s);
    expect(styles).toMatch(/\.panel-header,[\s\S]*?\.todo-heading\s*\{[^}]*border-bottom: 0/s);
    expect(styles).toMatch(/\.panel-header,[\s\S]*?\.todo-heading\s*\{[^}]*box-shadow: inset 0 -1px color-mix\(in srgb, var\(--border\) 55%, transparent\)/s);
    expect(styles).toMatch(/\.panel-header,[\s\S]*?\.todo-heading\s*\{[^}]*background: color-mix\(in srgb, var\(--card\) 96%, var\(--muted-surface\)\)/s);
    expect(styles).toMatch(/\.panel-header > h1,[\s\S]*?\.todo-heading > h3\s*\{[^}]*border: 0/s);
    expect(styles).toMatch(/\.panel-header > \.count,[\s\S]*?\.todo-heading-actions \.todo-count\s*\{[^}]*border: 0/s);
    expect(styles).toMatch(/\.header-actions,[\s\S]*?\.todo-heading-actions\s*\{[^}]*align-self: stretch/s);
    expect(styles).toMatch(/\.header-actions,[\s\S]*?\.todo-heading-actions\s*\{[^}]*gap: 0/s);
    expect(styles).toMatch(/\.quick-menu-button,[\s\S]*?\.todo-section-menu-button\s*\{[^}]*width: 34px/s);
    expect(styles).toMatch(/\.quick-menu-button,[\s\S]*?\.todo-section-menu-button\s*\{[^}]*height: 34px/s);
    expect(styles).toMatch(/\.quick-menu-button,[\s\S]*?\.todo-section-menu-button\s*\{[^}]*border: 0/s);
    expect(styles).toMatch(/\.quick-menu-button,[\s\S]*?\.todo-section-menu-button\s*\{[^}]*margin: 0 0 0 2px/s);
    expect(styles).toMatch(/\.quick-menu-button,[\s\S]*?\.todo-section-menu-button\s*\{[^}]*border-radius: 50%/s);
    expect(styles).toMatch(/button\.quick-menu-button,[\s\S]*?button\.todo-section-menu-button\s*\{[^}]*background: transparent/s);
    expect(styles).toMatch(/\.quick-menu-button:hover,[\s\S]*?\.todo-section-menu-button:focus-visible\s*\{[^}]*background: transparent/s);
  });

  it("styles configurable reminder list controls and compact collapsed states", () => {
    const todo = read("src/components/TodoPanel.vue");
    const styles = read("src/styles.css");

    expect(todo).not.toContain("todo-add-list-button");
    expect(todo).toContain("todo-list-drag-handle");
    expect(todo).toContain("todo-collapse-button");
    expect(todo).toContain("todo-list-create-dialog");
    expect(todo).toContain('class="todo-list-shell"');
    expect(todo).toContain(":class=\"{ 'is-hidden': list.collapsed }\"");
    expect(todo).toContain("is-collapsed");
    expect(todo).toContain("is-compact");
    expect(styles).toMatch(/\.todo-collapse-button\s*\{[^}]*height: 34px/s);
    expect(styles).toMatch(/\.todo-collapse-button\s*\{[^}]*background: transparent/s);
    expect(styles).toMatch(/\.todo-collapse-button:hover,[\s\S]*?\.todo-collapse-button:focus-visible\s*\{[^}]*background: transparent/s);
    expect(styles).toMatch(/\.todo-collapse-button \.n-icon\s*\{[^}]*transition: transform var\(--motion-medium\) var\(--motion-ease\)/s);
    expect(styles).toMatch(/\.todo-list-create-dialog\s*\{[^}]*width: 260px/s);
    expect(styles).toMatch(/\.todo-list-drag-handle\s*\{[^}]*display: none/s);
    expect(styles).toMatch(/\.todo-section\.is-collapsed\s*\{[^}]*flex: 0 0 34px/s);
    expect(styles).toMatch(/\.todo-section\.is-compact\.is-collapsed\s*\{[^}]*flex: 0 0 34px/s);
    expect(styles).toMatch(/\.todo-section\.is-compact\s*\{[^}]*flex: 1 1 0/s);
    expect(styles).toMatch(/\.todo-section\.is-compact \.todo-list\s*\{[^}]*overflow-y: auto/s);
    expect(styles).toMatch(/\.todo-list-shell\s*\{[^}]*overflow: hidden/s);
    expect(styles).toMatch(/\.todo-section\.is-compact \.todo-empty-hint\s*\{[^}]*min-height: 90px/s);
    expect(styles).toMatch(/\.todo-section\.is-compact \.todo-star-button\s*\{[^}]*height: 26px/s);
  });

  it("keeps workbench save status as a compact interactive dot", () => {
    const styles = read("src/styles.css");

    expect(styles).not.toContain(".top-actions");
    expect(styles).toMatch(/\.workbench-main\s*\{[^}]*grid-template-rows: 52px minmax\(0, 1fr\)/s);
    expect(styles).toMatch(/@media \(max-width: 1180px\)\s*\{[\s\S]*?\.workbench-grid\s*\{[^}]*grid-template-rows: repeat\(2, minmax\(0, 1fr\)\)/s);
    expect(styles).toMatch(/@media \(max-width: 1180px\)\s*\{[\s\S]*?\.workbench-resizer\s*\{[^}]*display: none/s);
    expect(styles).toMatch(/\.workbench-title-group \.save-status\s*\{[^}]*cursor: pointer/s);
    expect(styles).toMatch(/\.save-status\s*\{[^}]*height: 30px/s);
    expect(styles).toMatch(/\.save-status\s*\{[^}]*width: 34px/s);
    expect(styles).toMatch(/\.save-status\s*\{[^}]*min-width: 34px/s);
    expect(styles).toMatch(/\.save-status::before\s*\{[^}]*border-radius: 999px/s);
    expect(styles).toMatch(/\.save-status::before\s*\{[^}]*background-color: #22c55e/s);
    expect(styles).toMatch(/\.save-status::before\s*\{[^}]*transition:[^}]*background-color var\(--motion-fast\) ease/s);
    expect(styles).toMatch(/\.save-status\[data-state="dirty"\]::before\s*\{[^}]*animation: none/s);
    expect(styles).toMatch(/\.save-status\[data-state="saved"\]::before\s*\{[^}]*animation: none/s);
    expect(styles).toMatch(/\.save-status\[data-state="dirty"\]::before\s*\{[^}]*background-color: #ef4444/s);
    expect(styles).toMatch(/\.save-status\[data-state="saved"\]::before\s*\{[^}]*background-color: #22c55e/s);
    expect(styles).toMatch(/\.save-status\[data-state="saving"\]::before\s*\{[^}]*animation: save-status-pulse/s);
  });

  it("keeps the companion GIF unframed within a 50px box", () => {
    const styles = read("src/styles.css");

    expect(styles).toContain(".focus-companion img");
    expect(styles).toMatch(/\.focus-companion img\s*\{[^}]*max-width: 50px/s);
    expect(styles).toMatch(/\.focus-companion img\s*\{[^}]*max-height: 50px/s);
    expect(styles).toMatch(/\.focus-companion img\s*\{[^}]*width: auto/s);
    expect(styles).toMatch(/\.focus-companion img\s*\{[^}]*height: auto/s);
    expect(styles).not.toContain("aspect-ratio: 1 / 1");
    expect(styles).toContain("object-fit: contain");
    expect(styles).toMatch(/\.focus-companion img\s*\{[^}]*border: 0/s);
  });

  it("keeps typography and confirmation actions compact but readable", () => {
    const styles = read("src/styles.css");

    expect(styles).toContain("--app-font-size: 12px");
    expect(styles).toMatch(/body\s*\{[^}]*font-size: 12px/s);
    expect(styles).toMatch(/h1,[\s\S]*?h2\s*\{[^}]*font-size: var\(--app-font-size\)/s);
    expect(styles).toMatch(/\.count,[\s\S]*?\.todo-count\s*\{[^}]*font-size: var\(--app-font-size\)/s);
    expect(styles).toMatch(/\.today-focus-heading\s*\{[^}]*font-size: var\(--app-font-size\)/s);
    expect(styles).toMatch(/\.today-focus-heading\s*\{[^}]*color: inherit/s);
    expect(styles).toMatch(/\.today-focus-heading\s*\{[^}]*font-weight: 600/s);
    expect(styles).toMatch(/\.text-editor-textarea\s*\{[^}]*font-size: var\(--app-font-size\)/s);
    expect(styles).toMatch(/\.quick-button\s*\{[^}]*font-size: var\(--app-font-size\)/s);
    expect(styles).toMatch(/\.icon-button\s*\{[^}]*font-size: var\(--app-font-size\)/s);
    expect(styles).toMatch(/\.space-tabs\s*\{[^}]*font-size: var\(--app-font-size\)/s);
    expect(styles).toMatch(/\.space-tab\s*\{[^}]*font-size: var\(--app-font-size\)/s);
    expect(styles).toMatch(/\.todo-item\s*\{[^}]*font-size: var\(--app-font-size\)/s);
    expect(styles).toMatch(/\.today-focus-item\s*\{[^}]*font-size: var\(--app-font-size\)/s);
    expect(styles).toMatch(/\.todo-star-button\s*\{[^}]*font-size: 12px/s);
    expect(styles).toMatch(/\.todo-input\s*\{[^}]*font-size: var\(--app-font-size\)/s);
    expect(styles).toMatch(/\.today-focus-input\s*\{[^}]*font-size: var\(--app-font-size\)/s);
    expect(styles).toMatch(/\.todo-completed-divider\s*\{[^}]*font-size: var\(--app-font-size\)/s);
    expect(styles).toMatch(/\.n-input,[\s\S]*?\.n-card\s*\{[^}]*font-size: var\(--app-font-size\)/s);
    expect(styles).toMatch(/\.companion-actions \.n-button\s*\{[^}]*min-width: 64px/s);
  });

  it("keeps scrollbars and buttons in the simple line UI style", () => {
    const styles = read("src/styles.css");

    expect(styles).toContain("scrollbar-width: thin");
    expect(styles).toContain("--scrollbar-size: 2px");
    expect(styles).toMatch(/\*::-webkit-scrollbar\s*\{[^}]*width: var\(--scrollbar-size\)/s);
    expect(styles).toMatch(/\*::-webkit-scrollbar\s*\{[^}]*height: var\(--scrollbar-size\)/s);
    expect(styles).toContain("::-webkit-scrollbar-thumb");
    expect(styles).toMatch(/button\s*\{[^}]*background: transparent/s);
    expect(styles).toMatch(/\.n-button,[\s\S]*?\.n-checkbox-box\s*\{[^}]*--n-border-radius: var\(--radius\)/s);
    expect(styles).toMatch(/\.n-base-wave\s*\{[^}]*display: none/s);
  });

  it("keeps empty area hit targets unframed", () => {
    const styles = read("src/styles.css");
    const emptyHintRule = styles.match(/\.empty-hint\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";
    const todoEmptyHintRule = styles.match(/\.todo-empty-hint\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";

    expect(emptyHintRule).not.toContain("border");
    expect(todoEmptyHintRule).not.toContain("border");
    expect(styles).not.toContain("1px dashed var(--line-section)");
  });

  it("keeps visible border widths thin", () => {
    const styles = read("src/styles.css");
    const visibleBorderWidths = [...styles.matchAll(/(?:border(?:-(?:top|right|bottom|left))?|--n-border(?:-[a-z]+)?):[^;{}]*?(\d+(?:\.\d+)?)px/g)]
      .map((match) => Number(match[1]))
      .filter((width) => width > 0);

    expect(visibleBorderWidths.length).toBeGreaterThan(0);
    expect(visibleBorderWidths.every((width) => width === 1 || width === 0.5)).toBe(true);
  });

  it("keeps bordered controls and popup surfaces aligned to shared radius tokens", () => {
    const styles = read("src/styles.css");

    expect(styles).toMatch(/button:not\(\[data-slot="button"\]\)\s*\{[^}]*border: 0/s);
    expect(styles).toMatch(/button:not\(\[data-slot="button"\]\)\s*\{[^}]*border-radius: var\(--radius\)/s);
    expect(styles).toMatch(/input,[\s\S]*?textarea\s*\{[^}]*border-radius: var\(--radius\)/s);
    expect(styles).toMatch(/\.n-button,[\s\S]*?\.n-dropdown-menu,[\s\S]*?\.n-checkbox-box\s*\{[^}]*border-radius: var\(--radius\)/s);
    expect(styles).toMatch(/\.n-button \.n-button__border,[\s\S]*?\.n-button \.n-button__state-border\s*\{[^}]*border-radius: var\(--radius\)/s);
    expect(styles).toMatch(/\.quick-button\s*\{[^}]*border-radius: var\(--radius\)/s);
    expect(styles).toMatch(/\.space-tab\s*\{[^}]*border-radius: var\(--radius\)/s);
    expect(styles).toMatch(/\.todo-item\s*\{[^}]*border-radius: var\(--radius\)/s);
    expect(styles).toMatch(/\.image-card\s*\{[^}]*border-radius: var\(--radius\)/s);
    expect(styles).toMatch(/\.image-card\s*\{[^}]*border: 1px solid color-mix\(in srgb, var\(--border\) 64%, transparent\)/s);
    expect(styles).not.toContain(".notify-clock-options");
    expect(styles).not.toContain(".notify-clock-button");
  });

  it("renders context menus as bordered surfaces above companion bubbles", () => {
    const styles = read("src/styles.css");
    const contextMenu = read("src/utils/contextMenu.ts");
    const companion = read("src/components/CompanionBubble.vue");
    const dropdownFiles = [
      "src/components/EditableTitle.vue",
      "src/components/TextPanel.vue",
      "src/components/TodoPanel.vue",
      "src/components/QuickButtons.vue",
      "src/components/ImagePanel.vue",
      "src/components/ImagePreview.vue",
      "src/components/SpacePanel.vue",
    ];

    expect(styles).toMatch(/\.n-dropdown-menu,[\s\S]*?\.shortcut-help-modal\.n-card\s*\{[^}]*border: 1px solid var\(--border\) !important/s);
    expect(styles).toMatch(/\.n-dropdown-menu,[\s\S]*?\.shortcut-help-modal\.n-card\s*\{[^}]*background: var\(--popover\) !important/s);
    expect(styles).toMatch(/\.n-dropdown-menu,[\s\S]*?\.shortcut-help-modal\.n-card\s*\{[^}]*color: var\(--popover-foreground\) !important/s);
    expect(styles).toMatch(/\.n-dropdown-menu,[\s\S]*?\.shortcut-help-modal\.n-card\s*\{[^}]*box-shadow: 0 6px 14px rgba\(15, 23, 42, 0\.045\) !important/s);
    expect(contextMenu).toContain("export const CONTEXT_MENU_Z_INDEX = 3400");
    expect(companion).toContain(':z-index="3300"');
    for (const file of dropdownFiles) {
      const source = read(file);
      expect(source, file).toContain("CONTEXT_MENU_Z_INDEX");
      expect(source, file).toContain(':z-index="CONTEXT_MENU_Z_INDEX"');
    }
  });

  it("keeps the shortcut help close button circular before and during hover", () => {
    const styles = read("src/styles.css");

    expect(styles).toMatch(/\.shortcut-help-modal\s*\{[^}]*max-width: 620px/s);
    expect(styles).toMatch(/body:has\(\.image-preview\) \.shortcut-help-modal\.n-card\s*\{[^}]*pointer-events: auto/s);
    expect(styles).toMatch(/body:has\(\.image-preview\) \.shortcut-help-modal\.n-card\s*\{[^}]*user-select: text/s);
    expect(styles).toMatch(/body:has\(\.image-preview\) \.shortcut-help-modal \.n-scrollbar\s*\{[^}]*pointer-events: auto/s);
    expect(styles).toMatch(/\.shortcut-section\s*\{[^}]*border: 1px solid color-mix\(in srgb, var\(--border\) 74%, transparent\)/s);
    expect(styles).toMatch(/\.shortcut-section-heading\s*\{[^}]*grid-template-columns: 26px minmax\(0, 1fr\)/s);
    expect(styles).toMatch(/\.shortcut-tip-list\s*\{[^}]*display: grid/s);
    expect(styles).toMatch(/\.shortcut-grid\s*\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/s);
    expect(styles).toMatch(/\.shortcut-help-modal \.n-base-close\s*\{[^}]*width: 30px/s);
    expect(styles).toMatch(/\.shortcut-help-modal \.n-base-close\s*\{[^}]*height: 30px/s);
    expect(styles).toMatch(/\.shortcut-help-modal \.n-base-close\s*\{[^}]*border-radius: 50% !important/s);
    expect(styles).toMatch(/\.shortcut-help-modal \.n-base-close:hover\s*\{[^}]*width: 30px/s);
    expect(styles).toMatch(/\.shortcut-help-modal \.n-base-close:hover\s*\{[^}]*height: 30px/s);
    expect(styles).toMatch(/\.shortcut-help-modal \.n-base-close:hover\s*\{[^}]*border-radius: 50% !important/s);
    expect(styles).toMatch(/\.shortcut-help-modal \.n-base-close \.n-base-close__state-border[\s\S]*?\.shortcut-help-modal \.n-base-close \.n-base-close__border\s*\{[^}]*display: none/s);
  });

  it("uses row Naive date pickers for notification time editing", () => {
    const todo = read("src/components/TodoPanel.vue");
    const styles = read("src/styles.css");
    const i18n = read("src/state/i18n.ts");

    expect(todo).toContain("NDatePicker");
    expect(todo).toContain('type="date"');
    expect(todo).toContain('format="yyyy-MM-dd"');
    expect(todo).toContain(':actions="[]"');
    expect(todo).toContain("NOTIFY_HOURS");
    expect(todo).toContain("NOTIFY_MINUTES");
    expect(todo).toContain("updateNotifyPickerTime");
    expect(todo).toContain("scrollNotifyTimePickerActiveItems");
    expect(todo).toContain("active.offsetTop - column.offsetTop");
    expect(todo).not.toContain("handleNotifyPickerWheel");
    expect(todo).not.toContain('@wheel="handleNotifyPickerWheel"');
    expect(todo).not.toMatch(/<button[\s\S]{0,160}class="notify-time-option"/);
    expect(todo).toMatch(/<div[\s\S]{0,160}class="notify-time-option"/);
    expect(todo).toContain('<Teleport to="body">');
    expect(todo).toContain("notify-floating-date-picker");
    expect(todo).toContain("panel");
    expect(todo).not.toContain(':to="false"');
    expect(todo).not.toContain(':show="isNotifyPickerShown');
    expect(todo).toContain('@update:value="updateNotifyPickerDraft"');
    expect(todo).toContain("confirmCurrentNotifyPicker");
    expect(todo).toContain("setNotifyPickerDraftToToday");
    expect(todo).toContain("clearNotifyPicker");
    expect(todo).toContain("notify-time-column is-hour");
    expect(todo).toContain("notify-time-column is-minute");
    expect(todo).toContain("uiText.todo.clear");
    expect(todo).toContain("uiText.todo.today");
    expect(i18n).toContain('clear: "清除"');
    expect(i18n).toContain('today: "今天"');
    expect(todo).not.toContain('此刻');
    expect(todo).toContain("uiText.common.confirm");
    expect(todo).toContain("notify-panel-action is-confirm");
    expect(todo).not.toContain('class="deadline-editor notify-editor"');
    expect(todo).not.toContain("notify-calendar-grid");
    expect(todo).not.toContain("notify-clock-options");
    expect(styles).toMatch(/\.notify-floating-date-picker\s*\{[^}]*position: fixed/s);
    expect(styles).toMatch(/\.notify-floating-date-picker\s*\{[^}]*border: 0/s);
    expect(styles).toMatch(/\.notify-floating-date-picker\s*\{[^}]*border-radius: var\(--radius\)/s);
    expect(styles).toMatch(/\.notify-floating-date-picker\s*\{[^}]*box-shadow: 0 8px 22px rgba\(15, 23, 42, 0\.12\)/s);
    expect(styles).toMatch(/\.notify-floating-date-picker\s*\{[^}]*padding-top: 8px/s);
    expect(styles).toMatch(/\.notify-floating-date-picker\s*\{[^}]*--notify-date-column-width: 332px/s);
    expect(styles).toMatch(/\.notify-floating-date-picker\s*\{[^}]*--notify-time-column-width: 114px/s);
    expect(styles).toMatch(/\.notify-floating-date-picker\s*\{[^}]*--notify-date-panel-height: 267px/s);
    expect(styles).toMatch(/\.notify-floating-date-picker\s*\{[^}]*grid-template-columns: var\(--notify-date-column-width\) var\(--notify-time-column-width\)/s);
    expect(styles).toMatch(/\.notify-time-columns\s*\{[^}]*grid-template-columns: 1fr 1fr/s);
    expect(styles).toMatch(/\.notify-time-column\s*\{[^}]*overflow-y: auto/s);
    expect(styles).toMatch(/\.notify-time-column\s*\{[^}]*overscroll-behavior: contain/s);
    expect(styles).toMatch(/\.notify-time-panel\s*\{[^}]*border-radius: var\(--radius\)/s);
    expect(styles).toMatch(/\.notify-time-panel\s*\{[^}]*align-self: stretch/s);
    expect(styles).toMatch(/\.notify-time-panel\s*\{[^}]*height: var\(--notify-date-panel-height\)/s);
    expect(styles).toMatch(/\.notify-time-panel\s*\{[^}]*overflow: hidden/s);
    expect(styles).not.toMatch(/\.notify-time-panel\s*\{[^}]*border-left/s);
    expect(styles).toMatch(/\.notify-time-columns\s*\{[^}]*flex: 1/s);
    expect(styles).not.toMatch(/\.notify-time-columns\s*\{[^}]*height: 168px/s);
    expect(styles).toMatch(/\.notify-time-column\s*\{[^}]*-webkit-overflow-scrolling: touch/s);
    expect(styles).toMatch(/\.notify-panel-actions\s*\{[^}]*justify-content: flex-end/s);
    expect(styles).toMatch(/\.notify-panel-action\.is-confirm\s*\{[^}]*color: #18a058/s);
    expect(styles).toMatch(/\.notify-panel-action\.is-confirm\s*\{[^}]*background: var\(--button\)/s);
    expect(styles).toMatch(/\.todo-notify-button\s*\{[^}]*align-items: center/s);
    expect(styles).not.toContain(".notify-editor");
    expect(styles).not.toContain(".deadline-editor-actions");
  });

  it("uses Naive scrollbars while reminder text stays in native inputs", () => {
    const scrollbarSources = [
      "src/components/ImagePanel.vue",
      "src/components/QuickButtons.vue",
      "src/components/SpacePanel.vue",
      "src/components/TextPanel.vue",
      "src/components/TodoPanel.vue",
    ];

    for (const file of scrollbarSources) {
      expect(read(file), file).toContain("NScrollbar");
    }

    const todo = read("src/components/TodoPanel.vue");
    const preview = read("src/components/ImagePreview.vue");
    expect(preview).not.toContain("NScrollbar");
    expect(todo).not.toContain("NEllipsis");
    expect(todo).not.toContain("todo-text-ellipsis");
    expect(todo).toContain('class="todo-input"');
    expect(todo).toContain('class="today-focus-input"');
  });

  it("keeps editable text copy/paste while todo item menus stay concise", () => {
    const text = read("src/components/TextPanel.vue");
    const todo = read("src/components/TodoPanel.vue");
    const i18n = read("src/state/i18n.ts");

    expect(text).toContain("copyTextSelection");
    expect(text).toContain("pasteTextFromClipboard");
    expect(text).toContain("uiText.value.common.copy");
    expect(text).toContain("uiText.value.common.paste");
    expect(todo).toContain("copyTodoText");
    expect(todo).toContain("uiText.value.common.copy");
    expect(todo).toContain("uiText.value.todo.setNotify");
    expect(todo).toContain("uiText.value.todo.editNotify");
    expect(todo).toContain("uiText.value.common.delete");
    expect(i18n).toContain("设置通知时间");
  });

  it("keeps blank reminder hints outside the moving todo transition list", () => {
    const todo = read("src/components/TodoPanel.vue");
    const todoMoveBlock = todo.match(/<TransitionGroup\s+name="todo-move"[\s\S]*?<\/TransitionGroup>/)?.[0] ?? "";

    expect(todoMoveBlock).not.toContain('v-if="listEntries[list.id].length === 0"');
    expect(todo).toContain('v-if="listEntries[list.id].length === 0"');
    expect(todo).toContain('v-else');
  });

  it("uses a clear separated drag handle for reminder rows", () => {
    const todo = read("src/components/TodoPanel.vue");
    const styles = read("src/styles.css");

    expect(todo).toContain('class="todo-drag-handle"');
    expect(todo).not.toMatch(/class="todo-item"[\s\S]{0,160}draggable="true"/);
    expect(styles).toMatch(/\.todo-item\s*\{[^}]*grid-template-columns: 22px 32px minmax\(0, 1fr\) 26px 26px/s);
    expect(styles).toMatch(/\.todo-item\.has-notify\s*\{[^}]*grid-template-columns: 22px 32px minmax\(0, 1fr\) minmax\(0, 64px\) 26px/s);
    expect(styles).toMatch(/\.todo-list\s*\{[^}]*padding: 0/s);
    expect(styles).toMatch(/\.todo-item\s*\{[^}]*height: 34px/s);
    expect(styles).toMatch(/\.todo-item\s*\{[^}]*min-height: 34px/s);
    expect(styles).toMatch(/\.todo-item\s*\{[^}]*padding: 0/s);
    expect(styles).toMatch(/\.todo-item\s*\{[^}]*position: relative/s);
    expect(styles).toMatch(/\.todo-item\s*\{[^}]*border-bottom: 0/s);
    expect(styles).toMatch(/\.todo-item::after\s*\{[^}]*left: 6px/s);
    expect(styles).toMatch(/\.todo-item::after\s*\{[^}]*right: 6px/s);
    expect(styles).toMatch(/\.todo-item::after\s*\{[^}]*border-bottom: 1px solid var\(--border\)/s);
    expect(styles).toMatch(/\.todo-list \.todo-item:last-child\s*\{[^}]*margin-bottom: 8px/s);
    expect(styles).toMatch(/\.todo-drag-handle\s*\{[^}]*width: 18px/s);
    expect(styles).toMatch(/\.todo-drag-handle\s*\{[^}]*opacity: 0\.28/s);
    expect(styles).toContain(".todo-drag-handle::before");
    expect(styles).toContain(".todo-deadline-label");
    expect(styles).toContain(".deadline-overdue");
    expect(styles).toContain(".deadline-due-soon");
    expect(styles).toContain(".deadline-upcoming");
    expect(styles).toContain(".deadline-later");
    expect(styles).toMatch(/\.todo-item\.deadline-overdue:not\(\.is-done\) \.todo-input,[\s\S]*?\.deadline-overdue:not\(\.is-done\) \.todo-deadline-label\s*\{[^}]*color: var\(--danger\)/s);
    expect(styles).toMatch(/\.todo-item\.deadline-overdue:not\(\.is-done\) \.todo-input,[\s\S]*?\.today-focus-item\.deadline-overdue:not\(\.is-done\) \.today-focus-input\s*\{[^}]*animation: none/s);
    expect(styles).toMatch(/\.todo-deadline-label\s*\{[^}]*overflow: visible/s);
    expect(styles).not.toMatch(/\.todo-deadline-label\s*\{[^}]*text-overflow: ellipsis/s);
    expect(styles).not.toContain("filter: drop-shadow");
  });

  it("keeps today focus reminder rows aligned to the same one-line grid", () => {
    const todo = read("src/components/TodoPanel.vue");
    const styles = read("src/styles.css");

    const todayFocusTemplate = todo.match(/class="today-focus-item"[\s\S]*?<\/li>/)?.[0] ?? "";

    expect(todo).toContain('"today-focus-title"');
    expect(todo).toContain(":value=\"titles[todayFocusTitleId]\"");
    expect(todo).not.toContain("@drop.stop=\"dragged && emit('move', dragged, item.period, item.todo.id)\"");
    expect(todayFocusTemplate).not.toContain('class="todo-drag-handle"');
    expect(todayFocusTemplate).not.toContain("dragstart");
    expect(styles).toMatch(/\.today-focus-section\s*\{[^}]*border-top: 0/s);
    expect(styles).toMatch(/\.today-focus-section\s*\{[^}]*border-bottom: 0/s);
    expect(styles).toMatch(/\.today-focus-section\s*\{[^}]*border-left: 0/s);
    expect(styles).toMatch(/\.today-focus-section\s*\{[^}]*border-right: 0/s);
    expect(styles).toMatch(/\.today-focus-section\s*\{[^}]*box-shadow: none/s);
    expect(styles).toMatch(/\.today-focus-heading\s*\{[^}]*min-height: 34px/s);
    expect(styles).toMatch(/\.today-focus-heading\s*\{[^}]*border-bottom: 0\.5px solid var\(--line-section\)/s);
    expect(styles).toMatch(/\.today-focus-heading\s*\{[^}]*box-shadow: none/s);
    expect(styles).toMatch(/\.today-focus-list\s*\{[^}]*padding: 0/s);
    expect(styles).toMatch(/\.today-focus-item\s*\{[^}]*grid-template-columns: 42px minmax\(0, 1fr\) 26px 26px/s);
    expect(styles).toMatch(/\.today-focus-item\.has-notify\s*\{[^}]*grid-template-columns: 42px minmax\(0, 1fr\) minmax\(0, 64px\) 26px/s);
    expect(styles).toMatch(/\.today-focus-item \.todo-notify-button\s*\{[^}]*grid-column: 3/s);
    expect(styles).toMatch(/\.today-focus-item\s*\{[^}]*gap: 0/s);
    expect(styles).toMatch(/\.today-focus-item\s*\{[^}]*height: 34px/s);
    expect(styles).toMatch(/\.today-focus-item\s*\{[^}]*min-height: 34px/s);
    expect(styles).toMatch(/\.today-focus-item\s*\{[^}]*padding: 0/s);
    expect(styles).toMatch(/\.today-focus-item\s*\{[^}]*position: relative/s);
    expect(styles).toMatch(/\.today-focus-item\s*\{[^}]*border-bottom: 0/s);
    expect(styles).toMatch(/\.today-focus-item::after,[\s\S]*?\.todo-item::after\s*\{[^}]*left: 6px/s);
    expect(styles).toMatch(/\.today-focus-item::after,[\s\S]*?\.todo-item::after\s*\{[^}]*right: 6px/s);
    expect(styles).toMatch(/\.today-focus-item:last-child::after\s*\{[^}]*display: none/s);
    expect(styles).toMatch(/\.today-focus-section \+ \.todo-sections \.todo-section:first-child \.todo-heading\s*\{[^}]*border-top: 1px solid var\(--line-section\)/s);
    expect(styles).toMatch(/\.todo-item \.n-checkbox\s*\{[^}]*justify-self: center/s);
    expect(styles).toMatch(/\.today-focus-item \.n-checkbox\s*\{[^}]*justify-self: start/s);
    expect(styles).toMatch(/\.today-focus-item \.n-checkbox\s*\{[^}]*margin-left: 20px/s);
    expect(styles).toMatch(/\.today-focus-input\s*\{[^}]*height: 34px/s);
  });

  it("only reveals unstarred reminder star buttons on hover while starred buttons stay visible", () => {
    const todo = read("src/components/TodoPanel.vue");
    const styles = read("src/styles.css");
    const starRule = styles.match(/\.todo-star-button\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";

    expect(todo).toContain(":class=\"{ 'is-starred': entry.todo.starred }\"");
    expect(starRule).toContain("opacity: 0");
    expect(starRule).toContain("pointer-events: none");
    expect(styles).toContain(".todo-item:hover .todo-star-button");
    expect(styles).not.toContain(".todo-item:focus-within .todo-star-button");
    expect(styles).not.toContain(".today-focus-item:focus-within .todo-star-button");
    expect(styles).toContain(".todo-star-button:focus-visible");
    expect(styles).toContain(".todo-star-button.is-starred");
    expect(styles).toMatch(/\.todo-star-button\.is-starred\s*\{[^}]*opacity: 1/s);
    expect(styles).toMatch(/\.todo-star-button\.is-starred\s*\{[^}]*pointer-events: auto/s);
  });

  it("draws selected reminder borders inside the row so every edge stays visible", () => {
    const styles = read("src/styles.css");
    const selectedRule =
      styles.match(/\.today-focus-item\.is-menu-selected,[\s\S]*?\.todo-item\.is-menu-selected\s*\{(?<body>[^}]*)\}/)
        ?.groups?.body ?? "";
    const selectedBorderRule =
      styles.match(
        /\.today-focus-item\.is-menu-selected::before,[\s\S]*?\.todo-item\.is-menu-selected::before\s*\{(?<body>[^}]*)\}/
      )?.groups?.body ?? "";

    expect(selectedRule).toContain("background: transparent");
    expect(selectedBorderRule).toContain("top: 0");
    expect(selectedBorderRule).toContain("right: 6px");
    expect(selectedBorderRule).toContain("bottom: 0");
    expect(selectedBorderRule).toContain("left: 6px");
    expect(selectedBorderRule).toContain("border: 1px solid var(--line-focus)");
    expect(selectedBorderRule).toContain("pointer-events: none");
    expect(selectedBorderRule).toContain("z-index: 3");
  });

  it("uses click editing for area text and reminders while titles keep double-click editing", () => {
    const text = read("src/components/TextPanel.vue");
    const todo = read("src/components/TodoPanel.vue");
    const title = read("src/components/EditableTitle.vue");

    expect(text).toContain("@click=\"startEditing\"");
    expect(text).toContain("@dblclick=\"startEditing\"");
    expect(text).toContain(":readonly=\"!editing\"");
    expect(text).not.toContain(".select()");
    expect(todo).toContain("@click=\"startTodoEdit");
    expect(todo).not.toContain("@dblclick=\"startTodoEdit");
    expect(todo).toContain(":readonly=\"!isTodoEditable");
    expect(todo).not.toContain(".select()");
    expect(title).toContain("@dblclick=\"startEditing\"");
    expect(title).not.toContain("@click=\"startEditing\"");
    expect(title).not.toContain(".select()");
    expect(todo).toContain("lastTodoCarets");
    expect(text).toContain("lastCaret");
  });

  it("animates companion popover entry", () => {
    const styles = read("src/styles.css");

    expect(styles).toContain("@keyframes companion-gif-in");
    expect(styles).toMatch(/\.focus-companion\.is-visible\s*\{[^}]*animation: companion-gif-in/s);
    expect(styles).toContain("@keyframes companion-pop");
    expect(styles).toMatch(/\.companion-popover\s*\{[^}]*animation: companion-pop/s);
    expect(styles).toMatch(/\.companion-popover\s*\{[^}]*transform-origin: right bottom/s);
    expect(styles).toMatch(/\.companion-popover-shell\.n-popover\s*\{[^}]*box-shadow: 0 6px 14px rgba\(15, 23, 42, 0\.045\) !important/s);
    expect(styles).toMatch(/\.companion-popover-shell\.n-popover\s*\{[^}]*border: 1px solid var\(--border\) !important/s);
    expect(styles).toMatch(/\.companion-popover-shell\.n-popover\s*\{[^}]*background: var\(--popover\) !important/s);
    expect(styles).toMatch(/\.companion-popover-arrow\s*\{[^}]*box-shadow: none/s);
    expect(styles).toMatch(/\.companion-popover-arrow\s*\{[^}]*border: 1px solid var\(--border\) !important/s);
    expect(styles).toMatch(/\.companion-popover-arrow\s*\{[^}]*background: var\(--popover\) !important/s);
  });

  it("animates the tool configuration popover and keeps its close button circular", () => {
    const tool = read("src/components/ToolPanel.vue");
    const styles = read("src/styles.css");

    expect(tool).toContain('name="tool-config-pop"');
    expect(tool).toContain(':duration="240"');
    expect(styles).toMatch(/\.tool-config-panel\s*\{[^}]*border: 1px solid var\(--border\)/s);
    expect(styles).toMatch(/\.tool-config-panel\s*\{[^}]*background: var\(--popover\)/s);
    expect(styles).toMatch(/\.tool-config-panel\s*\{[^}]*box-shadow: 0 6px 14px rgba\(15, 23, 42, 0\.045\)/s);
    expect(styles).toMatch(/\.tool-config-pop-enter-active,[\s\S]*?\.tool-config-pop-leave-active\s*\{[^}]*transform var\(--motion-medium\)/s);
    expect(styles).toMatch(/\.tool-config-pop-enter-from,[\s\S]*?\.tool-config-pop-leave-to\s*\{[^}]*opacity: 0/s);
    expect(styles).toMatch(/\.tool-config-close\s*\{[^}]*width: 30px/s);
    expect(styles).toMatch(/\.tool-config-close\s*\{[^}]*height: 30px/s);
    expect(styles).toMatch(/\.tool-config-close\s*\{[^}]*border-radius: 50%/s);
    expect(styles).toMatch(/button\.tool-config-close:hover,[\s\S]*?button\.tool-config-close:focus-visible\s*\{[^}]*background: var\(--button-hover\)/s);
  });

  it("animates reminder reveal and workspace tab switches", () => {
    const space = read("src/components/SpacePanel.vue");
    const todo = read("src/components/TodoPanel.vue");
    const styles = read("src/styles.css");

    expect(space).toContain('name="space-panel-switch"');
    expect(space).toContain('mode="out-in"');
    expect(space).toContain(':duration="90"');
    expect(space).toContain('class="space-text-stage"');
    expect(space).not.toContain('class="space-tab-indicator"');
    expect(todo).toContain('name="section-reveal"');
    expect(todo).toContain('name="today-focus-move"');
    expect(todo).toContain('name="floating-pop"');
    expect(todo).toContain(':duration="240"');
    expect(styles).toMatch(/:root\s*\{[^}]*--motion-medium: 240ms/s);
    expect(styles).toMatch(/\.space-panel-switch-enter-active,[\s\S]*?\.space-panel-switch-leave-active\s*\{[^}]*opacity 90ms/s);
    expect(styles).not.toContain(".space-tab-indicator");
    expect(styles).toMatch(/\.todo-list-shell\s*\{[^}]*max-height var\(--motion-medium\)/s);
    expect(styles).toMatch(/\.todo-list-shell\.is-hidden\s*\{[^}]*max-height: 0/s);
    expect(styles).toMatch(/\.today-focus-move-move,[\s\S]*?\.today-focus-move-enter-active,[\s\S]*?\.today-focus-move-leave-active[\s\S]*?\{[^}]*transform 0\.22s/s);
    expect(styles).toMatch(/\.section-reveal-enter-active,[\s\S]*?\.section-reveal-leave-active\s*\{[^}]*max-height var\(--motion-medium\)/s);
    expect(styles).toMatch(/\.floating-pop-enter-active,[\s\S]*?\.floating-pop-leave-active\s*\{[^}]*transform var\(--motion-medium\)/s);
  });

  it("removes manual dropdowns before clearing their coordinates to avoid top-left flashes", () => {
    const dropdownSources = [
      "src/components/ImagePanel.vue",
      "src/components/QuickButtons.vue",
      "src/components/TodoPanel.vue",
      "src/components/TextPanel.vue",
    ];

    for (const file of dropdownSources) {
      const source = read(file);

      expect(source, file).toContain("<NDropdown");
      expect(source, file).toContain('v-if="menu"');
      expect(source, file).not.toContain(":style=\"{ left: `${menu?.x ?? 0}px`, top: `${menu?.y ?? 0}px` }\"");
    }
  });

  it("keeps companion confirmation actions in bordered button style", () => {
    const companion = read("src/components/CompanionBubble.vue");
    const styles = read("src/styles.css");

    expect(companion).toContain("companion-action-button");
    expect(styles).toMatch(/\.companion-action-button\s*\{[^}]*--n-border: 1px solid var\(--line-control\)/s);
    expect(styles).toMatch(/\.companion-action-button\s*\{[^}]*--n-color: transparent/s);
    expect(styles).toMatch(/\.companion-action-button\s*\{[^}]*border: 0 !important/s);
    expect(styles).toMatch(/\.companion-action-button \.n-button__border,[\s\S]*?\.companion-action-button \.n-button__state-border\s*\{[^}]*border-width: 1px/s);
  });

  it("uses shared guide options for blank-area context menus", () => {
    const app = read("src/App.vue");
    const image = read("src/components/ImagePanel.vue");
    const quick = read("src/components/QuickButtons.vue");
    const todo = read("src/components/TodoPanel.vue");
    const text = read("src/components/TextPanel.vue");
    const defaults = read("src/state/defaults.ts");
    const i18n = read("src/state/i18n.ts");

    expect(defaults).toContain("GUIDE_MENU_OPTION");
    expect(i18n).toContain('"today-focus-title": "❗️ 重点事项"');
    for (const source of [image, quick, todo, text]) {
      expect(source).toContain("GUIDE_MENU_OPTION");
      expect(source).toContain("common.tips");
    }
    expect(image).toContain("uiText.value.images.pasteImage");
    expect(app).not.toContain("@focus=\"handleGuideFocus('tools', $event)\"");
    expect(app).toContain("@guide=\"(_, anchor, immediate) => handleGuideClick('workspace', anchor, immediate)\"");
    expect(app).toContain("showGuideBubble");
  });

  it("uses two mutually exclusive checkboxes for quick button type", () => {
    const quick = read("src/components/QuickButtons.vue");
    const i18n = read("src/state/i18n.ts");

    expect(quick).toContain("setQuickType");
    expect(quick).toContain("uiText.quick.linkType");
    expect(quick).toContain("uiText.quick.textType");
    expect(i18n).toContain("链接属性");
    expect(i18n).toContain("复制文本属性");
    expect(quick).not.toContain("v-model:checked=\"form.isLink\"");
  });

  it("keeps modals and focused areas visually constrained", () => {
    const quick = read("src/components/QuickButtons.vue");
    const styles = read("src/styles.css");

    expect(quick).toContain(':mask-closable="false"');
    expect(quick).not.toContain("handleDialogOutsideClick");
    expect(quick).not.toContain("@mask-click");
    expect(styles).toMatch(/\.quick-dialog\s*\{[^}]*width: min\(420px, calc\(100vw - 32px\)\)/s);
    expect(styles).toMatch(/\.quick-dialog \.n-base-close\s*\{[^}]*border: 0/s);
    expect(styles).toMatch(/\.quick-dialog \.n-base-close\s*\{[^}]*box-shadow: none/s);
    expect(styles).toMatch(/\.panel\.is-focused,[\s\S]*?\.todo-section\.is-focused\s*\{[^}]*box-shadow: none/s);
    expect(styles).toMatch(/\.todo-section\.is-focused::before\s*\{[^}]*content: none/s);
    expect(styles).not.toMatch(/\.todo-section\.is-focused::before\s*\{[^}]*border: 1px solid var\(--line-focus\)/s);
  });

  it("uses a slightly stronger gradient for completed pinned reminders", () => {
    const styles = read("src/styles.css");
    const rule = styles.match(/\.todo-item\.is-starred\.is-done \.todo-input,[\s\S]*?\.today-focus-item\.is-done \.today-focus-input\s*\{([\s\S]*?)\}/)?.[1] ?? "";

    expect(rule).toContain("#e879f9");
    expect(rule).toContain("#60a5fa");
    expect(rule).toContain("#4ade80");
    expect(rule).toContain("#fbbf24");
    expect(rule).toContain("#f87171");
  });

  it("routes about information through the companion bubble and suggestions to GitHub issues", () => {
    const app = read("src/App.vue");
    const companion = read("src/components/CompanionBubble.vue");
    const messages = read("src/state/messages.ts");
    const styles = read("src/styles.css");

    expect(app).toContain("function about");
    expect(app).toContain("aboutTitle");
    expect(app).toContain("aboutDescription");
    expect(app).toContain("GITHUB_REPO_LABEL");
    expect(app).toContain("GITHUB_REPO_URL");
    expect(app).toContain("xiangjianan / mini-desk");
    expect(app).toContain("https://github.com/xiangjianan/mini-desk");
    expect(app).not.toContain("xiangjianan / todolist");
    expect(app).not.toContain("https://github.com/xiangjianan/todolist");
    expect(app).not.toContain("云霞 · 产品");
    expect(app).not.toContain("佳男 · 开发");
    expect(app).not.toContain("Codex · 协作支持");
    expect(app).not.toContain("👤 产品经理 — 云霞");
    expect(styles).toMatch(/\.companion-popover > span\s*\{[^}]*white-space: pre-line/s);
    expect(companion).toContain("LogoGithub");
    expect(companion).toContain("companion-link-icon");
    expect(companion).toContain('data-testid="companion-link"');
    expect(app).toContain("GITHUB_ISSUE_URL");
    expect(app).toContain("/issues/new");
    expect(app).not.toContain("LogoGithub");
    expect(app).not.toContain("about-github-link");
    expect(app).not.toContain("aboutVisible");
    expect(app).not.toContain("about-confirm-button");
    expect(app).not.toContain("naiveDialog.info");
    expect(app).not.toContain('positiveText: "知道了"');
    expect(styles).not.toContain(".about-modal");
    expect(styles).not.toContain(".about-confirm-button");
    expect(styles).toContain(".companion-link");
    expect(styles).toContain(".companion-link-icon");
    expect(messages).toContain('surface: "companion"');
    expect(messages).not.toContain("GitHub: https://github.com/xiangjianan/todolist");
  });

  it("moves version status into the settings menu", () => {
    const app = read("src/App.vue");
    const settings = read("src/components/SettingsMenu.vue");

    expect(app).not.toContain("version-badge");
    expect(settings).toContain("appVersion");
    expect(settings).toContain("updateAvailable");
    expect(settings).toContain("settings-version-dot");
    expect(settings).toContain('"data-testid": "settings-version"');
  });

  it("keeps overflowing workspace tabs scrollable before the top action bar", () => {
    const space = read("src/components/SpacePanel.vue");
    const styles = read("src/styles.css");

    expect(space).toContain("NScrollbar");
    expect(space).toContain('class="space-tabs-scrollbar"');
    expect(space).toContain('trigger="hover"');
    expect(space).toContain("@wheel=\"handleTabsWheel\"");
    expect(styles).toMatch(/\.space-tabs\s*\{[^}]*overflow-x: auto/s);
    expect(styles).toMatch(/\.space-tabs\s*\{[^}]*height: 34px/s);
    expect(styles).toMatch(/\.space-tabs-scrollbar\s*\{[^}]*max-width: 100%/s);
    expect(styles).not.toMatch(/\.space-tabs-scrollbar\s*\{[^}]*calc\(100% - 101px\)/s);
    expect(styles).toMatch(/\.space-tabs-scrollbar\s*\{[^}]*height: 34px/s);
    expect(styles).toMatch(/\.space-tabs-scrollbar\s*\{[^}]*border-bottom: 0\.5px solid var\(--line-control\)/s);
    expect(styles).toMatch(/\.space-add-button\s*\{[^}]*margin-left: 4px/s);
    expect(styles).toMatch(/button\.space-add-button,[\s\S]*?\.space-add-button\.icon-button\s*\{[^}]*border: 0/s);
    expect(styles).toMatch(/button\.space-add-button,[\s\S]*?\.space-add-button\.icon-button\s*\{[^}]*box-shadow: none/s);
    expect(styles).toMatch(/\.space-add-button\.icon-button:hover,[\s\S]*?\.space-add-button\.icon-button:focus-visible\s*\{[^}]*background: var\(--button-hover\)/s);
    expect(styles).toMatch(/\.space-add-button\.icon-button:hover,[\s\S]*?\.space-add-button\.icon-button:focus-visible\s*\{[^}]*color: var\(--primary\)/s);
    expect(styles).toMatch(/\.space-add-button\.icon-button:hover,[\s\S]*?\.space-add-button\.icon-button:focus-visible\s*\{[^}]*box-shadow: none/s);
    expect(styles).toMatch(/\.space-tabs\s*\{[^}]*scrollbar-width: none/s);
    expect(styles).toMatch(/\.space-tabs:hover\s*\{[^}]*scrollbar-width: thin/s);
    expect(styles).toMatch(/\.space-tabs::-webkit-scrollbar\s*\{[^}]*height: 0/s);
    expect(styles).toMatch(/\.space-tabs:hover::-webkit-scrollbar\s*\{[^}]*height: var\(--scrollbar-size\)/s);
    expect(styles).not.toMatch(/\.workspace-panel \.space-tabs\s*\{[^}]*overflow-x: scroll/s);
    expect(styles).not.toContain("scrollbar-gutter: stable");
    expect(styles).toMatch(/\.space-tabs\s*\{[^}]*overscroll-behavior-x: contain/s);
  });

  it("uses a mobile handoff page instead of mobile board regions", () => {
    const app = read("src/App.vue");
    const styles = read("src/styles.css");
    const text = read("src/components/TextPanel.vue");
    const i18n = read("src/state/i18n.ts");

    expect(app).toContain('class="workspace-panel"');
    expect(app).toContain("MOBILE_BREAKPOINT_QUERY");
    expect(app).toContain("mobileMessage");
    expect(app).toContain('class="mobile-handoff"');
    expect(app).toContain('class="mobile-handoff-title"');
    expect(app).toContain('class="mobile-handoff-theme"');
    expect(app).toContain('v-if="!isMobileBlocked"');
    expect(app).toContain("isMobileBlocked.value || companionVisible.value");
    expect(i18n).toContain("建议在电脑浏览器打开，以获得完整体验");
    expect(app).not.toContain('class="mobile-nav"');
    expect(app).not.toContain('class="mobile-drawer-trigger"');
    expect(app).not.toContain('class="mobile-drawer-menu"');
    expect(app).not.toContain('class="mobile-menu-option"');
    expect(app).not.toContain('class="mobile-banner"');
    expect(app).not.toContain("data-mobile-active");
    expect(app).not.toContain("mobileActiveArea");
    expect(app).not.toContain("mobileNavOpen");
    expect(styles).toMatch(/\.mobile-handoff\s*\{[^}]*display: grid/s);
    expect(styles).toMatch(/\.mobile-handoff\s*\{[^}]*height: 100dvh/s);
    expect(styles).toMatch(/\.mobile-handoff-body\s*\{[^}]*display: grid/s);
    expect(styles).toMatch(/\.mobile-handoff-message\s*\{[^}]*border: 1px solid var\(--line-main\)/s);
    expect(styles).toMatch(/@media \(max-width: 900px\)[\s\S]*--app-font-size: 14px/s);
    expect(styles).toMatch(/@media \(max-width: 900px\)[\s\S]*\.focus-companion\s*\{[^}]*bottom: 28px/s);
    expect(styles).toMatch(/@media \(max-width: 900px\)[\s\S]*\.focus-companion img\s*\{[^}]*max-width: 50px/s);
    expect(styles).not.toContain(".mobile-nav");
    expect(styles).not.toContain(".mobile-drawer-trigger");
    expect(styles).not.toContain(".mobile-drawer-menu");
    expect(styles).not.toContain(".mobile-menu-option");
    expect(styles).not.toContain(".mobile-banner");
    expect(styles).not.toContain("data-mobile-active");
    expect(text).toContain("unlockTextareaForMobileKeyboard");
    expect(text).toContain('@touchstart="handleTouchStart"');
    expect(text).toContain('@pointerdown="handlePointerDown"');
    expect(text).not.toContain("handleMobileEditTap");
    expect(text.match(/async function startEditing[\s\S]*?\n}/)?.[0] ?? "").not.toContain("event.preventDefault();");
    expect(text).toMatch(/function startEditingFromTextarea\(textarea: HTMLTextAreaElement, keyboardFocus = false\): void \{[\s\S]*editing\.value = true;[\s\S]*unlockTextareaForMobileKeyboard\(textarea, caret, keyboardFocus\);[\s\S]*\}/s);
    expect(text).toMatch(/async function startEditing\(event: MouseEvent\): Promise<void> \{[\s\S]*startEditingFromTextarea\(textarea\);[\s\S]*await nextTick\(\)/s);
  });
});
