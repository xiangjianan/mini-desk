/** 中转后端地址（自建阿里云 + MySQL，协议与原 Worker 一致）。本地联调用 .env.local 里 VITE_INBOX_WORKER_URL=http://127.0.0.1:8787 覆盖。 */
export const INBOX_WORKER_URL: string =
  ((import.meta.env.VITE_INBOX_WORKER_URL as string | undefined) ?? "").trim() ||
  "https://relay.minidesk.online:8443";

export const INBOX_PLAINTEXT_MAX_CHARS = 500;
export const INBOX_PULL_INTERVAL_MS = 5 * 60 * 1000;
export const INBOX_FOCUS_THROTTLE_MS = 60 * 1000;

/** 单次收件箱请求的超时（毫秒）：挂起的连接按失败处理，避免卡死拉取周期与手机提交。 */
export const INBOX_FETCH_TIMEOUT_MS = 15_000;
