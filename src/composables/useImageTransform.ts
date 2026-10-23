import { computed, ref } from "vue";
import { clamp } from "../utils/math";

const MIN_SCALE = 0.3;
const MAX_SCALE = 5;
export const ZOOM_STEP = 0.1;
const DOUBLE_CLICK_SCALE = 2;

/** Shared pan/zoom behavior for board previews and focus-session previews. */
export function useImageTransform() {
  const scale = ref(1);
  const offset = ref({ x: 0, y: 0 });
  const dragging = ref(false);
  let start = { x: 0, y: 0, ox: 0, oy: 0 };
  const activeImageStyle = computed(() => ({
    transform: `translate(${offset.value.x}px, ${offset.value.y}px) scale(${scale.value})`,
  }));

  function clampScale(value: number): number {
    return Number(clamp(value, MIN_SCALE, MAX_SCALE).toFixed(2));
  }

  function adjustZoom(delta: number): void {
    scale.value = clampScale(scale.value + delta);
    if (scale.value === 1) offset.value = { x: 0, y: 0 };
  }

  function getAnchoredZoomOffset(event: MouseEvent | WheelEvent, nextScale: number): { x: number; y: number } {
    const target = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    if (!target || scale.value <= 0) return offset.value;
    const rect = target.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const pointX = event.clientX - centerX;
    const pointY = event.clientY - centerY;
    const sourceX = (pointX - offset.value.x) / scale.value;
    const sourceY = (pointY - offset.value.y) / scale.value;
    return {
      x: Number((pointX - nextScale * sourceX).toFixed(2)),
      y: Number((pointY - nextScale * sourceY).toFixed(2)),
    };
  }

  function toggleZoom(event: MouseEvent): void {
    if (scale.value === 1) {
      offset.value = getAnchoredZoomOffset(event, DOUBLE_CLICK_SCALE);
      scale.value = DOUBLE_CLICK_SCALE;
      return;
    }
    scale.value = 1;
    offset.value = { x: 0, y: 0 };
  }

  function wheel(event: WheelEvent): void {
    event.preventDefault();
    if (!event.ctrlKey && !event.metaKey) return;
    const nextScale = clampScale(scale.value + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
    if (nextScale === scale.value) return;
    offset.value = getAnchoredZoomOffset(event, nextScale);
    scale.value = nextScale;
    if (scale.value === 1) offset.value = { x: 0, y: 0 };
  }

  function down(event: MouseEvent): void {
    dragging.value = true;
    start = { x: event.clientX, y: event.clientY, ox: offset.value.x, oy: offset.value.y };
  }

  function move(event: MouseEvent): void {
    if (!dragging.value) return;
    offset.value = {
      x: start.ox + event.clientX - start.x,
      y: start.oy + event.clientY - start.y,
    };
  }

  function resetTransform(): void {
    scale.value = 1;
    offset.value = { x: 0, y: 0 };
  }

  return { scale, offset, dragging, activeImageStyle, adjustZoom, toggleZoom, wheel, down, move, resetTransform };
}
