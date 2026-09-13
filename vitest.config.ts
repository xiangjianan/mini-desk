import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    // .agents/** 与 .claude/** 下的 skill 自带 node:test 测试与本项目无关，vitest 无法打包须排除。
    exclude: [...configDefaults.exclude, "**/.worktrees/**", "**/.agents/**", "**/.claude/**"],
    globals: true,
    setupFiles: ["src/test/setup.ts"],
  },
});
