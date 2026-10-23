import { defineComponent, h, TransitionGroup, withMemo } from "vue";
import type { PropType, VNode } from "vue";

/** Keep a separate memo cache per group. A parent's collapse/hover update must
 * not ask TransitionGroup to measure every unchanged child for FLIP motion. */
export default defineComponent({
  name: "MemoTransitionGroup",
  inheritAttrs: false,
  props: { memo: { type: Array as PropType<unknown[]>, required: true } },
  setup(props, { attrs, slots }) {
    const cache: VNode[] = [];
    return () => withMemo(props.memo, () => h(TransitionGroup, attrs, {
      default: () => slots.default?.() ?? [],
    }), cache, 0);
  },
});
