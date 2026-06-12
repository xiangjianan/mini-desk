<script setup lang="ts">
import { computed, nextTick, onMounted, ref, shallowRef, watch } from "vue";
import { ArrowUpRight, Check, Circle, Crop, Highlighter, Minus, MousePointer2, Paintbrush, RectangleHorizontal, RotateCcw, X } from "lucide-vue-next";
import { getUiText } from "../state/i18n";
import type { AppLanguage, StoredImage } from "../types";

type EditorTool = "crop" | "brush" | "rectangle" | "ellipse" | "arrow" | "marker";
type EditorColor = "#ef4444" | "#22c55e" | "#3b82f6" | "#facc15" | "#111827" | "#ffffff";
type CropHandle = "move" | "left" | "right" | "top" | "bottom" | "top-left" | "top-right" | "bottom-left" | "bottom-right";

interface EditorPoint {
  x: number;
  y: number;
}

interface EditorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type EditorCommand =
  | { type: "brush"; color: string; width: number; points: EditorPoint[] }
  | { type: "rectangle" | "ellipse" | "arrow"; color: string; width: number; start: EditorPoint; end: EditorPoint }
  | { type: "marker"; color: string; number: number; point: EditorPoint };

const props = withDefaults(defineProps<{
  image: StoredImage;
  language?: AppLanguage;
}>(), {
  language: "zh",
});

const emit = defineEmits<{
  cancel: [];
  save: [payload: { id: string; src: string; displayWidth: number; displayHeight: number }];
}>();

defineExpose({ saveImage });

const colorOptions: { value: EditorColor; key: "red" | "green" | "blue" | "yellow" | "black" | "white" }[] = [
  { value: "#ef4444", key: "red" },
  { value: "#22c55e", key: "green" },
  { value: "#3b82f6", key: "blue" },
  { value: "#facc15", key: "yellow" },
  { value: "#111827", key: "black" },
  { value: "#ffffff", key: "white" },
];

const toolOptions: { value: EditorTool; icon: typeof Crop; labelKey: "crop" | "brush" | "rectangle" | "ellipse" | "arrow" | "marker" }[] = [
  { value: "crop", icon: Crop, labelKey: "crop" },
  { value: "brush", icon: Paintbrush, labelKey: "brush" },
  { value: "rectangle", icon: RectangleHorizontal, labelKey: "rectangle" },
  { value: "ellipse", icon: Circle, labelKey: "ellipse" },
  { value: "arrow", icon: ArrowUpRight, labelKey: "arrow" },
  { value: "marker", icon: Highlighter, labelKey: "marker" },
];

const canvasRef = ref<HTMLCanvasElement | null>(null);
const sourceImage = shallowRef<HTMLImageElement | null>(null);
const workingImageSrc = ref(props.image.src);
const workingDisplayWidth = ref(props.image.displayWidth);
const workingDisplayHeight = ref(props.image.displayHeight);
const activeTool = ref<EditorTool>("brush");
const selectedColor = ref<EditorColor>("#ef4444");
const strokeWidth = ref(4);
const commands = ref<EditorCommand[]>([]);
const previewCommand = ref<EditorCommand | null>(null);
const cropRect = ref<EditorRect | null>(null);
const dragState = ref<{ pointerId: number; tool: EditorTool; start: EditorPoint; cropStart?: EditorRect; cropHandle?: CropHandle } | null>(null);

const uiText = computed(() => getUiText(props.language));
const editorText = computed(() => uiText.value.imageEditor);
const canvasWidth = computed(() => Math.max(1, Math.round(sourceImage.value?.naturalWidth || workingDisplayWidth.value || props.image.displayWidth || 800)));
const canvasHeight = computed(() => Math.max(1, Math.round(sourceImage.value?.naturalHeight || workingDisplayHeight.value || props.image.displayHeight || 600)));
const scaleX = computed(() => {
  const sourceWidth = sourceImage.value?.naturalWidth || canvasWidth.value;
  const displayWidth = workingDisplayWidth.value || props.image.displayWidth || sourceWidth;
  return displayWidth / sourceWidth;
});
const scaleY = computed(() => {
  const sourceHeight = sourceImage.value?.naturalHeight || canvasHeight.value;
  const displayHeight = workingDisplayHeight.value || props.image.displayHeight || sourceHeight;
  return displayHeight / sourceHeight;
});
const cropActionStyle = computed(() => {
  const rect = cropRect.value;
  if (!rect) return {};
  return {
    left: `${((rect.x + rect.width) / canvasWidth.value) * 100}%`,
    top: `${((rect.y + rect.height) / canvasHeight.value) * 100}%`,
  };
});

onMounted(() => {
  loadSourceImage();
});

watch(
  () => props.image.id,
  () => {
    workingImageSrc.value = props.image.src;
    workingDisplayWidth.value = props.image.displayWidth;
    workingDisplayHeight.value = props.image.displayHeight;
    commands.value = [];
    previewCommand.value = null;
    cropRect.value = null;
    dragState.value = null;
    loadSourceImage();
  },
);

watch([commands, previewCommand, cropRect, sourceImage], () => {
  renderCanvas();
}, { deep: true });

function loadSourceImage(): void {
  const canvas = canvasRef.value;
  if (canvas) {
    canvas.width = canvasWidth.value;
    canvas.height = canvasHeight.value;
  }

  sourceImage.value = null;
  if (!workingImageSrc.value) {
    void nextTick(renderCanvas);
    return;
  }

  const image = new Image();
  image.onload = () => {
    sourceImage.value = image;
    const nextCanvas = canvasRef.value;
    if (nextCanvas) {
      nextCanvas.width = canvasWidth.value;
      nextCanvas.height = canvasHeight.value;
    }
    renderCanvas();
  };
  image.onerror = () => {
    void nextTick(renderCanvas);
  };
  image.src = workingImageSrc.value;
  void nextTick(renderCanvas);
}

function getCanvasContext(canvas = canvasRef.value): CanvasRenderingContext2D | null {
  return canvas?.getContext("2d") ?? null;
}

function renderCanvas(showCropOverlay = true): void {
  const canvas = canvasRef.value;
  const context = getCanvasContext(canvas);
  if (!canvas || !context) return;

  if (canvas.width !== canvasWidth.value) canvas.width = canvasWidth.value;
  if (canvas.height !== canvasHeight.value) canvas.height = canvasHeight.value;

  context.clearRect(0, 0, canvas.width, canvas.height);
  if (sourceImage.value) context.drawImage(sourceImage.value, 0, 0, canvas.width, canvas.height);
  for (const command of commands.value) drawCommand(context, command);
  if (previewCommand.value) drawCommand(context, previewCommand.value);
  if (showCropOverlay && cropRect.value) drawCropOverlay(context, cropRect.value, canvas.width, canvas.height);
}

function drawCommand(context: CanvasRenderingContext2D, command: EditorCommand): void {
  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = command.color;
  context.fillStyle = command.color;
  context.lineWidth = "width" in command ? command.width : 3;

  if (command.type === "brush") drawBrush(context, command.points);
  if (command.type === "rectangle") drawRectangle(context, command.start, command.end);
  if (command.type === "ellipse") drawEllipse(context, command.start, command.end);
  if (command.type === "arrow") drawArrow(context, command.start, command.end);
  if (command.type === "marker") drawMarker(context, command);

  context.restore();
}

function drawBrush(context: CanvasRenderingContext2D, points: EditorPoint[]): void {
  if (points.length === 0) return;
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) context.lineTo(point.x, point.y);
  context.stroke();
}

function drawRectangle(context: CanvasRenderingContext2D, start: EditorPoint, end: EditorPoint): void {
  const rect = normalizeRect(start, end);
  context.strokeRect(rect.x, rect.y, rect.width, rect.height);
}

function drawEllipse(context: CanvasRenderingContext2D, start: EditorPoint, end: EditorPoint): void {
  const rect = normalizeRect(start, end);
  context.beginPath();
  context.ellipse(rect.x + rect.width / 2, rect.y + rect.height / 2, rect.width / 2, rect.height / 2, 0, 0, Math.PI * 2);
  context.stroke();
}

function drawArrow(context: CanvasRenderingContext2D, start: EditorPoint, end: EditorPoint): void {
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const headLength = Math.max(28, strokeWidth.value * 5);
  const lineEnd = {
    x: end.x - Math.cos(angle) * Math.min(headLength * 0.42, headLength - 4),
    y: end.y - Math.sin(angle) * Math.min(headLength * 0.42, headLength - 4),
  };
  context.beginPath();
  context.moveTo(start.x, start.y);
  context.lineTo(lineEnd.x, lineEnd.y);
  context.stroke();
  context.beginPath();
  context.moveTo(end.x, end.y);
  context.lineTo(end.x - headLength * Math.cos(angle - Math.PI / 6), end.y - headLength * Math.sin(angle - Math.PI / 6));
  context.lineTo(end.x - headLength * Math.cos(angle + Math.PI / 6), end.y - headLength * Math.sin(angle + Math.PI / 6));
  context.closePath();
  context.fill();
}

function drawMarker(context: CanvasRenderingContext2D, command: Extract<EditorCommand, { type: "marker" }>): void {
  const radius = 16;
  context.beginPath();
  context.arc(command.point.x, command.point.y, radius, 0, Math.PI * 2);
  context.fillStyle = command.color;
  context.fill();
  context.lineWidth = 2;
  context.strokeStyle = "#ffffff";
  context.stroke();
  context.fillStyle = "#ffffff";
  context.font = "700 16px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(String(command.number), command.point.x, command.point.y + 0.5);
}

function drawCropOverlay(context: CanvasRenderingContext2D, rect: EditorRect, width: number, height: number): void {
  const left = clamp(rect.x, 0, width);
  const top = clamp(rect.y, 0, height);
  const right = clamp(rect.x + rect.width, left, width);
  const bottom = clamp(rect.y + rect.height, top, height);

  context.save();
  context.fillStyle = "rgba(15, 23, 42, 0.34)";
  context.fillRect(0, 0, width, top);
  context.fillRect(0, bottom, width, height - bottom);
  context.fillRect(0, top, left, bottom - top);
  context.fillRect(right, top, width - right, bottom - top);
  context.strokeStyle = "#ffffff";
  context.lineWidth = 2;
  context.setLineDash([8, 6]);
  context.strokeRect(left, top, right - left, bottom - top);
  context.restore();
}

function normalizeRect(start: EditorPoint, end: EditorPoint): EditorRect {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

function getPointerPoint(event: PointerEvent): EditorPoint {
  const canvas = canvasRef.value;
  if (!canvas) return { x: 0, y: 0 };
  const rect = canvas.getBoundingClientRect();
  const width = rect.width || canvas.width;
  const height = rect.height || canvas.height;
  return {
    x: Math.min(canvas.width, Math.max(0, ((event.clientX - rect.left) / width) * canvas.width)),
    y: Math.min(canvas.height, Math.max(0, ((event.clientY - rect.top) / height) * canvas.height)),
  };
}

function selectTool(tool: EditorTool): void {
  activeTool.value = tool;
  if (tool === "crop" && !cropRect.value) {
    cropRect.value = { x: 0, y: 0, width: canvasWidth.value, height: canvasHeight.value };
  }
}

function handlePointerDown(event: PointerEvent): void {
  if (event.button !== 0) return;
  const point = getPointerPoint(event);
  if (activeTool.value === "marker") {
    commands.value = [
      ...commands.value,
      { type: "marker", color: selectedColor.value, number: getNextMarkerNumber(), point },
    ];
    return;
  }

  const cropHandle = activeTool.value === "crop" ? getCropHandle(point) : undefined;
  dragState.value = {
    pointerId: event.pointerId,
    tool: activeTool.value,
    start: point,
    ...(activeTool.value === "crop" ? { cropStart: cropRect.value ?? getFullCropRect(), cropHandle } : {}),
  };
  (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  if (activeTool.value === "brush") {
    previewCommand.value = { type: "brush", color: selectedColor.value, width: strokeWidth.value, points: [point] };
  }
  if (activeTool.value === "crop" && !cropRect.value) cropRect.value = getFullCropRect();
}

function handlePointerMove(event: PointerEvent): void {
  const state = dragState.value;
  if (!state || event.pointerId !== state.pointerId) return;
  const point = getPointerPoint(event);

  if (state.tool === "crop") {
    cropRect.value = resizeCropRect(state.cropStart ?? getFullCropRect(), state.cropHandle ?? getCropHandle(state.start), state.start, point);
    return;
  }

  if (state.tool === "brush" && previewCommand.value?.type === "brush") {
    previewCommand.value = { ...previewCommand.value, points: [...previewCommand.value.points, point] };
    return;
  }

  previewCommand.value = { type: state.tool, color: selectedColor.value, width: strokeWidth.value, start: state.start, end: point } as EditorCommand;
}

function handlePointerUp(event: PointerEvent): void {
  const state = dragState.value;
  if (!state || event.pointerId !== state.pointerId) return;
  (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
  dragState.value = null;

  if (state.tool === "crop") return;
  if (previewCommand.value) {
    commands.value = [...commands.value, previewCommand.value];
    previewCommand.value = null;
  }
}

function handlePointerCancel(event: PointerEvent): void {
  const state = dragState.value;
  if (!state || event.pointerId !== state.pointerId) return;
  dragState.value = null;
  previewCommand.value = null;
}

function getNextMarkerNumber(): number {
  return commands.value.filter((command) => command.type === "marker").length + 1;
}

function resetEdits(): void {
  commands.value = [];
  previewCommand.value = null;
  cropRect.value = null;
  dragState.value = null;
  renderCanvas();
}

function cancelCrop(): void {
  cropRect.value = null;
  dragState.value = null;
  renderCanvas();
}

function getFullCropRect(): EditorRect {
  return { x: 0, y: 0, width: canvasWidth.value, height: canvasHeight.value };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getCropHandle(point: EditorPoint): CropHandle {
  const rect = cropRect.value ?? getFullCropRect();
  const edge = Math.max(10, Math.min(canvasWidth.value, canvasHeight.value) * 0.035);
  const nearLeft = Math.abs(point.x - rect.x) <= edge;
  const nearRight = Math.abs(point.x - (rect.x + rect.width)) <= edge;
  const nearTop = Math.abs(point.y - rect.y) <= edge;
  const nearBottom = Math.abs(point.y - (rect.y + rect.height)) <= edge;
  if (nearLeft && nearTop) return "top-left";
  if (nearRight && nearTop) return "top-right";
  if (nearLeft && nearBottom) return "bottom-left";
  if (nearRight && nearBottom) return "bottom-right";
  if (nearLeft) return "left";
  if (nearRight) return "right";
  if (nearTop) return "top";
  if (nearBottom) return "bottom";
  return "move";
}

function resizeCropRect(startRect: EditorRect, handle: CropHandle, start: EditorPoint, point: EditorPoint): EditorRect {
  const minSize = 8;
  const deltaX = point.x - start.x;
  const deltaY = point.y - start.y;
  let left = startRect.x;
  let top = startRect.y;
  let right = startRect.x + startRect.width;
  let bottom = startRect.y + startRect.height;

  if (handle === "move") {
    const nextX = clamp(startRect.x + deltaX, 0, canvasWidth.value - startRect.width);
    const nextY = clamp(startRect.y + deltaY, 0, canvasHeight.value - startRect.height);
    return { x: nextX, y: nextY, width: startRect.width, height: startRect.height };
  }

  if (handle.includes("left")) left = clamp(point.x, 0, right - minSize);
  if (handle.includes("right")) right = clamp(point.x, left + minSize, canvasWidth.value);
  if (handle.includes("top")) top = clamp(point.y, 0, bottom - minSize);
  if (handle.includes("bottom")) bottom = clamp(point.y, top + minSize, canvasHeight.value);

  return { x: left, y: top, width: right - left, height: bottom - top };
}

function getExportRect(canvas: HTMLCanvasElement): EditorRect {
  const rect = cropRect.value;
  if (!rect || rect.width < 2 || rect.height < 2) return { x: 0, y: 0, width: canvas.width, height: canvas.height };
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
  };
}

function translatePointForCrop(point: EditorPoint, rect: EditorRect): EditorPoint {
  return { x: point.x - rect.x, y: point.y - rect.y };
}

function translateCommandForCrop(command: EditorCommand, rect: EditorRect): EditorCommand {
  if (command.type === "brush") {
    return {
      ...command,
      points: command.points.map((point) => translatePointForCrop(point, rect)),
    };
  }
  if (command.type === "marker") {
    return {
      ...command,
      point: translatePointForCrop(command.point, rect),
    };
  }
  return {
    ...command,
    start: translatePointForCrop(command.start, rect),
    end: translatePointForCrop(command.end, rect),
  };
}

function applyCrop(): void {
  const canvas = canvasRef.value;
  const rect = canvas ? getExportRect(canvas) : cropRect.value;
  if (!rect || rect.width < 1 || rect.height < 1) return;

  const nextDisplayWidth = Math.max(1, Math.round(rect.width * scaleX.value));
  const nextDisplayHeight = Math.max(1, Math.round(rect.height * scaleY.value));
  const output = document.createElement("canvas");
  output.width = rect.width;
  output.height = rect.height;
  const context = output.getContext("2d");
  if (!context) return;

  if (sourceImage.value) {
    context.drawImage(sourceImage.value, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
  }

  commands.value = commands.value.map((command) => translateCommandForCrop(command, rect));
  previewCommand.value = null;
  cropRect.value = null;
  dragState.value = null;
  workingDisplayWidth.value = nextDisplayWidth;
  workingDisplayHeight.value = nextDisplayHeight;
  workingImageSrc.value = output.toDataURL("image/png");
  loadSourceImage();
}

function saveImage(): void {
  renderCanvas(false);
  const canvas = canvasRef.value;
  if (!canvas) return;
  const rect = getExportRect(canvas);
  const output = document.createElement("canvas");
  output.width = rect.width;
  output.height = rect.height;
  const context = output.getContext("2d");
  if (!context) return;
  context.drawImage(canvas, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
  emit("save", {
    id: props.image.id,
    src: output.toDataURL("image/png"),
    displayWidth: Math.max(1, Math.round(rect.width * scaleX.value)),
    displayHeight: Math.max(1, Math.round(rect.height * scaleY.value)),
  });
}
</script>

<template>
  <section class="image-editor" :aria-label="editorText.title" @keydown.enter.stop.prevent="saveImage">
    <header class="image-editor-toolbar">
      <div class="image-editor-tool-group" role="toolbar" :aria-label="editorText.tools">
        <button
          v-for="tool in toolOptions"
          :key="tool.value"
          type="button"
          class="image-editor-tool"
          :class="{ 'is-active': activeTool === tool.value }"
          :aria-label="editorText[tool.labelKey]"
          :title="editorText[tool.labelKey]"
          @click="selectTool(tool.value)"
        >
          <component :is="tool.icon" :size="17" stroke-width="2" />
        </button>
      </div>

      <div class="image-editor-tool-group" :aria-label="editorText.colors">
        <button
          v-for="color in colorOptions"
          :key="color.value"
          type="button"
          class="image-editor-color"
          :class="{ 'is-active': selectedColor === color.value }"
          :aria-label="editorText[color.key]"
          :title="editorText[color.key]"
          :style="{ background: color.value }"
          @click="selectedColor = color.value"
        />
      </div>

      <label class="image-editor-width-label">
        <span class="image-editor-width-preview" aria-hidden="true">
          <span
            class="image-editor-width-preview-mark"
            :style="{ width: `${strokeWidth}px`, height: `${strokeWidth}px`, background: selectedColor }"
          />
        </span>
        <Minus :size="16" stroke-width="2" />
        <input v-model.number="strokeWidth" class="image-editor-width" type="range" min="2" max="18" step="1" :aria-label="editorText.width" />
      </label>

      <button type="button" class="image-editor-reset" :aria-label="editorText.reset" :title="editorText.reset" @click="resetEdits">
        <RotateCcw :size="16" stroke-width="2" />
      </button>

      <div class="image-editor-actions">
        <button type="button" class="image-editor-cancel" @click="emit('cancel')">{{ uiText.common.cancel }}</button>
        <button type="button" class="image-editor-save" @click="saveImage">{{ uiText.common.save }}</button>
      </div>
    </header>

    <div class="image-editor-stage">
      <div class="image-editor-canvas-wrap">
        <img
          v-if="workingImageSrc"
          class="image-editor-source"
          :src="workingImageSrc"
          :alt="editorText.title"
          draggable="false"
        />
        <canvas
          ref="canvasRef"
          class="image-editor-canvas"
          :width="canvasWidth"
          :height="canvasHeight"
          @pointerdown="handlePointerDown"
          @pointermove="handlePointerMove"
          @pointerup="handlePointerUp"
          @pointercancel="handlePointerCancel"
        />
        <div v-if="activeTool === 'crop' && cropRect" class="image-editor-crop-actions" :style="cropActionStyle">
          <button
            type="button"
            class="image-editor-crop-action image-editor-crop-cancel"
            :aria-label="editorText.cancelCrop"
            :title="editorText.cancelCrop"
            @click.stop="cancelCrop"
            @pointerdown.stop
          >
            <X :size="16" stroke-width="2.5" />
          </button>
          <button
            type="button"
            class="image-editor-crop-action image-editor-crop-apply"
            :aria-label="editorText.applyCrop"
            :title="editorText.applyCrop"
            @click.stop="applyCrop"
            @pointerdown.stop
          >
            <Check :size="16" stroke-width="2.5" />
          </button>
        </div>
      </div>
      <div class="image-editor-cursor" aria-hidden="true">
        <MousePointer2 :size="13" stroke-width="2" />
        <span>{{ editorText[activeTool] }}</span>
      </div>
    </div>
  </section>
</template>
