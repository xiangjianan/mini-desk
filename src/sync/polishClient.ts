import { inboxKeyHash } from "./crypto";
import { INBOX_WORKER_URL, POLISH_FETCH_TIMEOUT_MS } from "./config";

export type PolishKind = "todo" | "note";

/** 成功：整理后的条目（服务端保证非空）；降级：LLM 失败（200 + fallback 标记）；null：网络/HTTP/结构非法。 */
export type PolishResult = { items: string[] } | { fallback: true } | null;

/** 与服务端 MAX_POLISH_CHARS 对齐：超长不请求，直接走原文粘贴。 */
export const POLISH_MAX_CHARS = 2000;

function polishUrl(keyHash: string): string {
  return `${INBOX_WORKER_URL.replace(/\/+$/, "")}/polish/${keyHash}`;
}

/** 响应收敛：{items:[...]} / {items:null,fallback:true} 之外的形状一律按失败（null）处理。 */
function coercePolishResponse(data: unknown): PolishResult {
  if (typeof data !== "object" || data === null) return null;
  const typed = data as { items?: unknown; fallback?: unknown };
  if (typed.fallback === true && typed.items === null) return { fallback: true };
  if (Array.isArray(typed.items) && typed.items.length > 0 && typed.items.every((item) => typeof item === "string")) {
    return { items: typed.items };
  }
  return null;
}

/** 智能粘贴请求：任何失败返回 null 不抛异常——调用方一律走「原文粘贴」兜底。 */
export async function polishClipboardText(kind: PolishKind, text: string, code: string): Promise<PolishResult> {
  try {
    const keyHash = await inboxKeyHash(code);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), POLISH_FETCH_TIMEOUT_MS);
    const response = await fetch(polishUrl(keyHash), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, text }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    if (!response.ok) return null;
    return coercePolishResponse(await response.json());
  } catch {
    return null;
  }
}
