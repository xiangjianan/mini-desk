/**
 * 手机速记中转 Worker：只存 AES-GCM 密文队列。
 * 路由键是 SHA-256(配对码) 的 hex；条目 TTL 30 天，无账号、无按条删除
 * （多台桌面共用一个码，回收交给 TTL）。幂等：同 id 覆盖。
 */

export interface InboxKVStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number; metadata?: Record<string, unknown> }): Promise<void>;
  list(options: { prefix: string }): Promise<{ keys: { name: string; metadata?: Record<string, unknown> }[] }>;
}

export interface InboxEnv {
  INBOX: InboxKVStore;
  ALLOWED_ORIGINS?: string;
}

const KEY_HASH_PATTERN = /^[0-9a-f]{64}$/;
const MAX_CIPHER_BYTES = 4096;
const MAX_QUEUE_ITEMS = 200;
const DAILY_WRITE_LIMIT = 60;
const ITEM_TTL_SECONDS = 30 * 24 * 60 * 60;
const DAY_TTL_SECONDS = 2 * 24 * 60 * 60;
const MAX_ID_LENGTH = 64;

function corsHeaders(origin: string | null, env: InboxEnv): Record<string, string> {
  const allowed = (env.ALLOWED_ORIGINS ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  const allow = origin && allowed.includes(origin) ? origin : allowed[0] ?? "";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function jsonResponse(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors } });
}

function itemKey(keyHash: string, id: string): string {
  return `${keyHash}:item:${id}`;
}

function dayKey(keyHash: string): string {
  return `${keyHash}:day:${new Date().toISOString().slice(0, 10)}`;
}

export async function handleInboxRequest(request: Request, env: InboxEnv): Promise<Response> {
  const cors = corsHeaders(request.headers.get("Origin"), env);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const url = new URL(request.url);
  const match = /^\/inbox\/([0-9a-f]{64})$/.exec(url.pathname);
  if (!match || !KEY_HASH_PATTERN.test(match[1])) return jsonResponse({ error: "not_found" }, 404, cors);
  const keyHash = match[1];
  if (request.method === "POST") return handlePost(request, env, keyHash, cors);
  if (request.method === "GET") return handleGet(env, keyHash, cors);
  return jsonResponse({ error: "method_not_allowed" }, 405, cors);
}

async function handlePost(request: Request, env: InboxEnv, keyHash: string, cors: Record<string, string>): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "bad_request" }, 400, cors);
  }
  if (typeof body !== "object" || body === null) return jsonResponse({ error: "bad_request" }, 400, cors);
  const { id, payload } = body as Record<string, unknown>;
  if (typeof id !== "string" || !id || id.length > MAX_ID_LENGTH) return jsonResponse({ error: "bad_request" }, 400, cors);
  if (typeof payload !== "string" || !payload) return jsonResponse({ error: "bad_request" }, 400, cors);
  // base64 每 4 字符约 3 字节密文
  if (payload.length * 0.75 > MAX_CIPHER_BYTES) return jsonResponse({ error: "payload_too_large" }, 413, cors);
  const listed = await env.INBOX.list({ prefix: `${keyHash}:item:` });
  const isRetry = listed.keys.some((key) => key.name === itemKey(keyHash, id));
  const day = dayKey(keyHash);
  // 当日计数按“写入尝试”累计：被限流拒绝的尝试同样占用配额（固定窗口限流的常规语义，
  // 防止无限免费探测）；同 id 重试不计数，保证幂等重试永不被限流或拒收。
  const attempts = Number((await env.INBOX.get(day)) ?? "0");
  if (!isRetry) {
    // 队列饱和：存量条目达到上限（跨天硬上限），或当日写入尝试达到上限（单日饱和）。
    if (listed.keys.length >= MAX_QUEUE_ITEMS || attempts >= MAX_QUEUE_ITEMS) {
      return jsonResponse({ error: "queue_full" }, 409, cors);
    }
    if (attempts >= DAILY_WRITE_LIMIT) {
      await env.INBOX.put(day, String(attempts + 1), { expirationTtl: DAY_TTL_SECONDS });
      return jsonResponse({ error: "rate_limited" }, 429, cors);
    }
    await env.INBOX.put(day, String(attempts + 1), { expirationTtl: DAY_TTL_SECONDS });
  }
  await env.INBOX.put(itemKey(keyHash, id), payload, { expirationTtl: ITEM_TTL_SECONDS, metadata: { createdAt: Date.now() } });
  return jsonResponse({ ok: true }, 200, cors);
}

async function handleGet(env: InboxEnv, keyHash: string, cors: Record<string, string>): Promise<Response> {
  const listed = await env.INBOX.list({ prefix: `${keyHash}:item:` });
  const prefixLength = `${keyHash}:item:`.length;
  const items = (
    await Promise.all(
      listed.keys.map(async (key) => {
        const value = await env.INBOX.get(key.name);
        if (value === null) return null;
        const createdAt = key.metadata?.createdAt;
        return {
          id: key.name.slice(prefixLength),
          payload: value,
          createdAt: typeof createdAt === "number" ? createdAt : 0,
        };
      }),
    )
  )
    .filter((item): item is { id: string; payload: string; createdAt: number } => item !== null)
    .sort((a, b) => a.createdAt - b.createdAt);
  return jsonResponse({ items }, 200, cors);
}

export default {
  async fetch(request: Request, env: InboxEnv): Promise<Response> {
    return handleInboxRequest(request, env);
  },
};
