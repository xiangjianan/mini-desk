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
