<script setup lang="ts">
import { computed } from "vue";
import { NModal, NScrollbar } from "naive-ui";
import type { AppLanguage } from "../types";
import { getUiText, normalizeLanguage } from "../state/i18n";
import { CHANGELOG } from "../state/changelog";

const props = withDefaults(defineProps<{
  show: boolean;
  language?: AppLanguage;
  updateAvailable?: boolean;
  availableVersion?: string;
}>(), {
  language: "zh",
  updateAvailable: false,
  availableVersion: "",
});

const emit = defineEmits<{ close: []; update: [] }>();

const uiText = computed(() => getUiText(props.language));
const isEn = computed(() => normalizeLanguage(props.language) === "en");
const updateLabel = computed(() => uiText.value.changelog.updateTo.replace("{version}", props.availableVersion || ""));

const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Friendly per-language date: 2026-08-13 → 「2026年8月13日」/「Aug 13, 2026」.
function formatDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!year || !month || !day) return iso;
  return isEn.value ? `${MONTHS_EN[month - 1]} ${day}, ${year}` : `${year}年${month}月${day}日`;
}
</script>

<template>
  <NModal
    :show="show"
    preset="card"
    :mask-closable="true"
    :title="uiText.changelog.title"
    class="version-history-modal"
    @update:show="(value: boolean) => !value && emit('close')"
  >
    <NScrollbar class="version-history-content" @wheel.stop>
      <div class="version-history-inner">
        <button
          v-if="updateAvailable"
          type="button"
          class="version-history-update"
          @click="emit('update')"
        >
          {{ updateLabel }}
        </button>
        <ol class="version-history-list">
          <li v-for="(entry, index) in CHANGELOG" :key="entry.version" class="version-history-entry">
            <div class="version-history-entry-head">
              <span class="version-history-version">v{{ entry.version }}</span>
              <span v-if="index === 0" class="version-history-badge">{{ uiText.changelog.latest }}</span>
              <span class="version-history-date">{{ formatDate(entry.date) }}</span>
            </div>
            <ul class="version-history-notes">
              <li v-for="(note, noteIndex) in (isEn ? entry.notes.en : entry.notes.zh)" :key="noteIndex">{{ note }}</li>
            </ul>
          </li>
        </ol>
      </div>
    </NScrollbar>
  </NModal>
</template>
