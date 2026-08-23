// @vitest-environment node
import { describe, expect, it } from "vitest";
import { handleInboxRequest, type InboxEnv, type InboxKVStore } from "../index";

const ORIGIN = "https://todolist.pages.dev";
const KEY = "a".repeat(64);
const OTHER = "b".repeat(64);

class MockKV implements InboxKVStore {
  store = new Map<string, { value: string; metadata?: Record<string, unknown> }>();
  async get(key: string): Promise<string | null> {
    return this.store.get(key)?.value ?? null;
  }
  async put(key: string, value: string, options?: { expirationTtl?: number; metadata?: Record<string, unknown> }): Promise<void> {
    this.store.set(key, { value, metadata: options?.metadata });
  }
  async list(options: { prefix: string }): Promise<{ keys: { name: string; metadata?: Record<string, unknown> }[] }> {
    return {
      keys: Array.from(this.store.keys())
        .filter((name) => name.startsWith(options.prefix))
        .map((name) => ({ name, metadata: this.store.get(name)?.metadata })),
    };
  }
}

function makeEnv(): InboxEnv {
  return { INBOX: new MockKV(), ALLOWED_ORIGINS: `${ORIGIN},http://localhost:5173` };
}

function post(env: InboxEnv, keyHash: string, body: unknown, origin = ORIGIN): Promise<Response> {
  return handleInboxRequest(
    new Request(`https://worker.test/inbox/${keyHash}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify(body),
    }),
    env,
  );
}

function get(env: InboxEnv, keyHash: string, origin = ORIGIN): Promise<Response> {
  return handleInboxRequest(new Request(`https://worker.test/inbox/${keyHash}`, { headers: { Origin: origin } }), env);
}

describe("inbox worker", () => {
  it("POST 后 GET 返回条目并按 createdAt 排序", async () => {
    const env = makeEnv();
    expect((await post(env, KEY, { id: "i1", payload: "AAA" })).status).toBe(200);
    expect((await post(env, KEY, { id: "i2", payload: "BBB" })).status).toBe(200);
    const response = await get(env, KEY);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { items: { id: string; payload: string; createdAt: number }[] };
    expect(body.items.map((item) => item.id)).toEqual(["i1", "i2"]);
    expect(body.items[0].createdAt).toBeGreaterThan(0);
    expect(await response.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
  });

  it("重复 id 覆盖而非新增（幂等重试）", async () => {
    const env = makeEnv();
    await post(env, KEY, { id: "i1", payload: "AAA" });
    await post(env, KEY, { id: "i1", payload: "CCC" });
    const body = (await (await get(env, KEY)).json()) as { items: unknown[] };
    expect(body.items).toHaveLength(1);
  });

  it("非法 keyHash / body 返回 400 或 404", async () => {
    const env = makeEnv();
    expect((await post(env, "XYZ", { id: "i1", payload: "AAA" })).status).toBe(404);
    expect((await post(env, KEY, { id: "", payload: "AAA" })).status).toBe(400);
    expect((await post(env, KEY, { id: "i1" })).status).toBe(400);
  });

  it("超长 payload 返回 413", async () => {
    const env = makeEnv();
    const big = "A".repeat(6000);
    expect((await post(env, KEY, { id: "i1", payload: big })).status).toBe(413);
  });

  it("队列超 200 条且非重复 id 时返回 409", async () => {
    const env = makeEnv();
    for (let i = 0; i < 200; i += 1) {
      await post(env, KEY, { id: `item-${i}`, payload: "AAA" });
    }
    expect((await post(env, KEY, { id: "new", payload: "AAA" })).status).toBe(409);
    expect((await post(env, KEY, { id: "item-0", payload: "BBB" })).status).toBe(200); // 已存在的 id 仍可覆盖
  });

  it("每日 60 条写入限流返回 429", async () => {
    const env = makeEnv();
    for (let i = 0; i < 60; i += 1) {
      await post(env, OTHER, { id: `item-${i}`, payload: "AAA" });
    }
    expect((await post(env, OTHER, { id: "overflow", payload: "AAA" })).status).toBe(429);
  });

  it("CORS：白名单外 Origin 不回显，OPTIONS 返回 204", async () => {
    const env = makeEnv();
    const foreign = await get(env, KEY, "https://evil.example");
    expect(foreign.headers.get("Access-Control-Allow-Origin")).not.toBe("https://evil.example");
    const preflight = await handleInboxRequest(
      new Request(`https://worker.test/inbox/${KEY}`, { method: "OPTIONS", headers: { Origin: ORIGIN } }),
      env,
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
  });
});
