import { inboxKeyHash } from "./crypto";
import { INBOX_WORKER_URL, POLISH_FETCH_TIMEOUT_MS } from "./config";

export type PolishKind = "todo" | "note" | "quick";

/** AI 润色风格（便签选中文本子菜单）：tech=技术 / concise=简洁 / casual=口语；缺省=服务端默认润色口径。 */
export type PolishStyle = "tech" | "concise" | "casual";

/** 快捷动作智能粘贴生成的按钮（value 为服务端确定性回填：link=原文 URL，text=原文）。 */
export type QuickPolishButton = { title: string; value: string; type: "link" | "text" };

/** 成功：整理后的条目/快捷按钮（服务端保证非空）；降级：LLM 失败（200 + fallback 标记）；null：网络/HTTP/结构非法。 */
export type PolishResult = { items: string[] } | { button: QuickPolishButton } | { fallback: true } | null;

/** 与服务端 MAX_POLISH_CHARS 对齐：超长不请求，直接走原文粘贴。 */
export const POLISH_MAX_CHARS = 2000;

/** quick 单独放宽：服务端最坏 8s 链接抓取（跨跳总预算 10s）+ 30s LLM，35s 会把将成的结果误 abort。 */
export const POLISH_QUICK_FETCH_TIMEOUT_MS = 45_000;

function polishUrl(keyHash: string): string {
  return `${INBOX_WORKER_URL.replace(/\/+$/, "")}/polish/${keyHash}`;
}

function coerceQuickButton(data: unknown): QuickPolishButton | null {
  if (typeof data !== "object" || data === null) return null;
  const typed = data as { title?: unknown; value?: unknown; type?: unknown };
  if (typeof typed.title !== "string" || !typed.title.trim()) return null;
  if (typeof typed.value !== "string" || !typed.value.trim()) return null;
  if (typed.type !== "link" && typed.type !== "text") return null;
  return { title: typed.title, value: typed.value, type: typed.type };
}

/** 响应收敛：{items:[...]} / {button:{...}} / 对应的 fallback 标记之外的形状一律按失败（null）处理。 */
function coercePolishResponse(data: unknown): PolishResult {
  if (typeof data !== "object" || data === null) return null;
  const typed = data as { items?: unknown; fallback?: unknown; button?: unknown };
  if (typed.fallback === true && (typed.items === null || typed.button === null)) return { fallback: true };
  if (Array.isArray(typed.items) && typed.items.length > 0 && typed.items.every((item) => typeof item === "string")) {
    return { items: typed.items };
  }
  const button = coerceQuickButton(typed.button);
  return button ? { button } : null;
}

/** 智能粘贴/AI 润色请求：任何失败返回 null 不抛异常——调用方一律走「原文」兜底。style 仅在指定时随请求体下发。 */
export async function polishClipboardText(kind: PolishKind, text: string, code: string, style?: PolishStyle): Promise<PolishResult> {
  try {
    const keyHash = await inboxKeyHash(code);
    const controller = new AbortController();
    const timeoutMs = kind === "quick" ? POLISH_QUICK_FETCH_TIMEOUT_MS : POLISH_FETCH_TIMEOUT_MS;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(polishUrl(keyHash), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, text, ...(style ? { style } : {}) }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    if (!response.ok) return null;
    return coercePolishResponse(await response.json());
  } catch {
    return null;
  }
}
