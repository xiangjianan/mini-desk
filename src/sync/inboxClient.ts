import { INBOX_FETCH_TIMEOUT_MS, INBOX_WORKER_URL } from "./config";

export interface InboxStoredItem {
  id: string;
  payload: string;
  createdAt: number;
}

export type InboxPostFailure = "rate_limited" | "queue_full" | "too_large" | "bad_request" | "server" | "network";

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
