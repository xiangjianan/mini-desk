import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchInboxItems, postInboxItem, revokeInboxKey } from "../sync/inboxClient";

const KEY = "a".repeat(64);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("inboxClient", () => {
  it("postInboxItem 成功返回 ok:true，失败/网络错误返回带原因分类", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{\"ok\":true}", { status: 200 })));
    expect(await postInboxItem(KEY, "i1", "AAA")).toEqual({ ok: true });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 429 })));
    expect(await postInboxItem(KEY, "i1", "AAA")).toEqual({ ok: false, reason: "rate_limited" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    expect(await postInboxItem(KEY, "i1", "AAA")).toEqual({ ok: false, reason: "network" });
  });

  it("POST 状态码映射到失败原因", async () => {
    for (const [status, reason] of [[409, "queue_full"], [413, "too_large"], [400, "bad_request"], [500, "server"]] as const) {
      vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status })));
      expect(await postInboxItem(KEY, "i1", "AAA")).toEqual({ ok: false, reason });
    }
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
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("GET 200 非 JSON body 返回 null", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not json", { status: 200, headers: { "Content-Type": "application/json" } })));
    expect(await fetchInboxItems(KEY)).toBeNull();
  });

  it("GET 200 无 items 键返回 null", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } })));
    expect(await fetchInboxItems(KEY)).toBeNull();
  });

  it("GET 200 空队列返回空数组（区别于 null）", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{\"items\":[]}", { status: 200, headers: { "Content-Type": "application/json" } })));
    expect(await fetchInboxItems(KEY)).toEqual([]);
  });

  it("410 映射为 code_revoked（配对码已注销）", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{\"error\":\"revoked\"}", { status: 410 })));
    expect(await postInboxItem(KEY, "i1", "AAA")).toEqual({ ok: false, reason: "code_revoked" });
  });

  it("revokeInboxKey：DELETE /inbox/:keyHash，成功 true、非 2xx/网络异常 false", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{\"ok\":true}", { status: 200 })));
    expect(await revokeInboxKey(KEY)).toBe(true);

    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    expect(await revokeInboxKey(KEY)).toBe(false);

    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    expect(await revokeInboxKey(KEY)).toBe(false);
  });

  it("revokeInboxKey 请求打到 DELETE /inbox/:keyHash 且无 body", async () => {
    const fetchMock = vi.fn(async () => new Response("{\"ok\":true}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await revokeInboxKey(KEY);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url.endsWith(`/inbox/${KEY}`)).toBe(true);
    expect(init.method).toBe("DELETE");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
