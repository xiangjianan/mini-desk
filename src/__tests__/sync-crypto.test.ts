import { describe, expect, it } from "vitest";
import { decryptInboxPayload, encryptInboxPayload, inboxKeyHash, type InboxPlainItem } from "../sync/crypto";

const CODE = "AB2CDE4FGHJK";
const PLAIN: InboxPlainItem = { kind: "todo", text: "买牛奶", createdAt: 1234 };

describe("inbox crypto", () => {
  it("加解密往返", async () => {
    const payload = await encryptInboxPayload(CODE, PLAIN);
    expect(typeof payload).toBe("string");
    expect(await decryptInboxPayload(CODE, payload)).toEqual(PLAIN);
  });

  it("同一明文两次加密产生不同密文（随机盐+nonce）", async () => {
    const a = await encryptInboxPayload(CODE, PLAIN);
    const b = await encryptInboxPayload(CODE, PLAIN);
    expect(a).not.toBe(b);
  });

  it("错误配对码解密返回 null", async () => {
    const payload = await encryptInboxPayload(CODE, PLAIN);
    expect(await decryptInboxPayload("ZZ9ZZ9ZZ9ZZ9", payload)).toBeNull();
  });

  it("非法 base64 或过短输入返回 null", async () => {
    expect(await decryptInboxPayload(CODE, "!!!not-base64!!!")).toBeNull();
    expect(await decryptInboxPayload(CODE, "AAAA")).toBeNull();
  });

  it("明文结构非法（kind/text 缺失）返回 null", async () => {
    // 用正确码加密一个结构不完整的对象：手工构造 —— 直接加密非法明文
    const payload = await encryptInboxPayload(CODE, { kind: "other", text: "x", createdAt: 0 } as unknown as InboxPlainItem);
    expect(await decryptInboxPayload(CODE, payload)).toBeNull();
  });

  it("明文为 JSON null 返回 null", async () => {
    const payload = await encryptInboxPayload(CODE, null as unknown as InboxPlainItem);
    expect(await decryptInboxPayload(CODE, payload)).toBeNull();
  });

  it("createdAt 缺失回退为 0", async () => {
    const payload = await encryptInboxPayload(CODE, { kind: "note", text: "x" } as unknown as InboxPlainItem);
    expect(await decryptInboxPayload(CODE, payload)).toEqual({ kind: "note", text: "x", createdAt: 0 });
  });

  it("inboxKeyHash 返回 64 位 hex 且与码一一对应", async () => {
    const hash = await inboxKeyHash(CODE);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await inboxKeyHash("ZZ9ZZ9ZZ9ZZ9")).not.toBe(hash);
  });
});
