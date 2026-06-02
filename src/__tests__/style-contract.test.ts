import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("workbench style contract", () => {
  it("normalizes retained Naive UI and panel internals through shared tokens", () => {
    const styles = readFileSync(resolve(__dirname, "../styles.css"), "utf8");

    expect(styles).toContain(".n-dropdown-menu");
    expect(styles).toContain("--n-border-radius: var(--radius)");
    expect(styles).toContain(".panel-header");
    expect(styles).toContain("border-bottom: 1px solid var(--border)");
    expect(styles).toContain(".todo-item");
    expect(styles).toContain("border-color: var(--border)");
    expect(styles).toContain(".quick-button");
    expect(styles).toContain("border-radius: var(--radius)");
  });
});
