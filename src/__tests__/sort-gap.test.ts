import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSortGap } from '../utils/sortGap';

afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function fixture() {
  const root = document.createElement('div');
  root.innerHTML = '<div class="list"><div class="item">A</div><div class="item">B</div><div class="item">C</div></div><div class="list"></div>';
  document.body.append(root);
  const items = Array.from(root.querySelectorAll<HTMLElement>('.item'));
  items.forEach((item, i) => vi.spyOn(item, 'getBoundingClientRect').mockReturnValue({ top: i * 40, left: 0, width: 120, height: 40, bottom: i * 40 + 40 } as DOMRect));
  let hit: Element = items[1]!;
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: vi.fn(() => hit) });
  return { root, items, pointTo: (element: Element) => { hit = element; } };
}
describe('sorting landing gap', () => {
  it('does not measure hundreds of unaffected siblings for a local move', () => {
    const root = document.body.appendChild(document.createElement('div'));
    const items = Array.from({ length: 600 }, (_, index) => {
      const row = root.appendChild(document.createElement('div'));
      row.className = 'item';
      vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({ left: 0, right: 120, top: index * 40, bottom: index * 40 + 40, width: 120, height: 40 } as DOMRect);
      return row;
    });
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => items[2] });
    const gap = createSortGap(items[0]!, '.item');
    gap.update(root, 20, 105);
    expect(gap.anchor).toBe(items[2]);
    for (const row of items.slice(3)) expect(row.getBoundingClientRect).not.toHaveBeenCalled();
    gap.restore();
    expect(root.firstElementChild).toBe(items[0]);
  });

  it('ignores clipped rows in collapsed lists above the expanded source list', () => {
    const root = document.body.appendChild(document.createElement('div'));
    root.innerHTML = '<section class="todo-section is-collapsed"><div class="todo-heading">A</div><div class="todo-list-shell is-hidden"><ul class="todo-list"><li class="todo-item">Hidden A</li></ul></div></section><section class="todo-section is-collapsed"><div class="todo-heading">B</div><div class="todo-list-shell is-hidden"><ul class="todo-list"><li class="todo-item">Hidden B</li></ul></div></section><section class="todo-section"><div class="todo-heading">C</div><ul class="todo-list"><li class="todo-item">Source</li><li class="todo-item">Target</li></ul></section>';
    const items = Array.from(root.querySelectorAll<HTMLElement>('.todo-item'));
    // Collapsing clips the list shell; child rows still have layout rectangles
    // that can overlap visible rows in the section below it.
    items.forEach((item, index) => vi.spyOn(item, 'getBoundingClientRect').mockReturnValue({
      top: index === 2 ? 80 : 120, bottom: index === 2 ? 120 : 160,
      left: 0, right: 120, width: 120, height: 40,
    } as DOMRect));
    let hit: Element = items[3]!;
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => hit });
    const gap = createSortGap(items[2]!, '.todo-item');
    gap.update(root, 20, 145);
    expect(gap.anchor).toBe(items[3]);
    expect(root.querySelector('.sort-gap')!.parentElement).toBe(items[3]!.parentElement);
    hit = root.querySelector('.todo-heading')!;
    gap.update(root, 20, 10);
    expect(root.querySelector('.sort-gap')!.parentElement).toBe(items[3]!.parentElement);
    gap.restore();
  });

  it('reserves the source size, moves the gap, and restores DOM before commit', () => {
    const { root, items } = fixture();
    const gap = createSortGap(items[0]!, '.item');
    expect(items[0]!.style.display).toBe('none');
    expect(root.querySelector<HTMLElement>('.sort-gap')!.style.height).toBe('40px');
    gap.update(root, 20, 75);
    expect(items[1]!.nextElementSibling?.className).toBe('sort-gap');
    expect(gap.before).toBe(false);
    expect(gap.indexTarget()).toBe(items[1]);
    gap.restore();
    expect(root.querySelector('.sort-gap')).toBeNull();
    expect(items[0]!.style.display).toBe('');
    expect(root.querySelector('.list')!.textContent).toBe('ABC');
  });
  it('keeps the gap when the pointer is over it and supports moving back above a row', () => {
    const { root, items, pointTo } = fixture();
    const gap = createSortGap(items[0]!, '.item');
    gap.update(root, 20, 75);
    pointTo(root.querySelector('.list')!);
    gap.update(root, 20, 75);
    expect(gap.anchor).toBe(items[1]);
    pointTo(items[1]!);
    gap.update(root, 20, 45);
    expect(items[1]!.previousElementSibling?.className).toBe('sort-gap');
    expect(gap.indexTarget()).toBe(items[0]);
    gap.restore();
  });
  it('previews an empty destination and restores without changing either list', () => {
    const { root, items, pointTo } = fixture();
    items.forEach(el => el.className = 'todo-item');
    root.querySelectorAll('.list').forEach(el => el.className = 'todo-list');
    const empty = root.lastElementChild as HTMLElement;
    const gap = createSortGap(items[0]!, '.todo-item');
    pointTo(empty); gap.update(root, 20, 200);
    expect(gap.container).toBe(empty);
    expect(empty.querySelector('.sort-gap')).not.toBeNull();
    gap.restore();
    expect(empty.children).toHaveLength(0);
    expect(root.firstElementChild!.textContent).toBe('ABC');
  });
});


it('keeps an established gap stable while an animating row passes under the pointer', () => {
  const { root, items } = fixture();
  const list = root.firstElementChild as HTMLElement;
  let moving = false;
  function bounds(element: Element): DOMRect {
    const visible = Array.from(list.children).filter(el => (el as HTMLElement).style.display !== 'none');
    const top = visible.indexOf(element) * 40 + (moving && element === items[1] ? 40 : 0);
    return { left: 0, right: 120, top, bottom: top + 40, width: 120, height: 40 } as DOMRect;
  }
  items.forEach(item => vi.spyOn(item, 'getBoundingClientRect').mockImplementation(() => bounds(item)));
  const cancel = vi.fn();
  const animate = vi.fn(() => {
    moving = true;
    return { cancel } as unknown as Animation;
  });
  items[1]!.animate = animate;
  const gap = createSortGap(items[0]!, '.item');
  const placeholder = root.querySelector<HTMLElement>('.sort-gap')!;
  vi.spyOn(placeholder, 'getBoundingClientRect').mockImplementation(() => bounds(placeholder));
  gap.update(root, 20, 75);
  expect(gap.before).toBe(false);
  expect(animate).toHaveBeenCalledOnce();
  // Native hit testing can still report the row sliding over this reserved slot.
  gap.update(root, 20, 45);
  gap.update(root, 20, 46);
  expect(items[1]!.nextElementSibling).toBe(placeholder);
  expect(gap.before).toBe(false);
  expect(animate).toHaveBeenCalledOnce();
  expect(cancel).not.toHaveBeenCalled();
  gap.restore();
});


it('does not restart rows already settling when a fast upward drag crosses the next row', () => {
  const root = document.body.appendChild(document.createElement('div'));
  root.innerHTML = '<div class="item">A</div><div class="item">B</div><div class="item">C</div><div class="item">D</div>';
  const items = Array.from(root.querySelectorAll<HTMLElement>('.item'));
  const offsets = new Map<HTMLElement, number>();
  const nativeStyle = getComputedStyle;
  vi.stubGlobal('getComputedStyle', (el: HTMLElement) => offsets.has(el)
    ? { transform: `matrix(1, 0, 0, 1, 0, ${offsets.get(el)})` } : nativeStyle(el));
  function bounds(el: HTMLElement): DOMRect {
    const visible = Array.from(root.children).filter(child => (child as HTMLElement).style.display !== 'none');
    const top = visible.indexOf(el) * 40 + (offsets.get(el) ?? 0);
    return { left: 0, right: 120, top, bottom: top + 40, width: 120, height: 40 } as DOMRect;
  }
  const cancels = items.map(() => vi.fn());
  const animates = items.map((el, index) => {
    vi.spyOn(el, 'getBoundingClientRect').mockImplementation(() => bounds(el));
    const animate = vi.fn((frames: Keyframe[]) => {
      const dy = String(frames[0]!.transform).match(/, ([-\d.]+)px/)!;
      offsets.set(el, Number(dy[1]));
      return { cancel: () => { cancels[index]!(); offsets.delete(el); } } as unknown as Animation;
    });
    el.animate = animate as unknown as HTMLElement['animate'];
    return animate;
  });
  let hit: Element = items[1]!;
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => hit });
  const gap = createSortGap(items[3]!, '.item');
  const placeholder = root.querySelector<HTMLElement>('.sort-gap')!;
  vi.spyOn(placeholder, 'getBoundingClientRect').mockImplementation(() => bounds(placeholder));
  gap.update(root, 20, 45);
  expect(animates[1]).toHaveBeenCalledOnce();
  expect(animates[2]).toHaveBeenCalledOnce();
  hit = items[0]!;
  gap.update(root, 20, 5); // Previous animations have not finished yet.
  expect(root.firstElementChild).toBe(placeholder);
  expect(animates[0]).toHaveBeenCalledOnce();
  expect(animates[1]).toHaveBeenCalledOnce();
  expect(animates[2]).toHaveBeenCalledOnce();
  expect(cancels[1]).not.toHaveBeenCalled();
  expect(cancels[2]).not.toHaveBeenCalled();
  gap.restore();
});
