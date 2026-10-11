import { defineComponent, h, onBeforeUnmount, TransitionGroup, withMemo } from "vue";
import type { PropType, VNode } from "vue";

export function createTodoLeaveHooks() {
  const lists = new Map<HTMLElement, { count: number; minHeight: string }>();
  const rows = new Map<HTMLElement, { list: HTMLElement; top: string }>();
  const animations = new Map<HTMLElement, Animation>();
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
      if (fromHeight > toHeight && entry.list.animate && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
        const animation = entry.list.animate(
          [{ height: `${fromHeight}px` }, { height: `${toHeight}px` }],
          { duration: 220, easing: "cubic-bezier(0.2, 0, 0, 1)" },
        );
        animations.set(entry.list, animation);
        void animation.finished.catch(() => {}).then(() => {
          if (animations.get(entry.list) === animation) animations.delete(entry.list);
        });
      }
    }
  }
  return {
    onBeforeLeave(element: Element) {
      const row = element as HTMLElement;
      const list = row.parentElement;
      if (!list || rows.has(row)) return;
      // Read before Vue applies absolute positioning to the leaving row.
      const top = row.offsetTop;
      let state = lists.get(list);
      if (!state) {
        const height = list.getBoundingClientRect().height;
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
    const { dispose, ...leaveHooks } = createTodoLeaveHooks();
    onBeforeUnmount(dispose);
    return () => withMemo(props.memo, () => {
      const children = slots.default?.() ?? [];
      return h(TransitionGroup, { ...attrs, ...leaveHooks }, { default: () => children });
    }, cache, 0);
  },
});
