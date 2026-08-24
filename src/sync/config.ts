/** 中转 Worker 地址。本地联调用 .env.local 里 VITE_INBOX_WORKER_URL=http://127.0.0.1:8787 覆盖。 */
export const INBOX_WORKER_URL: string =
  ((import.meta.env.VITE_INBOX_WORKER_URL as string | undefined) ?? "").trim() ||
  "https://inbox.minidesk.online";

export const INBOX_PLAINTEXT_MAX_CHARS = 500;
export const INBOX_PULL_INTERVAL_MS = 5 * 60 * 1000;
export const INBOX_FOCUS_THROTTLE_MS = 60 * 1000;

/** 单次收件箱请求的超时（毫秒）：挂起的连接按失败处理，避免卡死拉取周期与手机提交。 */
export const INBOX_FETCH_TIMEOUT_MS = 15_000;
