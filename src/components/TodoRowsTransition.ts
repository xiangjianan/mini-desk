import { defineComponent, h, TransitionGroup, withMemo } from "vue";
import type { PropType, VNode } from "vue";

export function createTodoLeaveHooks() {
  const lists = new Map<HTMLElement, { count: number; minHeight: string }>();
  const rows = new Map<HTMLElement, { list: HTMLElement; top: string }>();
  function finish(element: Element) {
    const row = element as HTMLElement;
    const entry = rows.get(row);
    if (!entry) return;
    row.style.top = entry.top;
    rows.delete(row);
    const state = lists.get(entry.list)!;
    if (--state.count === 0) {
      entry.list.style.minHeight = state.minHeight;
      lists.delete(entry.list);
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
        state = { count: 0, minHeight: list.style.minHeight };
        lists.set(list, state);
        list.style.minHeight = `${list.getBoundingClientRect().height}px`;
      }
      state.count++;
      rows.set(row, { list, top: row.style.top });
      row.style.top = `${top}px`;
    },
    onAfterLeave: finish,
    onLeaveCancelled: finish,
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
    const leaveHooks = createTodoLeaveHooks();
    return () => withMemo(props.memo, () => {
      const children = slots.default?.() ?? [];
      return h(TransitionGroup, { ...attrs, ...leaveHooks }, { default: () => children });
    }, cache, 0);
  },
});
