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

type KeyboardRowId = "system" | "numbers" | "letters-top" | "letters-home" | "letters-bottom" | "controls" | "arrows";

type ShortcutKeycap = {
  id: string;
  label: string;
  row: KeyboardRowId;
  slot: number;
  span?: number;
};

type ShortcutKeyboardRow = {
  id: KeyboardRowId;
  keys: ShortcutKeycap[];
};

type ShortcutDisplayGroup =
  | { kind: "keyboard"; label: string; rows: ShortcutKeyboardRow[] }
  | { kind: "gesture"; label: string };

const KEYBOARD_ROW_ORDER: KeyboardRowId[] = ["system", "numbers", "letters-top", "letters-home", "letters-bottom", "controls", "arrows"];

const KEYBOARD_KEYS: Record<string, ShortcutKeycap> = {
  ctrl: { id: "ctrl", label: "Ctrl", row: "controls", slot: 1, span: 2 },
  shift: { id: "shift", label: "Shift", row: "letters-bottom", slot: 1, span: 2 },
  tab: { id: "tab", label: "Tab", row: "letters-top", slot: 1, span: 2 },
  w: { id: "w", label: "W", row: "letters-top", slot: 4 },
  a: { id: "a", label: "A", row: "letters-home", slot: 3 },
  s: { id: "s", label: "S", row: "letters-home", slot: 4 },
  d: { id: "d", label: "D", row: "letters-home", slot: 5 },
  v: { id: "v", label: "V", row: "letters-bottom", slot: 6 },
  "5": { id: "5", label: "5", row: "numbers", slot: 6 },
  enter: { id: "enter", label: "Enter", row: "letters-home", slot: 12, span: 2 },
  delete: { id: "delete", label: "Delete", row: "system", slot: 12, span: 2 },
  backspace: { id: "backspace", label: "Backspace", row: "numbers", slot: 12, span: 3 },
  esc: { id: "esc", label: "Esc", row: "system", slot: 1, span: 2 },
  space: { id: "space", label: "Space", row: "controls", slot: 5, span: 5 },
  "arrow-up": { id: "arrow-up", label: "↑", row: "arrows", slot: 2 },
  "arrow-left": { id: "arrow-left", label: "←", row: "arrows", slot: 1 },
  "arrow-down": { id: "arrow-down", label: "↓", row: "arrows", slot: 2 },
  "arrow-right": { id: "arrow-right", label: "→", row: "arrows", slot: 3 },
};

function getShortcutDisplayGroups(shortcut: string): ShortcutDisplayGroup[] {
  return shortcut.split(" / ").map((part) => createShortcutDisplayGroup(part.trim())).filter((group) => group.label.length > 0);
}

function createShortcutDisplayGroup(part: string): ShortcutDisplayGroup {
  const tokens = part.split(/\s+\+\s+/).flatMap((token) => token.split("/").map((value) => value.trim()).filter(Boolean));
  const keys = tokens.map(normalizeKeyToken).map((key) => KEYBOARD_KEYS[key]).filter((key): key is ShortcutKeycap => Boolean(key));

  if (keys.length === tokens.length && keys.length > 0) {
    return {
      kind: "keyboard",
      label: part,
      rows: createKeyboardRows(keys),
    };
  }

  return { kind: "gesture", label: part };
}

function normalizeKeyToken(token: string): string {
  const lower = token.toLowerCase();
  const arrows: Record<string, string> = {
    "↑": "arrow-up",
    "←": "arrow-left",
    "↓": "arrow-down",
    "→": "arrow-right",
  };

  return arrows[token] ?? lower;
}

function createKeyboardRows(keys: ShortcutKeycap[]): ShortcutKeyboardRow[] {
  return KEYBOARD_ROW_ORDER.map((row) => ({
    id: row,
    keys: keys.filter((key) => key.row === row).sort((left, right) => left.slot - right.slot),
  })).filter((row) => row.keys.length > 0);
}
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
              <div class="shortcut-keyboard" :aria-label="item.key">
                <span class="shortcut-key-text">{{ item.key }}</span>
                <template v-for="(group, groupIndex) in getShortcutDisplayGroups(item.key)" :key="`${item.key}-${groupIndex}`">
                  <div v-if="group.kind === 'keyboard'" class="shortcut-keyboard-diagram" :aria-label="group.label">
                    <div v-for="row in group.rows" :key="row.id" class="shortcut-keyboard-row" :data-row="row.id">
                      <kbd
                        v-for="key in row.keys"
                        :key="key.id"
                        class="shortcut-keycap"
                        :class="`shortcut-keycap--${key.id}`"
                        :style="{ gridColumn: `${key.slot} / span ${key.span ?? 1}` }"
                      >
                        {{ key.label }}
                      </kbd>
                    </div>
                  </div>
                  <span v-else class="shortcut-gesture-pill">{{ group.label }}</span>
                  <span v-if="groupIndex < getShortcutDisplayGroups(item.key).length - 1" class="shortcut-key-separator" aria-hidden="true">/</span>
                </template>
              </div>
              <span>{{ item.desc }}</span>
            </div>
          </div>
        </div>
      </div>
    </NScrollbar>
  </NModal>
</template>
