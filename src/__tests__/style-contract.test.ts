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
  it("normalizes retained Naive UI and panel internals through shared tokens", () => {
    const styles = readFileSync(resolve(__dirname, "../styles.css"), "utf8");

    expectSelectorBody(styles, ".n-button", "--n-border-radius: var(--radius)");
    expectSelectorBody(styles, ".n-dropdown-menu", "border: 1px solid var(--border) !important");
    expectSelectorBody(styles, ".n-dropdown-menu", "background: var(--popover) !important");
    expectSelectorBody(styles, ".n-dropdown-menu", "color: var(--popover-foreground) !important");
    expectSelectorBody(styles, ".n-modal .n-card", "border: 1px solid var(--border) !important");
    expectSelectorBody(styles, ".n-modal .n-card", "background: var(--popover) !important");
    expectSelectorBody(styles, ".n-modal .n-card", "color: var(--popover-foreground) !important");
    expectSelectorBody(styles, ".panel-header", "border-bottom: 1px solid var(--border)");
    expectSelectorBody(styles, ".panel-header", "background: var(--card)");
    expectSelectorBody(styles, ".todo-item", "border-color: var(--border)");
    expectSelectorBody(styles, ".todo-item", "border-radius: var(--radius)");
    expectSelectorBody(styles, ".todo-item::after", "border-bottom: 1px solid var(--border)");
    expectSelectorBody(styles, ".quick-button", "border-color: var(--border)");
    expectSelectorBody(styles, ".quick-button", "border-radius: var(--radius)");
    expectSelectorBody(styles, ".companion-popover-shell.n-popover", "border: 1px solid var(--border) !important");
    expectSelectorBody(styles, ".companion-popover-shell.n-popover", "background: var(--popover) !important");
    expectSelectorBody(styles, ".companion-popover-arrow", "border: 1px solid var(--border) !important");
    expect(ruleBodies(styles, ".companion-popover-shell.n-popover").join("\n")).not.toContain("#111");
    expect(ruleBodies(styles, ".companion-popover-arrow").join("\n")).not.toContain("#111");
  });
});
