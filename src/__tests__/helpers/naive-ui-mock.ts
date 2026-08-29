/**
 * App 级测试共享的 naive-ui 模块 mock（app-render / todo-ime-commit /
 * todo-delete-confirm 三份原地拷贝的统一归宿）：浮层组件换成轻量桩，
 * 其余导出保留真实现。各测试文件里写法固定为
 *
 *   vi.mock("naive-ui", async () => {
 *     const { createNaiveUiStubModule } = await import("./helpers/naive-ui-mock");
 *     return createNaiveUiStubModule();
 *   });
 *
 * 必须在工厂内动态 import——vi.mock 会被提升到文件顶部，静态引用会得到 undefined。
 */
import { vi } from "vitest";
import { modalStub, popoverStub, tooltipStub } from "./stubs";

export async function createNaiveUiStubModule() {
  const actual = await vi.importActual<typeof import("naive-ui")>("naive-ui");
  return {
    ...actual,
    // 菜单交互在各文件经 global.stubs 注入带选项按钮的 menuDropdownStub；
    // 模块级 mock 只需让直接挂载的组件渲染出默认插槽。
    NDropdown: { name: "NDropdown", template: "<div><slot /></div>" },
    NPopover: { name: "NPopover", ...popoverStub },
    NTooltip: { name: "NTooltip", ...tooltipStub },
    NModal: { name: "NModal", ...modalStub },
  };
}
