import { afterEach, describe, expect, it, vi } from "vitest";
import { POLISH_MAX_CHARS, POLISH_QUICK_FETCH_TIMEOUT_MS, polishClipboardText } from "../sync/polishClient";

const CODE = "AB2CDE4FGHJK";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("polishClient", () => {
  it("成功返回 items，请求打到 /polish/:keyHash 且带 kind/text body", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ items: ["任务 A", "任务 B"] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await polishClipboardText("todo", "杂乱文本", CODE)).toEqual({ items: ["任务 A", "任务 B"] });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/polish/");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ kind: "todo", text: "杂乱文本" });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("note kind 原样透传", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ items: ["1、要点"] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await polishClipboardText("note", "文本", CODE)).toEqual({ items: ["1、要点"] });
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({ kind: "note", text: "文本" });
  });

  it("指定风格时 body 附带 style，缺省不带 style 字段（老口径不变）", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ items: ["1、要点"] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await polishClipboardText("note", "文本", CODE, "casual")).toEqual({ items: ["1、要点"] });
    expect(JSON.parse(((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]).body as string))
      .toEqual({ kind: "note", text: "文本", style: "casual" });

    expect(await polishClipboardText("note", "文本", CODE)).toEqual({ items: ["1、要点"] });
    const plainBody = JSON.parse(((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1]).body as string);
    expect("style" in plainBody).toBe(false);
  });

  it("LLM 降级标记映射为 fallback:true", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ items: null, fallback: true }), { status: 200 })));
    expect(await polishClipboardText("note", "文本", CODE)).toEqual({ fallback: true });
  });

  it("非 2xx / 网络错误 / 结构非法 / 空条目一律返回 null", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
    expect(await polishClipboardText("todo", "文本", CODE)).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 410 })));
    expect(await polishClipboardText("todo", "文本", CODE)).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    expect(await polishClipboardText("todo", "文本", CODE)).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ items: "nope" }), { status: 200 })));
    expect(await polishClipboardText("todo", "文本", CODE)).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ items: [] }), { status: 200 })));
    expect(await polishClipboardText("todo", "文本", CODE)).toBeNull();
  });

  it("quick kind：成功收敛为 button 对象，body 带 kind=quick", async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ button: { title: "GitHub 主页", value: "https://github.com", type: "link" } }),
      { status: 200 },
    ));
    vi.stubGlobal("fetch", fetchMock);

    expect(await polishClipboardText("quick", "https://github.com", CODE))
      .toEqual({ button: { title: "GitHub 主页", value: "https://github.com", type: "link" } });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/polish/");
    expect(JSON.parse(init.body as string)).toEqual({ kind: "quick", text: "https://github.com" });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("quick 降级标记 {button:null,fallback:true} 收敛为 fallback:true", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ button: null, fallback: true }), { status: 200 })));
    expect(await polishClipboardText("quick", "文本", CODE)).toEqual({ fallback: true });
  });

  it("quick button 结构非法返回 null（类型枚举/空字段/非对象）", async () => {
    for (const button of [
      { title: "T", value: "V", type: "api" },
      { title: "", value: "V", type: "link" },
      { title: "T", value: 1, type: "text" },
      "nope",
    ]) {
      vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ button }), { status: 200 })));
      expect(await polishClipboardText("quick", "文本", CODE)).toBeNull();
    }
  });

  it("quick 请求超时放宽到 45s：40s 时仍未 abort 并成功返回", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        setTimeout(() => resolve(new Response(JSON.stringify({ button: { title: "T", value: "V", type: "text" } }), { status: 200 })), 40_000);
      }));
      vi.stubGlobal("fetch", fetchMock);
      const pending = polishClipboardText("quick", "文本", CODE);
      // crypto.subtle.digest 在测试环境里经线程池完成（非微任务），先用真实定时器轮询等请求真正发出，
      // fetch mock 的 40s 定时器才会挂到假时钟上；否则 40s advance 空转，pending 永不 settle。
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
      await vi.advanceTimersByTimeAsync(40_000);
      expect(await pending).toEqual({ button: { title: "T", value: "V", type: "text" } });
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it("quick 超时常量为 45s（todo/note 维持 config 的 35s）", () => {
    expect(POLISH_QUICK_FETCH_TIMEOUT_MS).toBe(45_000);
  });

  it("限长常量与服务端 MAX_POLISH_CHARS 对齐", () => {
    expect(POLISH_MAX_CHARS).toBe(2000);
  });
});
