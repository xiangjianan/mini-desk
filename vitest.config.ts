import { configDefaults, defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: "jsdom",
    exclude: [...configDefaults.exclude, "**/.worktrees/**"],
    globals: true,
    setupFiles: ["src/test/setup.ts"],
  },
});
