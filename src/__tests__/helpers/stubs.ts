/**
 * Naive UI 浮层组件的共享测试桩（多份原地拷贝的统一归宿）：
 * - `popoverStub`：trigger 插槽 + 随 `show` 显隐的 `.n-popover` 内容区；
 * - `persistentPopoverStub`：内容常驻、以 `data-show` 暴露状态——气泡淡出
 *   动画的断言需要隐藏后内容仍留在 DOM 里；
 * - `modalStub`：`.n-modal` 容器 + 标题 h2 + 默认插槽；show 撤下时同步发
 *   `after-leave`（真实 NModal 在 ~200ms 离场过渡结束后发）——配对弹窗等
 *   等 after-leave 才 close 的组件在桩下无需等待即可断言卸载；
 * - `tooltipStub`：trigger 与默认插槽平铺。
 * 断言了专属类名的桩（quick-dialog / workspace-inbox-dialog /
 * shortcut-help-modal / settings 菜单勾选态）仍留在各自测试文件里。
 */
import { defineComponent } from "vue";

export const popoverStub = {
  props: ["show"],
  template: '<div v-bind="$attrs"><slot name="trigger" /><div v-if="show" class="n-popover"><slot /></div></div>',
};

export const persistentPopoverStub = {
  props: ["show"],
  template: '<div v-bind="$attrs"><slot name="trigger" /><div class="n-popover" :data-show="String(show)"><slot /></div></div>',
};

export const modalStub = defineComponent({
  props: ["show", "title"],
  emits: ["update:show", "after-leave"],
  template: '<section v-if="show" class="n-modal"><h2>{{ title }}</h2><slot /></section>',
  watch: {
    show(value: boolean) {
      if (!value) this.$emit("after-leave");
    },
  },
});

export const tooltipStub = {
  template: '<span><slot name="trigger" /><slot /></span>',
};
