import { INBOX_FETCH_TIMEOUT_MS, INBOX_WORKER_URL } from "./config";

export interface InboxStoredItem {
  id: string;
  payload: string;
  createdAt: number;
}

export type InboxPostFailure = "rate_limited" | "queue_full" | "too_large" | "bad_request" | "code_revoked" | "unknown_code" | "server" | "network";

export type InboxKeyStatus = "active" | "revoked" | "unknown";

export type InboxPostResult = { ok: true } | { ok: false; reason: InboxPostFailure };

function inboxUrl(keyHash: string): string {
  return `${INBOX_WORKER_URL.replace(/\/+$/, "")}/inbox/${keyHash}`;
}

function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), INBOX_FETCH_TIMEOUT_MS);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function postFailureForStatus(status: number): InboxPostFailure {
  if (status === 429) return "rate_limited";
  if (status === 409) return "queue_full";
  if (status === 410) return "code_revoked";
  if (status === 404) return "unknown_code";
  if (status === 413) return "too_large";
  if (status === 400) return "bad_request";
  return "server";
}

/** 失败返回带原因分类，不抛异常——手机端据此给出针对性提示（429/409/413/网络）。 */
export async function postInboxItem(keyHash: string, id: string, payload: string): Promise<InboxPostResult> {
  try {
    const response = await fetchWithTimeout(inboxUrl(keyHash), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, payload }),
    });
    return response.ok ? { ok: true } : { ok: false, reason: postFailureForStatus(response.status) };
  } catch {
    return { ok: false, reason: "network" };
  }
}

/** 失败一律返回 null，不抛异常——桌面端静默等下次触发。 */
export async function fetchInboxItems(keyHash: string): Promise<InboxStoredItem[] | null> {
  try {
    const response = await fetchWithTimeout(inboxUrl(keyHash));
    if (!response.ok) return null;
    const data: unknown = await response.json();
    if (typeof data !== "object" || data === null) return null;
    const items = (data as { items?: unknown }).items;
    if (!Array.isArray(items)) return null;
    return items.flatMap((item): InboxStoredItem[] => {
      if (typeof item !== "object" || item === null) return [];
      const typed = item as Record<string, unknown>;
      if (typeof typed.id !== "string" || typeof typed.payload !== "string" || typeof typed.createdAt !== "number" || !Number.isFinite(typed.createdAt)) return [];
      return [{ id: typed.id, payload: typed.payload, createdAt: typed.createdAt }];
    });
  } catch {
    return null;
  }
}

/** 注销旧配对码（DELETE 清队列+登记）：失败一律 false，不抛异常——调用方照常清本地配对，仅气泡提示。 */
export async function revokeInboxKey(keyHash: string): Promise<boolean> {
  try {
    const response = await fetchWithTimeout(inboxUrl(keyHash), { method: "DELETE" });
    return response.ok;
  } catch {
    return false;
  }
}

/** 注册配对码（桌面端保存/轮换/启动时调用）：失败一律 false，不抛异常——调用方仅提示或静默重试。 */
export async function registerInboxKey(keyHash: string): Promise<boolean> {
  try {
    const response = await fetchWithTimeout(`${inboxUrl(keyHash)}/register`, { method: "POST" });
    return response.ok;
  } catch {
    return false;
  }
}

/** 查询配对码状态（手机输码验证用）：网络/非 2xx/结构非法一律 null，调用方 fail-open。 */
export async function checkInboxKeyStatus(keyHash: string): Promise<InboxKeyStatus | null> {
  try {
    const response = await fetchWithTimeout(`${inboxUrl(keyHash)}/status`);
    if (!response.ok) return null;
    const data: unknown = await response.json();
    const status = typeof data === "object" && data !== null ? (data as { status?: unknown }).status : undefined;
    return status === "active" || status === "revoked" || status === "unknown" ? status : null;
  } catch {
    return null;
  }
}
