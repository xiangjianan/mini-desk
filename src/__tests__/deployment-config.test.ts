import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("deployment configuration", () => {
  it("builds assets for the Cloudflare Pages root path by default", () => {
    const config = read("vite.config.ts");

    expect(config).toContain('base: process.env.VITE_BASE ?? "/"');
  });

  it("does not include a GitHub Pages deployment workflow", () => {
    expect(existsSync(".github/workflows/pages.yml")).toBe(false);
  });

  it("deploys the dist directory to the Cloudflare Pages project", () => {
    const packageJson = read("package.json");

    expect(packageJson).toContain(
      '"deploy:cloudflare": "npm run build && npx wrangler pages deploy dist --project-name=todolist"',
    );
  });
});
