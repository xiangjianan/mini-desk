/** Temporary layout only: restore before Vue commits the actual order. */
export function createSortGap(source: HTMLElement, selector: string) {
  const parent = source.parentElement!;
  const next = source.nextSibling;
  const display = source.style.display;
  const gap = document.createElement(source.tagName);
  const rect = source.getBoundingClientRect();
  gap.className = 'sort-gap';
  gap.setAttribute('aria-hidden', 'true');
  gap.inert = true;
  gap.style.cssText = `height:${rect.height}px;width:${rect.width}px;max-width:100%;flex-shrink:0;border:0;padding:0;pointer-events:none;box-sizing:border-box;`;
  source.before(gap);
  source.style.display = 'none';
  let anchor: HTMLElement | null = null;
  let before = true;
  let container: HTMLElement | null = null;
  const animations = new Map<HTMLElement, Animation>();
  function layoutBounds(element: HTMLElement): DOMRect {
    const bounds = element.getBoundingClientRect();
    if (!animations.has(element)) return bounds;
    // Hit testing must use the destination, not the row moving across the pointer.
    const transform = getComputedStyle(element).transform;
    const values = transform.match(/^matrix(3d)?\((.+)\)$/);
    if (!values) return bounds;
    const matrix = values[2]!.split(',').map(Number);
    const dx = matrix[values[1] ? 12 : 4] ?? 0;
    const dy = matrix[values[1] ? 13 : 5] ?? 0;
    return { ...bounds, left: bounds.left - dx, right: bounds.right - dx,
      top: bounds.top - dy, bottom: bounds.bottom - dy, width: bounds.width, height: bounds.height } as DOMRect;
  }
  function contains(bounds: DOMRect, x: number, y: number): boolean {
    return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
  }
  function update(root: HTMLElement, x: number, y: number) {
    const hit = document.elementFromPoint?.(x, y);
    if (!root.contains(hit)) return;
    // The gap is already the requested slot. Moving rows must not dislodge it.
    if (contains(gap.getBoundingClientRect(), x, y)) return;
    const candidates = Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(el => el !== source);
    const hitItem = hit?.closest<HTMLElement>(selector);
    const item = candidates.find(el => contains(layoutBounds(el), x, y))
      ?? (hitItem && !animations.has(hitItem) ? hitItem : null);
    if (!item) {
      const containers: Record<string, string> = {
        '.todo-item': '.todo-list', '.quick-button': '.quick-buttons',
        '.todo-section': '.todo-column', '.quick-tag-group': '.quick-tag-column',
      };
      const destination = (containers[selector] ? hit?.closest<HTMLElement>(containers[selector]) : null)
        ?? (selector === '.todo-item' ? hit?.closest('.todo-section')?.querySelector<HTMLElement>('.todo-list')
          : selector === '.quick-button' ? hit?.closest('.quick-tag-group:not(:has(.is-collapsed))')?.querySelector<HTMLElement>('.quick-buttons') : null);
      if (destination) {
        const last = Array.from(destination.querySelectorAll<HTMLElement>(selector)).filter(el => el !== source).at(-1);
        if (!last) {
          destination.append(gap); container = destination; anchor = null;
        } else if (y > last.getBoundingClientRect().bottom) {
          last.after(gap); anchor = last; before = false; container = null;
        }
      }
      return;
    }
    if (item === source) return;
    const heading = item.matches('.todo-section') ? item.querySelector('.todo-heading')
      : item.matches('.quick-tag-group') ? item.querySelector('.quick-tag-heading') : null;
    const layout = layoutBounds(item);
    const visual = item.getBoundingClientRect();
    const headingBounds = heading?.getBoundingClientRect();
    const bounds = headingBounds ? { left: headingBounds.left - (visual.left - layout.left),
      top: headingBounds.top - (visual.top - layout.top), width: headingBounds.width, height: headingBounds.height } : layout;
    const style = getComputedStyle(item.parentElement!);
    const horizontal = (style.flexDirection === 'row' && style.display === 'flex') || (style.display === 'grid' && style.gridTemplateColumns.split(' ').length > 1);
    const insertBefore = horizontal ? x < bounds.left + bounds.width / 2 : y < bounds.top + bounds.height / 2;
    if (anchor === item && before === insertBefore) return;
    anchor = item; container = null; before = insertBefore;
    if (before ? item.previousElementSibling === gap : item.nextElementSibling === gap) return;
    const elements = candidates;
    const positions = elements.map(el => el.getBoundingClientRect());
    animations.forEach(animation => animation.cancel());
    animations.clear();
    if (before) item.before(gap); else item.after(gap);
    if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) elements.forEach((el, i) => {
      const to = el.getBoundingClientRect();
      const from = positions[i]!;
      if (el.animate && (from.left !== to.left || from.top !== to.top)) animations.set(el, el.animate([
        { transform: `translate(${from.left - to.left}px, ${from.top - to.top}px)` }, { transform: 'translate(0, 0)' },
      ], { duration: 180, easing: 'ease-out' }));
    });
  }
  function restore() {
    gap.remove();
    if (source.parentElement !== parent || source.nextSibling !== next) parent.insertBefore(source, next?.parentNode === parent ? next : null);
    source.style.display = display;
    animations.forEach(animation => animation.cancel());
  }
  function indexTarget(): HTMLElement | null {
    if (!anchor) return null;
    const items = Array.from(parent.querySelectorAll<HTMLElement>(selector));
    const sourceIndex = items.indexOf(source);
    const others = items.filter(el => el !== source);
    const index = others.indexOf(anchor) + (before ? 0 : 1);
    return items[index] ?? items[sourceIndex] ?? null;
  }
  return { update, restore, indexTarget, get container() { return container; }, get anchor() { return anchor; }, get before() { return before; } };
}
