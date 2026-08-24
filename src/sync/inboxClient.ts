import { INBOX_WORKER_URL } from "./config";

export interface InboxStoredItem {
  id: string;
  payload: string;
  createdAt: number;
}

function inboxUrl(keyHash: string): string {
  return `${INBOX_WORKER_URL.replace(/\/+$/, "")}/inbox/${keyHash}`;
}

/** 失败一律返回 false，不抛异常——手机端据此提示重试。 */
export async function postInboxItem(keyHash: string, id: string, payload: string): Promise<boolean> {
  try {
    const response = await fetch(inboxUrl(keyHash), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, payload }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** 失败一律返回 null，不抛异常——桌面端静默等下次触发。 */
export async function fetchInboxItems(keyHash: string): Promise<InboxStoredItem[] | null> {
  try {
    const response = await fetch(inboxUrl(keyHash));
    if (!response.ok) return null;
    const data: unknown = await response.json();
    if (typeof data !== "object" || data === null) return null;
    const items = (data as { items?: unknown }).items;
    if (!Array.isArray(items)) return null;
    return items.flatMap((item): InboxStoredItem[] => {
      if (typeof item !== "object" || item === null) return [];
      const typed = item as Record<string, unknown>;
      if (typeof typed.id !== "string" || typeof typed.payload !== "string" || typeof typed.createdAt !== "number") return [];
      return [{ id: typed.id, payload: typed.payload, createdAt: typed.createdAt }];
    });
  } catch {
    return null;
  }
}
