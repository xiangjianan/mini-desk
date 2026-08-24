import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchInboxItems, postInboxItem } from "../sync/inboxClient";

const KEY = "a".repeat(64);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("inboxClient", () => {
  it("postInboxItem 成功返回 true，失败/网络错误返回 false", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{\"ok\":true}", { status: 200 })));
    expect(await postInboxItem(KEY, "i1", "AAA")).toBe(true);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 429 })));
    expect(await postInboxItem(KEY, "i1", "AAA")).toBe(false);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    expect(await postInboxItem(KEY, "i1", "AAA")).toBe(false);
  });

  it("fetchInboxItems 解析并过滤结构非法的条目", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ items: [
        { id: "i1", payload: "AAA", createdAt: 1 },
        { id: 42, payload: "BBB", createdAt: 2 },
        "junk",
      ] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )));
    expect(await fetchInboxItems(KEY)).toEqual([{ id: "i1", payload: "AAA", createdAt: 1 }]);
  });

  it("fetchInboxItems 失败返回 null（静默重试交给下次触发）", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 404 })));
    expect(await fetchInboxItems(KEY)).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    expect(await fetchInboxItems(KEY)).toBeNull();
  });

  it("请求打到 /inbox/:keyHash 且 POST 带 JSON body", async () => {
    const fetchMock = vi.fn(async () => new Response("{\"ok\":true}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await postInboxItem(KEY, "i1", "AAA");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url.endsWith(`/inbox/${KEY}`)).toBe(true);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ id: "i1", payload: "AAA" });
  });
});
