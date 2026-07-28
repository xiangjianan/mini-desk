<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import {
  MoonIcon,
  PanelTopCloseIcon,
  PanelTopOpenIcon,
  SunIcon,
} from "lucide-vue-next";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import EditableTitle from "./EditableTitle.vue";
import type { AppLanguage, ThemeMode } from "../types";
import {
  DEFAULT_LANGUAGE,
  WORKBENCH_COLLAPSED_FIXED_LABELS_BY_LANGUAGE,
  getDefaultTitles,
} from "../state/i18n";
import miniDeskLogo from "../../static/img/mini-desk-cat.png?url";
import miniDeskDarkLogo from "../../static/img/mini-desk-cat-dark.png?url";

const props = withDefaults(defineProps<{
  title: string;
  saveStatusLabel: string;
  theme: ThemeMode;
  language?: AppLanguage;
  assetsTitle?: string;
  notesTitle?: string;
  slogan?: string;
}>(), {
  language: DEFAULT_LANGUAGE,
  assetsTitle: "",
  notesTitle: "",
  slogan: "",
});

// Collapsed-rail labels per zone. Assets and notes follow their editable area
// titles; tasks and workspace use fixed labels (they hold multiple lists/spaces
// with no single heading).
const zoneLabels = computed<readonly string[]>(() => {
  const defaults = getDefaultTitles(props.language);
  const fixed = WORKBENCH_COLLAPSED_FIXED_LABELS_BY_LANGUAGE[props.language];
  return [
    props.assetsTitle || defaults["image-title"],
    props.notesTitle || defaults["quick-title"],
    fixed.tasks,
    fixed.workspace,
  ];
});

const expandHint = computed(() => (props.language === "en" ? "Click to expand" : "点击展开"));

const emit = defineEmits<{
  theme: [];
  updateTitle: [value: string];
  updateSlogan: [value: string];
}>();

const miniDeskLogoSrc = computed(() => (props.theme === "dark" ? miniDeskDarkLogo : miniDeskLogo));

defineSlots<{
  status?: () => unknown;
  actions?: () => unknown;
  search?: () => unknown;
  assets?: () => unknown;
  notes?: () => unknown;
  tasks?: () => unknown;
  workspace?: () => unknown;
}>();

const DESKTOP_RESIZE_BREAKPOINT = 1180;
const WORKBENCH_WIDTH_STORAGE_KEY = "mini-desk-workbench-widths";
const LEGACY_WORKBENCH_WIDTH_STORAGE_KEY = "todo-board-workbench-widths";
const WORKBENCH_HEADER_STORAGE_KEY = "mini-desk-workbench-header-hidden";
const LEGACY_WORKBENCH_HEADER_STORAGE_KEY = "todo-board-workbench-header-hidden";
const DEFAULT_COLUMN_WEIGHTS = [0.15, 0.2, 0.35, 0.3] as const;
const MIN_COLUMN_WIDTHS = [100, 100, 100, 100] as const;
const DEFAULT_GRID_GAP = 14;
const DEFAULT_GRID_PADDING_X = 14;
const DEFAULT_GRID_PADDING_Y = 14;
const DEFAULT_IMAGE_PREVIEW_TOP = 52;
const RESIZE_STEP = 24;
// Floor a zone can be dragged down to once it passes its minimum width.
// Below it the zone collapses to a vertical title rail and content is hidden.
const COLLAPSED_COLUMN_WIDTH = 44;
const HEADER_COLLAPSE_REVEAL_DELAY_MS = 200;
const HEADER_INITIAL_REVEAL_AUTO_HIDE_MS = 1_000;
const HEADER_REVEAL_AUTO_HIDE_MS = 100;
const HEADER_REVEAL_POINTER_LEAVE_HIDE_MS = 150;

const gridRef = ref<HTMLElement | null>(null);
const headerRevealZoneRef = ref<HTMLElement | null>(null);
const headerHidden = ref(false);
const headerRevealVisible = ref(false);
const columnWidths = ref<number[]>([]);
const gridGap = ref(DEFAULT_GRID_GAP);
const gridPadding = ref({
  top: DEFAULT_GRID_PADDING_Y,
  right: DEFAULT_GRID_PADDING_X,
  bottom: DEFAULT_GRID_PADDING_Y,
  left: DEFAULT_GRID_PADDING_X,
});
const activeResize = ref<{ index: number; startX: number; startWidths: number[] } | null>(null);

const gridTemplateColumns = computed(() =>
  columnWidths.value.length === 4 ? columnWidths.value.map((width) => `${Math.round(width)}px`).join(" ") : undefined,
);

const gridStyle = computed(() => gridTemplateColumns.value ? { gridTemplateColumns: gridTemplateColumns.value } : undefined);

// A zone collapses to its vertical title rail once its width drops below the
// column minimum: content is hidden and only the title remains visible.
const zoneCollapsed = computed<boolean[]>(() => {
  const widths = columnWidths.value;
  if (widths.length !== MIN_COLUMN_WIDTHS.length) {
    return MIN_COLUMN_WIDTHS.map(() => false);
  }
  return MIN_COLUMN_WIDTHS.map((min, index) => widths[index] < min);
});

let headerRevealHideTimer: number | undefined;
let headerRevealShowTimer: number | undefined;
let lastPointerPosition: { x: number; y: number } | undefined;

const resizeHandleStyles = computed(() => {
  if (columnWidths.value.length !== 4) return [];
  let cumulativeWidth = 0;
  return columnWidths.value.slice(0, -1).map((width, index) => {
    cumulativeWidth += width;
    const left = gridPadding.value.left + cumulativeWidth + gridGap.value * index + gridGap.value / 2;
    return {
      left: `${Math.round(left)}px`,
      top: `${gridPadding.value.top}px`,
      bottom: `${gridPadding.value.bottom}px`,
    };
  });
});

function readPixel(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readStoredColumnWidths(): number[] | undefined {
  if (typeof localStorage === "undefined") return undefined;
  try {
    const raw = localStorage.getItem(WORKBENCH_WIDTH_STORAGE_KEY) ?? localStorage.getItem(LEGACY_WORKBENCH_WIDTH_STORAGE_KEY);
    const parsed = JSON.parse(raw ?? "null");
    if (!Array.isArray(parsed) || parsed.length !== 4) return undefined;
    const widths = parsed.map((value) => Number(value));
    return widths.every((value) => Number.isFinite(value) && value > 0) ? widths : undefined;
  } catch {
    return undefined;
  }
}

function persistColumnWidths(widths: number[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(WORKBENCH_WIDTH_STORAGE_KEY, JSON.stringify(widths.map((width) => Math.round(width))));
  } catch {
    // Layout persistence is optional; storage may be unavailable in restricted contexts.
  }
}

function readStoredHeaderHidden(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return (localStorage.getItem(WORKBENCH_HEADER_STORAGE_KEY) ?? localStorage.getItem(LEGACY_WORKBENCH_HEADER_STORAGE_KEY)) === "true";
  } catch {
    return false;
  }
}

function persistHeaderHidden(hidden: boolean): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(WORKBENCH_HEADER_STORAGE_KEY, hidden ? "true" : "false");
  } catch {
    // Header visibility persistence is optional when storage is unavailable.
  }
}

function readGridMetrics(): { rect: DOMRect; contentWidth: number } | undefined {
  const grid = gridRef.value;
  if (!grid) return undefined;
  const rect = grid.getBoundingClientRect();
  if (rect.width <= 0) return undefined;
  const style = getComputedStyle(grid);
  const gap = readPixel(style.columnGap || style.gap, DEFAULT_GRID_GAP);
  const padding = {
    top: readPixel(style.paddingTop, DEFAULT_GRID_PADDING_Y),
    right: readPixel(style.paddingRight, DEFAULT_GRID_PADDING_X),
    bottom: readPixel(style.paddingBottom, DEFAULT_GRID_PADDING_Y),
    left: readPixel(style.paddingLeft, DEFAULT_GRID_PADDING_X),
  };
  gridGap.value = gap;
  gridPadding.value = padding;
  return {
    rect,
    contentWidth: Math.max(0, rect.width - padding.left - padding.right - gap * (DEFAULT_COLUMN_WEIGHTS.length - 1)),
  };
}

function fitColumnsToWidth(width: number, currentWidths?: readonly number[]): number[] {
  if (width <= 0) return [];

  const hasCurrent = currentWidths?.length === MIN_COLUMN_WIDTHS.length;
  const collapsedFlags = MIN_COLUMN_WIDTHS.map((min, index) =>
    hasCurrent ? currentWidths![index] < min : false,
  );

  if (!collapsedFlags.some(Boolean)) {
    const minTotal = MIN_COLUMN_WIDTHS.reduce((sum, value) => sum + value, 0);
    if (width <= minTotal) {
      return [...MIN_COLUMN_WIDTHS];
    }

    const source = hasCurrent ? currentWidths! : DEFAULT_COLUMN_WEIGHTS;
    const sourceWeights = source.map((value, index) => currentWidths?.length === 4 ? Math.max(0, value - MIN_COLUMN_WIDTHS[index]) : value);
    const effectiveWeights = sourceWeights.reduce((sum, value) => sum + value, 0) > 0 ? sourceWeights : [...DEFAULT_COLUMN_WEIGHTS];
    const sourceTotal = effectiveWeights.reduce((sum, value) => sum + value, 0);
    const remainingDelta = width - minTotal;
    return MIN_COLUMN_WIDTHS.map((minWidth, index) => {
      const weight = effectiveWeights[index];
      return minWidth + (remainingDelta * weight) / sourceTotal;
    });
  }

  // Some zones are intentionally collapsed (below their minimum): pin them to the
  // rail width and distribute the freed space across the expanded zones.
  const collapsedCount = collapsedFlags.filter(Boolean).length;
  const collapsedTotal = COLLAPSED_COLUMN_WIDTH * collapsedCount;
  const visibleMinTotal = MIN_COLUMN_WIDTHS.reduce((sum, min, index) =>
    collapsedFlags[index] ? sum : sum + min, 0);
  if (width <= collapsedTotal + visibleMinTotal) {
    return MIN_COLUMN_WIDTHS.map((min, index) => (collapsedFlags[index] ? COLLAPSED_COLUMN_WIDTH : min));
  }
  const excessWeights = MIN_COLUMN_WIDTHS.map((min, index) =>
    collapsedFlags[index] ? 0 : Math.max(0, currentWidths![index] - min),
  );
  const excessTotal = excessWeights.reduce((sum, value) => sum + value, 0);
  const effectiveWeights = excessTotal > 0
    ? excessWeights
    : MIN_COLUMN_WIDTHS.map((_, index) => (collapsedFlags[index] ? 0 : DEFAULT_COLUMN_WEIGHTS[index]));
  const sourceTotal = effectiveWeights.reduce((sum, value) => sum + value, 0);
  const remainingDelta = width - collapsedTotal - visibleMinTotal;
  return MIN_COLUMN_WIDTHS.map((min, index) =>
    collapsedFlags[index]
      ? COLLAPSED_COLUMN_WIDTH
      : min + (remainingDelta * effectiveWeights[index]) / sourceTotal,
  );
}

function syncImagePreviewLeft(): void {
  const grid = gridRef.value;
  if (!grid) return;
  const metrics = readGridMetrics();
  const firstWidth = columnWidths.value[0];
  if (metrics && firstWidth) {
    document.documentElement.style.setProperty("--image-preview-left", `${Math.round(metrics.rect.left + gridPadding.value.left + firstWidth)}px`);
    return;
  }
  const assets = grid.querySelector<HTMLElement>(".workbench-zone-assets");
  const fallbackRight = assets?.getBoundingClientRect().right;
  if (fallbackRight) document.documentElement.style.setProperty("--image-preview-left", `${Math.round(fallbackRight)}px`);
}

function syncImagePreviewTop(): void {
  document.documentElement.style.setProperty("--image-preview-top", headerHidden.value ? "0px" : `${DEFAULT_IMAGE_PREVIEW_TOP}px`);
}

function refreshWorkbenchLayout(): void {
  syncImagePreviewTop();
  const metrics = readGridMetrics();
  if (!metrics) return;
  if (window.innerWidth <= DESKTOP_RESIZE_BREAKPOINT) {
    columnWidths.value = [];
    void nextTick(syncImagePreviewLeft);
    return;
  }
  const sourceWidths = columnWidths.value.length === 4 ? columnWidths.value : readStoredColumnWidths();
  columnWidths.value = fitColumnsToWidth(metrics.contentWidth, sourceWidths);
  void nextTick(syncImagePreviewLeft);
}

function shrinkColumns(widths: number[], indices: number[], requestedShrink: number): { widths: number[]; actualShrink: number } {
  const nextWidths = [...widths];
  let remainingShrink = Math.max(0, requestedShrink);
  let actualShrink = 0;

  for (const index of indices) {
    if (remainingShrink <= 0) break;
    // Allow shrinking past the minimum all the way down to the collapsed rail
    // width so a zone can be dragged below its minimum and collapsed.
    const shrinkableWidth = Math.max(0, nextWidths[index] - COLLAPSED_COLUMN_WIDTH);
    const columnShrink = Math.min(shrinkableWidth, remainingShrink);
    nextWidths[index] -= columnShrink;
    remainingShrink -= columnShrink;
    actualShrink += columnShrink;
  }

  return { widths: nextWidths, actualShrink };
}

function applyResizeDelta(index: number, delta: number, startWidths: number[]): void {
  const nextWidths = [...startWidths];
  if (delta < 0) {
    const leftShrinkOrder = Array.from({ length: index + 1 }, (_, offset) => index - offset);
    const { widths, actualShrink } = shrinkColumns(startWidths, leftShrinkOrder, Math.abs(delta));
    Object.assign(nextWidths, widths);
    nextWidths[index + 1] = startWidths[index + 1] + actualShrink;
  } else {
    const rightShrinkOrder = Array.from({ length: startWidths.length - index - 1 }, (_, offset) => index + 1 + offset);
    const { widths, actualShrink } = shrinkColumns(startWidths, rightShrinkOrder, delta);
    Object.assign(nextWidths, widths);
    nextWidths[index] = startWidths[index] + actualShrink;
  }
  columnWidths.value = nextWidths;
  persistColumnWidths(nextWidths);
  syncImagePreviewLeft();
}

function handleResizeMove(event: PointerEvent | MouseEvent): void {
  const current = activeResize.value;
  if (!current) return;
  applyResizeDelta(current.index, event.clientX - current.startX, current.startWidths);
}

function finishResize(): void {
  activeResize.value = null;
  window.removeEventListener("pointermove", handleResizeMove);
  window.removeEventListener("pointerup", finishResize);
  window.removeEventListener("mousemove", handleResizeMove);
  window.removeEventListener("mouseup", finishResize);
}

function startResize(event: PointerEvent, index: number): void {
  if (columnWidths.value.length !== 4) refreshWorkbenchLayout();
  if (columnWidths.value.length !== 4) return;
  event.preventDefault();
  activeResize.value = { index, startX: event.clientX, startWidths: [...columnWidths.value] };
  window.addEventListener("pointermove", handleResizeMove);
  window.addEventListener("pointerup", finishResize);
  window.addEventListener("mousemove", handleResizeMove);
  window.addEventListener("mouseup", finishResize);
}

function resizeWithKeyboard(event: KeyboardEvent, index: number): void {
  if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
  if (columnWidths.value.length !== 4) return;
  event.preventDefault();
  applyResizeDelta(index, event.key === "ArrowRight" ? RESIZE_STEP : -RESIZE_STEP, columnWidths.value);
}

function expandZoneToDefault(index: number): void {
  const widths = columnWidths.value;
  if (widths.length !== MIN_COLUMN_WIDTHS.length) return;
  // Only collapsed zones (below their minimum) expand on click.
  if (widths[index] >= MIN_COLUMN_WIDTHS[index]) return;
  const metrics = readGridMetrics();
  if (!metrics) return;

  // The zone returns to its default proportional width. Fund the growth from
  // expanded neighbors (proportional to their excess above the minimum); collapsed
  // neighbors stay collapsed and expanded neighbors never collapse as a side effect.
  const target = fitColumnsToWidth(metrics.contentWidth)[index];
  const grow = Math.max(0, target - widths[index]);
  const fundable = MIN_COLUMN_WIDTHS.map((min, i) =>
    i === index || widths[i] < min ? 0 : Math.max(0, widths[i] - min),
  );
  const fundableTotal = fundable.reduce((sum, value) => sum + value, 0);
  const actualGrow = Math.min(grow, fundableTotal);
  const nextWidths = [...widths];
  nextWidths[index] = widths[index] + actualGrow;
  if (fundableTotal > 0) {
    MIN_COLUMN_WIDTHS.forEach((min, i) => {
      if (i === index || widths[i] < min) return;
      nextWidths[i] = widths[i] - (actualGrow * fundable[i]) / fundableTotal;
    });
  }
  columnWidths.value = nextWidths;
  persistColumnWidths(nextWidths);
  syncImagePreviewLeft();
}

function clearHeaderRevealHideTimer(): void {
  if (headerRevealHideTimer === undefined) return;
  window.clearTimeout(headerRevealHideTimer);
  headerRevealHideTimer = undefined;
}

function clearHeaderRevealShowTimer(): void {
  if (headerRevealShowTimer === undefined) return;
  window.clearTimeout(headerRevealShowTimer);
  headerRevealShowTimer = undefined;
}

function rememberPointerPosition(event?: MouseEvent | PointerEvent): void {
  if (!event || !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return;
  lastPointerPosition = { x: event.clientX, y: event.clientY };
}

function isLastPointerInsideHeaderRevealZone(): boolean {
  const zone = headerRevealZoneRef.value;
  if (!zone || !lastPointerPosition) return false;
  const rect = zone.getBoundingClientRect();
  return (
    lastPointerPosition.x >= rect.left &&
    lastPointerPosition.x <= rect.right &&
    lastPointerPosition.y >= rect.top &&
    lastPointerPosition.y <= rect.bottom
  );
}

function scheduleHeaderRevealHide(delay = HEADER_REVEAL_AUTO_HIDE_MS): void {
  clearHeaderRevealHideTimer();
  if (!headerHidden.value) return;
  headerRevealHideTimer = window.setTimeout(() => {
    headerRevealVisible.value = false;
    headerRevealHideTimer = undefined;
  }, delay);
}

function scheduleHeaderRevealAfterCollapse(): void {
  clearHeaderRevealShowTimer();
  headerRevealVisible.value = false;
  headerRevealShowTimer = window.setTimeout(() => {
    headerRevealShowTimer = undefined;
    if (!headerHidden.value) return;
    headerRevealVisible.value = true;
    void nextTick(() => {
      if (!headerHidden.value) return;
      if (isLastPointerInsideHeaderRevealZone()) {
        clearHeaderRevealHideTimer();
        return;
      }
      scheduleHeaderRevealHide(HEADER_INITIAL_REVEAL_AUTO_HIDE_MS);
    });
  }, HEADER_COLLAPSE_REVEAL_DELAY_MS);
}

function showHeaderRevealControl(event?: MouseEvent | PointerEvent): void {
  rememberPointerPosition(event);
  if (!headerHidden.value) return;
  if (headerRevealShowTimer !== undefined) return;
  clearHeaderRevealHideTimer();
  headerRevealVisible.value = true;
}

function handleHeaderRevealZoneLeave(event?: MouseEvent | PointerEvent): void {
  rememberPointerPosition(event);
  if (!headerHidden.value) return;
  scheduleHeaderRevealHide(HEADER_REVEAL_POINTER_LEAVE_HIDE_MS);
}

function setHeaderHidden(hidden: boolean, event?: MouseEvent | PointerEvent): void {
  rememberPointerPosition(event);
  headerHidden.value = hidden;
  persistHeaderHidden(hidden);
  syncImagePreviewTop();
  if (hidden) {
    scheduleHeaderRevealAfterCollapse();
  } else {
    clearHeaderRevealShowTimer();
    clearHeaderRevealHideTimer();
    headerRevealVisible.value = false;
  }
  void nextTick(refreshWorkbenchLayout);
}

onMounted(() => {
  if (readStoredHeaderHidden()) {
    headerHidden.value = true;
    headerRevealVisible.value = true;
    scheduleHeaderRevealHide();
  }
  void nextTick(refreshWorkbenchLayout);
  window.addEventListener("resize", refreshWorkbenchLayout);
});

onUnmounted(() => {
  finishResize();
  clearHeaderRevealShowTimer();
  clearHeaderRevealHideTimer();
  window.removeEventListener("resize", refreshWorkbenchLayout);
  document.documentElement.style.removeProperty("--image-preview-left");
  document.documentElement.style.removeProperty("--image-preview-top");
});
</script>

<template>
  <main class="workbench-shell">
    <section class="workbench-main" :class="{ 'is-header-hidden': headerHidden }">
      <Transition name="workbench-header" :duration="200">
        <header v-if="!headerHidden" class="workbench-command-bar" data-testid="workbench-command-bar">
          <div class="workbench-title-group">
            <img class="workbench-title-icon workbench-title-logo" :src="miniDeskLogoSrc" alt="" aria-hidden="true" width="20" height="20" />
            <h1>
              <EditableTitle
                id="board-title"
                :value="title"
                @update="(_id, value) => emit('updateTitle', value)"
              />
            </h1>
            <slot name="status">
              <Badge variant="secondary" data-testid="workbench-save-status">{{ saveStatusLabel }}</Badge>
            </slot>
            <p v-if="slogan" class="workbench-slogan">
              <EditableTitle
                id="board-slogan"
                :value="slogan"
                @update="(_id, value) => emit('updateSlogan', value)"
              />
            </p>
          </div>
          <div class="workbench-command-actions">
            <slot name="search" />
            <Button
              variant="ghost"
              size="icon"
              class="workbench-header-hide-button"
              data-testid="workbench-header-hide"
              aria-label="隐藏顶部菜单"
              @click="setHeaderHidden(true, $event)"
            >
              <PanelTopCloseIcon data-icon="inline-start" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              class="workbench-theme-button"
              data-testid="workbench-theme"
              :aria-label="theme === 'dark' ? '切换到浅色' : '切换到深色'"
              @click="emit('theme')"
            >
              <SunIcon v-if="theme === 'dark'" data-icon="inline-start" />
              <MoonIcon v-else data-icon="inline-start" />
            </Button>
            <slot name="actions" />
          </div>
        </header>
      </Transition>

      <div
        v-if="headerHidden"
        ref="headerRevealZoneRef"
        class="workbench-header-reveal-zone"
        data-testid="workbench-header-reveal-zone"
        @click="showHeaderRevealControl($event)"
        @mouseenter="showHeaderRevealControl($event)"
        @pointermove="showHeaderRevealControl($event)"
        @mouseleave="handleHeaderRevealZoneLeave($event)"
      >
        <Transition name="workbench-header-reveal" :duration="100">
          <Button
            v-if="headerRevealVisible"
            variant="ghost"
            size="icon"
            class="workbench-header-reveal"
            data-testid="workbench-header-show"
            aria-label="显示顶部菜单"
            @click="setHeaderHidden(false, $event)"
          >
            <PanelTopOpenIcon data-icon="inline-start" />
          </Button>
        </Transition>
      </div>

      <div ref="gridRef" class="workbench-grid" :style="gridStyle">
        <section
          class="workbench-zone workbench-zone-assets"
          :class="{ 'workbench-zone-collapsed': zoneCollapsed[0] }"
          :aria-label="zoneLabels[0]"
        >
          <div class="workbench-zone-rail" aria-hidden="true" :title="expandHint" @click="expandZoneToDefault(0)">{{ zoneLabels[0] }}</div>
          <slot name="assets" />
        </section>
        <section
          class="workbench-zone workbench-zone-notes"
          :class="{ 'workbench-zone-collapsed': zoneCollapsed[1] }"
          :aria-label="zoneLabels[1]"
        >
          <div class="workbench-zone-rail" aria-hidden="true" :title="expandHint" @click="expandZoneToDefault(1)">{{ zoneLabels[1] }}</div>
          <slot name="notes" />
        </section>
        <section
          class="workbench-zone workbench-zone-tasks"
          :class="{ 'workbench-zone-collapsed': zoneCollapsed[2] }"
          :aria-label="zoneLabels[2]"
        >
          <div class="workbench-zone-rail" aria-hidden="true" :title="expandHint" @click="expandZoneToDefault(2)">{{ zoneLabels[2] }}</div>
          <slot name="tasks" />
        </section>
        <section
          class="workbench-zone workbench-zone-workspace"
          :class="{ 'workbench-zone-collapsed': zoneCollapsed[3] }"
          :aria-label="zoneLabels[3]"
        >
          <div class="workbench-zone-rail" aria-hidden="true" :title="expandHint" @click="expandZoneToDefault(3)">{{ zoneLabels[3] }}</div>
          <slot name="workspace" />
        </section>
        <button
          v-for="(_, index) in resizeHandleStyles"
          :key="index"
          type="button"
          class="workbench-resizer"
          role="separator"
          aria-orientation="vertical"
          :aria-label="`调整区域宽度 ${index + 1}`"
          :style="resizeHandleStyles[index]"
          @pointerdown="startResize($event, index)"
          @keydown="resizeWithKeyboard($event, index)"
        />
      </div>
    </section>
  </main>
</template>
