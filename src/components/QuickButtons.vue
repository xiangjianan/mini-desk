<script setup lang="ts">
import { computed, h, nextTick, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import type { Component, ComponentPublicInstance, VNode } from "vue";
import { NButton, NCheckbox, NDropdown, NIcon, NInput, NModal, NScrollbar, NSelect } from "naive-ui";
import { AddOutline, AppsOutline, ChevronDownOutline, ClipboardOutline, CloudUploadOutline, CopyOutline, CreateOutline, DocumentTextOutline, EyeOffOutline, EyeOutline, HelpCircleOutline, PricetagsOutline, SearchOutline, SwapHorizontalOutline, TrashOutline } from "@vicons/ionicons5";
import type { DropdownOption } from "naive-ui";
import type { AppLanguage, GuideKey, QuickApiBodyType, QuickApiHeader, QuickApiMethod, QuickButton, QuickButtonType, QuickTag, WorkspaceMoveTarget } from "../types";
import { GUIDE_MENU_OPTION } from "../state/defaults";
import { getUiText } from "../state/i18n";
import { buildVisibleQuickButtonGroups, filterVisibleQuickButtonGroups, getQuickTagColor, hasOverloadedVisibleQuickButtonGroup, normalizeQuickTagColor, QUICK_BUTTON_EMPTY_GROUP_ID, QUICK_DENSITY_THRESHOLD, QUICK_TAG_COLORS, QUICK_TAG_DEFAULT_COLOR } from "../state/quickButtons";
import { findQuickAppPresetByScheme, getQuickAppPresetHint, getQuickAppPresetTitle, QUICK_APP_PRESETS } from "../state/quickApps";
import { findQuickApiTemplate, QUICK_API_TEMPLATES } from "../state/quickApiTemplates";
import { clearGlobalSearch, globalSearchNormalized, globalSearchQuery, setGlobalSearch } from "../state/globalSearch";
import { CONTEXT_MENU_Z_INDEX, createExclusiveContextMenu } from "../utils/contextMenu";
import { renderIcon } from "../utils/dropdownIcons";
import { createDragAutoScroll, findDragScrollContainer } from "../utils/dragScroll";
import EditableTitle from "./EditableTitle.vue";
import HighlightText from "./HighlightText.vue";

const props = withDefaults(defineProps<{
  title: string;
  buttons: QuickButton[];
  tags?: QuickTag[];
  showHidden: boolean;
  otherCollapsed?: boolean;
  language?: AppLanguage;
  moveTargets?: WorkspaceMoveTarget[];
}>(), {
  tags: () => [],
  otherCollapsed: false,
  language: "zh",
  moveTargets: () => [],
});

const emit = defineEmits<{
  titleUpdate: [id: string, value: string];
  save: [payload: { id?: string; title: string; value: string; type: QuickButtonType; tagTitle?: string; apiMethod?: QuickApiMethod; apiHeaders?: QuickApiHeader[]; apiBodyType?: QuickApiBodyType; apiBody?: string }];
  delete: [id: string, anchor?: HTMLElement];
  copy: [id: string, anchor?: HTMLElement];
  copyText: [id: string, anchor?: HTMLElement];
  copyLink: [id: string, anchor?: HTMLElement];
  toggleHidden: [id: string];
  toggleShowHidden: [];
  reorder: [dragId: string, targetId: string];
  reorderTag: [dragId: string, targetId: string];
  moveToTag: [buttonId: string, tagId?: string, targetId?: string];
  saveTag: [payload: { id?: string; title: string; color?: string }];
  toggleTagCollapsed: [id: string];
  deleteTag: [id: string, anchor?: HTMLElement];
  guide: [key: GuideKey, anchor: HTMLElement, immediate?: boolean];
  declutter: [anchor: HTMLElement];
  moveButtonToWorkspace: [buttonId: string, workspaceId: string];
  moveTagToWorkspace: [tagId: string, workspaceId: string];
}>();

const dialogOpen = ref(false);
const tagManagerOpen = ref(false);
const editingId = ref<string | undefined>();
const titleRef = ref<{ openMenuAt: (x: number, y: number, event?: Event) => void } | null>(null);
type QuickApiHeaderFormRow = QuickApiHeader & { id: string };
type QuickTagDraft = QuickTag & { titleDraft: string; colorDraft: string };

let headerRowId = 0;

function createHeaderRow(key = "", value = ""): QuickApiHeaderFormRow {
  headerRowId += 1;
  return { id: `header-${headerRowId}`, key, value };
}

function createHeaderRows(headers: QuickApiHeader[] | undefined): QuickApiHeaderFormRow[] {
  const rows = (headers ?? []).map((header) => createHeaderRow(header.key, header.value));
  return rows.length ? rows : [createHeaderRow()];
}

const form = reactive<{ title: string; value: string; tagTitle: string; customTagTitle: string; type: QuickButtonType; apiMethod: QuickApiMethod; apiHeaders: QuickApiHeaderFormRow[]; apiBodyType: QuickApiBodyType; apiBody: string }>({
  title: "",
  value: "",
  tagTitle: "",
  customTagTitle: "",
  type: "link",
  apiMethod: "GET",
  apiHeaders: [createHeaderRow()],
  apiBodyType: "none",
  apiBody: "",
});
const menu = ref<{ x: number; y: number; id?: string; anchor?: HTMLElement; tagTitle?: string; tagId?: string } | null>(null);
const tagDrafts = ref<QuickTagDraft[]>([]);
const newTagTitle = ref("");
const tagManagerAnchor = ref<HTMLElement | undefined>();
const draggingId = ref<string | null>(null);
const draggingTagId = ref<string | null>(null);
const dragScroll = createDragAutoScroll();
const editingTagId = ref<string | null>(null);
const inlineTagDraft = ref("");
let inlineRenameInput: HTMLInputElement | null = null;
const isDragHover = ref(false);
const leavingHiddenIds = new Set<string>();
const uiText = computed(() => getUiText(props.language));
const guideMenuOption = computed<DropdownOption>(() => ({ ...GUIDE_MENU_OPTION, label: uiText.value.common.tips }));
const exclusiveMenu = createExclusiveContextMenu(closeMenu);
const apiMethodOptions = computed(() =>
  ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map((method) => ({ label: method, value: method })),
);
const apiBodyTypeOptions = computed(() => [
  { label: uiText.value.quick.bodyNone, value: "none" },
  { label: uiText.value.quick.bodyJson, value: "json" },
  { label: uiText.value.quick.bodyText, value: "text" },
  { label: uiText.value.quick.bodyForm, value: "form" },
]);
const tagChoices = computed(() => [
  { label: uiText.value.quick.noTag, value: "" },
  ...props.tags.map((tag) => ({ label: tag.title, value: tag.title })),
]);
const appPresetOptions = computed(() => [
  { label: uiText.value.quick.commonApp, value: "" },
  ...QUICK_APP_PRESETS.map((preset) => {
    const title = getQuickAppPresetTitle(preset, props.language);
    const hint = getQuickAppPresetHint(preset, props.language);
    return { label: hint ? `${title}（${hint}）` : title, value: preset.scheme };
  }),
]);
const selectedAppScheme = computed(() => {
  const preset = findQuickAppPresetByScheme(form.value);
  return preset ? preset.scheme : "";
});


onMounted(exclusiveMenu.mount);
onUnmounted(exclusiveMenu.unmount);
watch(() => props.tags, refreshTagDrafts, { deep: true });

const groupedButtons = computed(() => {
  const base = buildVisibleQuickButtonGroups(props.buttons, props.tags, props.showHidden, uiText.value.quick.otherTag, props.otherCollapsed);
  return filterVisibleQuickButtonGroups(base, globalSearchNormalized.value);
});
const searchOpen = ref(false);
const searchInputRef = ref<{ focus?: () => void } | null>(null);

function openSearch(): void {
  searchOpen.value = true;
  void nextTick(() => {
    searchInputRef.value?.focus?.();
  });
}

function closeSearch(): void {
  searchOpen.value = false;
  clearGlobalSearch();
}

function toggleSearch(): void {
  if (searchOpen.value) closeSearch();
  else openSearch();
}

function handleSearchClickOutside(event: MouseEvent): void {
  if (!searchOpen.value) return;
  const target = event.target as HTMLElement | null;
  if (target?.closest?.(".quick-search")) return;
  // Clicking a quick action button should not clear the search input.
  if (target?.closest?.(".quick-button")) return;
  closeSearch();
}

onMounted(() => {
  document.addEventListener("click", handleSearchClickOutside);
});
onUnmounted(() => {
  document.removeEventListener("click", handleSearchClickOutside);
});
const canSubmit = computed(() => {
  if (form.title.trim().length === 0 || form.value.trim().length === 0) return false;
  if (form.type !== "api") return true;
  return form.apiBodyType === "none" || form.apiBody.trim().length > 0;
});
const moveMenuChildren = computed<DropdownOption[]>(() =>
  props.moveTargets.map((target) => ({ label: target.title, key: `move-ws:${target.id}` })),
);
const menuOptions = computed<DropdownOption[]>(() => {
  if (menu.value?.tagId) {
    return moveMenuChildren.value.length > 0
      ? [{
          label: uiText.value.common.moveToWorkspace,
          key: "move-tag",
          icon: renderIcon(SwapHorizontalOutline),
          children: moveMenuChildren.value,
        }]
      : [];
  }
  const button = props.buttons.find((item) => item.id === menu.value?.id);
  if (!menu.value?.id) {
    return [
      { label: uiText.value.quick.add, key: "add", icon: renderIcon(AddOutline) },
      { label: uiText.value.common.paste, key: "paste", icon: renderIcon(ClipboardOutline) },
      { label: props.showHidden ? uiText.value.quick.hideHidden : uiText.value.quick.showHidden, key: "toggle-show-hidden", icon: renderIcon(props.showHidden ? EyeOffOutline : EyeOutline) },
      { label: uiText.value.quick.tagManage, key: "manage-tags", icon: renderIcon(PricetagsOutline) },
      { ...guideMenuOption.value, icon: renderIcon(HelpCircleOutline) },
    ];
  }
  return [
    { label: uiText.value.common.edit, key: "edit", icon: renderIcon(CreateOutline) },
    { label: button?.hidden ? uiText.value.quick.show : uiText.value.quick.hide, key: "toggle-hidden", icon: renderIcon(button?.hidden ? EyeOutline : EyeOffOutline) },
    ...(button?.type === "link"
      ? [
          { label: uiText.value.quick.copyText, key: "copy-text", icon: renderIcon(DocumentTextOutline) },
          { label: uiText.value.quick.copyLink, key: "copy-link", icon: renderIcon(CopyOutline) },
        ]
      : []),
    ...(moveMenuChildren.value.length > 0
      ? [{
          label: uiText.value.common.moveToWorkspace,
          key: "move-button",
          icon: renderIcon(SwapHorizontalOutline),
          children: moveMenuChildren.value,
        }]
      : []),
    { label: uiText.value.common.delete, key: "delete", icon: renderIcon(TrashOutline, true) },
    { ...guideMenuOption.value, icon: renderIcon(HelpCircleOutline) },
  ];
});

function openAdd(anchor?: HTMLElement, tagTitle = ""): void {
  editingId.value = undefined;
  form.title = "";
  form.value = "";
  form.tagTitle = tagTitle;
  form.customTagTitle = "";
  form.type = "link";
  form.apiMethod = "GET";
  form.apiHeaders = [createHeaderRow()];
  form.apiBodyType = "none";
  form.apiBody = "";
  dialogOpen.value = true;
  if (anchor) emit("guide", "addQuick", anchor);
}

function openEdit(id: string): void {
  const button = props.buttons.find((item) => item.id === id);
  if (!button) return;
  editingId.value = id;
  form.title = button.title;
  form.value = button.value;
  form.tagTitle = getQuickTagTitle(button.tagId);
  form.customTagTitle = "";
  form.type = button.type;
  form.apiMethod = button.apiMethod ?? "GET";
  form.apiHeaders = createHeaderRows(button.apiHeaders);
  form.apiBodyType = button.apiBodyType ?? "none";
  form.apiBody = button.apiBody ?? "";
  dialogOpen.value = true;
  menu.value = null;
}

function refreshTagDrafts(): void {
  tagDrafts.value = props.tags.map((tag, index) => ({
    ...tag,
    titleDraft: tag.title,
    colorDraft: normalizeQuickTagColor(tag.color, getQuickTagColor(index)),
  }));
}

function openTagManager(anchor?: HTMLElement): void {
  refreshTagDrafts();
  newTagTitle.value = "";
  tagManagerAnchor.value = anchor;
  tagManagerOpen.value = true;
}

function setInlineRenameInput(el: Element | ComponentPublicInstance | null): void {
  inlineRenameInput = el instanceof HTMLInputElement ? el : null;
}

function startInlineTagRename(groupId: string, groupTitle: string): void {
  if (!isRealTagGroup(groupId)) return;
  editingTagId.value = groupId;
  inlineTagDraft.value = groupTitle;
  void nextTick(() => {
    inlineRenameInput?.focus();
    inlineRenameInput?.select();
  });
}

function commitInlineTagRename(): void {
  const id = editingTagId.value;
  if (!id) return;
  const title = inlineTagDraft.value.trim();
  editingTagId.value = null;
  const tag = props.tags.find((item) => item.id === id);
  if (tag && title && title !== tag.title) emit("saveTag", { id, title });
}

function cancelInlineTagRename(): void {
  editingTagId.value = null;
}

function addTag(): void {
  const title = newTagTitle.value.trim();
  if (!title) return;
  emit("saveTag", { title });
  newTagTitle.value = "";
}

function saveTag(draft: QuickTagDraft): void {
  const title = draft.titleDraft.trim();
  const color = draft.colorDraft;
  if (!title) return;
  if (title === draft.title && color === draft.color) return;
  emit("saveTag", { id: draft.id, title, color });
}

function setTagColor(draft: QuickTagDraft, color: string): void {
  draft.colorDraft = color;
  emit("saveTag", { id: draft.id, title: draft.titleDraft.trim() || draft.title, color });
}

function deleteTag(id: string, event: MouseEvent): void {
  emit("deleteTag", id, event.currentTarget as HTMLElement ?? tagManagerAnchor.value);
}

function getQuickTagTitle(tagId?: string): string {
  if (!tagId) return "";
  return props.tags.find((tag) => tag.id === tagId)?.title ?? "";
}

function setQuickType(type: QuickButtonType): void {
  form.type = type;
  if (type !== "api") {
    form.apiHeaders = [createHeaderRow()];
    form.apiBodyType = "none";
    form.apiBody = "";
  } else if (form.apiHeaders.length === 0) {
    form.apiHeaders = [createHeaderRow()];
  }
}

function selectQuickTag(tagTitle: string): void {
  form.tagTitle = tagTitle;
  form.customTagTitle = "";
}

function setCustomQuickTag(tagTitle: string): void {
  form.customTagTitle = tagTitle;
  if (tagTitle.trim()) form.tagTitle = "";
}

function selectAppPreset(scheme: string): void {
  if (!scheme) return;
  const preset = QUICK_APP_PRESETS.find((item) => item.scheme === scheme);
  if (!preset) return;
  form.value = preset.scheme;
  form.title = getQuickAppPresetTitle(preset, props.language);
}

function selectApiTemplate(key: string): void {
  const template = findQuickApiTemplate(key);
  if (!template) return;
  form.apiMethod = template.method;
  form.apiHeaders = createHeaderRows(template.headers);
  form.apiBodyType = template.bodyType;
  form.apiBody = template.body;
}

function addApiHeader(): void {
  form.apiHeaders.push(createHeaderRow());
}

function removeApiHeader(id: string): void {
  form.apiHeaders = form.apiHeaders.filter((header) => header.id !== id);
  if (form.apiHeaders.length === 0) form.apiHeaders = [createHeaderRow()];
}

function getApiHeadersPayload(): QuickApiHeader[] {
  return form.apiHeaders
    .map((header) => ({ key: header.key.trim(), value: header.value.trim() }))
    .filter((header) => header.key.length > 0);
}

function submit(): void {
  if (!canSubmit.value) return;

  emit("save", {
    id: editingId.value,
    title: form.title.trim(),
    value: form.value,
    type: form.type,
    tagTitle: (form.customTagTitle.trim() || form.tagTitle).trim(),
    ...(form.type === "api"
      ? { apiMethod: form.apiMethod, apiHeaders: getApiHeadersPayload(), apiBodyType: form.apiBodyType, apiBody: form.apiBody }
      : {}),
  });
  closeDialog();
}

function closeDialog(): void {
  dialogOpen.value = false;
}

function openMenu(event: MouseEvent, id: string): void {
  event.preventDefault();
  event.stopPropagation();
  exclusiveMenu.notifyOpen(event, { replacingExistingMenu: Boolean(menu.value) });
  menu.value = { x: event.clientX, y: event.clientY, id, anchor: event.currentTarget as HTMLElement };
}

function openAreaMenu(event: MouseEvent): void {
  const target = event.target as HTMLElement;
  const button = target.closest("button");
  if (target.closest("input, textarea, .quick-button") || button) return;
  event.preventDefault();
  event.stopPropagation();
  exclusiveMenu.notifyOpen(event, { replacingExistingMenu: Boolean(menu.value) });
  const group = target.closest<HTMLElement>(".quick-tag-group");
  const tagId = group?.dataset.tagId;
  const tagTitle = tagId && isRealTagGroup(tagId)
    ? props.tags.find((tag) => tag.id === tagId)?.title
    : undefined;
  menu.value = { x: event.clientX, y: event.clientY, anchor: event.currentTarget as HTMLElement, tagTitle };
}

/** 标签头右键：仅真实标签提供「移动到空间」；其他目标回落到区域菜单。 */
function openTagMenu(event: MouseEvent, tagId: string): void {
  const target = event.target as HTMLElement;
  if (target.closest("button, input, textarea")) return;
  if (!isRealTagGroup(tagId)) return;
  if (moveMenuChildren.value.length === 0) return;
  event.preventDefault();
  event.stopPropagation();
  exclusiveMenu.notifyOpen(event, { replacingExistingMenu: Boolean(menu.value) });
  // 标签菜单当前只有移动项，无需 anchor 定位气泡/指南；将来加删除/指南类项时需补 anchor。
  menu.value = { x: event.clientX, y: event.clientY, tagId };
}

function openHeaderMenu(event: MouseEvent): void {
  event.preventDefault();
  event.stopPropagation();
  exclusiveMenu.notifyOpen(event, { replacingExistingMenu: Boolean(menu.value) });
  menu.value = { x: event.clientX, y: event.clientY, anchor: event.currentTarget as HTMLElement };
}

function openTitleMenu(event: MouseEvent): void {
  const target = event.target as HTMLElement;
  if (target.closest("button, input, textarea")) return;
  event.preventDefault();
  event.stopPropagation();
  titleRef.value?.openMenuAt(event.clientX, event.clientY, event);
}

function closeMenu(): void {
  menu.value = null;
}

function handleMenuSelect(key: string): void {
  if (!menu.value) return;
  const { id, anchor, tagTitle, tagId } = menu.value;
  closeMenu();
  if (key.startsWith("move-ws:")) {
    const workspaceId = key.slice("move-ws:".length);
    if (tagId) emit("moveTagToWorkspace", tagId, workspaceId);
    else if (id) emit("moveButtonToWorkspace", id, workspaceId);
    return;
  }
  if (key === "add") {
    openAdd(anchor, tagTitle);
    return;
  }
  if (key === "toggle-show-hidden") {
    handleToggleShowHidden(anchor);
    return;
  }
  if (key === "manage-tags") {
    openTagManager(anchor);
    return;
  }
  if (key === "paste") {
    void pasteQuick(tagTitle);
    return;
  }
  if (key === "guide" && anchor) emit("guide", "quickButtons", anchor, true);
  if (!id) return;
  if (key === "copy-text") emit("copyText", id, anchor);
  if (key === "copy-link") emit("copyLink", id, anchor);
  if (key === "edit") openEdit(id);
  if (key === "toggle-hidden") {
    const btn = props.buttons.find((b) => b.id === id);
    if (btn && !btn.hidden) leavingHiddenIds.add(id);
    emit("toggleHidden", id);
  }
  if (key === "delete") emit("delete", id, anchor);
}

function handleAreaClick(event: MouseEvent): void {
  const target = event.target as HTMLElement;
  if (target.closest("button, input, textarea, .quick-button, .header-actions")) return;
  const anchor = event.currentTarget as HTMLElement;
  if (hasOverloadedVisibleGroup.value) {
    emit("declutter", anchor);
    return;
  }
  emit("guide", "quickButtons", anchor);
}

const hasOverloadedVisibleGroup = computed(() =>
  hasOverloadedVisibleQuickButtonGroup(props.buttons, props.tags, QUICK_DENSITY_THRESHOLD),
);

function handleToggleShowHidden(anchor?: HTMLElement): void {
  emit("toggleShowHidden");
  if (anchor) emit("guide", "toggleHiddenQuick", anchor);
}

function handleQuickDragOver(event: DragEvent): void {
  const types = Array.from(event.dataTransfer?.types ?? []);
  const hasText = types.includes("text/plain") || types.includes("text/uri-list");
  if (hasText && !types.includes("Files")) {
    event.preventDefault();
    event.dataTransfer!.dropEffect = "copy";
    isDragHover.value = true;
  }
  if (draggingId.value || draggingTagId.value) {
    dragScroll.update(findDragScrollContainer(event.target, "quick-buttons-scrollbar"), event.clientY);
  }
}

function handleQuickDragLeave(): void {
  isDragHover.value = false;
}

function handleQuickDragEnd(): void {
  handleQuickDragLeave();
  dragScroll.stop();
}

function readQuickDropText(transfer: DataTransfer | null): string {
  if (!transfer) return "";
  const plain = transfer.getData("text/plain");
  if (plain.trim()) return plain;
  // Windows often exposes dragged URLs only as text/uri-list (no text/plain flavor).
  const uriList = transfer.getData("text/uri-list");
  if (uriList.trim()) {
    const firstUrl = uriList.split(/\r?\n/).find((line) => {
      const trimmed = line.trim();
      return trimmed.length > 0 && !trimmed.startsWith("#");
    });
    if (firstUrl) return firstUrl.trim();
  }
  return "";
}

function classifyQuickText(rawText: string): { title: string; value: string; type: QuickButtonType } {
  const text = rawText.trim();
  const isWebUrl = /^https?:\/\//.test(text);
  const isAppScheme = /^[a-z][a-z0-9+.\-]*:\/\//i.test(text) && !isWebUrl;
  const title = isWebUrl
    ? (() => { try { return new URL(text).hostname; } catch { return text.slice(0, 20); } })()
    : text.slice(0, 20);
  const type: QuickButtonType = isWebUrl ? "link" : isAppScheme ? "app" : "text";
  return { title, value: text, type };
}

function buildQuickDropPayload(rawText: string, groupId?: string): { title: string; value: string; type: QuickButtonType; tagTitle?: string } {
  const tagTitle = groupId && isRealTagGroup(groupId)
    ? props.tags.find((tag) => tag.id === groupId)?.title
    : undefined;
  return { ...classifyQuickText(rawText), tagTitle };
}

async function pasteQuick(tagTitle?: string): Promise<void> {
  if (!navigator.clipboard?.readText) return;
  let text: string;
  try {
    text = await navigator.clipboard.readText();
  } catch {
    // Clipboard read can be blocked (permission denied, insecure context); nothing to paste then.
    return;
  }
  const trimmed = text.trim();
  if (!trimmed) return;
  emit("save", { ...classifyQuickText(trimmed), tagTitle });
}

function handleExternalQuickDrop(event: DragEvent, groupId: string): boolean {
  if (draggingId.value || draggingTagId.value) return false;
  // Inner group/heading drops use .stop, so the outer handleQuickDrop (which clears
  // isDragHover) never runs — clear the drag-hover frame here too.
  isDragHover.value = false;
  const text = readQuickDropText(event.dataTransfer);
  if (!text.trim()) return false;
  emit("save", buildQuickDropPayload(text, groupId));
  return true;
}

function handleQuickDrop(event: DragEvent): void {
  event.preventDefault();
  isDragHover.value = false;
  const text = readQuickDropText(event.dataTransfer);
  if (!text.trim()) return;
  emit("save", buildQuickDropPayload(text));
}

const MOVE_DURATION = 220;

function onQuickBeforeEnter(el: Element): void {
  const e = el as HTMLElement;
  e.style.opacity = "0";
}

function onQuickEnter(el: Element, done: () => void): void {
  const e = el as HTMLElement;
  requestAnimationFrame(() => {
    e.style.transition = `opacity 0.18s ease, transform 0.22s cubic-bezier(0.2, 0, 0, 1)`;
    e.style.opacity = e.classList.contains("is-hidden") ? "0.42" : "1";
  });
  setTimeout(done, 220);
}

function onQuickAfterEnter(el: Element): void {
  const e = el as HTMLElement;
  e.style.transition = "";
  e.style.opacity = "";
}

function onQuickBeforeLeave(el: Element): void {
  const e = el as HTMLElement;
  const id = e.dataset.id;
  if (id && leavingHiddenIds.has(id)) {
    e.style.display = "none";
    leavingHiddenIds.delete(id);
  }
}

function onQuickLeave(el: Element, done: () => void): void {
  done();
}

function onQuickAfterLeave(el: Element): void {
  const e = el as HTMLElement;
  e.style.display = "";
}

function onQuickBeforeMove(el: Element): void {
  const e = el as HTMLElement;
  e.style.transition = `transform ${MOVE_DURATION}ms cubic-bezier(0.2, 0, 0, 1)`;
}

function onQuickMove(el: Element, done: () => void): void {
  setTimeout(done, MOVE_DURATION);
}

function onQuickAfterMove(el: Element): void {
  const e = el as HTMLElement;
  e.style.transition = "";
}

function onTagDrop(event: DragEvent, groupId: string): void {
  if (draggingId.value && isQuickButtonTargetGroup(groupId)) {
    const targetTagId = getGroupTagId(groupId);
    if (getQuickButtonTagId(draggingId.value) !== targetTagId) emit("moveToTag", draggingId.value, targetTagId);
    return;
  }
  if (handleExternalQuickDrop(event, groupId)) return;
  if (!draggingTagId.value || draggingTagId.value === groupId || !isRealTagGroup(groupId)) return;
  emit("reorderTag", draggingTagId.value, groupId);
}

function handleTagDragOver(event: DragEvent, groupId: string): void {
  const types = Array.from(event.dataTransfer?.types ?? []);
  const isExternalText = !draggingId.value && !draggingTagId.value
    && !types.includes("Files")
    && (types.includes("text/plain") || types.includes("text/uri-list"));
  if (isExternalText) {
    event.preventDefault();
    return;
  }
  if (!isQuickButtonTargetGroup(groupId) && !isRealTagGroup(groupId)) return;
  if (!draggingId.value && !draggingTagId.value) return;
  if (draggingTagId.value && !isRealTagGroup(groupId)) return;
  event.preventDefault();
}

function getQuickButtonTagId(id: string): string | undefined {
  return props.buttons.find((button) => button.id === id)?.tagId;
}

function isRealTagGroup(groupId: string): boolean {
  return props.tags.some((tag) => tag.id === groupId);
}

function isQuickButtonTargetGroup(groupId: string): boolean {
  return groupId === "__other" || isRealTagGroup(groupId);
}

function getGroupTagId(groupId: string): string | undefined {
  return groupId === "__other" ? undefined : groupId;
}

function handleQuickButtonDrop(targetButtonId: string, targetGroupId: string): void {
  isDragHover.value = false;
  if (!draggingId.value || draggingId.value === targetButtonId) return;
  if (isQuickButtonTargetGroup(targetGroupId)) {
    const targetTagId = getGroupTagId(targetGroupId);
    if (getQuickButtonTagId(draggingId.value) !== targetTagId) {
      emit("moveToTag", draggingId.value, targetTagId, targetButtonId);
      return;
    }
  }
  emit("reorder", draggingId.value, targetButtonId);
}

function handleQuickGroupDrop(event: DragEvent, groupId: string): void {
  if (draggingId.value && isQuickButtonTargetGroup(groupId)) {
    const targetTagId = getGroupTagId(groupId);
    if (getQuickButtonTagId(draggingId.value) !== targetTagId) emit("moveToTag", draggingId.value, targetTagId);
    return;
  }
  if (handleExternalQuickDrop(event, groupId)) return;
  onTagDrop(event, groupId);
}
</script>

<template>
  <section
    class="split-block quick-block"
    :class="{ 'drag-hover': isDragHover }"
    @click="handleAreaClick"
    @contextmenu="openAreaMenu"
    @dragover="handleQuickDragOver"
    @dragleave="handleQuickDragLeave"
    @drop="handleQuickDrop"
    @dragend="handleQuickDragEnd"
  >
    <div class="panel-header" @contextmenu="openTitleMenu">
      <h2 id="quick-title">
        <EditableTitle
          ref="titleRef"
          id="quick-title"
          :value="title"
          :edit-label="uiText.common.rename"
          @update="(id, value) => emit('titleUpdate', id, value)"
        />
      </h2>
      <div class="header-actions">
        <div class="quick-search" :class="{ 'is-open': searchOpen }">
          <button
            type="button"
            class="quick-search-toggle icon-button"
            :aria-label="uiText.quick.searchPlaceholder"
            :aria-expanded="searchOpen"
            @click="toggleSearch"
          >
            <NIcon :component="SearchOutline" />
          </button>
          <div class="quick-search-input-wrapper">
            <NInput
              ref="searchInputRef"
              class="quick-search-input"
              :value="globalSearchQuery"
              :placeholder="uiText.quick.searchPlaceholder"
              :aria-label="uiText.quick.searchPlaceholder"
              clearable
              @update:value="setGlobalSearch"
              @keydown.esc.prevent.stop="closeSearch"
            />
          </div>
        </div>
        <button
          type="button"
          class="quick-menu-button icon-button"
          :aria-label="uiText.quick.menu"
          @click="openHeaderMenu"
        >
          ⋯
        </button>
      </div>
    </div>

    <NScrollbar class="quick-buttons-scrollbar" :aria-label="uiText.quick.list" @click="closeMenu" @contextmenu="openAreaMenu">
      <TransitionGroup tag="div" class="quick-tag-groups" name="quick-tag-group">
        <section
          v-for="group in groupedButtons"
          :key="group.id"
          :class="['quick-tag-group', { 'has-tag-color': Boolean(group.color) }]"
          :data-tag-id="group.id"
          :style="group.color ? { '--tag-bg': group.color } : undefined"
          @dragover="handleTagDragOver($event, group.id)"
          @drop.stop.prevent="handleQuickGroupDrop($event, group.id)"
        >
          <div
            v-if="group.title"
            class="quick-tag-heading"
            :class="{ 'is-dragging': draggingTagId === group.id, 'is-static': !group.reorderable, 'is-editing': editingTagId === group.id }"
            :draggable="group.reorderable && editingTagId !== group.id"
            @dblclick="startInlineTagRename(group.id, group.title)"
            @contextmenu="openTagMenu($event, group.id)"
            @dragstart="group.reorderable && editingTagId !== group.id && (draggingTagId = group.id)"
            @dragover="handleTagDragOver($event, group.id)"
            @drop.stop.prevent="onTagDrop($event, group.id)"
            @dragend="draggingTagId = null"
          >
            <button
              v-if="group.id !== QUICK_BUTTON_EMPTY_GROUP_ID && editingTagId !== group.id"
              type="button"
              class="quick-tag-collapse-button"
              :class="{ 'is-collapsed': group.collapsed }"
              :aria-label="group.collapsed ? uiText.quick.expandTag : uiText.quick.collapseTag"
              :aria-expanded="!group.collapsed"
              @click.stop="emit('toggleTagCollapsed', group.id)"
              @dblclick.stop
            >
              <NIcon :component="ChevronDownOutline" />
            </button>
            <input
              v-if="editingTagId === group.id"
              :ref="setInlineRenameInput"
              v-model="inlineTagDraft"
              class="quick-tag-title-input"
              :placeholder="uiText.quick.tagName"
              autocomplete="off"
              @keydown.enter.prevent="commitInlineTagRename"
              @keydown.esc.prevent="cancelInlineTagRename"
              @blur="commitInlineTagRename"
            />
            <span v-else class="quick-tag-title">{{ group.title }}</span>
            <span v-if="editingTagId !== group.id" class="quick-tag-count">{{ group.buttons.length }}</span>
          </div>
          <div
            class="quick-tag-content"
            :class="{ 'is-collapsed': group.collapsed }"
            :aria-hidden="group.collapsed"
            :inert="group.collapsed"
          >
            <TransitionGroup
              :css="false"
              tag="div"
              class="quick-buttons"
              @before-enter="onQuickBeforeEnter"
              @enter="onQuickEnter"
              @after-enter="onQuickAfterEnter"
              @before-leave="onQuickBeforeLeave"
              @leave="onQuickLeave"
              @after-leave="onQuickAfterLeave"
              @before-move="onQuickBeforeMove"
              @move="onQuickMove"
              @after-move="onQuickAfterMove"
            >
              <button
                v-for="button in group.buttons"
                :key="button.id"
                class="quick-button"
                :class="{ 'is-hidden': button.hidden, 'is-copy': button.type === 'text', 'is-api': button.type === 'api', 'is-app': button.type === 'app', 'is-dragging': draggingId === button.id }"
                :data-id="button.id"
                :title="button.title"
                type="button"
                draggable="true"
                @click="emit('copy', button.id, $event.currentTarget as HTMLElement)"
                @contextmenu.stop="openMenu($event, button.id)"
                @dragstart="draggingId = button.id"
                @dragover.prevent
                @drop.stop.prevent="handleQuickButtonDrop(button.id, group.id)"
                @dragend="draggingId = null"
              >
                <NIcon v-if="button.type === 'text'" class="quick-button-icon" :component="CopyOutline" />
                <NIcon v-else-if="button.type === 'api'" class="quick-button-icon" :component="CloudUploadOutline" />
                <NIcon v-else-if="button.type === 'app'" class="quick-button-icon" :component="AppsOutline" />
                <HighlightText class="quick-button-label" :text="button.title" :query="globalSearchQuery" />
              </button>
            </TransitionGroup>
          </div>
        </section>
      </TransitionGroup>
    </NScrollbar>

    <NDropdown
      v-if="menu"
      placement="bottom-start"
      trigger="manual"
      :show="true"
      :x="menu.x"
      :y="menu.y"
      :z-index="CONTEXT_MENU_Z_INDEX"
      :options="menuOptions"
      @select="handleMenuSelect"
      @clickoutside="exclusiveMenu.handleClickOutside"
    >
      <span
        class="dropdown-anchor"
        :style="{ left: `${menu.x}px`, top: `${menu.y}px` }"
        aria-hidden="true"
      />
    </NDropdown>

    <NModal
      v-model:show="dialogOpen"
      preset="card"
      class="quick-dialog"
      :mask-closable="false"
      :title="editingId ? uiText.quick.dialogEdit : uiText.quick.dialogAdd"
    >
      <form class="quick-form" @submit.prevent="submit">
        <label>
          <span>{{ uiText.quick.title }}</span>
          <NInput v-model:value="form.title" autocomplete="off" />
        </label>
        <div class="quick-type-options">
          <label class="checkbox-row">
            <NCheckbox :checked="form.type === 'link'" @update:checked="setQuickType('link')">{{ uiText.quick.linkType }}</NCheckbox>
          </label>
          <label class="checkbox-row">
            <NCheckbox :checked="form.type === 'text'" @update:checked="setQuickType('text')">{{ uiText.quick.textType }}</NCheckbox>
          </label>
          <label class="checkbox-row">
            <NCheckbox :checked="form.type === 'api'" @update:checked="setQuickType('api')">{{ uiText.quick.apiType }}</NCheckbox>
          </label>
          <label class="checkbox-row">
            <NCheckbox :checked="form.type === 'app'" @update:checked="setQuickType('app')">{{ uiText.quick.appType }}</NCheckbox>
          </label>
        </div>
        <label v-if="form.type === 'app'">
          <span>{{ uiText.quick.commonApp }}</span>
          <NSelect
            :value="selectedAppScheme"
            class="quick-app-preset-select"
            :options="appPresetOptions"
            @update:value="selectAppPreset"
          />
        </label>
        <label>
          <span>{{ form.type === "api" ? uiText.quick.requestUrl : form.type === "link" ? "URL" : form.type === "app" ? uiText.quick.appScheme : uiText.quick.copyText }}</span>
          <NInput
            v-model:value="form.value"
            :type="form.type === 'text' ? 'textarea' : 'text'"
            autocomplete="off"
            :autosize="form.type === 'text' ? { minRows: 4, maxRows: 8 } : undefined"
          />
        </label>
        <div class="quick-tag-field">
          <span>{{ uiText.quick.tag }}</span>
          <div class="quick-tag-choices" role="group" :aria-label="uiText.quick.tag">
            <button
              v-for="tag in tagChoices"
              :key="tag.value || '__none'"
              type="button"
              class="quick-tag-choice"
              :class="{ 'is-selected': !form.customTagTitle.trim() && form.tagTitle === tag.value }"
              :aria-pressed="!form.customTagTitle.trim() && form.tagTitle === tag.value"
              @click="selectQuickTag(tag.value)"
            >
              {{ tag.label }}
            </button>
          </div>
          <NInput
            :value="form.customTagTitle"
            class="quick-tag-new-inline-input"
            :placeholder="uiText.quick.newTag"
            autocomplete="off"
            @update:value="setCustomQuickTag"
          />
        </div>
        <template v-if="form.type === 'api'">
          <div class="quick-api-templates">
            <span class="quick-api-templates-label">{{ uiText.quick.apiTemplates.label }}</span>
            <button
              v-for="template in QUICK_API_TEMPLATES"
              :key="template.key"
              type="button"
              :class="['quick-api-template', `quick-api-template-${template.key}`]"
              @click="selectApiTemplate(template.key)"
            >
              {{ uiText.quick.apiTemplates[template.key] }}
            </button>
          </div>
          <label>
            <span>{{ uiText.quick.requestMethod }}</span>
            <NSelect v-model:value="form.apiMethod" class="quick-api-method-select" :options="apiMethodOptions" />
          </label>
          <label>
            <span>{{ uiText.quick.requestHeaders }}</span>
            <div class="quick-api-headers">
              <div
                v-for="header in form.apiHeaders"
                :key="header.id"
                class="quick-api-header-row"
              >
                <NInput
                  v-model:value="header.key"
                  class="quick-api-header-key"
                  :placeholder="uiText.quick.requestHeaderKey"
                  autocomplete="off"
                />
                <NInput
                  v-model:value="header.value"
                  class="quick-api-header-value"
                  :placeholder="uiText.quick.requestHeaderValue"
                  autocomplete="off"
                />
                <button
                  type="button"
                  class="quick-api-remove-header icon-button is-delete"
                  :aria-label="uiText.quick.removeRequestHeader"
                  @click="removeApiHeader(header.id)"
                >
                  <NIcon :component="TrashOutline" />
                </button>
              </div>
              <NButton class="quick-api-add-header" type="default" @click="addApiHeader">{{ uiText.quick.addRequestHeader }}</NButton>
            </div>
          </label>
          <label>
            <span>{{ uiText.quick.requestBodyType }}</span>
            <NSelect v-model:value="form.apiBodyType" class="quick-api-body-type-select" :options="apiBodyTypeOptions" />
          </label>
          <label v-if="form.apiBodyType !== 'none'">
            <span>{{ uiText.quick.requestBody }}</span>
            <NInput
              v-model:value="form.apiBody"
              type="textarea"
              autocomplete="off"
              :autosize="{ minRows: 5, maxRows: 10 }"
            />
          </label>
        </template>
        <div class="dialog-actions">
          <NButton v-if="editingId" class="quick-dialog-action quick-dialog-cancel" type="default" @click="closeDialog">{{ uiText.common.cancel }}</NButton>
          <NButton class="quick-dialog-action quick-dialog-submit" attr-type="submit" type="default" :disabled="!canSubmit">{{ uiText.common.save }}</NButton>
        </div>
      </form>
    </NModal>

    <NModal
      v-model:show="tagManagerOpen"
      preset="card"
      class="quick-dialog quick-tag-manager"
      :mask-closable="false"
      :title="uiText.quick.tagManage"
    >
      <div class="quick-tag-manager-body">
        <div v-if="tagDrafts.length" class="quick-tag-manager-list">
          <div
            v-for="tag in tagDrafts"
            :key="tag.id"
            class="quick-tag-manager-row"
          >
            <NInput
              v-model:value="tag.titleDraft"
              class="quick-tag-name-input"
              :placeholder="uiText.quick.tagName"
              autocomplete="off"
              @keydown.enter.prevent="saveTag(tag)"
              @blur="saveTag(tag)"
            />
            <div class="quick-tag-color-picker" role="group" :aria-label="uiText.quick.tagColor">
              <button
                type="button"
                class="quick-tag-color-swatch quick-tag-color-swatch--default"
                :class="{ 'is-selected': tag.colorDraft === QUICK_TAG_DEFAULT_COLOR }"
                :aria-label="uiText.quick.tagColorDefault"
                :title="uiText.quick.tagColorDefault"
                @click="setTagColor(tag, QUICK_TAG_DEFAULT_COLOR)"
              />
              <button
                v-for="color in QUICK_TAG_COLORS"
                :key="color"
                type="button"
                class="quick-tag-color-swatch"
                :class="{ 'is-selected': tag.colorDraft === color }"
                :style="{ '--swatch-color': color }"
                :aria-label="color"
                :title="color"
                @click="setTagColor(tag, color)"
              />
            </div>
            <button
              type="button"
              class="quick-tag-delete icon-button is-delete"
              :aria-label="uiText.quick.deleteTag"
              @click="deleteTag(tag.id, $event)"
            >
              <NIcon :component="TrashOutline" />
            </button>
          </div>
        </div>
        <p v-else class="quick-tag-empty">{{ uiText.quick.emptyTags }}</p>
        <div class="quick-tag-add-row">
          <NInput
            v-model:value="newTagTitle"
            class="quick-tag-new-input"
            :placeholder="uiText.quick.newTag"
            autocomplete="off"
            @keydown.enter.prevent="addTag"
          />
          <button
            type="button"
            class="quick-tag-add icon-button"
            :aria-label="uiText.quick.addTag"
            :disabled="newTagTitle.trim().length === 0"
            @click="addTag"
          >
            <NIcon :component="AddOutline" />
          </button>
        </div>
      </div>
    </NModal>
  </section>
</template>
