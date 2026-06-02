import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function ruleBodies(styles: string, selector: string): string[] {
  const bodies: string[] = [];
  for (const match of styles.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = match[1].split(",").map((item) => item.trim());
    if (selectors.includes(selector)) bodies.push(match[2]);
  }
  if (bodies.length === 0) throw new Error(`Missing CSS rule for ${selector}`);
  return bodies;
}

function expectSelectorBody(styles: string, selector: string, text: string): void {
  expect(ruleBodies(styles, selector).some((body) => body.includes(text))).toBe(true);
}

describe("workbench style contract", () => {
  it("uses a rail-free rounded surface model instead of boxed borders", () => {
    const styles = readFileSync(resolve(__dirname, "../styles.css"), "utf8");

    expect(ruleBodies(styles, ".workbench-shell").join("\n")).not.toContain("grid-template-columns: 56px");
    expectSelectorBody(styles, ".workbench-shell", "padding: 0");
    expectSelectorBody(styles, ".workbench-main", "border-radius: 0");
    expectSelectorBody(styles, ".workbench-main", "grid-template-rows: 52px minmax(0, 1fr)");
    expectSelectorBody(styles, ".workbench-main", "transition: grid-template-rows 200ms var(--motion-ease)");
    expectSelectorBody(styles, ".workbench-main.is-header-hidden", "grid-template-rows: 0px minmax(0, 1fr)");
    expectSelectorBody(styles, ".workbench-command-bar", "padding: 0 16px");
    expectSelectorBody(styles, ".workbench-grid", "background: color-mix(in srgb, var(--background) 82%, var(--muted-surface))");
    expect(ruleBodies(styles, ".workbench-zone").join("\n")).not.toContain("border: 1px solid var(--border)");
    expectSelectorBody(styles, ".workbench-zone", "border-radius: calc(var(--radius) + 4px)");
    expectSelectorBody(styles, ".workbench-zone", "padding: 8px");
    expectSelectorBody(styles, ".workbench-zone", "background: color-mix(in srgb, var(--card) 96%, var(--background))");
    expectSelectorBody(styles, ".workbench-zone", "inset 0 0 0 1px color-mix(in srgb, var(--border) 34%, transparent)");
    expectSelectorBody(styles, ".workbench-zone > .panel", "border-radius: var(--radius)");
    expectSelectorBody(styles, ".workbench-zone > .tool-panel", "border-radius: 0");
    expectSelectorBody(styles, ".workbench-zone-notes", "gap: 8px");
    expectSelectorBody(styles, "button.quick-button", "border: 0");
    expectSelectorBody(styles, "button.space-tab", "border: 0");
    expectSelectorBody(styles, "button.quick-menu-button", "border: 0");
    expectSelectorBody(styles, "button.image-card", "border: 0");
    expectSelectorBody(styles, ".image-card", "border-bottom: 0");
    expectSelectorBody(styles, ".image-index", "border-right: 0");
  });

  it("keeps legacy native button styling from overriding shadcn buttons", () => {
    const styles = readFileSync(resolve(__dirname, "../styles.css"), "utf8");
    const bareButtonBodies = ruleBodies(styles, "button");

    expect(bareButtonBodies.join("\n")).not.toMatch(/\b(border|background|border-radius|min-height|padding):/);
    expectSelectorBody(styles, 'button:not([data-slot="button"])', "border: 0");
    expectSelectorBody(styles, 'button:not([data-slot="button"])', "background: var(--button)");
    expectSelectorBody(styles, 'button:not([data-slot="button"])', "min-height: 30px");
  });

  it("normalizes retained Naive UI and panel internals through shared tokens", () => {
    const styles = readFileSync(resolve(__dirname, "../styles.css"), "utf8");

    expectSelectorBody(styles, ".n-button", "--n-border-radius: var(--radius)");
    expectSelectorBody(styles, ".n-button:not(.n-button--primary-type):not(.n-button--error-type)", "--n-color: var(--button) !important");
    expectSelectorBody(styles, ".n-dropdown-menu", "border: 1px solid var(--border) !important");
    expectSelectorBody(styles, ".n-dropdown-menu", "background: var(--popover) !important");
    expectSelectorBody(styles, ".n-dropdown-menu", "color: var(--popover-foreground) !important");
    expectSelectorBody(styles, ".n-dropdown-menu", "box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08) !important");
    expectSelectorBody(styles, ".n-modal .n-card", "border: 1px solid var(--border) !important");
    expectSelectorBody(styles, ".n-modal .n-card", "background: var(--popover) !important");
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
    expectSelectorBody(styles, ".companion-popover-shell.n-popover", "box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08) !important");
    expectSelectorBody(styles, ".companion-popover-arrow", "border: 1px solid var(--border) !important");
    expect(ruleBodies(styles, ".companion-popover-shell.n-popover").join("\n")).not.toContain("#111");
    expect(ruleBodies(styles, ".companion-popover-arrow").join("\n")).not.toContain("#111");
  });

  it("keeps preview, workspace tabs, and top actions aligned to the compact workbench layout", () => {
    const styles = readFileSync(resolve(__dirname, "../styles.css"), "utf8");

    expectSelectorBody(styles, ".image-preview", "left: var(--image-preview-left, clamp(220px, 18vw, 320px))");
    expectSelectorBody(styles, ".image-preview", "right: 0");
    expect(ruleBodies(styles, ".image-preview").join("\n")).not.toContain("width: 90vw");
    expectSelectorBody(styles, ".preview-stage img", "max-width: calc(100vw - var(--image-preview-left, clamp(220px, 18vw, 320px)) - 32px)");
    expectSelectorBody(styles, ".workbench-grid", "position: relative");
    expectSelectorBody(styles, ".workbench-grid", "grid-template-columns: minmax(160px, 0.15fr) minmax(160px, 0.2fr) minmax(320px, 0.35fr) minmax(320px, 0.3fr)");
    expectSelectorBody(styles, ".workbench-grid", "gap: 7px");
    expectSelectorBody(styles, ".workbench-grid", "padding: 7px");
    expectSelectorBody(styles, ".workbench-grid", "grid-row: 2");
    expectSelectorBody(styles, ".workbench-header-reveal-zone", "position: absolute");
    expectSelectorBody(styles, ".workbench-header-reveal-zone", "left: 50%");
    expectSelectorBody(styles, ".workbench-header-reveal-zone", "transform: translateX(-50%)");
    expectSelectorBody(styles, ".workbench-header-reveal", "position: absolute");
    expectSelectorBody(styles, ".workbench-header-reveal", "left: 50%");
    expectSelectorBody(styles, ".workbench-header-reveal", "transform: translateX(-50%)");
    expectSelectorBody(styles, ".workbench-header-reveal:hover", "cursor: pointer");
    expectSelectorBody(styles, ".workbench-header-reveal-leave-to", "transform: translate(-50%, -12px)");
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
    expectSelectorBody(styles, ".workbench-theme-button", "width: 32px");
    expectSelectorBody(styles, ".workbench-theme-button", "height: 32px");
    expectSelectorBody(styles, ".workbench-theme-button", "background: var(--button)");
    expectSelectorBody(styles, ".workbench-header-hide-button:hover", "cursor: pointer");
    expectSelectorBody(styles, ".workbench-theme-button:hover", "cursor: pointer");
    expectSelectorBody(styles, ".settings-trigger", "height: 32px");
    expectSelectorBody(styles, ".settings-btn.icon-button", "width: 32px");
    expectSelectorBody(styles, ".settings-btn.icon-button", "height: 32px");
    expectSelectorBody(styles, "button.tool-tab", "background: transparent");
    expectSelectorBody(styles, ".tool-tab.is-active", "background: var(--button-hover)");
    expectSelectorBody(styles, "button.tool-tab.is-active", "background: var(--button-hover)");
    expectSelectorBody(styles, "button.quick-menu-button", "background: transparent");
    expectSelectorBody(styles, "button.todo-section-menu-button", "background: transparent");
    expectSelectorBody(styles, ".todo-collapse-button", "background: transparent");
    expectSelectorBody(styles, "button.todo-collapse-button", "background: transparent");
    expectSelectorBody(styles, ".todo-collapse-button", "--n-color: transparent !important");
    expectSelectorBody(styles, ".todo-collapse-button", "--n-color-hover: transparent !important");
    expectSelectorBody(styles, ".panel.is-focused", "box-shadow: none");
    expectSelectorBody(styles, ".todo-section.is-focused::before", "content: none");
  });
});
