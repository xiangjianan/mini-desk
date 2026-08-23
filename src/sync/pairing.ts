/** Crockford base32：0-9 + 22 个字母（排除 I L O U 防误读），32 进制恰好整除 256，无取模偏差。 */
const INBOX_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const INBOX_CODE_LENGTH = 12;
export const INBOX_CODE_PATTERN = /^[0-9A-HJKMNP-TV-Z]{12}$/;

export function generateInboxCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(INBOX_CODE_LENGTH));
  let code = "";
  for (const byte of bytes) code += INBOX_ALPHABET[byte % INBOX_ALPHABET.length];
  return code;
}

export function isValidInboxCode(code: unknown): code is string {
  return typeof code === "string" && INBOX_CODE_PATTERN.test(code);
}

export function parseInboxFragment(hash: string): string | null {
  const match = /^#inbox=([0-9A-HJKMNP-TV-Z]{12})$/.exec(hash);
  return match ? match[1] : null;
}

export function buildInboxAddress(code: string): string {
  return `${window.location.origin}${window.location.pathname}#inbox=${code}`;
}
