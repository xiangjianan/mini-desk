/** 中转 Worker 地址。本地联调用 .env.local 里 VITE_INBOX_WORKER_URL=http://127.0.0.1:8787 覆盖。 */
export const INBOX_WORKER_URL: string =
  ((import.meta.env.VITE_INBOX_WORKER_URL as string | undefined) ?? "").trim() ||
  "https://mini-desk-inbox.xiangjianan.workers.dev";

export const INBOX_PLAINTEXT_MAX_CHARS = 500;
export const INBOX_CIPHER_MAX_BYTES = 4096;
export const INBOX_PULL_INTERVAL_MS = 5 * 60 * 1000;
export const INBOX_FOCUS_THROTTLE_MS = 60 * 1000;
