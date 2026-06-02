import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(__dirname, "../../", path), "utf8")) as T;
}

describe("design system setup", () => {
  it("configures Tailwind and shadcn-vue for a Vue Vite app", () => {
    const packageJson = readJson<{
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    }>("package.json");
    const tsconfig = readJson<{
      compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> };
    }>("tsconfig.json");
    const components = readJson<{
      aliases: Record<string, string>;
      style: string;
      tailwind: { css: string };
    }>("components.json");
    const viteConfig = readFileSync(resolve(__dirname, "../../vite.config.ts"), "utf8");
    const styles = readFileSync(resolve(__dirname, "../styles.css"), "utf8");

    expect(packageJson.dependencies).toHaveProperty("lucide-vue-next");
    expect(packageJson.dependencies).toHaveProperty("tailwind-merge");
    expect(packageJson.dependencies).toHaveProperty("clsx");
    expect(packageJson.devDependencies).toHaveProperty("tailwindcss");
    expect(packageJson.devDependencies).toHaveProperty("@tailwindcss/vite");
    expect(tsconfig.compilerOptions?.baseUrl).toBe(".");
    expect(tsconfig.compilerOptions?.paths?.["@/*"]).toEqual(["./src/*"]);
    expect(components.aliases.components).toBe("@/components");
    expect(components.aliases.utils).toBe("@/lib/utils");
    expect(components.tailwind.css).toBe("src/styles.css");
    expect(components.style).toBe("new-york");
    expect(viteConfig).toContain("@tailwindcss/vite");
    expect(viteConfig).toContain('path.resolve(__dirname, "./src")');
    expect(styles).toContain('@import "tailwindcss"');
    expect(styles).toContain("--background:");
    expect(styles).toContain("--foreground:");
  });
});
