import { webcrypto } from "node:crypto";
import { vi } from "vitest";

// jsdom 只提供 getRandomValues；同步加解密测试需要 Node 的 WebCrypto。
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    writable: true,
    value: webcrypto,
  });
}

// DOM 相关 mock 仅在 jsdom 环境生效；node 环境的测试跳过。
if (typeof window !== "undefined") {
  // jsdom has no layout/ResizeObserver. Give UI libraries a stable native-shaped
  // observer before imports, rather than a DOM-scheduling polyfill that can keep
  // callbacks alive after the jsdom window is disposed. Resize-specific tests
  // replace this observer with a controllable callback of their own.
  vi.stubGlobal("ResizeObserver", class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  });

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
