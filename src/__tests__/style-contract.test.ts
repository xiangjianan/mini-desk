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
    expectSelectorBody(styles, ".workbench-zone", "padding: 16px");
    expectSelectorBody(styles, ".workbench-zone", "background: color-mix(in srgb, var(--card) 96%, var(--background))");
    expectSelectorBody(styles, ".workbench-zone", "inset 0 0 0 1px color-mix(in srgb, var(--border) 34%, transparent)");
    expectSelectorBody(styles, ".workbench-zone > .panel", "border-radius: var(--radius)");
    expectSelectorBody(styles, ".workbench-zone > .space-panel", "box-shadow: none");
    expectSelectorBody(styles, ".workbench-zone > .image-panel", "box-shadow: none");
    expectSelectorBody(styles, ".workbench-zone > .todo-panel", "box-shadow: none");
    expectSelectorBody(styles, ".workbench-zone > .text-panel", "box-shadow: none");
    expectSelectorBody(styles, ".workbench-zone > .tool-panel", "box-shadow: none");
    expectSelectorBody(styles, ".workbench-zone > .image-panel", "border-radius: var(--radius)");
    expectSelectorBody(styles, ".workbench-zone > .tool-panel", "border-radius: var(--radius)");
    expectSelectorBody(styles, ".workbench-zone > .todo-panel", "border-radius: var(--radius)");
    expect(ruleBodies(styles, ".workbench-zone > .tool-panel").join("\n")).not.toContain("border-radius: 0");
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
    expectSelectorBody(styles, ".tool-panel > .panel-header", "border-top-left-radius: var(--radius)");
    expectSelectorBody(styles, ".tool-panel > .tool-panel-header", "border-top-left-radius: var(--radius)");
    expectSelectorBody(styles, ".workbench-zone-notes > .quick-block > .panel-header", "border-top-left-radius: var(--radius)");
    expectSelectorBody(styles, ".workbench-zone-notes > .quick-block > .panel-header", "border-top-right-radius: var(--radius)");
    expectSelectorBody(styles, ".note-panel.tool-panel.split-block", "border-top-left-radius: var(--radius) !important");
    expectSelectorBody(styles, ".note-panel.tool-panel.split-block", "border-top-right-radius: var(--radius) !important");
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

  it("keeps legacy native button styling from overriding shadcn buttons", () => {
    const styles = readFileSync(resolve(__dirname, "../styles.css"), "utf8");
    const bareButtonBodies = ruleBodies(styles, "button");

    expect(bareButtonBodies.join("\n")).not.toMatch(/\b(border|background|border-radius|min-height|padding):/);
    expectSelectorBody(styles, 'button:not([data-slot="button"])', "border: 0");
    expect(ruleBodies(styles, 'button:not([data-slot="button"])').join("\n")).not.toContain("background:");
    expect(styles).not.toContain('button:not([data-slot="button"]):hover');
    expectSelectorBody(styles, 'button:not([data-slot="button"])', "min-height: 30px");
  });

  it("keeps the settings custom GIF dialog above workspace content", () => {
    const styles = readFileSync(resolve(__dirname, "../styles.css"), "utf8");

    expectSelectorBody(styles, ".workbench-command-bar", "overflow: visible");
    expectSelectorBody(styles, ".workbench-command-bar", "z-index: 4200");
    expectSelectorBody(styles, ".gif-theme-custom-dialog", "z-index: 4210");
  });

  it("normalizes retained Naive UI and panel internals through shared tokens", () => {
    const styles = readFileSync(resolve(__dirname, "../styles.css"), "utf8");

    expectSelectorBody(styles, ".n-button", "--n-border-radius: var(--radius)");
    expectSelectorBody(styles, ".n-button:not(.n-button--primary-type):not(.n-button--error-type)", "--n-color: var(--button) !important");
    expectSelectorBody(styles, ".n-dropdown-menu", "border: 1px solid var(--border) !important");
    expectSelectorBody(styles, ".n-dropdown-menu", "background: var(--popover) !important");
    expectSelectorBody(styles, ".n-dropdown-menu", "color: var(--popover-foreground) !important");
    expectSelectorBody(styles, ".n-dropdown-menu", "box-shadow: 0 6px 14px rgba(15, 23, 42, 0.045) !important");
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
    expectSelectorBody(styles, ".companion-popover-shell.n-popover", "box-shadow: 0 6px 14px rgba(15, 23, 42, 0.045) !important");
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
    expectSelectorBody(styles, ".preview-stage img", "max-width: calc(100vw - var(--image-preview-left, clamp(220px, 18vw, 320px)) - 32px)");
    expectSelectorBody(styles, ".preview-stage img", "width: 100%");
    expectSelectorBody(styles, ".preview-stage img", "height: 100%");
    expectSelectorBody(styles, ".preview-stage img", "min-width: 0");
    expectSelectorBody(styles, ".preview-stage img", "min-height: 0");
    expectSelectorBody(styles, ".preview-stage img", "justify-self: stretch");
    expectSelectorBody(styles, ".preview-stage img", "align-self: stretch");
    expectSelectorBody(styles, ".preview-stage img", "max-width: 100%");
    expectSelectorBody(styles, ".preview-stage img", "max-height: 100%");
    expectSelectorBody(styles, ".preview-stage img", "object-fit: contain");
    expectSelectorBody(styles, ".preview-main", "grid-template-rows: minmax(0, 1fr)");
    expectSelectorBody(styles, ".preview-actions", "position: absolute");
    expectSelectorBody(styles, ".preview-actions", "bottom: 14px");
    expectSelectorBody(styles, ".preview-toolbar-button:focus-visible", "outline: 0");
    expectSelectorBody(styles, ".preview-toolbar-button:focus-visible", "box-shadow: none");
    expectSelectorBody(styles, ".image-editor-stage", "overflow: visible");
    expectSelectorBody(styles, ".image-editor-crop-actions", "transform: translate(8px, 8px)");
    expectSelectorBody(styles, ".image-editor-tool[data-tooltip]:hover::after", "content: attr(data-tooltip)");
    expectSelectorBody(styles, ".workbench-grid", "position: relative");
    expectSelectorBody(styles, ".workbench-grid", "grid-template-columns: minmax(160px, 0.15fr) minmax(320px, 0.2fr) minmax(320px, 0.35fr) minmax(320px, 0.3fr)");
    expectSelectorBody(styles, ".workbench-grid", "gap: 14px");
    expectSelectorBody(styles, ".workbench-grid", "padding: 14px");
    expectSelectorBody(styles, ".workbench-grid", "grid-row: 2");
    expectSelectorBody(styles, ".workbench-header-reveal-zone", "position: absolute");
    expectSelectorBody(styles, ".workbench-header-reveal-zone", "z-index: 4500");
    expectSelectorBody(styles, ".workbench-header-reveal-zone", "top: 0");
    expectSelectorBody(styles, ".workbench-header-reveal-zone", "right: 100px");
    expectSelectorBody(styles, ".workbench-header-reveal-zone", "width: 32px");
    expectSelectorBody(styles, ".workbench-header-reveal-zone", "height: 32px");
    expectSelectorBody(styles, ".workbench-header-reveal", "position: absolute");
    expectSelectorBody(styles, ".workbench-header-reveal", "top: 1px");
    expectSelectorBody(styles, ".workbench-header-reveal", "left: 0");
    expectSelectorBody(styles, ".workbench-header-reveal", "width: 32px");
    expectSelectorBody(styles, ".workbench-header-reveal", "height: 32px");
    expectSelectorBody(styles, ".workbench-header-reveal", "border-radius: 0");
    expectSelectorBody(styles, ".workbench-header-reveal", "background: transparent");
    expectSelectorBody(styles, ".workbench-header-reveal", "box-shadow: none");
    expectSelectorBody(styles, ".workbench-header-reveal::before", "top: -1px");
    expectSelectorBody(styles, ".workbench-header-reveal::before", "height: 22px");
    expectSelectorBody(styles, ".workbench-header-reveal::before", "transform: translateX(-50%)");
    expectSelectorBody(styles, ".workbench-header-reveal:hover", "background: transparent");
    expectSelectorBody(styles, ".workbench-header-reveal:hover", "cursor: pointer");
    expectSelectorBody(styles, ".workbench-header-reveal:hover", "transform: translateY(0)");
    expectSelectorBody(styles, ".workbench-header-reveal-leave-to", "transform: translateY(-12px)");
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
    expectSelectorBody(styles, ".settings-btn.icon-button", "border-radius: 50% !important");
    expectSelectorBody(styles, ".settings-btn.icon-button", "--n-border-radius: 50% !important");
    expectSelectorBody(styles, ".settings-btn.icon-button .n-icon", "font-size: 16px");
    expectSelectorBody(styles, ".settings-btn.icon-button svg", "stroke-width: 1.8");
    expectSelectorBody(styles, ".icon-button", "border-radius: 50%");
    expectSelectorBody(styles, ".n-button.icon-button", "border-radius: 50% !important");
    expectSelectorBody(styles, ".icon-button .n-icon", "font-size: 16px");
    expectSelectorBody(styles, ".icon-button svg", "font-size: 16px");
    expectSelectorBody(styles, ".icon-button svg", "stroke-width: 1.8");
    expectSelectorBody(styles, ".tool-tabs", "flex: 0 0 35px");
    expectSelectorBody(styles, ".tool-tabs", "width: 35px");
    expectSelectorBody(styles, ".tool-tabs", "min-width: 35px");
    expectSelectorBody(styles, ".tool-tabs", "max-width: 35px");
    expectSelectorBody(styles, ".tool-tabs", "border-right: 1px solid color-mix(in srgb, var(--border) 72%, transparent)");
    expectSelectorBody(styles, ".tool-tabs", "border-bottom: 0");
    expectSelectorBody(styles, ".tool-tabs", "box-shadow: none");
    expectSelectorBody(styles, ".tool-panel-menu-button", "width: 34px");
    expectSelectorBody(styles, ".tool-panel-menu-button", "height: 34px");
    expectSelectorBody(styles, ".tool-panel-menu-button", "border-radius: 50%");
    expectSelectorBody(styles, "button.tool-panel-menu-button", "border-radius: 50%");
    expectSelectorBody(styles, "button.tool-panel-menu-button:hover", "background: transparent");
    expectSelectorBody(styles, "button.tool-panel-menu-button:hover", "box-shadow: none");
    expectSelectorBody(styles, "button.tool-panel-menu-button:hover", "border-radius: 50%");
    expectSelectorBody(styles, "button.tool-tab", "background: transparent");
    expectSelectorBody(styles, ".tool-tab", "width: 30px");
    expectSelectorBody(styles, ".tool-tab", "height: 30px");
    expectSelectorBody(styles, ".tool-tab", "border-radius: 50%");
    expectSelectorBody(styles, "button.tool-tab", "border-radius: 50%");
    expectSelectorBody(styles, ".note-panel.tool-panel .tool-tab", "width: 30px");
    expectSelectorBody(styles, ".note-panel.tool-panel .tool-tab", "border-radius: 50%");
    expectSelectorBody(styles, ".tool-tab-icon", "flex: 0 0 16px");
    expectSelectorBody(styles, ".tool-tab-icon", "width: 16px");
    expectSelectorBody(styles, ".tool-tab-icon", "height: 16px");
    expectSelectorBody(styles, ".tool-tab-icon", "font-size: 16px");
    expectSelectorBody(styles, ".tool-tab-icon .n-icon", "font-size: 16px");
    expectSelectorBody(styles, ".tool-tab-icon svg", "font-size: 16px");
    expectSelectorBody(styles, ".tool-tab-icon svg", "stroke-width: 1.8");
    expectSelectorBody(styles, ".tool-tab::after", "content: attr(data-tooltip)");
    expectSelectorBody(styles, ".tool-tab:hover::after", "opacity: 1");
    expectSelectorBody(styles, ".tool-tab.is-active", "background: var(--button-hover)");
    expectSelectorBody(styles, "button.tool-tab.is-active", "background: var(--button-hover)");
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
    expectSelectorBody(styles, ".workbench-theme-button", "border-radius: 50%");
    expectSelectorBody(styles, ".workbench-header-hide-button svg", "stroke-width: 1.5");
    expectSelectorBody(styles, ".workbench-theme-button svg", "stroke-width: 1.5");
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
    expectSelectorBody(styles, ".notify-panel-action.is-confirm", "color: #18a058");
    expectSelectorBody(styles, ".notify-panel-action.is-confirm", "background: var(--button)");
    expectSelectorBody(styles, ".notify-panel-action.is-confirm:hover:not(:disabled)", "background: rgba(24, 160, 88, 0.1)");
    expectSelectorBody(styles, ".notify-floating-date-picker", "--notify-date-column-width: 332px");
    expectSelectorBody(styles, ".notify-floating-date-picker", "--notify-time-column-width: 114px");
    expectSelectorBody(styles, ".notify-floating-date-picker", "grid-template-columns: var(--notify-date-column-width) var(--notify-time-column-width)");
    expectSelectorBody(styles, ".notify-floating-date-picker", "border: 0");
    expectSelectorBody(styles, ".notify-floating-date-picker", "border-radius: var(--radius)");
    expectSelectorBody(styles, ".notify-floating-date-picker", "box-shadow: 0 8px 22px rgba(15, 23, 42, 0.12)");
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
    expectSelectorBody(styles, ".quick-dialog-submit.n-button", "--n-color-hover: rgba(24, 160, 88, 0.1) !important");
    expectSelectorBody(styles, ".quick-dialog-submit.n-button", "--n-text-color: #18a058 !important");
    expectSelectorBody(styles, ".quick-dialog-submit.n-button:hover:not(.n-button--disabled)", "background: rgba(24, 160, 88, 0.1) !important");
    expectSelectorBody(styles, ".n-time-picker-panel .n-button--primary-type", "--n-text-color: #111111 !important");
    expectSelectorBody(styles, ".n-time-picker-panel .n-button--primary-type", "color: #111111 !important");
  });

  it("keeps shortcut help key pills visually tied to the shared keyboard", () => {
    const styles = readFileSync(resolve(__dirname, "../styles.css"), "utf8");
    const activeKeycap = ruleBodies(styles, ".shortcut-keyboard-diagram--shared .shortcut-keycap--active").join("\n");
    const keyPill = ruleBodies(styles, ".shortcut-key-pill").join("\n");

    expect(activeKeycap).toContain("background: color-mix(in srgb, var(--line-focus) 18%, var(--button))");
    expect(keyPill).toContain("background: color-mix(in srgb, var(--line-focus) 18%, var(--button))");
    expect(keyPill).toContain("border-color: color-mix(in srgb, var(--line-focus) 42%, var(--line-subtle))");
  });

  it("centers reminder star icons, unifies primary tool buttons, and unifies thin scrollbars", () => {
    const styles = readFileSync(resolve(__dirname, "../styles.css"), "utf8");

    expectSelectorBody(styles, ".todo-star-button", "display: inline-flex");
    expectSelectorBody(styles, ".todo-star-button", "align-items: center");
    expectSelectorBody(styles, ".todo-star-button", "justify-content: center");
    expectSelectorBody(styles, ".todo-star-button", "font-size: 12px");
    expectSelectorBody(styles, ".todo-star-button", "line-height: 1");

    expectSelectorBody(styles, ".tool-primary-action.eyedropper-button", "--eyedropper-flow-gradient: none");
    expectSelectorBody(styles, ".tool-primary-action.eyedropper-button", "border: 1px solid color-mix(in srgb, var(--primary) 56%, transparent)");
    expectSelectorBody(styles, ".tool-primary-action.eyedropper-button", "background: var(--button)");
    expectSelectorBody(styles, ".tool-primary-action.eyedropper-button", "color: var(--primary)");
    expectSelectorBody(styles, ".tool-primary-action.eyedropper-button", "font-size: var(--app-font-size)");
    expectSelectorBody(styles, ".tool-primary-action.eyedropper-button::before", "display: none");
    expectSelectorBody(styles, ".tool-primary-action.eyedropper-button > *", "z-index: 1");
    expectSelectorBody(styles, ".eyedropper-label", "z-index: 1");
    expectSelectorBody(styles, ".eyedropper-label", "font-size: inherit");
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
    expectSelectorBody(styles, ":root", "--scrollbar-thumb: color-mix(in srgb, var(--line-control) 44%, transparent)");
    expectSelectorBody(styles, ":root", "--scrollbar-thumb-hover: color-mix(in srgb, var(--line-control) 58%, transparent)");
    expectSelectorBody(styles, "*", "scrollbar-color: var(--scrollbar-thumb) transparent");
    expectSelectorBody(styles, ".n-scrollbar", "--n-scrollbar-width: var(--scrollbar-size) !important");
    expectSelectorBody(styles, ".n-scrollbar", "--n-scrollbar-height: var(--scrollbar-size) !important");
    expectSelectorBody(styles, ".n-scrollbar-rail__scrollbar", "background: var(--scrollbar-thumb) !important");
    expectSelectorBody(styles, ".n-scrollbar-rail__scrollbar:hover", "background: var(--scrollbar-thumb-hover) !important");
    expectSelectorBody(styles, ".tool-content-scrollbar", "--n-scrollbar-width: var(--scrollbar-size) !important");
    expectSelectorBody(styles, ".todo-list-scrollbar", "--n-scrollbar-width: var(--scrollbar-size) !important");
    expectSelectorBody(styles, ".today-focus-scrollbar", "--n-scrollbar-width: var(--scrollbar-size) !important");
  });

  it("keeps calculator operators neutral while giving equals a white primary-accent treatment", () => {
    const styles = readFileSync(resolve(__dirname, "../styles.css"), "utf8");

    const operatorRules = ruleBodies(styles, ".calculator-key.is-operator").join("\n");
    const equalsRules = ruleBodies(styles, ".calculator-key.is-equals").join("\n");

    expect(operatorRules).not.toContain("var(--primary)");
    expect(equalsRules).toContain("color: var(--primary)");
    expect(equalsRules).toContain("background: var(--button)");
    expect(equalsRules).toContain("border: 1px solid color-mix(in srgb, var(--primary) 56%, transparent)");
    expect(equalsRules).toContain("box-shadow: var(--shadow-control)");
    expectSelectorBody(styles, ".calculator-key.is-operator", "color: var(--text)");
    expectSelectorBody(styles, ".calculator-key.is-operator", "background: var(--button)");
    expectSelectorBody(styles, ".calculator-key.is-operator:hover", "background: var(--button-hover)");
    expectSelectorBody(styles, ".calculator-key.is-equals:hover", "background: var(--button-hover)");
    expectSelectorBody(styles, ".tool-primary-action", "border-color: color-mix(in srgb, var(--primary) 56%, transparent)");
    expectSelectorBody(styles, ".tool-primary-action", "background: var(--button)");
  });

  it("keeps the calculator expression input aligned with other tool fields", () => {
    const styles = readFileSync(resolve(__dirname, "../styles.css"), "utf8");
    const calculatorInputRules = ruleBodies(styles, ".calculator-display > input").join("\n");

    expectSelectorBody(styles, ".tool-field > input", "border: 1px solid color-mix(in srgb, var(--border) 86%, transparent)");
    expectSelectorBody(styles, ".tool-field > input", "border-radius: var(--radius-control)");
    expectSelectorBody(styles, ".calculator-display > input", "text-align: right");
    expectSelectorBody(styles, ".calculator-display > input", "padding: 0 8px");
    expect(calculatorInputRules).not.toContain("border: 0");
    expect(calculatorInputRules).not.toContain("font-size: 20px");
    expect(calculatorInputRules).not.toContain("height: 42px");
  });
});
