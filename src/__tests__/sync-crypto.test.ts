import { describe, expect, it } from "vitest";
import { decodeInboxPayload, decryptInboxPayload, inboxKeyHash, type InboxPlainItem } from "../sync/crypto";

const CODE = "AB2CDE4FGHJK";
const PLAIN: InboxPlainItem = { kind: "todo", text: "买牛奶", createdAt: 1234 };

/** 存量密文行构造器：与手机端原 encryptInboxPayload 同格式 base64(salt[16]‖nonce[12]‖AES-GCM 密文)。 */
async function legacyCipher(code: string, plain: unknown): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(code), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 600_000, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    new TextEncoder().encode(JSON.stringify(plain)),
  );
  const packed = new Uint8Array(16 + 12 + cipher.byteLength);
  packed.set(salt, 0);
  packed.set(nonce, 16);
  packed.set(new Uint8Array(cipher), 28);
  let binary = "";
  for (let i = 0; i < packed.length; i += 0x8000) binary += String.fromCharCode(...packed.subarray(i, i + 0x8000));
  return btoa(binary);
}

describe("inbox crypto", () => {
  it("inboxKeyHash 返回 64 位 hex 且与码一一对应", async () => {
    const hash = await inboxKeyHash(CODE);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await inboxKeyHash("ZZ9ZZ9ZZ9ZZ9")).not.toBe(hash);
  });
});

describe("decryptInboxPayload（存量密文行）", () => {
  it("正确配对码解密往返", async () => {
    const payload = await legacyCipher(CODE, PLAIN);
    expect(await decryptInboxPayload(CODE, payload)).toEqual(PLAIN);
  });

  it("错误配对码解密返回 null", async () => {
    const payload = await legacyCipher(CODE, PLAIN);
    expect(await decryptInboxPayload("ZZ9ZZ9ZZ9ZZ9", payload)).toBeNull();
  });

  it("非法 base64 或过短输入返回 null", async () => {
    expect(await decryptInboxPayload(CODE, "!!!not-base64!!!")).toBeNull();
    expect(await decryptInboxPayload(CODE, "AAAA")).toBeNull();
  });

  it("明文结构非法（kind/text 缺失）返回 null", async () => {
    const payload = await legacyCipher(CODE, { kind: "other", text: "x", createdAt: 0 });
    expect(await decryptInboxPayload(CODE, payload)).toBeNull();
  });

  it("createdAt 缺失回退为 0", async () => {
    const payload = await legacyCipher(CODE, { kind: "note", text: "x" });
    expect(await decryptInboxPayload(CODE, payload)).toEqual({ kind: "note", text: "x", createdAt: 0 });
  });
});

describe("decodeInboxPayload（明文行优先，密文兜底）", () => {
  it("明文 JSON 行直接解析，无需配对码", async () => {
    const payload = JSON.stringify({ kind: "todo", text: "买牛奶", createdAt: 5 });
    expect(await decodeInboxPayload("whatever", payload)).toEqual({ kind: "todo", text: "买牛奶", createdAt: 5 });
  });

  it("明文 JSON 缺 createdAt 回退为 0", async () => {
    expect(await decodeInboxPayload(CODE, '{"kind":"note","text":"x"}')).toEqual({ kind: "note", text: "x", createdAt: 0 });
  });

  it("明文 JSON 结构非法回退解密路径后返回 null", async () => {
    expect(await decodeInboxPayload(CODE, '{"kind":"other","text":"x"}')).toBeNull();
    expect(await decodeInboxPayload(CODE, "123")).toBeNull();
    expect(await decodeInboxPayload(CODE, "null")).toBeNull();
  });

  it("非 JSON payload 回退解密：存量密文行可用配对码解出", async () => {
    const payload = await legacyCipher(CODE, PLAIN);
    expect(await decodeInboxPayload(CODE, payload)).toEqual(PLAIN);
  });

  it("非 JSON 且非密文返回 null", async () => {
    expect(await decodeInboxPayload(CODE, "AAA")).toBeNull();
  });
});
