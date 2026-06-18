import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  base: process.env.VITE_BASE ?? "/",
  plugins: [vue(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("/node_modules/vue/") || id.includes("/node_modules/@vue/")) return "vendor-vue";
          if (id.includes("/node_modules/naive-ui/")) return "vendor-naive";
          if (id.includes("/node_modules/@vicons/") || id.includes("/node_modules/lucide-vue-next/")) return "vendor-icons";
          if (id.includes("/node_modules/reka-ui/") || id.includes("/node_modules/@vueuse/")) return "vendor-ui";
          return "vendor";
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
