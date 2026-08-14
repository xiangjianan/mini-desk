import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  base: process.env.VITE_BASE ?? "/",
  plugins: [vue(), tailwindcss()],
  build: {
    // Vite 8 runs on rolldown; the legacy `manualChunks` hook is a compatibility
    // shim that silently drops groups (the old vendor-vue rule never emitted a
    // chunk). `advancedChunks` groups are the supported way to pin vendor splits.
    rolldownOptions: {
      output: {
        advancedChunks: {
          groups: [
            { name: "vendor-vue", test: /[\\/]node_modules[\\/](vue|@vue)[\\/]/ },
            { name: "vendor-naive", test: /[\\/]node_modules[\\/]naive-ui[\\/]/ },
            { name: "vendor-icons", test: /[\\/]node_modules[\\/](@vicons|lucide-vue-next)[\\/]/ },
            { name: "vendor-ui", test: /[\\/]node_modules[\\/](reka-ui|@vueuse)[\\/]/ },
            { name: "vendor", test: /[\\/]node_modules[\\/]/ },
          ],
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
