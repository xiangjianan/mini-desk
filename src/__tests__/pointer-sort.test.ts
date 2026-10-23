import { afterEach, describe, expect, it, vi } from "vitest";
import { installPointerSort } from "../utils/pointerSort";

let dispose: (() => void) | undefined;
afterEach(() => { dispose?.(); dispose = undefined; document.body.innerHTML = ""; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function pointer(target: EventTarget, type: string, y: number): void {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: 20, clientY: y });
  Object.defineProperty(event, "pointerId", { value: 1 });
  target.dispatchEvent(event);
}
function fixture() {
  vi.stubGlobal("DataTransfer", class {
    values = new Map<string, string>();
    setData(key: string, value: string) { this.values.set(key, value); }
    getData(key: string) { return this.values.get(key) ?? ""; }
  });
  vi.stubGlobal("DragEvent", class extends MouseEvent {
    dataTransfer: DataTransfer | null;
    constructor(type: string, options: DragEventInit) { super(type, options); this.dataTransfer = options.dataTransfer ?? null; }
  });
  const root = document.createElement("div");
  root.style.overflowY = "auto";
  root.innerHTML = '<button draggable="true" class="source">Move</button><div class="target">Drop</div>';
  document.body.appendChild(root);
  Object.defineProperties(root, { scrollHeight: { value: 1000 }, clientHeight: { value: 100 } });
  const source = root.querySelector<HTMLElement>(".source")!;
  const target = root.querySelector<HTMLElement>(".target")!;
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: vi.fn(() => target) });
  const end = vi.fn(); const drop = vi.fn(); const pause = vi.fn();
  source.addEventListener("dragstart", (event) => (event as DragEvent).dataTransfer!.setData("text/plain", "payload"));
  source.addEventListener("dragend", end);
  target.addEventListener("drop", (event) => drop((event as DragEvent).dataTransfer!.getData("text/plain")));
  dispose = installPointerSort(root, ".source", pause);
  return { root, source, target, end, drop, pause };
}

describe("pointer sorting", () => {
  it("blocks selection only while dragging without rewriting the page style", () => {
    const { source } = fixture();
    pointer(source, "pointerdown", 20);
    pointer(window, "pointermove", 35);
    const selection = new Event("selectstart", { bubbles: true, cancelable: true });
    document.dispatchEvent(selection);
    expect(selection.defaultPrevented).toBe(true);
    expect(document.body.style.userSelect).toBe("");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    const after = new Event("selectstart", { cancelable: true });
    document.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });

  it.each(['todo', 'quick'])('drops a %s item into an explicitly hovered collapsed heading', (kind) => {
    const { root, source, target, drop } = fixture();
    const row = document.createElement('div');
    row.className = kind === 'todo' ? 'todo-item' : 'quick-button';
    source.before(row); row.append(source);
    const group = document.createElement('section');
    group.className = kind === 'todo' ? 'todo-section is-collapsed' : 'quick-tag-group';
    target.before(group); group.append(target);
    target.className = kind === 'todo' ? 'todo-heading' : 'quick-tag-heading';
    const content = document.createElement('div');
    content.className = kind === 'todo' ? 'todo-list-shell is-hidden' : 'quick-tag-content is-collapsed';
    group.append(content);
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({ left: 0, right: 120, top: 80, bottom: 120, width: 120, height: 40 } as DOMRect);
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({ left: 0, right: 120, top: 0, bottom: 40, width: 120, height: 40 } as DOMRect);
    pointer(source, 'pointerdown', 100);
    pointer(window, 'pointermove', 20);
    expect(target.classList.contains('is-sort-drop-target')).toBe(true);
    expect(row.previousElementSibling?.className).toBe('sort-gap');
    pointer(window, 'pointerup', 20);
    expect(drop).toHaveBeenCalledWith('payload');
    expect(target.classList.contains('is-sort-drop-target')).toBe(false);
    expect(row.style.display).toBe('');
    expect(root.querySelector('.sort-gap')).toBeNull();
    pointer(source, 'pointerdown', 100);
    pointer(window, 'pointermove', 20);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(target.classList.contains('is-sort-drop-target')).toBe(false);
    expect(drop).toHaveBeenCalledOnce();
  });

  it("allows wheel scrolling mid-drag and preserves drop payloads", () => {
    const { root, source, end, drop, pause } = fixture();
    pointer(source, "pointerdown", 20); pointer(window, "pointermove", 35);
    const wheel = new WheelEvent("wheel", { deltaY: 10, deltaMode: 1, cancelable: true });
    window.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(true);
    expect(root.scrollTop).toBe(160);
    expect(pause).toHaveBeenCalled();
    pointer(window, "pointerup", 35);
    expect(drop).toHaveBeenCalledWith("payload");
    expect(end).toHaveBeenCalledOnce();
    expect(document.body.style.userSelect).toBe("");
    window.dispatchEvent(new WheelEvent("wheel", { deltaY: 20 }));
    expect(root.scrollTop).toBe(160);
  });
  it("centers the drag preview on the pointer and follows movement without lag", () => {
    const { source } = fixture();
    pointer(source, "pointerdown", 20);
    pointer(window, "pointermove", 35);
    const preview = document.body.querySelector<HTMLElement>('[aria-hidden="true"]')!;
    expect(preview.style.top).toBe("35px");
    expect(preview.style.left).toBe("32px");
    expect(preview.style.transform).toBe("translateY(-50%)");
    expect(preview.style.transition).toBe("none");
    expect(preview.style.animation).toBe("none");
    pointer(window, "pointermove", 75);
    expect(preview.style.top).toBe("75px");
    pointer(window, "pointerup", 75);
    expect(preview.isConnected).toBe(false);
  });
  it("keeps ordinary clicks intact and cancels a drag without dropping", () => {
    const { source, drop, end } = fixture();
    pointer(source, "pointerdown", 20); pointer(window, "pointermove", 22); pointer(window, "pointerup", 22);
    expect(drop).not.toHaveBeenCalled(); expect(end).not.toHaveBeenCalled();
    pointer(source, "pointerdown", 20); pointer(window, "pointermove", 35);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    pointer(window, "pointerup", 35);
    expect(drop).not.toHaveBeenCalled(); expect(end).toHaveBeenCalledOnce();
    expect(document.body.style.userSelect).toBe("");
  });
});

it('drops at the reserved row position after restoring layout and removes gaps on Escape', () => {
  const { root, source, target } = fixture();
  source.className = 'todo-drag-handle';
  const row = document.createElement('div');
  row.className = 'todo-item';
  source.before(row); row.append(source);
  target.className = 'todo-item';
  vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({ top: 0, left: 0, width: 120, height: 40 } as DOMRect);
  vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({ top: 40, left: 0, width: 120, height: 40 } as DOMRect);
  dispose?.();
  dispose = installPointerSort(root, '.todo-drag-handle', () => {});
  const drop = vi.fn((event: Event) => {
    expect(root.querySelector('.sort-gap')).toBeNull();
    expect(root.classList.contains('is-sort-committing')).toBe(true);
    expect(row.style.display).toBe('');
    expect((event as DragEvent).clientY).toBe(70);
  });
  target.addEventListener('drop', drop);
  pointer(source, 'pointerdown', 20);
  pointer(window, 'pointermove', 75);
  expect(target.nextElementSibling?.className).toBe('sort-gap');
  pointer(window, 'pointerup', 75);
  expect(drop).toHaveBeenCalledOnce();
  pointer(source, 'pointerdown', 20);
  pointer(window, 'pointermove', 75);
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  expect(root.querySelector('.sort-gap')).toBeNull();
  expect(row.style.display).toBe('');
  expect(drop).toHaveBeenCalledOnce();
});

it('cancels a drop if a reactive update removed its landing gap', () => {
  const { root, source, target, end } = fixture();
  source.className = 'todo-drag-handle';
  const row = document.createElement('div');
  row.className = 'todo-item';
  source.before(row); row.append(source);
  target.className = 'todo-item';
  vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({ top: 0, left: 0, width: 120, height: 40 } as DOMRect);
  vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({ top: 40, left: 0, width: 120, height: 40 } as DOMRect);
  dispose?.();
  dispose = installPointerSort(root, '.todo-drag-handle', () => {});
  const drop = vi.fn();
  target.addEventListener('drop', drop);
  pointer(source, 'pointerdown', 20);
  pointer(window, 'pointermove', 75);
  root.querySelector('.sort-gap')!.remove();
  pointer(window, 'pointerup', 75);
  expect(drop).not.toHaveBeenCalled();
  expect(row.style.display).toBe('');
  expect(root.firstElementChild).toBe(row);
  expect(end).toHaveBeenCalledOnce();
  expect(document.body.style.userSelect).toBe('');
  const click = new MouseEvent('click', { bubbles: true, cancelable: true });
  target.dispatchEvent(click);
  expect(click.defaultPrevented).toBe(true);
});
