/**
 * 挂载整个 App 的共享入口（app-render / todo-ime-commit / todo-delete-confirm /
 * image-storage-performance 四份原地拷贝的统一归宿）。
 * - 默认用随 `show` 显隐的 popover 桩；`popover: "persistent"` 换成常驻桩
 *   （气泡淡出动画类测试需要隐藏后内容仍在 DOM）。
 * - 其余 Naive UI 浮层一律用共享桩，组件专属桩仍在各测试文件内定义。
 */
import { mount } from "@vue/test-utils";
import App from "../../App.vue";
import { menuDropdownStub } from "./menu-dropdown-stub";
import { modalStub, persistentPopoverStub, popoverStub, tooltipStub } from "./stubs";

export interface MountAppOptions {
  popover?: "toggle" | "persistent";
}

export function mountApp(options: MountAppOptions = {}): ReturnType<typeof mount> {
  return mount(App, {
    attachTo: document.body,
    global: {
      stubs: {
        NDropdown: menuDropdownStub,
        NPopover: options.popover === "persistent" ? persistentPopoverStub : popoverStub,
        NTooltip: tooltipStub,
        NModal: modalStub,
      },
    },
  });
}
