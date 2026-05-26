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
    const workflow = read(".github/workflows/pages.yml");

    expect(workflow).toContain("VITE_BASE=/todolist/ npm run build");
    expect(workflow).toContain("cp -R dist/.");
    expect(workflow).toContain("git checkout gh-pages");
    expect(workflow).toContain("touch .nojekyll");
    expect(workflow).toContain("git push origin gh-pages");
  });
});
