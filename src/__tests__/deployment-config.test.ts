import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("deployment configuration", () => {
  it("allows each Pages target to choose the Vite base path", () => {
    const config = read("vite.config.ts");

    expect(config).toContain('base: process.env.VITE_BASE ?? "/"');
  });

  it("builds the GitHub Pages artifact with the repository subpath", () => {
    const workflow = read(".github/workflows/deploy-pages.yml");

    expect(workflow).toContain("uses: actions/configure-pages@v6");
    expect(workflow).toContain("uses: actions/upload-pages-artifact@v5");
    expect(workflow).toContain("uses: actions/deploy-pages@v5");
    expect(workflow).toContain("VITE_BASE: /todolist/");
    expect(workflow).toContain("path: ./dist");
  });
});
