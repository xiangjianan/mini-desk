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
  function update(root: HTMLElement, x: number, y: number) {
    const hit = document.elementFromPoint?.(x, y);
    const item = hit?.closest<HTMLElement>(selector);
    if (!root.contains(hit)) return;
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
    const bounds = (heading ?? item).getBoundingClientRect();
    const style = getComputedStyle(item.parentElement!);
    const horizontal = (style.flexDirection === 'row' && style.display === 'flex') || (style.display === 'grid' && style.gridTemplateColumns.split(' ').length > 1);
    const insertBefore = horizontal ? x < bounds.left + bounds.width / 2 : y < bounds.top + bounds.height / 2;
    if (anchor === item && before === insertBefore) return;
    const elements = Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(el => el !== source);
    const positions = elements.map(el => el.getBoundingClientRect());
    anchor = item; container = null; before = insertBefore;
    if (before) item.before(gap); else item.after(gap);
    if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) elements.forEach((el, i) => {
      animations.get(el)?.cancel();
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
