<script setup lang="ts">
import { computed, nextTick, onMounted, ref, shallowRef, watch } from "vue";
import type { Component } from "vue";
import { ArrowUpRight, Check, Crop, Minus, MousePointer2, PenLine, RectangleHorizontal, Redo2, RotateCcw, Type, Undo2, X } from "lucide-vue-next";
import { getUiText } from "../state/i18n";
import type { AppLanguage, StoredImage } from "../types";

type EditorTool = "crop" | "brush" | "rectangle" | "ellipse" | "arrow" | "marker" | "text";
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

interface PreviewFrame {
  width: number;
  height: number;
}

type EditorCommand =
  | { type: "brush"; color: string; width: number; points: EditorPoint[] }
  | { type: "rectangle" | "ellipse" | "arrow"; color: string; width: number; start: EditorPoint; end: EditorPoint }
  | { type: "marker"; color: string; number: number; point: EditorPoint }
  | { type: "text"; id: string; color: string; fontSize: number; point: EditorPoint; text: string };

interface EditorSnapshot {
  workingImageSrc?: string;
  workingDisplayWidth?: number;
  workingDisplayHeight?: number;
  commands: EditorCommand[];
  cropRect: EditorRect | null;
  activeTextId: string | null;
}

const props = withDefaults(defineProps<{
  image: StoredImage;
  language?: AppLanguage;
  previewLayout?: boolean;
  previewTransform?: string;
  previewFrame?: PreviewFrame | null;
}>(), {
  language: "zh",
  previewLayout: false,
  previewTransform: undefined,
  previewFrame: null,
});

const emit = defineEmits<{
  cancel: [];
  save: [payload: { id: string; src: string; displayWidth: number; displayHeight: number }];
}>();

defineExpose({ redoEdit, saveImage, undoEdit });

const colorOptions: { value: EditorColor; key: "red" | "green" | "blue" | "yellow" | "black" | "white" }[] = [
  { value: "#ef4444", key: "red" },
  { value: "#22c55e", key: "green" },
  { value: "#3b82f6", key: "blue" },
  { value: "#facc15", key: "yellow" },
  { value: "#111827", key: "black" },
  { value: "#ffffff", key: "white" },
];
const TEXT_FONT_SIZE_OFFSET = 20;
const TEXT_LINE_HEIGHT = 1.35;
const TEXT_LETTER_SPACING = 0.4;

const toolOptions: { value: EditorTool; icon?: Component; labelKey: "crop" | "brush" | "rectangle" | "ellipse" | "arrow" | "marker" | "text"; glyph?: string; customIcon?: "ellipse" }[] = [
  { value: "crop", icon: Crop, labelKey: "crop" },
  { value: "brush", icon: PenLine, labelKey: "brush" },
  { value: "rectangle", icon: RectangleHorizontal, labelKey: "rectangle" },
  { value: "ellipse", labelKey: "ellipse", customIcon: "ellipse" },
  { value: "arrow", icon: ArrowUpRight, labelKey: "arrow" },
  { value: "marker", labelKey: "marker", glyph: "1" },
  { value: "text", icon: Type, labelKey: "text" },
];

const canvasRef = ref<HTMLCanvasElement | null>(null);
const sourceImage = shallowRef<HTMLImageElement | null>(null);
const workingImageSrc = ref(props.image.src);
const workingDisplayWidth = ref(props.image.displayWidth);
const workingDisplayHeight = ref(props.image.displayHeight);
const activeTool = ref<EditorTool>("rectangle");
const selectedColor = ref<EditorColor>("#ef4444");
const strokeWidth = ref(4);
const commands = ref<EditorCommand[]>([]);
const previewCommand = ref<EditorCommand | null>(null);
const cropRect = ref<EditorRect | null>(null);
const historySnapshots = ref<EditorSnapshot[]>([]);
const historyIndex = ref(0);
const dragState = ref<{ pointerId: number; tool: EditorTool; start: EditorPoint; cropStart?: EditorRect; cropHandle?: CropHandle } | null>(null);
const textDragState = ref<{ pointerId: number; id: string; start: EditorPoint; origin: EditorPoint } | null>(null);
const activeTextId = ref<string | null>(null);
let restoringHistory = false;
let textIdSequence = 0;

const uiText = computed(() => getUiText(props.language));
const editorText = computed(() => uiText.value.imageEditor);
const textCommands = computed(() => commands.value.filter((command): command is Extract<EditorCommand, { type: "text" }> => command.type === "text"));
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
  resetEditorHistory();
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
    textDragState.value = null;
    activeTextId.value = null;
    resetEditorHistory();
    loadSourceImage();
  },
);

watch([commands, previewCommand, cropRect, sourceImage], () => {
  renderCanvas();
}, { deep: true });

watch(strokeWidth, (width) => {
  if (activeTool.value !== "text" || !activeTextId.value) return;
  const fontSize = getTextFontSizeFromSlider(width);
  const currentText = commands.value.find((command) => command.type === "text" && command.id === activeTextId.value);
  commands.value = commands.value.map((command) => (
    command.type === "text" && command.id === activeTextId.value ? { ...command, fontSize } : command
  ));
  if (currentText?.type === "text" && currentText.fontSize !== fontSize) recordEditorHistory();
});

const canUndo = computed(() => historyIndex.value > 0);
const canRedo = computed(() => historyIndex.value < historySnapshots.value.length - 1);

function isEditorUndoShortcut(event: KeyboardEvent): boolean {
  return (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "z";
}

function isEditorRedoShortcut(event: KeyboardEvent): boolean {
  const key = event.key.toLowerCase();
  return (event.ctrlKey || event.metaKey) && ((event.shiftKey && key === "z") || key === "y");
}

function handleEditorKeydown(event: KeyboardEvent): void {
  if (isEditorRedoShortcut(event)) {
    event.preventDefault();
    event.stopPropagation();
    redoEdit();
    return;
  }
  if (isEditorUndoShortcut(event)) {
    event.preventDefault();
    event.stopPropagation();
    undoEdit();
  }
}

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

function renderCanvas(showCropOverlay = true, includeText = false): void {
  const canvas = canvasRef.value;
  const context = getCanvasContext(canvas);
  if (!canvas || !context) return;

  if (canvas.width !== canvasWidth.value) canvas.width = canvasWidth.value;
  if (canvas.height !== canvasHeight.value) canvas.height = canvasHeight.value;

  context.clearRect(0, 0, canvas.width, canvas.height);
  if (sourceImage.value) context.drawImage(sourceImage.value, 0, 0, canvas.width, canvas.height);
  for (const command of commands.value) {
    if (command.type !== "text" || includeText) drawCommand(context, command);
  }
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
  if (command.type === "text") drawText(context, command);

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

function drawText(context: CanvasRenderingContext2D, command: Extract<EditorCommand, { type: "text" }>): void {
  if (!command.text.trim()) return;
  const lineHeight = Math.round(command.fontSize * TEXT_LINE_HEIGHT);
  context.font = `600 ${command.fontSize}px system-ui, -apple-system, BlinkMacSystemFont, sans-serif`;
  (context as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${TEXT_LETTER_SPACING}px`;
  context.textAlign = "left";
  context.textBaseline = "top";
  context.lineJoin = "round";
  context.lineWidth = Math.max(3, Math.round(command.fontSize * 0.16));
  context.strokeStyle = "#ffffff";
  context.fillStyle = command.color;
  for (const [index, line] of command.text.split(/\r?\n/).entries()) {
    const y = command.point.y + index * lineHeight;
    context.strokeText(line, command.point.x, y);
    context.fillText(line, command.point.x, y);
  }
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
  pruneEmptyTextCommands();
  activeTool.value = tool;
  if (tool === "crop" && !cropRect.value) {
    cropRect.value = { x: 0, y: 0, width: canvasWidth.value, height: canvasHeight.value };
  }
}

function handlePointerDown(event: PointerEvent): void {
  if (event.button !== 0) return;
  const point = getPointerPoint(event);
  if (activeTool.value === "text") {
    createTextCommand(point);
    return;
  }
  if (activeTool.value === "marker") {
    commands.value = [
      ...commands.value,
      { type: "marker", color: selectedColor.value, number: getNextMarkerNumber(), point },
    ];
    recordEditorHistory();
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

  if (state.tool === "crop") {
    recordEditorHistory();
    return;
  }
  if (previewCommand.value) {
    commands.value = [...commands.value, previewCommand.value];
    previewCommand.value = null;
    recordEditorHistory();
  }
}

function handlePointerCancel(event: PointerEvent): void {
  const state = dragState.value;
  if (!state || event.pointerId !== state.pointerId) return;
  dragState.value = null;
  previewCommand.value = null;
}

function createTextCommand(point: EditorPoint): void {
  pruneEmptyTextCommands();
  const id = `text-${++textIdSequence}`;
  commands.value = [
    ...commands.value,
    { type: "text", id, color: selectedColor.value, fontSize: getTextFontSizeFromSlider(strokeWidth.value), point, text: "" },
  ];
  activeTextId.value = id;
  recordEditorHistory();
  void nextTick(() => {
    focusTextInput(id);
    window.requestAnimationFrame(() => focusTextInput(id));
  });
}

function focusTextInput(id: string): void {
  const input = document.querySelector<HTMLTextAreaElement>(`.image-editor-text-box[data-text-id="${id}"] .image-editor-text-input`);
  if (!input) return;
  input.focus({ preventScroll: true });
  input.setSelectionRange(input.value.length, input.value.length);
}

function updateTextCommand(id: string, text: string): void {
  const currentText = commands.value.find((command) => command.type === "text" && command.id === id);
  commands.value = commands.value.map((command) => command.type === "text" && command.id === id ? { ...command, text } : command);
  if (currentText?.type === "text" && currentText.text !== text) recordEditorHistory();
}

function selectTextCommand(id: string): void {
  pruneEmptyTextCommands(id);
  activeTextId.value = id;
}

function pruneEmptyTextCommands(exceptId?: string): void {
  const nextCommands = commands.value.filter((command) => command.type !== "text" || command.id === exceptId || command.text.trim());
  if (nextCommands.length !== commands.value.length) commands.value = nextCommands;
  if (activeTextId.value && !nextCommands.some((command) => command.type === "text" && command.id === activeTextId.value)) {
    activeTextId.value = null;
  }
}

function getTextBoxStyle(command: Extract<EditorCommand, { type: "text" }>): Record<string, string> {
  return {
    left: `${(command.point.x / canvasWidth.value) * 100}%`,
    top: `${(command.point.y / canvasHeight.value) * 100}%`,
    color: command.color,
  };
}

function getTextInputStyle(command: Extract<EditorCommand, { type: "text" }>): Record<string, string> {
  const displayScale = getCanvasDisplayScale();
  return {
    fontSize: `${formatPixelValue(command.fontSize * displayScale)}px`,
    lineHeight: String(TEXT_LINE_HEIGHT),
    letterSpacing: `${TEXT_LETTER_SPACING}px`,
  };
}

function getCanvasWrapStyle(): Record<string, string> | undefined {
  if (!props.previewLayout && !props.previewTransform && !props.previewFrame) return undefined;
  return {
    ...(props.previewFrame ? {
      width: `${formatPixelValue(props.previewFrame.width)}px`,
      height: `${formatPixelValue(props.previewFrame.height)}px`,
    } : {}),
    ...(props.previewTransform ? { transform: props.previewTransform } : {}),
  };
}

function getTextFontSizeFromSlider(width: number): number {
  return Math.round(clamp(width, 2, 18) + TEXT_FONT_SIZE_OFFSET);
}

function getCanvasDisplayScale(): number {
  const canvas = canvasRef.value;
  const rect = canvas?.getBoundingClientRect();
  if (!canvas || !rect || rect.width <= 0 || canvas.width <= 0) return 1;
  return rect.width / canvas.width;
}

function formatPixelValue(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function startTextDrag(event: PointerEvent, command: Extract<EditorCommand, { type: "text" }>): void {
  if (event.button !== 0) return;
  activeTextId.value = command.id;
  textDragState.value = {
    pointerId: event.pointerId,
    id: command.id,
    start: getPointerPoint(event),
    origin: command.point,
  };
  (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
}

function handleTextInputPointerDown(event: PointerEvent, command: Extract<EditorCommand, { type: "text" }>): void {
  selectTextCommand(command.id);
  if (isTextResizeHandlePointer(event)) return;
  startTextDrag(event, command);
}

function isTextResizeHandlePointer(event: PointerEvent): boolean {
  const target = event.currentTarget;
  if (!(target instanceof HTMLElement)) return false;
  const rect = target.getBoundingClientRect();
  const handleSize = 18;
  if (rect.width <= handleSize || rect.height <= handleSize) return false;
  return event.clientX >= rect.right - handleSize && event.clientY >= rect.bottom - handleSize;
}

function moveTextDrag(event: PointerEvent): void {
  const state = textDragState.value;
  if (!state || event.pointerId !== state.pointerId) return;
  const point = getPointerPoint(event);
  const nextPoint = {
    x: clamp(state.origin.x + point.x - state.start.x, 0, canvasWidth.value),
    y: clamp(state.origin.y + point.y - state.start.y, 0, canvasHeight.value),
  };
  commands.value = commands.value.map((command) => command.type === "text" && command.id === state.id ? { ...command, point: nextPoint } : command);
}

function finishTextDrag(event: PointerEvent): void {
  const state = textDragState.value;
  if (!state || event.pointerId !== state.pointerId) return;
  (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
  textDragState.value = null;
  recordEditorHistory();
}

function getNextMarkerNumber(): number {
  return commands.value.filter((command) => command.type === "marker").length + 1;
}

function resetEdits(): void {
  commands.value = [];
  previewCommand.value = null;
  cropRect.value = null;
  dragState.value = null;
  textDragState.value = null;
  activeTextId.value = null;
  recordEditorHistory();
  renderCanvas();
}

function cancelCrop(): void {
  cropRect.value = null;
  dragState.value = null;
  recordEditorHistory();
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
  if (command.type === "text") {
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
  pruneEmptyTextCommands();
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
  recordEditorHistory();
  loadSourceImage();
}

function saveImage(): void {
  pruneEmptyTextCommands();
  renderCanvas(false, true);
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

function cloneEditorCommands(value: EditorCommand[]): EditorCommand[] {
  return value.map((command) => {
    if (command.type === "brush") return { ...command, points: command.points.map((point) => ({ ...point })) };
    if (command.type === "marker" || command.type === "text") return { ...command, point: { ...command.point } };
    return { ...command, start: { ...command.start }, end: { ...command.end } };
  });
}

function cloneEditorRect(value: EditorRect | null): EditorRect | null {
  return value ? { ...value } : null;
}

function createEditorSnapshot(): EditorSnapshot {
  return {
    workingImageSrc: workingImageSrc.value,
    workingDisplayWidth: workingDisplayWidth.value,
    workingDisplayHeight: workingDisplayHeight.value,
    commands: cloneEditorCommands(commands.value),
    cropRect: cloneEditorRect(cropRect.value),
    activeTextId: activeTextId.value,
  };
}

function areEditorSnapshotsEqual(left: EditorSnapshot, right: EditorSnapshot): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function resetEditorHistory(): void {
  historySnapshots.value = [createEditorSnapshot()];
  historyIndex.value = 0;
}

function recordEditorHistory(): void {
  if (restoringHistory) return;
  const snapshot = createEditorSnapshot();
  const current = historySnapshots.value[historyIndex.value];
  if (current && areEditorSnapshotsEqual(current, snapshot)) return;
  const nextSnapshots = [...historySnapshots.value.slice(0, historyIndex.value + 1), snapshot].slice(-50);
  historySnapshots.value = nextSnapshots;
  historyIndex.value = nextSnapshots.length - 1;
}

function restoreEditorSnapshot(snapshot: EditorSnapshot): void {
  restoringHistory = true;
  workingImageSrc.value = snapshot.workingImageSrc;
  workingDisplayWidth.value = snapshot.workingDisplayWidth;
  workingDisplayHeight.value = snapshot.workingDisplayHeight;
  commands.value = cloneEditorCommands(snapshot.commands);
  previewCommand.value = null;
  cropRect.value = cloneEditorRect(snapshot.cropRect);
  dragState.value = null;
  textDragState.value = null;
  activeTextId.value = snapshot.activeTextId;
  loadSourceImage();
  restoringHistory = false;
}

function undoEdit(): void {
  if (!canUndo.value) return;
  historyIndex.value -= 1;
  restoreEditorSnapshot(historySnapshots.value[historyIndex.value]);
}

function redoEdit(): void {
  if (!canRedo.value) return;
  historyIndex.value += 1;
  restoreEditorSnapshot(historySnapshots.value[historyIndex.value]);
}
</script>

<template>
  <section class="image-editor" :class="{ 'image-editor--preview': previewLayout }" :aria-label="editorText.title" @keydown.capture="handleEditorKeydown">
    <header class="image-editor-toolbar" :class="{ 'preview-actions image-editor-preview-actions': previewLayout }">
      <div class="image-editor-tool-group" role="toolbar" :aria-label="editorText.tools">
        <button
          v-for="tool in toolOptions"
          :key="tool.value"
          type="button"
          class="image-editor-tool"
          :class="{ 'is-active': activeTool === tool.value }"
          :aria-label="editorText[tool.labelKey]"
          :data-tooltip="editorText[tool.labelKey]"
          :title="editorText[tool.labelKey]"
          @click="selectTool(tool.value)"
        >
          <span v-if="tool.customIcon === 'ellipse'" class="image-editor-ellipse-icon" aria-hidden="true" />
          <span v-else-if="tool.glyph" class="image-editor-marker-icon" aria-hidden="true">{{ tool.glyph }}</span>
          <component v-else-if="tool.icon" :is="tool.icon" :size="17" stroke-width="2" />
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

      <div class="image-editor-tool-group image-editor-history" role="toolbar" :aria-label="editorText.history">
        <button type="button" class="image-editor-reset" :aria-label="editorText.undo" :title="editorText.undo" :disabled="!canUndo" @click="undoEdit">
          <Undo2 :size="16" stroke-width="2" />
        </button>
        <button type="button" class="image-editor-reset" :aria-label="editorText.redo" :title="editorText.redo" :disabled="!canRedo" @click="redoEdit">
          <Redo2 :size="16" stroke-width="2" />
        </button>
      </div>

      <div class="image-editor-actions">
        <button type="button" class="image-editor-cancel" @click="emit('cancel')">{{ uiText.common.cancel }}</button>
        <button type="button" class="image-editor-save" @click="saveImage">{{ uiText.common.save }}</button>
      </div>
    </header>

    <div class="image-editor-stage">
      <div class="image-editor-canvas-wrap" :style="getCanvasWrapStyle()">
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
        <div
          v-for="command in textCommands"
          :key="command.id"
          class="image-editor-text-box"
          :class="{ 'is-active': activeTextId === command.id }"
          :data-text-id="command.id"
          :style="getTextBoxStyle(command)"
          @click.stop="selectTextCommand(command.id)"
          @pointerdown.stop="startTextDrag($event, command)"
          @pointermove.stop="moveTextDrag"
          @pointerup.stop="finishTextDrag"
          @pointercancel.stop="finishTextDrag"
        >
          <textarea
            class="image-editor-text-input"
            :class="{ 'is-transparent': !command.text }"
            :value="command.text"
            :style="getTextInputStyle(command)"
            placeholder=""
            rows="1"
            :aria-label="editorText.textInput"
            @input="updateTextCommand(command.id, ($event.target as HTMLTextAreaElement).value)"
            @focus="selectTextCommand(command.id)"
            @click.stop="selectTextCommand(command.id)"
            @pointerdown.stop="handleTextInputPointerDown($event, command)"
            @pointermove.stop="moveTextDrag"
            @pointerup.stop="finishTextDrag"
            @pointercancel.stop="finishTextDrag"
            @keydown.stop
          />
        </div>
      </div>
      <div class="image-editor-cursor" aria-hidden="true">
        <MousePointer2 :size="13" stroke-width="2" />
        <span>{{ editorText[activeTool] }}</span>
      </div>
    </div>
  </section>
</template>
