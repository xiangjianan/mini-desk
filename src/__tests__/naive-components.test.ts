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

    expect(app).toContain('createDiscreteApi(["message", "dialog"])');
    expect(app).not.toContain("window.alert");
    expect(preview).toContain("NModal");
  });

  it("uses Naive popover primitives for the reusable companion bubble", () => {
    const companion = read("src/components/CompanionBubble.vue");

    expect(companion).toContain("NPopover");
    expect(companion).toContain("NButton");
    expect(companion).toContain("popoverKey");
    expect(companion).toContain("POPOVER_DELAY_MS = 200");
    expect(companion).toContain("delayedPopoverVisible");
    expect(companion).toContain('placement="top-end"');
    expect(companion).toContain(":arrow-point-to-center");
    expect(companion).toContain('class="companion-popover-shell"');
    expect(companion).toContain('arrow-class="companion-popover-arrow"');
    expect(companion).toContain("--n-box-shadow");
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

    expect(read("src/App.vue")).toContain("maybeShowGuideBubble");
    expect(read("src/App.vue")).toContain("handleGuideFocus");
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

    expect(preview).toContain("NDropdown");
    expect(preview).toContain("@contextmenu.prevent");
    expect(preview).toContain(':mask-closable="false"');
    expect(preview).not.toContain('@click.self="emit(\'close\')"');
    expect(preview).toContain("取消预览");
    expect(preview).toContain("复制");
    expect(preview).toContain("删除");
    expect(styles).toContain("grid-template-columns: 10vw 90vw");
    expect(styles).toContain("backdrop-filter");
    expect(styles).toContain("z-index: 3200");
  });

  it("keeps the preview sidebar aligned with the normal image list", () => {
    const preview = read("src/components/ImagePreview.vue");
    const styles = read("src/styles.css");

    expect(preview).toContain('v-for="(image, index) in images"');
    expect(preview).toContain('<span class="image-index">{{ index + 1 }}</span>');
    expect(preview).not.toContain("preview-sidebar-header");
    expect(styles).toMatch(/\.preview-sidebar\s*\{[^}]*padding: 40px 6px 6px/s);
    expect(styles).toMatch(/\.preview-thumb\s*\{[^}]*grid-template-columns: 28px minmax\(0, 1fr\)/s);
    expect(styles).toMatch(/\.preview-thumb\s*\{[^}]*min-height: 72px/s);
    expect(styles).toMatch(/\.preview-thumb\s*\{[^}]*padding: 0/s);
    expect(styles).toMatch(/\.preview-thumb\s*\{[^}]*border-bottom: 1px solid/s);
    expect(styles).toMatch(/\.preview-thumb img\s*\{[^}]*max-height: 120px/s);
    expect(styles).toMatch(/\.preview-thumb img\s*\{[^}]*margin: 10px/s);
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
    expect(styles).toMatch(/\.settings-btn\s*\{[^}]*border-radius: var\(--radius\)/s);
    expect(styles).toMatch(/\.top-actions\s*\{[^}]*top: 2px/s);
  });

  it("crops the companion GIF into a square instead of letterboxing it", () => {
    const styles = read("src/styles.css");

    expect(styles).toContain(".focus-companion img");
    expect(styles).toContain("aspect-ratio: 1 / 1");
    expect(styles).toContain("object-fit: cover");
    expect(styles).toMatch(/\.focus-companion img\s*\{[^}]*border: 1px solid var\(--line-main\)/s);
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

  it("keeps modals and focused areas visually constrained", () => {
    const quick = read("src/components/QuickButtons.vue");
    const styles = read("src/styles.css");

    expect(quick).toContain(':mask-closable="true"');
    expect(styles).toMatch(/\.quick-dialog\s*\{[^}]*width: min\(420px, calc\(100vw - 32px\)\)/s);
    expect(styles).toMatch(/\.panel\.is-focused,[\s\S]*?\.todo-section\.is-focused\s*\{[^}]*box-shadow: inset 0 0 0 1px var\(--line-focus\)/s);
  });

  it("renders the source repository in the about dialog as an icon link", () => {
    const app = read("src/App.vue");
    const messages = read("src/state/messages.ts");

    expect(app).toContain("LogoGithub");
    expect(app).toContain("GITHUB_REPO_NAME");
    expect(app).toContain("GITHUB_REPO_URL");
    expect(app).toContain("about-github-link");
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
});
