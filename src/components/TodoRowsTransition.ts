import { defineComponent, h, onBeforeUnmount, onUpdated, TransitionGroup, withMemo } from "vue";
import type { PropType, VNode } from "vue";

export function createTodoLeaveHooks() {
  const lists = new Map<HTMLElement, { count: number; minHeight: string }>();
  const rows = new Map<HTMLElement, { list: HTMLElement; top: string }>();
  const animations = new Map<HTMLElement, Animation>();
  const previousHeights = new Map<HTMLElement, number>();
  function animateHeight(list: HTMLElement, fromHeight: number, toHeight: number) {
    if (Math.abs(fromHeight - toHeight) < 0.5 || !list.animate || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const animation = list.animate(
      [{ height: `${fromHeight}px` }, { height: `${toHeight}px` }],
      { duration: 220, easing: "cubic-bezier(0.2, 0, 0, 1)" },
    );
    animations.set(list, animation);
    void animation.finished.catch(() => {}).then(() => {
      if (animations.get(list) === animation) animations.delete(list);
    });
  }
  function finish(element: Element) {
    const row = element as HTMLElement;
    const entry = rows.get(row);
    if (!entry) return;
    row.style.top = entry.top;
    rows.delete(row);
    const state = lists.get(entry.list)!;
    if (--state.count === 0) {
      const fromHeight = entry.list.getBoundingClientRect().height;
      entry.list.style.minHeight = state.minHeight;
      lists.delete(entry.list);
      const toHeight = entry.list.getBoundingClientRect().height;
      animateHeight(entry.list, fromHeight, toHeight);
    }
  }
  return {
    beforeUpdate(list: HTMLElement) {
      previousHeights.set(list, list.getBoundingClientRect().height);
      animations.get(list)?.cancel();
      animations.delete(list);
    },
    afterUpdate(list: HTMLElement) {
      const height = previousHeights.get(list);
      previousHeights.delete(list);
      // Removals keep their space until the row fade completes; additions can
      // grow immediately, using the height captured before Vue inserts them.
      if (height !== undefined && !lists.has(list)) {
        animateHeight(list, height, list.getBoundingClientRect().height);
      }
    },
    onBeforeLeave(element: Element) {
      const row = element as HTMLElement;
      const list = row.parentElement;
      if (!list || rows.has(row)) return;
      // Read before Vue applies absolute positioning to the leaving row.
      const top = row.offsetTop;
      let state = lists.get(list);
      if (!state) {
        const height = previousHeights.get(list) ?? list.getBoundingClientRect().height;
        animations.get(list)?.cancel();
        animations.delete(list);
        state = { count: 0, minHeight: list.style.minHeight };
        lists.set(list, state);
        list.style.minHeight = `${height}px`;
      }
      state.count++;
      rows.set(row, { list, top: row.style.top });
      row.style.top = `${top}px`;
    },
    onAfterLeave: finish,
    onLeaveCancelled: finish,
    dispose() {
      for (const animation of animations.values()) animation.cancel();
      animations.clear();
      for (const [list, state] of lists) list.style.minHeight = state.minHeight;
      for (const [row, entry] of rows) row.style.top = entry.top;
      lists.clear();
      rows.clear();
      previousHeights.clear();
    },
  };
}

/** Each list owns its cache. A nested v-memo inside the panel's v-for shares
 * one compiler cache slot, so different lists invalidate one another and make
 * TransitionGroup measure every row even when only the columns change.
 */
export default defineComponent({
  name: "TodoRowsTransition",
  inheritAttrs: false,
  props: {
    memo: { type: Array as PropType<unknown[]>, required: true },
  },
  setup(props, { attrs, slots }) {
    const cache: VNode[] = [];
    const { dispose, beforeUpdate, afterUpdate, ...leaveHooks } = createTodoLeaveHooks();
    let listElement: HTMLElement | undefined;
    onBeforeUnmount(dispose);
    onUpdated(() => { if (listElement) afterUpdate(listElement); });
    return () => withMemo(props.memo, () => {
      if (listElement) beforeUpdate(listElement);
      const children = slots.default?.() ?? [];
      return h(TransitionGroup, {
        ...attrs, ...leaveHooks,
        ref: (instance: unknown) => { listElement = (instance as { $el?: HTMLElement } | null)?.$el; },
      }, { default: () => children });
    }, cache, 0);
  },
});
