<script setup lang="ts">
import { computed, h, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import type { Component, VNode } from "vue";
import { NDropdown, NIcon, NScrollbar, NSlider } from "naive-ui";
import type { DropdownOption } from "naive-ui";
import {
  CalculatorOutline,
  BulbOutline,
  CloseOutline,
  CodeSlashOutline,
  ColorPaletteOutline,
  CopyOutline,
  EyedropOutline,
  KeyOutline,
  RefreshOutline,
  SettingsOutline,
  SwapHorizontalOutline,
} from "@vicons/ionicons5";
import type { AppLanguage, ThemeMode } from "../types";
import { getUiText } from "../state/i18n";
import { withKaomoji, type MessageMood } from "../state/messages";
import { CONTEXT_MENU_Z_INDEX, createExclusiveContextMenu } from "../utils/contextMenu";
import EditableTitle from "./EditableTitle.vue";

type ToolId = "calculator" | "base" | "color" | "codec" | "password";
type EyeDropperResult = { sRGBHex: string };
type EyeDropperConstructor = new () => { open: () => Promise<EyeDropperResult> };
type ToolTab = { id: ToolId; label: string; icon: Component };
type CalculatorKey = { label: string; value: string; testId: string; kind?: "operator" | "utility" | "equals" };
type RgbColor = { r: number; g: number; b: number };
type ToolMenu = { x: number; y: number; toolId: ToolId | null };
type ToolPanelMenu = { x: number; y: number };

const ACTIVE_TOOL_STORAGE_KEY = "mini-desk-active-tool";
const LEGACY_ACTIVE_TOOL_STORAGE_KEY = "todo-board-active-tool";
const HIDDEN_TOOLS_STORAGE_KEY = "mini-desk-hidden-tools";
const LEGACY_HIDDEN_TOOLS_STORAGE_KEY = "todo-board-hidden-tools";
const TOOL_IDS = ["calculator", "base", "color", "codec", "password"] as const;
const DEFAULT_HIDDEN_TOOL_IDS: readonly ToolId[] = ["base", "codec", "password"];
const COMMON_BASES = [2, 8, 10, 16] as const;
const DEFAULT_PASSWORD_SYMBOLS_TEXT = "!@#$%^&*_-+=?";
const DEFAULT_LIGHT_COLOR = "#ffffff";
const DEFAULT_DARK_COLOR = "#000000";

const props = withDefaults(defineProps<{
  titleId: string;
  title: string;
  split?: boolean;
  language?: AppLanguage;
  theme?: ThemeMode;
}>(), {
  language: "zh",
  theme: "light",
});

const emit = defineEmits<{
  titleUpdate: [id: string, value: string];
  focus: [element: HTMLElement];
  blur: [element: HTMLElement];
  message: [message: string, anchor?: HTMLElement];
  dismissMessage: [];
}>();

const uiText = computed(() => getUiText(props.language));
const panelRef = ref<HTMLElement | null>(null);
const titleRef = ref<{ openMenuAt: (x: number, y: number, event?: Event) => void } | null>(null);
const toolPanelMenuButtonRef = ref<HTMLElement | null>(null);
const toolConfigPanelRef = ref<HTMLElement | null>(null);
const activeToolId = ref<ToolId | null>(readStoredActiveToolId());
const hiddenToolIds = ref<Set<ToolId>>(readStoredHiddenToolIds());
const toolMenu = ref<ToolMenu | null>(null);
const toolPanelMenu = ref<ToolPanelMenu | null>(null);
const toolConfigVisible = ref(false);
const panelClasses = computed(() => ({
  panel: !props.split,
  "split-block": props.split,
}));
const exclusiveToolMenu = createExclusiveContextMenu(closeToolMenu);

const calculatorExpression = ref("");
const baseSource = ref("255");
const baseFrom = ref("10");

const manualColorInputRef = ref<HTMLInputElement | null>(null);
const colorValue = ref(getDefaultColorForTheme(props.theme));

const codecInput = ref("");
const codecOutput = ref("");

const passwordLength = ref(16);
const passwordOutput = ref("");
const passwordOptions = reactive({
  uppercase: true,
  lowercase: true,
  numbers: true,
  symbols: true,
});
const passwordSymbolSet = ref(DEFAULT_PASSWORD_SYMBOLS_TEXT);

onMounted(() => {
  exclusiveToolMenu.mount();
  document.addEventListener("pointerdown", handleToolConfigOutsidePointerDown);
});

onUnmounted(() => {
  exclusiveToolMenu.unmount();
  document.removeEventListener("pointerdown", handleToolConfigOutsidePointerDown);
});

watch(() => props.theme, (theme) => {
  if (isDefaultThemeColor(colorValue.value)) colorValue.value = getDefaultColorForTheme(theme);
});

const tools = computed<ToolTab[]>(() => [
  { id: "calculator", label: uiText.value.tools.calculator, icon: CalculatorOutline },
  { id: "base", label: uiText.value.tools.baseConvert, icon: SwapHorizontalOutline },
  { id: "color", label: uiText.value.tools.colorPicker, icon: ColorPaletteOutline },
  { id: "codec", label: uiText.value.tools.codec, icon: CodeSlashOutline },
  { id: "password", label: uiText.value.tools.password, icon: KeyOutline },
]);

const visibleTools = computed<ToolTab[]>(() => tools.value.filter((tool) => !hiddenToolIds.value.has(tool.id)));
const activeTool = computed(() => activeToolId.value ? visibleTools.value.find((tool) => tool.id === activeToolId.value) ?? null : null);
const toolMenuOptions = computed<DropdownOption[]>(() => [
  { label: uiText.value.tools.close, key: "close", disabled: !activeToolId.value, icon: renderIcon(CloseOutline) },
  { label: uiText.value.tools.configure, key: "configure", icon: renderIcon(SettingsOutline) },
  { label: uiText.value.tools.tips, key: "tips", icon: renderIcon(BulbOutline) },
]);
const baseOptions = computed(() => [
  { value: "2", label: uiText.value.tools.binaryBase },
  { value: "8", label: uiText.value.tools.octalBase },
  { value: "10", label: uiText.value.tools.decimalBase },
  { value: "16", label: uiText.value.tools.hexBase },
]);
const parsedBaseValue = computed(() => {
  try {
    return parseBaseInteger(baseSource.value, Number(baseFrom.value));
  } catch {
    return null;
  }
});
const baseConversionRows = computed(() =>
  COMMON_BASES.map((base) => ({
    base,
    label: getBaseLabel(base),
    value: parsedBaseValue.value === null ? "--" : formatBaseInteger(parsedBaseValue.value, base),
    canCopy: parsedBaseValue.value !== null,
  })),
);
const safeColorHex = computed(() => parseColorInput(colorValue.value) ?? "#000000");
const colorRgb = computed(() => {
  const rgb = hexToRgb(safeColorHex.value);
  return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
});
const colorHsl = computed(() => rgbToHslText(hexToRgb(safeColorHex.value)));
const selectedPasswordSymbolText = computed(() =>
  passwordOptions.symbols ? uniqueChars(passwordSymbolSet.value) : "",
);

const calculatorKeys: CalculatorKey[] = [
  { label: "C", value: "clear", testId: "calculator-key-clear", kind: "utility" },
  { label: "⌫", value: "backspace", testId: "calculator-key-backspace", kind: "utility" },
  { label: "%", value: "%", testId: "calculator-key-percent", kind: "operator" },
  { label: "÷", value: "÷", testId: "calculator-key-divide", kind: "operator" },
  { label: "7", value: "7", testId: "calculator-key-7" },
  { label: "8", value: "8", testId: "calculator-key-8" },
  { label: "9", value: "9", testId: "calculator-key-9" },
  { label: "×", value: "×", testId: "calculator-key-multiply", kind: "operator" },
  { label: "4", value: "4", testId: "calculator-key-4" },
  { label: "5", value: "5", testId: "calculator-key-5" },
  { label: "6", value: "6", testId: "calculator-key-6" },
  { label: "-", value: "-", testId: "calculator-key-subtract", kind: "operator" },
  { label: "1", value: "1", testId: "calculator-key-1" },
  { label: "2", value: "2", testId: "calculator-key-2" },
  { label: "3", value: "3", testId: "calculator-key-3" },
  { label: "+", value: "+", testId: "calculator-key-add", kind: "operator" },
  { label: "0", value: "0", testId: "calculator-key-0" },
  { label: ".", value: ".", testId: "calculator-key-decimal" },
  { label: "=", value: "equals", testId: "calculator-key-equals", kind: "equals" },
];

function renderIcon(icon: Component): () => VNode {
  return () => h(NIcon, { size: 16 }, { default: () => h(icon) });
}

function isToolId(value: unknown): value is ToolId {
  return typeof value === "string" && (TOOL_IDS as readonly string[]).includes(value);
}

function readStoredActiveToolId(): ToolId | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const stored = localStorage.getItem(ACTIVE_TOOL_STORAGE_KEY) ?? localStorage.getItem(LEGACY_ACTIVE_TOOL_STORAGE_KEY);
    return isToolId(stored) ? stored : null;
  } catch {
    return null;
  }
}

function readStoredHiddenToolIds(): Set<ToolId> {
  try {
    if (typeof localStorage === "undefined") return new Set(DEFAULT_HIDDEN_TOOL_IDS);
    const stored = localStorage.getItem(HIDDEN_TOOLS_STORAGE_KEY) ?? localStorage.getItem(LEGACY_HIDDEN_TOOLS_STORAGE_KEY);
    if (stored === null) return new Set(DEFAULT_HIDDEN_TOOL_IDS);
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return new Set(DEFAULT_HIDDEN_TOOL_IDS);
    const ids = parsed.filter(isToolId);
    return ids.length >= TOOL_IDS.length ? new Set(DEFAULT_HIDDEN_TOOL_IDS) : new Set(ids);
  } catch {
    return new Set(DEFAULT_HIDDEN_TOOL_IDS);
  }
}

function storeActiveToolId(id: ToolId | null): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(ACTIVE_TOOL_STORAGE_KEY, id ?? "");
  } catch {
    // Local storage may be blocked; the tool can still be used for this session.
  }
}

function storeHiddenToolIds(ids: ReadonlySet<ToolId>): void {
  try {
    if (typeof localStorage === "undefined") return;
    const orderedIds = TOOL_IDS.filter((id) => ids.has(id));
    localStorage.setItem(HIDDEN_TOOLS_STORAGE_KEY, JSON.stringify(orderedIds));
  } catch {
    // Layout storage is optional; all tools stay available for this session.
  }
}

function getToolMessageAnchor(): HTMLElement | undefined {
  const activeElement = document.activeElement;
  if (activeElement instanceof HTMLElement && panelRef.value?.contains(activeElement)) return activeElement;
  return panelRef.value ?? undefined;
}

function notifyToolMessage(message: string): void {
  emit("message", withKaomoji(message, getToolMessageMood(message)), getToolMessageAnchor());
}

function getDefaultColorForTheme(theme: ThemeMode): string {
  return theme === "dark" ? DEFAULT_DARK_COLOR : DEFAULT_LIGHT_COLOR;
}

function isDefaultThemeColor(value: string): boolean {
  const normalized = normalizeHexColor(value);
  return normalized === DEFAULT_LIGHT_COLOR || normalized === DEFAULT_DARK_COLOR;
}

function showEmptyToolTips(event: MouseEvent): void {
  if (activeToolId.value) return;
  if ((event.target as HTMLElement).closest(".tool-tabs")) return;
  notifyToolMessage(uiText.value.tools.emptyTips);
}

function getToolMessageMood(message: string): MessageMood {
  return /无效|无法|失败|取消|不支持|Unsupported|Invalid|Failed|Cancelled/i.test(message) ? "warning" : "happy";
}

function getBaseLabel(base: number): string {
  return baseOptions.value.find((option) => Number(option.value) === base)?.label ?? String(base);
}

function openTitleMenu(event: MouseEvent): void {
  const target = event.target as HTMLElement;
  if (target.closest("button, input, textarea, select")) return;
  event.preventDefault();
  event.stopPropagation();
  titleRef.value?.openMenuAt(event.clientX, event.clientY, event);
}

function handleFocusIn(event: FocusEvent): void {
  emit("focus", event.currentTarget as HTMLElement);
}

function handleFocusOut(event: FocusEvent): void {
  const current = event.currentTarget as HTMLElement;
  const next = event.relatedTarget;
  if (next instanceof Node && current.contains(next)) return;
  emit("blur", current);
}

function selectTool(id: ToolId): void {
  if (hiddenToolIds.value.has(id)) return;
  const previousToolId = activeToolId.value;
  activeToolId.value = id;
  storeActiveToolId(id);
  closeToolMenu();
  if (previousToolId !== id) emit("dismissMessage");
}

function openToolPanelMenu(event: MouseEvent): void {
  event.preventDefault();
  event.stopPropagation();
  closeToolMenu();
  toolPanelMenu.value = { x: event.clientX, y: event.clientY };
}

function closeToolPanelMenu(): void {
  toolPanelMenu.value = null;
}

function handleToolPanelMenuSelect(key: string): void {
  handleToolActionSelect(key, activeToolId.value);
  closeToolPanelMenu();
}

function handleToolConfigOutsidePointerDown(event: PointerEvent): void {
  if (!toolConfigVisible.value) return;
  const target = event.target;
  if (!(target instanceof Node)) return;
  if (toolConfigPanelRef.value?.contains(target)) return;
  if (toolPanelMenuButtonRef.value?.contains(target)) return;
  toolConfigVisible.value = false;
}

function isToolVisible(id: ToolId): boolean {
  return !hiddenToolIds.value.has(id);
}

function canHideTool(id: ToolId): boolean {
  return !isToolVisible(id) || visibleTools.value.length > 1;
}

function toggleToolVisibility(id: ToolId, visible: boolean): void {
  const nextHidden = new Set(hiddenToolIds.value);
  if (visible) {
    nextHidden.delete(id);
  } else {
    if (!canHideTool(id)) return;
    nextHidden.add(id);
  }
  hiddenToolIds.value = nextHidden;
  storeHiddenToolIds(nextHidden);
  if (activeToolId.value && nextHidden.has(activeToolId.value)) {
    const nextActiveToolId = TOOL_IDS.find((toolId) => !nextHidden.has(toolId)) ?? null;
    activeToolId.value = nextActiveToolId;
    storeActiveToolId(nextActiveToolId);
  }
}

function openToolMenu(event: MouseEvent, id: ToolId | null): void {
  event.preventDefault();
  event.stopPropagation();
  const replacingExistingMenu = Boolean(toolMenu.value);
  toolMenu.value = { x: event.clientX, y: event.clientY, toolId: id };
  exclusiveToolMenu.notifyOpen(event, { replacingExistingMenu });
}

function openToolTabsMenu(event: MouseEvent): void {
  const target = event.target as HTMLElement;
  if (target.closest(".tool-tab")) return;
  openToolMenu(event, activeToolId.value);
}

function openActiveToolMenu(event: MouseEvent): void {
  const target = event.target as HTMLElement;
  if (!isBlankToolContextTarget(target)) return;
  openToolMenu(event, activeToolId.value);
}

function isBlankToolContextTarget(target: HTMLElement): boolean {
  if (target.closest(".tool-tabs")) return false;
  if (target.closest("button, input, textarea, select, label, code")) return false;
  const pane = target.closest(".tool-pane");
  if (pane) return target === pane;
  return Boolean(target.closest(".tool-workbench, .tool-content, .tool-content-scrollbar"));
}

function closeToolMenu(): void {
  toolMenu.value = null;
}

function handleToolMenuSelect(key: string): void {
  handleToolActionSelect(key, toolMenu.value?.toolId ?? activeToolId.value);
  closeToolMenu();
}

function handleToolActionSelect(key: string, contextToolId: ToolId | null): void {
  if (key === "close" && activeToolId.value) {
    activeToolId.value = null;
    storeActiveToolId(null);
  }
  if (key === "configure") {
    toolConfigVisible.value = true;
  }
  if (key === "tips") {
    notifyToolMessage(getToolTipsMessage(contextToolId));
  }
}

function getToolTipsMessage(id: ToolId | null): string {
  const tips = uiText.value.tools;
  if (id === "calculator") return tips.calculatorTips;
  if (id === "base") return tips.baseTips;
  if (id === "color") return tips.colorTips;
  if (id === "codec") return tips.codecTips;
  if (id === "password") return tips.passwordTips;
  return tips.tipsGeneral;
}

function calculateExpression(): void {
  const expression = calculatorExpression.value.trim();
  if (!expression) {
    return;
  }
  try {
    calculatorExpression.value = formatNumberResult(evaluateExpression(expression));
  } catch {
    notifyToolMessage(uiText.value.tools.invalidExpression);
  }
}

function clearCalculator(): void {
  calculatorExpression.value = "";
}

function pressCalculatorKey(key: CalculatorKey): void {
  if (key.value === "clear") {
    clearCalculator();
    return;
  }
  if (key.value === "backspace") {
    calculatorExpression.value = calculatorExpression.value.slice(0, -1);
    return;
  }
  if (key.value === "equals") {
    calculateExpression();
    return;
  }
  calculatorExpression.value += key.value;
}

function notifyBaseInvalidIfNeeded(): void {
  if (baseSource.value.trim() && parsedBaseValue.value === null) {
    notifyToolMessage(uiText.value.tools.invalidBaseValue);
  }
}

function evaluateExpression(expression: string): number {
  const normalized = expression
    .replace(/[×x]/g, "*")
    .replace(/÷/g, "/");
  if (!/^[\d+\-*/().%\s]+$/.test(normalized)) throw new Error("Invalid expression");
  const value = Function(`"use strict"; return (${normalized});`)() as unknown;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("Invalid result");
  return value;
}

function formatNumberResult(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toFixed(12)));
}

function parseBaseInteger(value: string, base: number): bigint {
  if (!Number.isInteger(base) || base < 2 || base > 36) throw new Error("Invalid base");
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) throw new Error("Empty value");
  const negative = trimmed.startsWith("-");
  const digits = negative || trimmed.startsWith("+") ? trimmed.slice(1) : trimmed;
  if (!digits) throw new Error("Empty value");
  let result = 0n;
  for (const char of digits) {
    const digit = Number.parseInt(char, 36);
    if (!Number.isInteger(digit) || digit < 0 || digit >= base) throw new Error("Invalid digit");
    result = result * BigInt(base) + BigInt(digit);
  }
  return negative ? -result : result;
}

function formatBaseInteger(value: bigint, base: number): string {
  if (!Number.isInteger(base) || base < 2 || base > 36) throw new Error("Invalid base");
  if (value === 0n) return "0";
  const negative = value < 0n;
  let current = negative ? -value : value;
  const digits = "0123456789abcdefghijklmnopqrstuvwxyz";
  let output = "";
  while (current > 0n) {
    const digit = Number(current % BigInt(base));
    output = digits[digit] + output;
    current /= BigInt(base);
  }
  return negative ? `-${output}` : output;
}

function setColor(value: string): void {
  const normalized = parseColorInput(value);
  colorValue.value = normalized ?? value;
}

function normalizeColorInput(): void {
  colorValue.value = safeColorHex.value;
}

async function pickExternalColor(): Promise<void> {
  const EyeDropper = getEyeDropperConstructor();
  if (!EyeDropper) {
    manualColorInputRef.value?.click();
    notifyToolMessage(uiText.value.tools.eyedropperFallback);
    return;
  }
  try {
    const result = await new EyeDropper().open();
    setColor(result.sRGBHex);
    notifyToolMessage(uiText.value.tools.colorPicked);
  } catch (error) {
    notifyToolMessage(error instanceof DOMException && error.name === "AbortError"
      ? uiText.value.tools.eyedropperCancelled
      : uiText.value.tools.eyedropperUnsupported);
  }
}

function getEyeDropperConstructor(): EyeDropperConstructor | undefined {
  return (window as Window & { EyeDropper?: EyeDropperConstructor }).EyeDropper
    ?? (globalThis as typeof globalThis & { EyeDropper?: EyeDropperConstructor }).EyeDropper;
}

function parseColorInput(value: string): string | null {
  return normalizeHexColor(value) ?? parseRgbColor(value) ?? parseHslColor(value);
}

function normalizeHexColor(value: string): string | null {
  const trimmed = value.trim();
  const short = trimmed.match(/^#?([0-9a-f]{3})$/i)?.[1];
  if (short) return `#${short.split("").map((char) => char + char).join("").toLowerCase()}`;
  const full = trimmed.match(/^#?([0-9a-f]{6})$/i)?.[1];
  return full ? `#${full.toLowerCase()}` : null;
}

function parseRgbColor(value: string): string | null {
  const content = value.trim().match(/^rgba?\((.*)\)$/i)?.[1];
  if (!content) return null;
  const parts = content.replace(/\s*\/\s*[\d.]+%?\s*$/, "").split(/[,\s]+/).filter(Boolean);
  if (parts.length < 3) return null;
  const rgb = parts.slice(0, 3).map(parseRgbChannel);
  return rgb.every((channel) => channel !== null)
    ? rgbToHex({ r: rgb[0] ?? 0, g: rgb[1] ?? 0, b: rgb[2] ?? 0 })
    : null;
}

function parseRgbChannel(value: string): number | null {
  const trimmed = value.trim();
  const isPercent = trimmed.endsWith("%");
  const number = Number.parseFloat(isPercent ? trimmed.slice(0, -1) : trimmed);
  if (!Number.isFinite(number)) return null;
  const channel = isPercent ? Math.round((number / 100) * 255) : Math.round(number);
  return channel >= 0 && channel <= 255 ? channel : null;
}

function parseHslColor(value: string): string | null {
  const content = value.trim().match(/^hsla?\((.*)\)$/i)?.[1];
  if (!content) return null;
  const parts = content.replace(/\s*\/\s*[\d.]+%?\s*$/, "").split(/[,\s]+/).filter(Boolean);
  if (parts.length < 3) return null;
  const hue = parseHue(parts[0] ?? "");
  const saturation = parsePercent(parts[1] ?? "");
  const lightness = parsePercent(parts[2] ?? "");
  if (hue === null || saturation === null || lightness === null) return null;
  return rgbToHex(hslToRgb(hue, saturation, lightness));
}

function parseHue(value: string): number | null {
  const number = Number.parseFloat(value.trim().replace(/deg$/i, ""));
  if (!Number.isFinite(number)) return null;
  return ((number % 360) + 360) % 360;
}

function parsePercent(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed.endsWith("%")) return null;
  const number = Number.parseFloat(trimmed.slice(0, -1));
  if (!Number.isFinite(number) || number < 0 || number > 100) return null;
  return number / 100;
}

function hslToRgb(hue: number, saturation: number, lightness: number): RgbColor {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const huePrime = hue / 60;
  const x = chroma * (1 - Math.abs((huePrime % 2) - 1));
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (huePrime >= 0 && huePrime < 1) [r1, g1, b1] = [chroma, x, 0];
  else if (huePrime < 2) [r1, g1, b1] = [x, chroma, 0];
  else if (huePrime < 3) [r1, g1, b1] = [0, chroma, x];
  else if (huePrime < 4) [r1, g1, b1] = [0, x, chroma];
  else if (huePrime < 5) [r1, g1, b1] = [x, 0, chroma];
  else [r1, g1, b1] = [chroma, 0, x];
  const match = lightness - chroma / 2;
  return {
    r: Math.round((r1 + match) * 255),
    g: Math.round((g1 + match) * 255),
    b: Math.round((b1 + match) * 255),
  };
}

function rgbToHex({ r, g, b }: RgbColor): string {
  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function hexToRgb(hex: string): RgbColor {
  const normalized = normalizeHexColor(hex) ?? "#000000";
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

function rgbToHslText({ r, g, b }: { r: number; g: number; b: number }): string {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  let hue = 0;
  let saturation = 0;
  if (max !== min) {
    const delta = max - min;
    saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    if (max === red) hue = (green - blue) / delta + (green < blue ? 6 : 0);
    else if (max === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
    hue *= 60;
  }
  return `hsl(${Math.round(hue)}, ${Math.round(saturation * 100)}%, ${Math.round(lightness * 100)}%)`;
}

function runCodec(action: "base64-encode" | "base64-decode" | "url-encode" | "url-decode"): void {
  try {
    if (action === "base64-encode") codecOutput.value = encodeBase64(codecInput.value);
    if (action === "base64-decode") codecOutput.value = decodeBase64(codecInput.value);
    if (action === "url-encode") codecOutput.value = encodeURIComponent(codecInput.value);
    if (action === "url-decode") codecOutput.value = decodeURIComponent(codecInput.value);
  } catch {
    codecOutput.value = "";
    notifyToolMessage(uiText.value.tools.codecError);
  }
}

function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function decodeBase64(value: string): string {
  const binary = atob(value.trim());
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function generatePassword(): void {
  const sets = getSelectedPasswordSets();
  if (sets.length === 0) {
    passwordOutput.value = "";
    notifyToolMessage(uiText.value.tools.passwordNoCharacters);
    return;
  }
  const targetLength = Math.max(4, Math.min(128, Math.round(Number(passwordLength.value) || 16)));
  passwordLength.value = targetLength;
  const chars = sets.map((set) => pickRandomChar(set));
  const combined = sets.join("");
  while (chars.length < targetLength) chars.push(pickRandomChar(combined));
  passwordOutput.value = shuffle(chars).join("");
}

function resetPasswordSymbolSet(): void {
  passwordSymbolSet.value = DEFAULT_PASSWORD_SYMBOLS_TEXT;
}

function getSelectedPasswordSets(): string[] {
  const sets: string[] = [];
  if (passwordOptions.uppercase) sets.push("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
  if (passwordOptions.lowercase) sets.push("abcdefghijklmnopqrstuvwxyz");
  if (passwordOptions.numbers) sets.push("0123456789");
  if (selectedPasswordSymbolText.value) sets.push(selectedPasswordSymbolText.value);
  return sets;
}

function pickRandomChar(chars: string): string {
  return chars[randomInt(chars.length)] ?? chars[0] ?? "";
}

function shuffle(chars: string[]): string[] {
  const result = [...chars];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function randomInt(max: number): number {
  if (max <= 0) return 0;
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return values[0] % max;
  }
  return Math.floor(Math.random() * max);
}

function uniqueChars(value: string): string {
  return Array.from(new Set(Array.from(value))).join("");
}

async function copyToolText(value: string): Promise<boolean> {
  if (!value || value === "--") return false;
  let copied = false;
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      copied = true;
    } catch {
      // Fall back below when async clipboard access is denied.
    }
  }
  if (!copied) copied = copyTextWithBrowserCommand(value);
  notifyToolMessage(copied ? uiText.value.tools.copySuccess : uiText.value.tools.copyFailed);
  return copied;
}

async function copyPassword(): Promise<void> {
  const copied = await copyToolText(passwordOutput.value);
  if (copied) passwordOutput.value = "";
}

function copyTextWithBrowserCommand(value: string): boolean {
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.append(textarea);
  textarea.focus();
  textarea.setSelectionRange(0, textarea.value.length);
  const copied = document.execCommand?.("copy") ?? false;
  textarea.remove();
  return copied;
}
</script>

<template>
  <section ref="panelRef" class="tool-panel" :class="panelClasses" :aria-label="uiText.tools.panel" @focusin="handleFocusIn" @focusout="handleFocusOut">
    <div class="panel-header tool-panel-header" @contextmenu="openTitleMenu">
      <h2>
        <EditableTitle
          ref="titleRef"
          :id="titleId"
          :value="title"
          :edit-label="uiText.common.rename"
          @update="(id, value) => emit('titleUpdate', id, value)"
        />
      </h2>
      <span class="count tool-active-title">
        <NIcon v-if="activeTool" class="tool-active-title-icon" :component="activeTool.icon" aria-hidden="true" />
        <span class="tool-active-title-text">{{ activeTool?.label ?? "" }}</span>
      </span>
      <button
        ref="toolPanelMenuButtonRef"
        type="button"
        class="tool-panel-menu-button icon-button"
        :aria-label="uiText.tools.menu"
        :title="uiText.tools.menu"
        @click="openToolPanelMenu"
      >
        ⋯
      </button>
    </div>

    <Transition name="tool-config-pop" :duration="240">
      <section v-if="toolConfigVisible" ref="toolConfigPanelRef" class="tool-config-panel" :aria-label="uiText.tools.configTitle">
        <div class="tool-config-heading">
          <span>{{ uiText.tools.configTitle }}</span>
          <button
            type="button"
            class="tool-config-close icon-button"
            :aria-label="uiText.tools.close"
            :title="uiText.tools.close"
            @click="toolConfigVisible = false"
          >
            <NIcon :component="CloseOutline" aria-hidden="true" />
          </button>
        </div>
        <label v-for="tool in tools" :key="tool.id" class="tool-config-row">
          <input
            type="checkbox"
            :data-testid="`tool-toggle-${tool.id}`"
            :checked="isToolVisible(tool.id)"
            :disabled="isToolVisible(tool.id) && !canHideTool(tool.id)"
            @change="toggleToolVisibility(tool.id, ($event.target as HTMLInputElement).checked)"
          />
          <span>{{ tool.label }}</span>
        </label>
      </section>
    </Transition>

    <div class="tool-workbench" @click="showEmptyToolTips" @contextmenu.capture="openActiveToolMenu">
      <nav class="tool-tabs" role="tablist" :aria-label="uiText.tools.list" @contextmenu="openToolTabsMenu">
        <button
          v-for="tool in visibleTools"
          :key="tool.id"
          class="tool-tab"
          :class="{ 'is-active': activeToolId === tool.id }"
          type="button"
          role="tab"
          :aria-selected="activeToolId === tool.id"
          :aria-label="tool.label"
          :title="tool.label"
          :data-tooltip="tool.label"
          @click="selectTool(tool.id)"
          @contextmenu="openToolMenu($event, tool.id)"
        >
          <span class="tool-tab-icon" aria-hidden="true">
            <NIcon :component="tool.icon" />
          </span>
        </button>
      </nav>

      <NScrollbar class="tool-content-scrollbar" trigger="hover" @contextmenu="openActiveToolMenu">
      <div class="tool-content" :class="{ 'is-empty': !activeToolId }" @click="showEmptyToolTips" @contextmenu="openActiveToolMenu">
        <section v-if="activeToolId === 'calculator'" class="tool-pane calculator-tool" :aria-label="uiText.tools.calculator">
          <div class="calculator-shell">
            <label class="tool-field calculator-display">
              <span>{{ uiText.tools.expression }}</span>
              <input v-model="calculatorExpression" data-testid="calculator-expression" autocomplete="off" @keydown.enter.prevent="calculateExpression" />
            </label>
            <div class="calculator-keypad" aria-label="calculator keypad">
              <button
                v-for="key in calculatorKeys"
                :key="key.testId"
                type="button"
                class="calculator-key"
                :class="[`is-${key.kind ?? 'number'}`, { 'is-wide': key.kind === 'equals' }]"
                :data-testid="key.testId"
                @click="pressCalculatorKey(key)"
              >
                {{ key.label }}
              </button>
            </div>
          </div>
        </section>

        <section v-else-if="activeToolId === 'base'" class="tool-pane base-tool" :aria-label="uiText.tools.baseConvert">
          <div class="base-source-row">
            <label class="tool-field base-select-field">
              <span>{{ uiText.tools.sourceBase }}</span>
              <select v-model="baseFrom" data-testid="base-from" @change="notifyBaseInvalidIfNeeded">
                <option v-for="option in baseOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
            </label>
            <label class="tool-field tool-field-wide">
              <span>{{ uiText.tools.sourceValue }}</span>
              <input v-model="baseSource" data-testid="base-source" autocomplete="off" @blur="notifyBaseInvalidIfNeeded" @keydown.enter.prevent="notifyBaseInvalidIfNeeded" />
            </label>
          </div>
          <div class="base-result-list">
            <div
              v-for="row in baseConversionRows"
              :key="row.base"
              class="copy-value-row base-result-row"
              :data-testid="`base-result-${row.base}`"
            >
              <span class="copy-value-label">{{ row.label }}</span>
              <code>{{ row.value }}</code>
              <button
                type="button"
                class="copy-inline-button"
                :data-testid="`copy-base-${row.base}`"
                :disabled="!row.canCopy"
                :aria-label="`${uiText.common.copy} ${row.label}`"
                @click="copyToolText(row.value)"
              >
                <NIcon :component="CopyOutline" />
              </button>
            </div>
          </div>
        </section>

        <section v-else-if="activeToolId === 'color'" class="tool-pane color-tool" :aria-label="uiText.tools.colorPicker">
          <div class="color-preview" :style="{ backgroundColor: safeColorHex }" />
          <div class="color-pick-row">
            <label class="tool-field">
              <span>{{ uiText.tools.browserColor }}</span>
              <input ref="manualColorInputRef" type="color" :value="safeColorHex" @input="setColor(($event.target as HTMLInputElement).value)" />
            </label>
            <button type="button" class="tool-primary-action eyedropper-button" data-testid="eyedropper" @click="pickExternalColor">
              <NIcon class="eyedropper-icon" :component="EyedropOutline" />
              <span class="eyedropper-label">{{ uiText.tools.pickExternalColor }}</span>
            </button>
          </div>
          <label class="tool-field color-value-field">
            <span>{{ uiText.tools.colorValue }}</span>
            <input v-model="colorValue" data-testid="color-value" autocomplete="off" @blur="normalizeColorInput" />
          </label>
          <div class="copy-value-list color-value-list">
            <div class="copy-value-row">
              <span class="copy-value-label">HEX</span>
              <code>{{ safeColorHex }}</code>
              <button type="button" class="copy-inline-button" data-testid="copy-color-hex" :aria-label="`${uiText.common.copy} HEX`" @click="copyToolText(safeColorHex)">
                <NIcon :component="CopyOutline" />
              </button>
            </div>
            <div class="copy-value-row">
              <span class="copy-value-label">{{ uiText.tools.rgbValue }}</span>
              <code data-testid="color-rgb">{{ colorRgb }}</code>
              <button type="button" class="copy-inline-button" data-testid="copy-color-rgb" :aria-label="`${uiText.common.copy} RGB`" @click="copyToolText(colorRgb)">
                <NIcon :component="CopyOutline" />
              </button>
            </div>
            <div class="copy-value-row">
              <span class="copy-value-label">{{ uiText.tools.hslValue }}</span>
              <code>{{ colorHsl }}</code>
              <button type="button" class="copy-inline-button" data-testid="copy-color-hsl" :aria-label="`${uiText.common.copy} HSL`" @click="copyToolText(colorHsl)">
                <NIcon :component="CopyOutline" />
              </button>
            </div>
          </div>
        </section>

        <section v-else-if="activeToolId === 'codec'" class="tool-pane codec-tool" :aria-label="uiText.tools.codec">
          <label class="tool-field tool-textarea-field">
            <span>{{ uiText.tools.codecInput }}</span>
            <textarea v-model="codecInput" data-testid="codec-input" spellcheck="false" />
          </label>
          <div class="codec-actions">
            <button type="button" data-testid="base64-encode" @click="runCodec('base64-encode')">{{ uiText.tools.base64Encode }}</button>
            <button type="button" data-testid="base64-decode" @click="runCodec('base64-decode')">{{ uiText.tools.base64Decode }}</button>
            <button type="button" data-testid="url-encode" @click="runCodec('url-encode')">{{ uiText.tools.urlEncode }}</button>
            <button type="button" data-testid="url-decode" @click="runCodec('url-decode')">{{ uiText.tools.urlDecode }}</button>
          </div>
          <label class="tool-field tool-textarea-field">
            <span>{{ uiText.tools.codecOutput }}</span>
            <textarea :value="codecOutput" data-testid="codec-output" spellcheck="false" readonly />
          </label>
        </section>

        <section v-else-if="activeToolId === 'password'" class="tool-pane password-tool" :aria-label="uiText.tools.password">
          <div class="password-length-control">
            <span>{{ uiText.tools.passwordLength }}</span>
            <strong>{{ passwordLength }}</strong>
            <NSlider
              v-model:value="passwordLength"
              data-testid="password-length"
              :min="4"
              :max="64"
              :step="1"
            />
          </div>
          <div class="password-options">
            <label><input v-model="passwordOptions.uppercase" data-testid="password-uppercase" type="checkbox" />{{ uiText.tools.uppercase }}</label>
            <label><input v-model="passwordOptions.lowercase" data-testid="password-lowercase" type="checkbox" />{{ uiText.tools.lowercase }}</label>
            <label><input v-model="passwordOptions.numbers" data-testid="password-numbers" type="checkbox" />{{ uiText.tools.numbers }}</label>
            <label><input v-model="passwordOptions.symbols" data-testid="password-symbols" type="checkbox" />{{ uiText.tools.symbols }}</label>
          </div>
          <div class="tool-field password-symbols-field">
            <div class="tool-field-heading">
              <span>{{ uiText.tools.symbolSet }}</span>
              <button
                type="button"
                class="icon-button password-symbol-reset"
                data-testid="password-symbol-reset"
                :aria-label="uiText.tools.resetSymbols"
                :title="uiText.tools.resetSymbols"
                @click="resetPasswordSymbolSet"
              >
                <NIcon :component="RefreshOutline" />
              </button>
            </div>
            <textarea v-model="passwordSymbolSet" data-testid="password-symbol-set" spellcheck="false" />
          </div>
          <button type="button" class="tool-primary-action" data-testid="password-generate" @click="generatePassword">{{ uiText.tools.generatePassword }}</button>
          <div class="password-output-row">
            <label class="tool-field tool-field-wide">
              <span>{{ uiText.tools.generatedPassword }}</span>
              <input :value="passwordOutput" data-testid="password-output" readonly />
            </label>
            <button
              type="button"
              class="copy-inline-button password-copy-button"
              data-testid="copy-password"
              :aria-label="`${uiText.common.copy} ${uiText.tools.generatedPassword}`"
              :disabled="!passwordOutput"
              @click="copyPassword"
            >
              <NIcon :component="CopyOutline" />
            </button>
          </div>
        </section>
      </div>
      </NScrollbar>
    </div>

    <NDropdown
      v-if="toolPanelMenu"
      placement="bottom-start"
      trigger="manual"
      :show="true"
      :x="toolPanelMenu.x"
      :y="toolPanelMenu.y"
      :z-index="CONTEXT_MENU_Z_INDEX"
      :options="toolMenuOptions"
      @select="handleToolPanelMenuSelect"
      @clickoutside="closeToolPanelMenu"
    >
      <span
        class="dropdown-anchor"
        :style="{ left: `${toolPanelMenu.x}px`, top: `${toolPanelMenu.y}px` }"
        aria-hidden="true"
      />
    </NDropdown>

    <NDropdown
      v-if="toolMenu"
      placement="bottom-start"
      trigger="manual"
      :show="true"
      :x="toolMenu.x"
      :y="toolMenu.y"
      :z-index="CONTEXT_MENU_Z_INDEX"
      :options="toolMenuOptions"
      @select="handleToolMenuSelect"
      @clickoutside="exclusiveToolMenu.handleClickOutside"
    >
      <span
        class="dropdown-anchor"
        :style="{ left: `${toolMenu.x}px`, top: `${toolMenu.y}px` }"
        aria-hidden="true"
      />
    </NDropdown>
  </section>
</template>
