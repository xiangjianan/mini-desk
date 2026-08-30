import { afterEach, describe, expect, it, vi } from "vitest";
import { POLISH_MAX_CHARS, polishClipboardText } from "../sync/polishClient";

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

  it("限长常量与服务端 MAX_POLISH_CHARS 对齐", () => {
    expect(POLISH_MAX_CHARS).toBe(2000);
  });
});
