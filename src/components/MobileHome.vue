<script setup lang="ts">
import { computed } from "vue";
import { getUiText } from "../state/i18n";
import type { AppLanguage } from "../types";
const props = defineProps<{ language: AppLanguage }>();
const app = computed(() => getUiText(props.language).app);
</script>

<template>
  <main class="mobile-desktop-guide" :aria-label="app.mobileLabel">
    <h1>{{ app.mobileTitle }}</h1>
    <p>{{ app.mobileMessage }}</p>
  </main>
</template>

<style scoped>
.mobile-desktop-guide { min-height: 100dvh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px; box-sizing: border-box; text-align: center; color: var(--text); background: var(--bg); }
h1 { font-size: 28px; margin: 0 0 16px; }
p { font-size: 16px; line-height: 1.6; margin: 0; }
</style>
