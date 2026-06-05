<script setup lang="ts">
import { computed } from "vue";
import { NModal, NScrollbar } from "naive-ui";
import type { AppLanguage } from "../types";
import { getUiText, SHORTCUT_HELP } from "../state/i18n";

const props = withDefaults(defineProps<{
  show: boolean;
  language?: AppLanguage;
}>(), {
  language: "zh",
});

const emit = defineEmits<{ close: [] }>();
const uiText = computed(() => getUiText(props.language));
const sections = computed(() => SHORTCUT_HELP[props.language === "en" ? "en" : "zh"]);
</script>

<template>
  <NModal :show="show" preset="card" :title="uiText.settings.shortcutHelp" class="shortcut-help-modal" @update:show="(v: boolean) => !v && emit('close')">
    <NScrollbar class="shortcut-help-content" @wheel.stop>
      <div class="shortcut-help-inner">
        <div v-for="section in sections" :key="section.area" class="shortcut-section">
          <div class="shortcut-section-heading">
            <span class="shortcut-section-icon" aria-hidden="true">{{ section.icon }}</span>
            <div>
              <h4>{{ section.area }}</h4>
              <p>{{ section.summary }}</p>
            </div>
          </div>
          <ul class="shortcut-tip-list">
            <li v-for="tip in section.tips" :key="tip">{{ tip }}</li>
          </ul>
          <div class="shortcut-grid" :aria-label="section.area">
            <div v-for="item in section.shortcuts" :key="item.key" class="shortcut-row">
              <kbd>{{ item.key }}</kbd>
              <span>{{ item.desc }}</span>
            </div>
          </div>
        </div>
      </div>
    </NScrollbar>
  </NModal>
</template>
