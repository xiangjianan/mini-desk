import { binaryStringToBytes } from "../utils/base64";

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

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  return binaryStringToBytes(atob(value));
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

/** 校验已解析的明文并收敛为 InboxPlainItem：kind ∈ todo/note、text 为字符串（不要求非空）、createdAt 非数字记 0；结构非法返回 null。 */
function coercePlainItem(parsed: unknown): InboxPlainItem | null {
  if (typeof parsed !== "object" || parsed === null) return null;
  const typed = parsed as Record<string, unknown>;
  if ((typed.kind !== "todo" && typed.kind !== "note") || typeof typed.text !== "string") return null;
  return {
    kind: typed.kind,
    text: typed.text,
    createdAt: typeof typed.createdAt === "number" ? typed.createdAt : 0,
  };
}

/** 解密并校验明文结构；条目级失败（错码/损坏/结构非法）返回 null，不抛异常。
 *  环境级失败（Web Crypto 缺失）在 try 外抛出，让拉取层中止整批而非当作坏条目推进水位线。 */
export async function decryptInboxPayload(code: string, payload: string): Promise<InboxPlainItem | null> {
  void subtle();
  try {
    const packed = fromBase64(payload);
    if (packed.length <= SALT_BYTES + NONCE_BYTES) return null;
    const salt = packed.subarray(0, SALT_BYTES);
    const nonce = packed.subarray(SALT_BYTES, SALT_BYTES + NONCE_BYTES);
    const cipher = packed.subarray(SALT_BYTES + NONCE_BYTES);
    const key = await deriveAesKey(code, salt);
    const plain = await subtle().decrypt({ name: "AES-GCM", iv: nonce }, key, cipher);
    return coercePlainItem(JSON.parse(decoder.decode(plain)));
  } catch {
    return null;
  }
}

/** 明文行（服务端润色后的新格式）：JSON 文本，结构同 InboxPlainItem。非 JSON 或结构非法返回 null。 */
function parsePlainPayload(payload: string): InboxPlainItem | null {
  try {
    return coercePlainItem(JSON.parse(payload));
  } catch {
    return null;
  }
}

/** 解码入库行：优先按明文 JSON（服务端润色后的新格式）解析，失败回退 AES-GCM 解密（存量密文行）。
 *  环境级失败（Web Crypto 缺失）与 decryptInboxPayload 同语义：仅在回退路径抛出。 */
export async function decodeInboxPayload(code: string, payload: string): Promise<InboxPlainItem | null> {
  const plain = parsePlainPayload(payload);
  if (plain) return plain;
  return decryptInboxPayload(code, payload);
}

/** 服务端路由键：SHA-256(码) 的 hex。服务器持它也无法解密内容。 */
export async function inboxKeyHash(code: string): Promise<string> {
  const digest = await subtle().digest("SHA-256", encoder.encode(code));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
