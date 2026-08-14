<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { ContractOutline, ExpandOutline, MoonOutline, SunnyOutline } from "@vicons/ionicons5";
import { NIcon } from "naive-ui";
import type { AppLanguage, ThemeMode, ZoneVisibility } from "../types";
import {
  DEFAULT_LANGUAGE,
  WORKBENCH_COLLAPSED_FIXED_LABELS_BY_LANGUAGE,
  getDefaultTitles,
} from "../state/i18n";

const props = withDefaults(defineProps<{
  title: string;
  saveStatusLabel: string;
  theme: ThemeMode;
  language?: AppLanguage;
  assetsTitle?: string;
  notesTitle?: string;
  slogan?: string;
  imagePreviewOpen?: boolean;
  zoneVisibility?: ZoneVisibility;
}>(), {
  language: DEFAULT_LANGUAGE,
  assetsTitle: "",
  notesTitle: "",
  slogan: "",
  imagePreviewOpen: false,
  zoneVisibility: () => ({ assets: true, notes: true, tasks: true, workspace: true }),
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
}>();

defineSlots<{
  "workspace-trigger"?: () => unknown;
  status?: () => unknown;
  actions?: () => unknown;
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
const DEFAULT_COLUMN_WEIGHTS = [0.1, 0.25, 0.35, 0.3] as const;
const MIN_COLUMN_WIDTHS = [100, 100, 100, 100] as const;
// Canonical zone order matches DEFAULT_COLUMN_WEIGHTS / MIN_COLUMN_WIDTHS indices.
const ZONE_INDEX = { assets: 0, notes: 1, tasks: 2, workspace: 3 } as const;
const CANONICAL_ZONE_ORDER = [0, 1, 2, 3];
const DEFAULT_GRID_GAP = 14;
const DEFAULT_GRID_PADDING_X = 14;
const DEFAULT_GRID_PADDING_Y = 14;
// When only the image zone is visible, keep it narrow on the left and leave the
// rest of the board empty as a preview area instead of stretching it to 100%.
const SOLO_ASSETS_WIDTH_RATIO = 0.15;
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
const activeResize = ref<{ index: number; startX: number; startWidths: number[]; trailing?: boolean } | null>(null);
// True while the board is showing only the assets zone. Lets a solo layout keep
// a user-adjusted width across window resizes (instead of snapping back to the
// 10% default on every refresh); reset whenever we leave solo mode.
const soloAssetsEngaged = ref(false);

// Visible (active) zones drive the rendered grid. Hidden zones drop out of the
// grid entirely (no track, no resizer); the remaining zones re-fit the width.
const activeIndices = computed<number[]>(() => {
  const visibility = [
    props.zoneVisibility.assets,
    props.zoneVisibility.notes,
    props.zoneVisibility.tasks,
    props.zoneVisibility.workspace,
  ];
  return CANONICAL_ZONE_ORDER.filter((index) => visibility[index]);
});
const activeWeights = computed(() => activeIndices.value.map((index) => DEFAULT_COLUMN_WEIGHTS[index]));
const activeMins = computed(() => activeIndices.value.map((index) => MIN_COLUMN_WIDTHS[index]));

const gridTemplateColumns = computed(() =>
  columnWidths.value.length === activeMins.value.length && activeMins.value.length > 0
    ? columnWidths.value.map((width) => `${Math.round(width)}px`).join(" ")
    : undefined,
);

const gridStyle = computed(() => gridTemplateColumns.value ? { gridTemplateColumns: gridTemplateColumns.value } : undefined);

// A zone collapses to its vertical title rail once its width drops below the
// column minimum: content is hidden and only the title remains visible. Indexed
// by canonical zone (always length 4) so template sections can look up directly.
const zoneCollapsed = computed<boolean[]>(() => {
  const widths = columnWidths.value;
  const mins = activeMins.value;
  const indices = activeIndices.value;
  if (widths.length !== mins.length || widths.length !== indices.length) {
    return CANONICAL_ZONE_ORDER.map(() => false);
  }
  const collapsedByCanonical = new Map<number, boolean>();
  indices.forEach((canonicalIndex, pos) => {
    collapsedByCanonical.set(canonicalIndex, widths[pos] < mins[pos]);
  });
  return CANONICAL_ZONE_ORDER.map((canonicalIndex) => collapsedByCanonical.get(canonicalIndex) ?? false);
});

let headerRevealHideTimer: number | undefined;
let headerRevealShowTimer: number | undefined;
let lastPointerPosition: { x: number; y: number } | undefined;

const resizeHandleStyles = computed(() => {
  if (columnWidths.value.length !== activeMins.value.length) return [];
  const widths = columnWidths.value;
  const handles: Array<{
    style: Record<string, string>;
    column: number;
    trailing: boolean;
    label: string;
  }> = [];
  let cumulativeWidth = 0;
  // Inter-column resizers: one per gap between adjacent visible columns.
  widths.slice(0, -1).forEach((width, index) => {
    cumulativeWidth += width;
    const left = gridPadding.value.left + cumulativeWidth + gridGap.value * index + gridGap.value / 2;
    handles.push({
      style: {
        left: `${Math.round(left)}px`,
        top: `${gridPadding.value.top}px`,
        bottom: `${gridPadding.value.bottom}px`,
      },
      column: index,
      trailing: false,
      label: `调整区域宽度 ${index + 1}`,
    });
  });
  // Trailing resizer on the right edge of a solo assets zone: there is no right
  // neighbor to absorb the space, so dragging it widens/narrows the column
  // against the empty area instead.
  if (activeIndices.value.length === 1 && activeIndices.value[0] === ZONE_INDEX.assets) {
    cumulativeWidth += widths[widths.length - 1];
    const gapFactor = widths.length - 1;
    const left = gridPadding.value.left + cumulativeWidth + gridGap.value * gapFactor + gridGap.value / 2;
    handles.push({
      style: {
        left: `${Math.round(left)}px`,
        top: `${gridPadding.value.top}px`,
        bottom: `${gridPadding.value.bottom}px`,
      },
      column: widths.length - 1,
      trailing: true,
      label: "调整图片区域宽度",
    });
  }
  return handles;
});

function readPixel(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readStoredColumnWidths(expectedLength: number = MIN_COLUMN_WIDTHS.length): number[] | undefined {
  if (typeof localStorage === "undefined") return undefined;
  try {
    const raw = localStorage.getItem(WORKBENCH_WIDTH_STORAGE_KEY) ?? localStorage.getItem(LEGACY_WORKBENCH_WIDTH_STORAGE_KEY);
    const parsed = JSON.parse(raw ?? "null");
    if (!Array.isArray(parsed) || parsed.length !== expectedLength) return undefined;
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
  // Gaps sit between adjacent visible columns only.
  const gapCount = Math.max(0, activeMins.value.length - 1);
  return {
    rect,
    contentWidth: Math.max(0, rect.width - padding.left - padding.right - gap * gapCount),
  };
}

function fitColumnsToWidth(
  width: number,
  currentWidths?: readonly number[],
  mins: readonly number[] = MIN_COLUMN_WIDTHS,
  weights: readonly number[] = DEFAULT_COLUMN_WEIGHTS,
): number[] {
  if (width <= 0) return [];

  const hasCurrent = currentWidths?.length === mins.length;
  const collapsedFlags = mins.map((min, index) =>
    hasCurrent ? currentWidths![index] < min : false,
  );

  if (!collapsedFlags.some(Boolean)) {
    const minTotal = mins.reduce((sum, value) => sum + value, 0);
    if (width <= minTotal) {
      return [...mins];
    }

    const source = hasCurrent ? currentWidths! : weights;
    const sourceWeights = source.map((value, index) => currentWidths?.length === mins.length ? Math.max(0, value - mins[index]) : value);
    const effectiveWeights = sourceWeights.reduce((sum, value) => sum + value, 0) > 0 ? sourceWeights : [...weights];
    const sourceTotal = effectiveWeights.reduce((sum, value) => sum + value, 0);
    const remainingDelta = width - minTotal;
    return mins.map((minWidth, index) => {
      const weight = effectiveWeights[index];
      return minWidth + (remainingDelta * weight) / sourceTotal;
    });
  }

  // Some zones are intentionally collapsed (below their minimum): pin them to the
  // rail width and distribute the freed space across the expanded zones.
  const collapsedCount = collapsedFlags.filter(Boolean).length;
  const collapsedTotal = COLLAPSED_COLUMN_WIDTH * collapsedCount;
  const visibleMinTotal = mins.reduce((sum, min, index) =>
    collapsedFlags[index] ? sum : sum + min, 0);
  if (width <= collapsedTotal + visibleMinTotal) {
    return mins.map((min, index) => (collapsedFlags[index] ? COLLAPSED_COLUMN_WIDTH : min));
  }
  const excessWeights = mins.map((min, index) =>
    collapsedFlags[index] ? 0 : Math.max(0, currentWidths![index] - min),
  );
  const excessTotal = excessWeights.reduce((sum, value) => sum + value, 0);
  const effectiveWeights = excessTotal > 0
    ? excessWeights
    : mins.map((_, index) => (collapsedFlags[index] ? 0 : weights[index]));
  const sourceTotal = effectiveWeights.reduce((sum, value) => sum + value, 0);
  const remainingDelta = width - collapsedTotal - visibleMinTotal;
  return mins.map((min, index) =>
    collapsedFlags[index]
      ? COLLAPSED_COLUMN_WIDTH
      : min + (remainingDelta * effectiveWeights[index]) / sourceTotal,
  );
}

function syncImagePreviewLeft(): void {
  const grid = gridRef.value;
  if (!grid) return;
  const metrics = readGridMetrics();
  const widths = columnWidths.value;
  const indices = activeIndices.value;
  if (metrics && widths.length === indices.length && widths.length > 0) {
    const contentLeft = metrics.rect.left + gridPadding.value.left;
    // Align the preview's left edge with the quick-actions (notes) zone's left
    // edge so the gap before it stays exposed as the drag strip. When notes is
    // hidden, fall back to the assets zone's right edge, else the grid's left.
    const notesPos = indices.indexOf(ZONE_INDEX.notes);
    if (notesPos >= 0) {
      const precedingWidth = widths.slice(0, notesPos).reduce((sum, value) => sum + value, 0);
      applyImagePreviewVars(contentLeft + precedingWidth + gridGap.value * notesPos);
      return;
    }
    const assetsPos = indices.indexOf(ZONE_INDEX.assets);
    if (assetsPos >= 0) {
      const upToAssets = widths.slice(0, assetsPos + 1).reduce((sum, value) => sum + value, 0);
      applyImagePreviewVars(contentLeft + upToAssets + gridGap.value * (assetsPos + 1));
      return;
    }
    applyImagePreviewVars(contentLeft);
    return;
  }
  const assets = grid.querySelector<HTMLElement>(".workbench-zone-assets");
  const fallbackRight = assets?.getBoundingClientRect().right;
  if (fallbackRight) applyImagePreviewVars(fallbackRight + gridGap.value);
}

function applyImagePreviewVars(notesLeft: number): void {
  document.documentElement.style.setProperty("--image-preview-left", `${Math.round(notesLeft)}px`);
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
    soloAssetsEngaged.value = false;
    void nextTick(syncImagePreviewLeft);
    return;
  }
  const mins = activeMins.value;
  const indices = activeIndices.value;
  // When only the image zone is visible, pin it to ~15% on the left and leave the
  // remaining width empty rather than letting the single column stretch full-width.
  if (indices.length === 1 && indices[0] === ZONE_INDEX.assets) {
    if (!soloAssetsEngaged.value) {
      // Just entered solo mode: reset to the default ratio.
      columnWidths.value = [Math.max(mins[0], Math.round(metrics.contentWidth * SOLO_ASSETS_WIDTH_RATIO))];
      soloAssetsEngaged.value = true;
    } else {
      // Already in solo mode (e.g. a window resize): keep the user-adjusted
      // width, only clamping it to the new content bounds.
      const current = columnWidths.value[0];
      const base = Number.isFinite(current) && current > 0
        ? current
        : Math.round(metrics.contentWidth * SOLO_ASSETS_WIDTH_RATIO);
      columnWidths.value = [Math.min(metrics.contentWidth, Math.max(COLLAPSED_COLUMN_WIDTH, base))];
    }
    void nextTick(syncImagePreviewLeft);
    return;
  }
  soloAssetsEngaged.value = false;
  const sourceWidths = columnWidths.value.length === mins.length ? columnWidths.value : readStoredColumnWidths(mins.length);
  columnWidths.value = fitColumnsToWidth(metrics.contentWidth, sourceWidths, activeMins.value, activeWeights.value);
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

function applyResizeDelta(index: number, delta: number, startWidths: number[], trailing = false): void {
  // Trailing edge (solo assets): no right neighbor absorbs the space, so the
  // column grows/shrinks directly against the empty area, clamped to
  // [collapsed rail, content width]. Width is session-only (solo resets to the
  // default ratio on reload), so it is not persisted.
  if (trailing) {
    const metrics = readGridMetrics();
    const maxWidth = metrics?.contentWidth ?? startWidths[index];
    const next = Math.min(maxWidth, Math.max(COLLAPSED_COLUMN_WIDTH, startWidths[index] + delta));
    if (columnWidths.value.length === 1 && columnWidths.value[0] === next) return;
    columnWidths.value = [next];
    syncImagePreviewLeft();
    return;
  }
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
  applyResizeDelta(current.index, event.clientX - current.startX, current.startWidths, current.trailing);
}

function finishResize(): void {
  activeResize.value = null;
  window.removeEventListener("pointermove", handleResizeMove);
  window.removeEventListener("pointerup", finishResize);
  window.removeEventListener("mousemove", handleResizeMove);
  window.removeEventListener("mouseup", finishResize);
}

function startResize(event: PointerEvent, index: number, trailing = false): void {
  if (columnWidths.value.length !== activeMins.value.length) refreshWorkbenchLayout();
  if (columnWidths.value.length !== activeMins.value.length) return;
  event.preventDefault();
  activeResize.value = { index, startX: event.clientX, startWidths: [...columnWidths.value], trailing };
  window.addEventListener("pointermove", handleResizeMove);
  window.addEventListener("pointerup", finishResize);
  window.addEventListener("mousemove", handleResizeMove);
  window.addEventListener("mouseup", finishResize);
}

function resizeWithKeyboard(event: KeyboardEvent, index: number, trailing = false): void {
  if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
  if (columnWidths.value.length !== activeMins.value.length) return;
  event.preventDefault();
  applyResizeDelta(index, event.key === "ArrowRight" ? RESIZE_STEP : -RESIZE_STEP, columnWidths.value, trailing);
}

function expandZoneToDefault(canonicalIndex: number): void {
  const pos = activeIndices.value.indexOf(canonicalIndex);
  if (pos < 0) return;
  const widths = columnWidths.value;
  const mins = activeMins.value;
  if (widths.length !== mins.length) return;
  // Only collapsed zones (below their minimum) expand on click.
  if (widths[pos] >= mins[pos]) return;
  const metrics = readGridMetrics();
  if (!metrics) return;

  // Solo assets has no neighbors to fund an expansion; the empty area absorbs
  // it, so jump straight to the default ratio instead of the proportional fit
  // (which would otherwise fill the whole width for a single column).
  if (activeIndices.value.length === 1 && activeIndices.value[0] === ZONE_INDEX.assets) {
    const soloTarget = Math.max(mins[pos], Math.round(metrics.contentWidth * SOLO_ASSETS_WIDTH_RATIO));
    if (widths[pos] < soloTarget) {
      columnWidths.value = [soloTarget];
      syncImagePreviewLeft();
    }
    return;
  }

  // The zone returns to its default proportional width. Fund the growth from
  // expanded neighbors (proportional to their excess above the minimum); collapsed
  // neighbors stay collapsed and expanded neighbors never collapse as a side effect.
  const target = fitColumnsToWidth(metrics.contentWidth, undefined, mins, activeWeights.value)[pos];
  const grow = Math.max(0, target - widths[pos]);
  const fundable = mins.map((min, i) =>
    i === pos || widths[i] < min ? 0 : Math.max(0, widths[i] - min),
  );
  const fundableTotal = fundable.reduce((sum, value) => sum + value, 0);
  const actualGrow = Math.min(grow, fundableTotal);
  const nextWidths = [...widths];
  nextWidths[pos] = widths[pos] + actualGrow;
  if (fundableTotal > 0) {
    mins.forEach((min, i) => {
      if (i === pos || widths[i] < min) return;
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

// When the image preview opens, re-sync the preview's left edge to the current
// image-column width. Column widths only change through resize/expand/window
// resize (each of which already syncs), but a fresh sync on open guarantees the
// overlay starts exactly at the image list's right boundary even if the layout
// hasn't been touched since load.
watch(
  () => props.imagePreviewOpen,
  (open) => {
    if (open) void nextTick(syncImagePreviewLeft);
  },
);

// When zones are shown/hidden the active column set changes: re-fit the visible
// zones to the grid width so they redivide the freed space.
watch(
  () => props.zoneVisibility,
  () => {
    void nextTick(refreshWorkbenchLayout);
  },
  { deep: true },
);

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
            <slot name="workspace-trigger">
              <span class="workbench-title-fallback">{{ title }}</span>
            </slot>
            <slot name="status">
              <span class="workbench-save-badge" data-testid="workbench-save-status">{{ saveStatusLabel }}</span>
            </slot>
            <p v-if="slogan" class="workbench-slogan">{{ slogan }}</p>
          </div>
          <div class="workbench-command-actions">
            <button
              type="button"
              class="icon-button workbench-header-hide-button"
              data-testid="workbench-header-hide"
              aria-label="隐藏顶部菜单"
              @click="setHeaderHidden(true, $event)"
            >
              <NIcon :component="ContractOutline" />
            </button>
            <button
              type="button"
              class="icon-button workbench-theme-button"
              data-testid="workbench-theme"
              :aria-label="theme === 'dark' ? '切换到浅色' : '切换到深色'"
              @click="emit('theme')"
            >
              <NIcon v-if="theme === 'dark'" :component="SunnyOutline" />
              <NIcon v-else :component="MoonOutline" />
            </button>
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
          <button
            v-if="headerRevealVisible"
            type="button"
            class="workbench-header-reveal"
            data-testid="workbench-header-show"
            aria-label="显示顶部菜单"
            @click="setHeaderHidden(false, $event)"
          >
            <NIcon :component="ExpandOutline" />
          </button>
        </Transition>
      </div>

      <div ref="gridRef" class="workbench-grid" :style="gridStyle">
        <section
          v-if="zoneVisibility.assets"
          class="workbench-zone workbench-zone-assets"
          :class="{ 'workbench-zone-collapsed': zoneCollapsed[0] }"
          :aria-label="zoneLabels[0]"
        >
          <div class="workbench-zone-rail" aria-hidden="true" :title="expandHint" @click="expandZoneToDefault(0)">{{ zoneLabels[0] }}</div>
          <slot name="assets" />
        </section>
        <section
          v-if="zoneVisibility.notes"
          class="workbench-zone workbench-zone-notes"
          :class="{ 'workbench-zone-collapsed': zoneCollapsed[1] }"
          :aria-label="zoneLabels[1]"
        >
          <div class="workbench-zone-rail" aria-hidden="true" :title="expandHint" @click="expandZoneToDefault(1)">{{ zoneLabels[1] }}</div>
          <slot name="notes" />
        </section>
        <section
          v-if="zoneVisibility.tasks"
          class="workbench-zone workbench-zone-tasks"
          :class="{ 'workbench-zone-collapsed': zoneCollapsed[2] }"
          :aria-label="zoneLabels[2]"
        >
          <div class="workbench-zone-rail" aria-hidden="true" :title="expandHint" @click="expandZoneToDefault(2)">{{ zoneLabels[2] }}</div>
          <slot name="tasks" />
        </section>
        <section
          v-if="zoneVisibility.workspace"
          class="workbench-zone workbench-zone-workspace"
          :class="{ 'workbench-zone-collapsed': zoneCollapsed[3] }"
          :aria-label="zoneLabels[3]"
        >
          <div class="workbench-zone-rail" aria-hidden="true" :title="expandHint" @click="expandZoneToDefault(3)">{{ zoneLabels[3] }}</div>
          <slot name="workspace" />
        </section>
        <button
          v-for="(handle, index) in resizeHandleStyles"
          :key="index"
          type="button"
          class="workbench-resizer"
          role="separator"
          aria-orientation="vertical"
          :aria-label="handle.label"
          :style="handle.style"
          @pointerdown="startResize($event, handle.column, handle.trailing)"
          @keydown="resizeWithKeyboard($event, handle.column, handle.trailing)"
        />
      </div>
    </section>
  </main>
</template>
