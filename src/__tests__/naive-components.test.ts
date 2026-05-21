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

  it("uses Naive message feedback instead of a custom toast element", () => {
    const app = read("src/App.vue");
    const styles = read("src/styles.css");

    expect(app).toContain("createDiscreteApi");
    expect(app).not.toContain('class="toast"');
    expect(app).not.toContain('const toast = ref("")');
    expect(styles).not.toContain(".toast");
  });

  it("uses Naive dialog/modal primitives for popup surfaces", () => {
    const app = read("src/App.vue");
    const preview = read("src/components/ImagePreview.vue");

    expect(app).toContain('createDiscreteApi(["message"])');
    expect(app).toContain("NModal");
    expect(app).toContain('class="about-modal"');
    expect(app).not.toContain("window.alert");
    expect(preview).toContain("NModal");
  });

  it("uses Naive popover primitives for the reusable companion bubble", () => {
    const companion = read("src/components/CompanionBubble.vue");
    const app = read("src/App.vue");

    expect(companion).toContain("NPopover");
    expect(companion).toContain("NButton");
    expect(companion).toContain("hermes-dark.gif");
    expect(companion).toContain(":src=\"gifSrc\"");
    expect(app).toContain(":theme=\"state.theme\"");
    expect(companion).toContain("popoverKey");
    expect(companion).toContain("POPOVER_DELAY_MS = 200");
    expect(companion).toContain("delayedPopoverVisible");
    expect(companion).toContain('placement="top-end"');
    expect(companion).toContain(":arrow-point-to-center");
    expect(companion).toContain('class="companion-popover-shell"');
    expect(companion).toContain('arrow-class="companion-popover-arrow"');
    expect(companion).toContain("--n-box-shadow");
    expect(companion).toContain(":show=\"visiblePopover\"");
    expect(companion).not.toContain("content-class=\"companion-popover-shell\"");
    expect(companion).not.toContain("border: '1px solid #111'");
    expect(companion).not.toContain("bubble-box");
    expect(companion).not.toContain("<button");
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

    expect(preview).toContain("@contextmenu.prevent");
    expect(preview).toContain(':mask-closable="false"');
    expect(preview).not.toContain('@click.self="emit(\'close\')"');
    expect(preview).toContain("取消预览");
    expect(preview).toContain("复制");
    expect(preview).toContain("删除");
    expect(preview).toContain("@keydown.space.prevent");
    expect(preview).not.toContain("NDropdown");
    expect(preview).not.toContain("openMenu");
    expect(preview).not.toContain("@contextmenu.prevent.stop=\"openMenu\"");
    expect(preview).not.toContain("custom-menu");
    expect(preview).not.toContain('id="custom-menu"');
    expect(styles).toContain("grid-template-columns: 10vw 90vw");
    expect(styles).toContain("backdrop-filter");
    expect(styles).toMatch(/\.image-preview\s*\{[^}]*background: rgba\(255, 255, 255/s);
    expect(styles).toMatch(/html\[data-theme="dark"\] \.image-preview\s*\{[^}]*background: rgba\(0, 0, 0/s);
    expect(styles).toContain("-webkit-backdrop-filter");
    expect(styles).toContain("z-index: 3200");
    expect(preview).toContain("preview-close-button");
  });

  it("keeps the preview sidebar aligned with the normal image list", () => {
    const preview = read("src/components/ImagePreview.vue");
    const styles = read("src/styles.css");

    expect(preview).toContain('v-for="(image, index) in images"');
    expect(preview).toContain('class="image-list preview-image-list"');
    expect(preview).toContain('class="image-card preview-thumb"');
    expect(preview).toContain('<span class="image-index">{{ index + 1 }}</span>');
    expect(preview).not.toContain("preview-sidebar-header");
    expect(styles).toMatch(/\.preview-sidebar-bar\s*\{[^}]*min-height: 34px/s);
    expect(styles).toMatch(/\.preview-image-list\s*\{[^}]*padding: 6px/s);
    expect(styles).not.toMatch(/\.preview-thumb\s*\{[^}]*margin-bottom/s);
  });

  it("marks text quick buttons with a copy icon and keeps settings in the top action bar", () => {
    const quick = read("src/components/QuickButtons.vue");
    const app = read("src/App.vue");
    const settings = read("src/components/SettingsMenu.vue");
    const todo = read("src/components/TodoPanel.vue");
    const styles = read("src/styles.css");

    expect(quick).toContain("CopyOutline");
    expect(quick).toContain("AddOutline");
    expect(quick).toContain("EyeOutline");
    expect(quick).toContain("EyeOffOutline");
    expect(quick).toContain("quick-button-icon");
    expect(app).toContain("top-actions");
    expect(app).toContain("SunnyOutline");
    expect(app).toContain("MoonOutline");
    expect(todo).toContain("clear-completed-icon");
    expect(todo).toContain("M786.6 715.9");
    expect(todo).not.toContain("TrashOutline");
    expect(settings).toContain("NIcon");
    expect(settings).toContain("NBadge");
    expect(settings).toContain("SettingsOutline");
    expect(settings).not.toContain("⚙");
    expect(settings).not.toContain("circle");
    expect(settings).not.toContain("settings-wrap");
    expect(quick).not.toContain(">+</NButton>");
    expect(todo).not.toContain("↘");
    expect(styles).toMatch(/\.settings-btn\s*\{[^}]*border-radius: 0/s);
    expect(styles).toMatch(/\.top-actions\s*\{[^}]*top: 2px/s);
  });

  it("crops the companion GIF into a square instead of letterboxing it", () => {
    const styles = read("src/styles.css");

    expect(styles).toContain(".focus-companion img");
    expect(styles).toContain("aspect-ratio: 1 / 1");
    expect(styles).toContain("object-fit: cover");
    expect(styles).toMatch(/\.focus-companion img\s*\{[^}]*border: 1px solid var\(--line-main\)/s);
  });

  it("keeps typography and confirmation actions compact but readable", () => {
    const styles = read("src/styles.css");

    expect(styles).toContain("--app-font-size: 12px");
    expect(styles).toMatch(/body\s*\{[^}]*font-size: 12px/s);
    expect(styles).toMatch(/h1,[\s\S]*?h2\s*\{[^}]*font-size: var\(--app-font-size\)/s);
    expect(styles).toMatch(/\.count,[\s\S]*?\.todo-count\s*\{[^}]*font-size: var\(--app-font-size\)/s);
    expect(styles).toMatch(/\.text-editor-textarea\s*\{[^}]*font-size: var\(--app-font-size\)/s);
    expect(styles).toMatch(/\.quick-button\s*\{[^}]*font-size: var\(--app-font-size\)/s);
    expect(styles).toMatch(/\.todo-input\s*\{[^}]*font-size: var\(--app-font-size\)/s);
    expect(styles).toMatch(/\.n-input,[\s\S]*?\.n-card\s*\{[^}]*font-size: var\(--app-font-size\)/s);
    expect(styles).toMatch(/\.companion-actions \.n-button\s*\{[^}]*min-width: 64px/s);
  });

  it("keeps scrollbars and buttons in the simple line UI style", () => {
    const styles = read("src/styles.css");

    expect(styles).toContain("scrollbar-width: thin");
    expect(styles).toContain("::-webkit-scrollbar-thumb");
    expect(styles).toMatch(/button\s*\{[^}]*background: transparent/s);
    expect(styles).toMatch(/\.n-button\s*\{[^}]*--n-border-radius: 0/s);
    expect(styles).toMatch(/\.n-base-wave\s*\{[^}]*display: none/s);
  });

  it("keeps visible border widths at exactly one pixel", () => {
    const styles = read("src/styles.css");
    const visibleBorderWidths = [...styles.matchAll(/(?:border(?:-(?:top|right|bottom|left))?|--n-border(?:-[a-z]+)?|box-shadow):[^;{}]*?(\d+)px/g)]
      .map((match) => Number(match[1]))
      .filter((width) => width > 0);

    expect(visibleBorderWidths.length).toBeGreaterThan(0);
    expect(visibleBorderWidths.every((width) => width === 1)).toBe(true);
  });

  it("keeps bordered controls and popup surfaces square without rounded corners", () => {
    const styles = read("src/styles.css");

    expect(styles).toContain("--radius: 0");
    expect(styles).toMatch(/button\s*\{[^}]*border-radius: 0/s);
    expect(styles).toMatch(/input,[\s\S]*?textarea\s*\{[^}]*border-radius: 0/s);
    expect(styles).toMatch(/\.n-button,[\s\S]*?\.n-dropdown-menu,[\s\S]*?\.n-checkbox-box\s*\{[^}]*border-radius: 0/s);
    expect(styles).not.toMatch(/border-radius:\s*(?:[1-9]\d*px|0\.\d+|[1-9]\d*%)/);
  });

  it("adds copy and paste actions to editable text context menus", () => {
    const text = read("src/components/TextPanel.vue");
    const todo = read("src/components/TodoPanel.vue");

    for (const source of [text, todo]) {
      expect(source).toContain("copyTextSelection");
      expect(source).toContain("pasteTextFromClipboard");
      expect(source).toContain("复制");
      expect(source).toContain("粘贴");
    }
  });

  it("keeps blank reminder hints outside the moving todo transition list", () => {
    const todo = read("src/components/TodoPanel.vue");

    expect(todo).not.toMatch(/<TransitionGroup[\s\S]*v-if="todos\[period\]\.length === 0"[\s\S]*<\/TransitionGroup>/);
    expect(todo).toContain('v-if="todos[period].length === 0"');
    expect(todo).toContain('v-else');
  });

  it("uses a clear separated drag handle for reminder rows", () => {
    const todo = read("src/components/TodoPanel.vue");
    const styles = read("src/styles.css");

    expect(todo).toContain('class="todo-drag-handle"');
    expect(todo).not.toMatch(/class="todo-item"[\s\S]{0,160}draggable="true"/);
    expect(styles).toMatch(/\.todo-item\s*\{[^}]*grid-template-columns: 14px 24px 28px minmax\(0, 1fr\)/s);
    expect(styles).toMatch(/\.todo-drag-handle\s*\{[^}]*width: 12px/s);
    expect(styles).toMatch(/\.todo-drag-handle\s*\{[^}]*opacity: 0\.28/s);
    expect(styles).toContain(".todo-drag-handle::before");
  });

  it("highlights the reminder context-menu item without adding another border", () => {
    const styles = read("src/styles.css");
    const selectedRule = styles.match(/\.todo-item\.is-menu-selected\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";

    expect(selectedRule).toContain("background:");
    expect(selectedRule).not.toContain("border");
    expect(selectedRule).not.toContain("box-shadow");
  });

  it("uses double-click editing for area text instead of single-click editing", () => {
    const text = read("src/components/TextPanel.vue");
    const todo = read("src/components/TodoPanel.vue");
    const title = read("src/components/EditableTitle.vue");

    expect(text).toContain("@dblclick=\"startEditing\"");
    expect(text).toContain(":readonly=\"!editing\"");
    expect(text).not.toContain(".select()");
    expect(todo).toContain("@dblclick=\"startTodoEdit");
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
    expect(styles).toMatch(/\.companion-popover-shell\.n-popover\s*\{[^}]*box-shadow: none/s);
    expect(styles).toMatch(/\.companion-popover-shell\.n-popover\s*\{[^}]*border: 1px solid #111/s);
    expect(styles).toMatch(/\.companion-popover-arrow\s*\{[^}]*box-shadow: none/s);
    expect(styles).toMatch(/\.companion-popover-arrow\s*\{[^}]*border: 1px solid #111/s);
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

    expect(defaults).toContain("GUIDE_MENU_OPTION");
    for (const source of [image, quick, todo, text]) {
      expect(source).toContain("GUIDE_MENU_OPTION");
      expect(source).toContain("使用指南");
    }
    expect(image).toContain("粘贴图片");
    expect(app).toContain("@guide=\"(anchor, immediate) => handleGuideClick('note', anchor, immediate)\"");
    expect(app).toContain("@guide=\"(_, anchor, immediate) => handleGuideClick('workspace', anchor, immediate)\"");
    expect(app).toContain("showGuideBubble");
  });

  it("uses two mutually exclusive checkboxes for quick button type", () => {
    const quick = read("src/components/QuickButtons.vue");

    expect(quick).toContain("setQuickType");
    expect(quick).toContain("链接属性");
    expect(quick).toContain("复制文本属性");
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
    expect(styles).toMatch(/\.panel\.is-focused,[\s\S]*?\.todo-section\.is-focused\s*\{[^}]*box-shadow: inset 0 0 0 1px var\(--line-focus\)/s);
  });

  it("renders the source repository in the about dialog as an icon link", () => {
    const app = read("src/App.vue");
    const messages = read("src/state/messages.ts");
    const styles = read("src/styles.css");

    expect(app).toContain("LogoGithub");
    expect(app).toContain("GITHUB_REPO_NAME");
    expect(app).toContain("GITHUB_REPO_URL");
    expect(app).toContain("about-github-link");
    expect(app).toContain("aboutVisible");
    expect(app).toContain("about-confirm-button");
    expect(app).not.toContain("naiveDialog.info");
    expect(app).not.toContain('positiveText: "知道了"');
    expect(styles).toMatch(/\.about-modal\s*\{[^}]*background: var\(--panel\)/s);
    expect(styles).toMatch(/\.about-confirm-button\s*\{[^}]*color: var\(--text\)/s);
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

  it("uses a mobile area menu instead of compressing the desktop board", () => {
    const app = read("src/App.vue");
    const styles = read("src/styles.css");
    const text = read("src/components/TextPanel.vue");

    expect(app).toContain('class="workspace-panel"');
    expect(app).toContain('class="mobile-nav"');
    expect(app).toContain('data-mobile-active');
    expect(app).toContain('{ key: "todos", label: "待办" }');
    expect(styles).toMatch(/\.mobile-nav\s*\{[^}]*display: flex/s);
    expect(styles).toMatch(/\.board\[data-mobile-active="todos"\] > \.todo-panel/s);
    expect(styles).toMatch(/\.board\[data-mobile-active="spaces"\] > \.space-panel/s);
    expect(styles).toMatch(/@media \(max-width: 900px\)[\s\S]*--app-font-size: 14px/s);
    expect(styles).toMatch(/@media \(max-width: 900px\)[\s\S]*\.top-actions\s*\{[^}]*display: flex/s);
    expect(styles).toMatch(/@media \(max-width: 900px\)[\s\S]*\.top-actions\s*\{[^}]*top: 3px/s);
    expect(styles).toMatch(/@media \(max-width: 900px\)[\s\S]*\.focus-companion\s*\{[^}]*top: 118px/s);
    expect(styles).toMatch(/@media \(max-width: 900px\)[\s\S]*\.focus-companion img\s*\{[^}]*width: 60px/s);
    expect(styles).toMatch(/\.image-preview\s*\{[^}]*display: none !important/s);
    expect(styles).not.toMatch(/\.top-actions,[\s\S]*?\.focus-companion,[\s\S]*?\.image-preview\s*\{[^}]*display: none !important/s);
    expect(text).toContain("unlockTextareaForMobileKeyboard");
    expect(text).toContain('@touchstart="handleTouchStart"');
    expect(text.match(/async function startEditing[\s\S]*?\n}/)?.[0] ?? "").not.toContain("event.preventDefault();");
    expect(text).toMatch(/function startEditingFromTextarea\(textarea: HTMLTextAreaElement, keyboardFocus = false\): void \{[\s\S]*editing\.value = true;[\s\S]*unlockTextareaForMobileKeyboard\(textarea, caret, keyboardFocus\);[\s\S]*\}/s);
    expect(text).toMatch(/async function startEditing\(event: MouseEvent\): Promise<void> \{[\s\S]*startEditingFromTextarea\(textarea\);[\s\S]*await nextTick\(\)/s);
  });
});
