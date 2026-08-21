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

describe("pwa configuration", () => {
  it("links the manifest and registers the service worker in the production entry", () => {
    const index = read("index.html");

    expect(index).toContain('<link rel="manifest" href="/manifest.webmanifest"');
    expect(read("src/main.ts")).toContain("registerServiceWorker");
  });

  it("serves sw.js and the manifest with no-cache headers", () => {
    const headers = read("public/_headers");

    expect(headers).toContain("/sw.js");
    expect(headers).toContain("Cache-Control: no-cache");
  });

  it("pre-caches the app shell declared by the service worker", () => {
    const sw = read("public/sw.js");

    expect(sw).toContain('"/theme-boot.js"');
    expect(sw).toContain('"/manifest.webmanifest"');
    expect(sw).toContain('"/icons/icon-192.png"');
    expect(sw).toContain('"/icons/icon-512.png"');
  });
});
