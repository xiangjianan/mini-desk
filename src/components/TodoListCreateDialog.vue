<script setup lang="ts">
import { TITLE_MAX_LENGTH, limitTitle } from "../state/titleLimits";
import { computed, nextTick, ref } from "vue";
import { NButton, NInput, NModal } from "naive-ui";
import type { InputInst } from "naive-ui";
import { findTodoListByTitle } from "../state/todoListNames";
import type { AppLanguage, TodoListConfig } from "../types";
import { getUiText } from "../state/i18n";

const props = defineProps<{ language?: AppLanguage; lists?: TodoListConfig[]; dialogTitle?: string }>();
const emit = defineEmits<{ confirm: [anchor: HTMLElement | undefined, title: string, id?: string] }>();
const uiText = computed(() => getUiText(props.language ?? "zh"));
const inputRef = ref<InputInst | null>(null);
const show = ref(false);
const title = ref("");
const editingId = ref<string>();
const duplicate = computed(() => Boolean(findTodoListByTitle((props.lists ?? []).filter(list => list.id !== editingId.value), limitTitle(title.value), props.language ?? "zh")));
const attempted = ref(false);
let anchor: HTMLElement | undefined;

async function open(element?: HTMLElement, list?: TodoListConfig): Promise<void> {
  anchor = element;
  editingId.value = list?.id;
  title.value = list?.title ?? "";
  attempted.value = false;
  show.value = true;
  await nextTick();
  inputRef.value?.focus();
}
function confirm(): void {
  const trimmed = limitTitle(title.value);
  if (!trimmed) { inputRef.value?.focus(); return; }
  attempted.value = true;
  if (duplicate.value) { inputRef.value?.focus(); return; }
  emit("confirm", anchor, trimmed, editingId.value);
  show.value = false;
}
function clear(): void {
  if (show.value) return;
  title.value = "";
  anchor = undefined;
}
defineExpose({ open });
</script>

<template>
  <NModal :show="show" preset="card" class="quick-dialog todo-list-create-dialog"
    :mask-closable="false" :title="editingId ? uiText.todo.editList : (dialogTitle ?? uiText.todo.newList)" :aria-label="editingId ? uiText.todo.editList : (dialogTitle ?? uiText.todo.newList)"
    @close="show = false" @esc="show = false" @after-leave="clear">
    <form class="quick-form" autocomplete="off" @submit.prevent="confirm">
      <label for="todo-list-create-input">
        <span>{{ uiText.todo.listName }}</span>
        <NInput ref="inputRef" v-model:value="title" :status="attempted && duplicate ? 'error' : undefined" :maxlength="TITLE_MAX_LENGTH" show-count
          :input-props="{ id: 'todo-list-create-input', class: 'todo-list-create-input', name: 'mini-desk-todo-list-title', autocomplete: 'off' }" />
      </label>
      <p v-if="attempted && duplicate" role="alert">{{ uiText.todo.duplicateList }}</p>
      <div class="dialog-actions">
        <NButton class="quick-dialog-action todo-list-create-cancel" @click="show = false">{{ uiText.common.cancel }}</NButton>
        <NButton class="quick-dialog-action quick-dialog-submit todo-list-create-confirm" attr-type="submit">{{ editingId ? uiText.common.save : uiText.common.confirm }}</NButton>
      </div>
    </form>
  </NModal>
</template>
