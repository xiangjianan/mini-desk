import { defineComponent, h, TransitionGroup, withMemo } from "vue";
import type { PropType, VNode } from "vue";

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
    return () => withMemo(props.memo, () => {
      const children = slots.default?.() ?? [];
      return h(TransitionGroup, { ...attrs }, { default: () => children });
    }, cache, 0);
  },
});
