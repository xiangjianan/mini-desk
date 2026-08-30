import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultWorkspace } from "../state/defaults";
import type { WorkspaceData, WorkspaceInbox } from "../types";

// 与 sync-pull.test.ts 不同：本文件不 mock ../sync/crypto，走真实解码（明文优先 + 密文兜底）。
vi.mock("../sync/inboxClient", () => ({
  fetchInboxItems: vi.fn(),
}));

import { inboxKeyHash } from "../sync/crypto";
import { fetchInboxItems } from "../sync/inboxClient";
import { applyInboxItems, pullAllInboxes } from "../sync/pull";

const fetchMock = vi.mocked(fetchInboxItems);

const CODE = "AB2CDE4FGHJK";

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

function row(id: string, payload: string, createdAt: number): { id: string; payload: string; createdAt: number } {
  return { id, payload, createdAt };
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe("pullAllInboxes 集成（真实解码）", () => {
  it("明文行与存量密文行混合批次：双路解码均入补丁且水位线推进", async () => {
    const t1 = 1_700_000_000_000;
    const t2 = t1 + 5_000;
    const paired: WorkspaceData = {
      ...defaultWorkspace("mixed"),
      inbox: { code: CODE, todoListId: "morning", noteTarget: "workspace", lastSeenAt: 0 } satisfies WorkspaceInbox,
    };
    // 同一批次：旧密文行（服务端原样转存的存量加密捕获）+ 新明文行（服务端润色后直存）。
    fetchMock.mockResolvedValue([
      row("legacy", await legacyCipher(CODE, { kind: "todo", text: "旧密文待办", createdAt: t1 }), t1),
      row("plain", JSON.stringify({ kind: "note", text: "新明文便签", createdAt: t2 }), t2),
    ]);

    const { patches, reports, changed } = await pullAllInboxes([paired]);
    expect(fetchMock).toHaveBeenCalledWith(await inboxKeyHash(CODE)); // 真实路由键（SHA-256 hex）
    expect(patches).toEqual([
      {
        workspaceId: "mixed",
        plains: [
          { kind: "todo", text: "旧密文待办", createdAt: t1 },
          { kind: "note", text: "新明文便签", createdAt: t2 },
        ],
        lastSeenAt: t2,
      },
    ]);
    expect(reports).toEqual([{ workspaceId: "mixed", imported: 2 }]);
    expect(changed).toBe(true);

    // 调用方按契约重放补丁后，工作区水位线推进到本批最大 createdAt。
    const merged = applyInboxItems(paired, patches[0]!.plains, patches[0]!.lastSeenAt);
    expect(merged.inbox?.lastSeenAt).toBe(t2);
    expect(merged.todos.morning.at(-1)).toMatchObject({ text: "旧密文待办", done: false });
    expect(merged.spaces[0].lines.at(-1)).toEqual({ text: "新明文便签", indent: 0 });
  });
});
