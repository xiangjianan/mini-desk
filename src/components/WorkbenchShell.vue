<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import {
  MoonIcon,
  PanelTopCloseIcon,
  PanelTopOpenIcon,
  SparklesIcon,
  SunIcon,
} from "lucide-vue-next";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import type { ThemeMode } from "../types";

defineProps<{
  title: string;
  saveStatusLabel: string;
  theme: ThemeMode;
}>();

const emit = defineEmits<{
  theme: [];
}>();

defineSlots<{
  status?: () => unknown;
  actions?: () => unknown;
  assets?: () => unknown;
  notes?: () => unknown;
  tasks?: () => unknown;
  workspace?: () => unknown;
}>();

const DESKTOP_RESIZE_BREAKPOINT = 1180;
const WORKBENCH_WIDTH_STORAGE_KEY = "todo-board-workbench-widths";
const WORKBENCH_HEADER_STORAGE_KEY = "todo-board-workbench-header-hidden";
const DEFAULT_COLUMN_WEIGHTS = [0.15, 0.2, 0.35, 0.3] as const;
const MIN_COLUMN_WIDTHS = [160, 160, 320, 320] as const;
const DEFAULT_GRID_GAP = 7;
const DEFAULT_GRID_PADDING_X = 7;
const DEFAULT_GRID_PADDING_Y = 7;
const RESIZE_STEP = 24;
const HEADER_REVEAL_AUTO_HIDE_MS = 2_000;

const gridRef = ref<HTMLElement | null>(null);
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

let headerRevealHideTimer: number | undefined;

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
    const parsed = JSON.parse(localStorage.getItem(WORKBENCH_WIDTH_STORAGE_KEY) ?? "null");
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
    return localStorage.getItem(WORKBENCH_HEADER_STORAGE_KEY) === "true";
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
  if (width <= MIN_COLUMN_WIDTHS.reduce((sum, value) => sum + value, 0)) {
    return [...MIN_COLUMN_WIDTHS];
  }

  const source = currentWidths?.length === 4 ? currentWidths : DEFAULT_COLUMN_WEIGHTS;
  const sourceTotal = source.reduce((sum, value) => sum + value, 0);
  let widths = source.map((value, index) => Math.max(MIN_COLUMN_WIDTHS[index], (value / sourceTotal) * width));
  let delta = widths.reduce((sum, value) => sum + value, 0) - width;

  while (Math.abs(delta) > 0.5) {
    const adjustable = widths
      .map((value, index) => ({ index, room: value - MIN_COLUMN_WIDTHS[index] }))
      .filter((item) => item.room > 0.5);
    if (adjustable.length === 0) break;
    const share = delta / adjustable.length;
    for (const item of adjustable) {
      const reduction = Math.min(item.room, share);
      widths[item.index] -= reduction;
    }
    delta = widths.reduce((sum, value) => sum + value, 0) - width;
  }

  return widths;
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

function refreshWorkbenchLayout(): void {
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

function clampResizeDelta(index: number, delta: number, widths: number[]): number {
  const leftMinDelta = MIN_COLUMN_WIDTHS[index] - widths[index];
  const rightMaxDelta = widths[index + 1] - MIN_COLUMN_WIDTHS[index + 1];
  return Math.max(leftMinDelta, Math.min(rightMaxDelta, delta));
}

function applyResizeDelta(index: number, delta: number, startWidths: number[]): void {
  const adjustedDelta = clampResizeDelta(index, delta, startWidths);
  const nextWidths = [...startWidths];
  nextWidths[index] = startWidths[index] + adjustedDelta;
  nextWidths[index + 1] = startWidths[index + 1] - adjustedDelta;
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

function clearHeaderRevealHideTimer(): void {
  if (headerRevealHideTimer === undefined) return;
  window.clearTimeout(headerRevealHideTimer);
  headerRevealHideTimer = undefined;
}

function scheduleHeaderRevealHide(): void {
  clearHeaderRevealHideTimer();
  if (!headerHidden.value) return;
  headerRevealHideTimer = window.setTimeout(() => {
    headerRevealVisible.value = false;
    headerRevealHideTimer = undefined;
  }, HEADER_REVEAL_AUTO_HIDE_MS);
}

function showHeaderRevealControl(): void {
  if (!headerHidden.value) return;
  clearHeaderRevealHideTimer();
  headerRevealVisible.value = true;
}

function handleHeaderRevealZoneLeave(): void {
  if (!headerHidden.value) return;
  scheduleHeaderRevealHide();
}

function setHeaderHidden(hidden: boolean): void {
  headerHidden.value = hidden;
  persistHeaderHidden(hidden);
  if (hidden) {
    headerRevealVisible.value = true;
    scheduleHeaderRevealHide();
  } else {
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
  clearHeaderRevealHideTimer();
  window.removeEventListener("resize", refreshWorkbenchLayout);
  document.documentElement.style.removeProperty("--image-preview-left");
});
</script>

<template>
  <main class="workbench-shell">
    <section class="workbench-main" :class="{ 'is-header-hidden': headerHidden }">
      <Transition name="workbench-header" :duration="200">
        <header v-if="!headerHidden" class="workbench-command-bar" data-testid="workbench-command-bar">
          <div class="workbench-title-group">
            <SparklesIcon class="workbench-title-icon" aria-hidden="true" />
            <h1>{{ title }}</h1>
            <slot name="status">
              <Badge variant="secondary" data-testid="workbench-save-status">{{ saveStatusLabel }}</Badge>
            </slot>
          </div>
          <div class="workbench-command-actions">
            <Button
              variant="ghost"
              size="icon"
              class="workbench-header-hide-button"
              data-testid="workbench-header-hide"
              aria-label="隐藏顶部菜单"
              @click="setHeaderHidden(true)"
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
        class="workbench-header-reveal-zone"
        data-testid="workbench-header-reveal-zone"
        @mouseenter="showHeaderRevealControl"
        @mouseleave="handleHeaderRevealZoneLeave"
      >
        <Transition name="workbench-header-reveal" :duration="200">
          <Button
            v-if="headerRevealVisible"
            variant="ghost"
            size="icon"
            class="workbench-header-reveal"
            data-testid="workbench-header-show"
            aria-label="显示顶部菜单"
            @click="setHeaderHidden(false)"
          >
            <PanelTopOpenIcon data-icon="inline-start" />
          </Button>
        </Transition>
      </div>

      <div ref="gridRef" class="workbench-grid" :style="gridStyle">
        <section class="workbench-zone workbench-zone-assets" aria-label="素材">
          <slot name="assets" />
        </section>
        <section class="workbench-zone workbench-zone-notes" aria-label="笔记与快捷动作">
          <slot name="notes" />
        </section>
        <section class="workbench-zone workbench-zone-tasks" aria-label="任务流">
          <slot name="tasks" />
        </section>
        <section class="workbench-zone workbench-zone-workspace" aria-label="工作区与工具">
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
