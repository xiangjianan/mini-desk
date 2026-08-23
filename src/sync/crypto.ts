export interface InboxPlainItem {
  kind: "todo" | "note";
  text: string;
  createdAt: number;
}

const PBKDF2_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const NONCE_BYTES = 12;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function subtle(): SubtleCrypto {
  const scope = globalThis.crypto as Crypto | undefined;
  if (!scope?.subtle) throw new Error("Web Crypto is unavailable in this environment");
  return scope.subtle;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveAesKey(code: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const material = await subtle().importKey("raw", encoder.encode(code), "PBKDF2", false, ["deriveKey"]);
  return subtle().deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** 密文格式：base64(salt[16] || nonce[12] || AES-GCM ciphertext)。 */
export async function encryptInboxPayload(code: string, plain: InboxPlainItem): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  const key = await deriveAesKey(code, salt);
  const cipher = await subtle().encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    encoder.encode(JSON.stringify(plain)),
  );
  const packed = new Uint8Array(SALT_BYTES + NONCE_BYTES + cipher.byteLength);
  packed.set(salt, 0);
  packed.set(nonce, SALT_BYTES);
  packed.set(new Uint8Array(cipher), SALT_BYTES + NONCE_BYTES);
  return toBase64(packed);
}

/** 解密并校验明文结构；任何失败（错码/损坏/结构非法）返回 null，不抛异常。 */
export async function decryptInboxPayload(code: string, payload: string): Promise<InboxPlainItem | null> {
  try {
    const packed = fromBase64(payload);
    if (packed.length <= SALT_BYTES + NONCE_BYTES) return null;
    const salt = packed.subarray(0, SALT_BYTES);
    const nonce = packed.subarray(SALT_BYTES, SALT_BYTES + NONCE_BYTES);
    const cipher = packed.subarray(SALT_BYTES + NONCE_BYTES);
    const key = await deriveAesKey(code, salt);
    const plain = await subtle().decrypt({ name: "AES-GCM", iv: nonce }, key, cipher);
    const parsed: unknown = JSON.parse(decoder.decode(plain));
    if (typeof parsed !== "object" || parsed === null) return null;
    const typed = parsed as Record<string, unknown>;
    if ((typed.kind !== "todo" && typed.kind !== "note") || typeof typed.text !== "string") return null;
    return {
      kind: typed.kind,
      text: typed.text,
      createdAt: typeof typed.createdAt === "number" ? typed.createdAt : 0,
    };
  } catch {
    return null;
  }
}

/** 服务端路由键：SHA-256(码) 的 hex。服务器持它也无法解密内容。 */
export async function inboxKeyHash(code: string): Promise<string> {
  const digest = await subtle().digest("SHA-256", encoder.encode(code));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
