import { vi } from "vitest";

// DOM 相关 mock 仅在 jsdom 环境生效；node 环境的测试跳过。
if (typeof window !== "undefined") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  // Keep Naive UI's observer polyfill from scheduling callbacks after jsdom teardown.
  class TestResizeObserver implements ResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, writable: true, value: TestResizeObserver });

  HTMLElement.prototype.scrollIntoView = vi.fn();

  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: vi.fn(() => null),
  });

  Object.defineProperty(HTMLCanvasElement.prototype, "toDataURL", {
    configurable: true,
    value: vi.fn(() => "data:image/png;base64,canvas"),
  });
}
