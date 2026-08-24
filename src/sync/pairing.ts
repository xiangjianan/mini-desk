/** Crockford base32：0-9 + 22 个字母（排除 I L O U 防误读），32 进制恰好整除 256，无取模偏差。 */
const INBOX_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const INBOX_CODE_LENGTH = 12;
export const INBOX_CODE_PATTERN = new RegExp(`^[${INBOX_ALPHABET}]{${INBOX_CODE_LENGTH}}$`);

export function generateInboxCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(INBOX_CODE_LENGTH));
  let code = "";
  for (const byte of bytes) code += INBOX_ALPHABET[byte % INBOX_ALPHABET.length];
  return code;
}

export function isValidInboxCode(code: unknown): code is string {
  return typeof code === "string" && INBOX_CODE_PATTERN.test(code);
}

/** 手动输码容错：移除全部空白（含分组粘贴的内部空格）、大写、混淆字符归一（I/L→1、O→0；Crockford base32 不含这三个字母）。 */
export function normalizeInboxCode(input: string): string {
  return input.replace(/\s+/g, "").toUpperCase().replace(/[IL]/g, "1").replace(/O/g, "0");
}

export function parseInboxFragment(hash: string): string | null {
  const match = /^#inbox=(.+)$/.exec(hash);
  return match && isValidInboxCode(match[1]) ? match[1] : null;
}

export function buildInboxAddress(code: string): string {
  return `${window.location.origin}${window.location.pathname}#inbox=${code}`;
}

export const REMEMBERED_INBOX_CODE_KEY = "mini-desk-inbox-code";

/** 手机壳本地记忆最近配对码：主屏图标（start_url=/）与微信重开都会丢 fragment，裸访问时用它自动配对。
 *  码即密钥，明文存 localStorage 与桌面端 state 存码一致（威胁模型见设计文档）。 */
export function loadRememberedInboxCode(storage: Storage = localStorage): string | null {
  const stored = storage.getItem(REMEMBERED_INBOX_CODE_KEY);
  return stored !== null && isValidInboxCode(stored) ? stored : null;
}

/** 调用方保证 code 已过校验（三处来源均先验证）；load 侧仍会自愈非法值。 */
export function saveRememberedInboxCode(code: string, storage: Storage = localStorage): void {
  storage.setItem(REMEMBERED_INBOX_CODE_KEY, code);
}

export function clearRememberedInboxCode(storage: Storage = localStorage): void {
  storage.removeItem(REMEMBERED_INBOX_CODE_KEY);
}

/** 12 位码按 4 位分组展示（速记页脚与桌面配对面板人工比对用）。 */
export function formatInboxCode(code: string): string {
  return code.replace(/(.{4})(?=.)/g, "$1 ");
}

/** 导入载荷（单工作区 `workspace` 或全量 `workspaces[]`）是否携带配对码——用于导入后的轮换提醒。 */
export function importedPayloadHasInbox(parsed: unknown): boolean {
  if (typeof parsed !== "object" || parsed === null) return false;
  const typed = parsed as Record<string, unknown>;
  const candidates: unknown[] = Array.isArray(typed.workspaces) ? typed.workspaces : [typed.workspace];
  return candidates.some((item) => {
    if (typeof item !== "object" || item === null) return false;
    const inbox = (item as Record<string, unknown>).inbox;
    // 与 normalizeWorkspaceInbox 同规则校验码格式：短码等无效载荷会被 normalize 丢弃，不触发提示。
    return typeof inbox === "object" && inbox !== null && isValidInboxCode((inbox as Record<string, unknown>).code);
  });
}
