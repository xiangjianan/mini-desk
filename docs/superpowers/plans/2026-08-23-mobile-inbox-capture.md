# 手机速记（单向收件箱）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 手机扫码打开速记页 → 文字经 E2EE 中转 Worker → 桌面端定时拉取合并到对应工作区（单向、按工作区配对）。

**Architecture:** Cloudflare Worker + KV 只存密文队列（配对码即 AES-GCM 密钥，路由键 = SHA-256(码)）；客户端 `src/sync/` 模块负责加解密、拉取与纯函数合并；`WorkspaceData.inbox?` 存配对配置与 `lastSeenAt` 水位线，随工作区导出/导入迁移。

**Tech Stack:** Vue 3 + Naive UI + TS（现有）；Web Crypto API；Cloudflare Worker + KV（零依赖）；`qrcode`（新依赖，仅桌面配对弹窗）。

**Spec:** `docs/superpowers/specs/2026-08-23-mobile-inbox-capture-design.md`

**关键事实（写代码前先知道）:**
- `WorkspaceData` 定义在 `src/types.ts:136`；`TodoItem = { id, text, done, starred?, notifyAt?, deadlineAt? }`；`LineItem = { text, indent }`。
- `normalizeWorkspaceData` 在 `src/state/storage/normalize.ts:69`；`getSerializableWorkspace` 在 `src/state/storage/serialize.ts:20`，是**显式字段白名单**——新字段必须显式加入，否则导出会丢。
- `createId` 从 `src/state/storage/shared` 导出。
- App.vue 关键锚点：`onMounted` :402、`onUnmounted` :451、Ctrl+S 处理 :2488、移动端壳模板 :3128-3153、`exportWorkspaceById` :740、`importData` :2285、气泡 `showBubble`/`showBubbleText` 来自 `useCompanionBubble`。
- vitest：`vitest.config.ts` 全局 jsdom + `src/test/setup.ts`；worker 测试用 `// @vitest-environment node` docblock 覆盖。
- tsconfig 只包含 `src/**`，`worker/` 不进 vue-tsc 检查（由 wrangler/vitest 编译）。
- 提交信息用 conventional commits，中文描述，无 attribution 尾注。

---

### Task 1: 状态模型 — `WorkspaceInbox` 类型、normalize、serialize

**Files:**
- Modify: `src/types.ts`
- Modify: `src/state/storage/normalize.ts`
- Modify: `src/state/storage/serialize.ts`
- Test: `src/__tests__/workspace-inbox.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `src/__tests__/workspace-inbox.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { defaultWorkspace } from "../state/defaults";
import { normalizeWorkspaceData, normalizeWorkspaceInbox } from "../state/storage/normalize";
import { getSerializableWorkspace } from "../state/storage/serialize";
import type { TodoListConfig, WorkspaceData, WorkspaceInbox } from "../types";

const LISTS: TodoListConfig[] = [
  { id: "morning", title: "上午", collapsed: false, compact: false, column: 0 },
  { id: "evening", title: "晚上", collapsed: false, compact: false, column: 1 },
];

function validInbox(overrides: Partial<WorkspaceInbox> = {}): WorkspaceInbox {
  return { code: "AB2CDE4FGHJK", todoListId: "evening", noteTarget: "note", lastSeenAt: 100, ...overrides };
}

describe("normalizeWorkspaceInbox", () => {
  it("合法配置原样保留", () => {
    expect(normalizeWorkspaceInbox(validInbox(), LISTS)).toEqual(validInbox());
  });

  it("非对象或缺少合法配对码时丢弃整个字段", () => {
    expect(normalizeWorkspaceInbox(undefined, LISTS)).toBeUndefined();
    expect(normalizeWorkspaceInbox("x", LISTS)).toBeUndefined();
    expect(normalizeWorkspaceInbox({ ...validInbox(), code: "short" }, LISTS)).toBeUndefined();
    // 字母表排除 I L O U
    expect(normalizeWorkspaceInbox({ ...validInbox(), code: "ABCDEFGHIJKL" }, LISTS)).toBeUndefined();
  });

  it("todoListId 不在清单中时回退第一个清单", () => {
    expect(normalizeWorkspaceInbox(validInbox({ todoListId: "nope" }), LISTS)?.todoListId).toBe("morning");
  });

  it("noteTarget 非法回退 note，lastSeenAt 非法回退 0", () => {
    const result = normalizeWorkspaceInbox(validInbox({ noteTarget: "other", lastSeenAt: Number.NaN }), LISTS);
    expect(result?.noteTarget).toBe("note");
    expect(result?.lastSeenAt).toBe(0);
  });
});

describe("WorkspaceData.inbox", () => {
  it("defaultWorkspace 不含 inbox 字段", () => {
    expect("inbox" in defaultWorkspace("a")).toBe(false);
  });

  it("normalizeWorkspaceData 透传并清洗 inbox", () => {
    const base = defaultWorkspace("a");
    const workspace = normalizeWorkspaceData({ ...base, inbox: validInbox() }, "zh");
    expect(workspace.inbox).toEqual(validInbox({ todoListId: "morning" })); // defaultWorkspace 的清单是 morning
    const cleaned = normalizeWorkspaceData({ ...base, inbox: { code: "bad" } }, "zh");
    expect(cleaned.inbox).toBeUndefined();
  });

  it("getSerializableWorkspace 深拷贝携带 inbox", () => {
    const workspace: WorkspaceData = { ...defaultWorkspace("a"), inbox: validInbox() };
    const serialized = getSerializableWorkspace(workspace);
    expect(serialized.inbox).toEqual(validInbox());
    expect(serialized.inbox).not.toBe(workspace.inbox);
    expect(getSerializableWorkspace(defaultWorkspace("b")).inbox).toBeUndefined();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/__tests__/workspace-inbox.test.ts`
Expected: FAIL —— `normalizeWorkspaceInbox` 不存在、`inbox` 类型报错。

- [ ] **Step 3: 实现**

`src/types.ts` —— 在 `BoardSyncState`（约 :161）之前插入：

```ts
export type WorkspaceInboxNoteTarget = "note" | "workspace" | "storage";

/**
 * 手机速记（单向收件箱）配对配置。字段存在即启用该工作区的拉取同步。
 * `code` 兼作加密密钥（12 位 Crockford base32）；`lastSeenAt` 是服务端
 * 时间戳水位线，随工作区导出迁移，防止新机器导入后重灌历史条目。
 */
export interface WorkspaceInbox {
  code: string;
  todoListId: TodoListId;
  noteTarget: WorkspaceInboxNoteTarget;
  lastSeenAt: number;
}
```

`WorkspaceData`（:136）末尾 `zoneVisibility: ZoneVisibility;` 之后加一行：

```ts
  inbox?: WorkspaceInbox;
```

`src/state/storage/normalize.ts` —— 在 `normalizeWorkspaceData`（:69）内部 `return` 前的位置使用，并新增函数。修改 `normalizeWorkspaceData` 的 return 对象，在 `zoneVisibility` 之后加：

```ts
    inbox: normalizeWorkspaceInbox(typed.inbox, todoLists),
```

在 `normalizeWorkspaceData` 函数之后新增：

```ts
const INBOX_CODE_PATTERN = /^[0-9A-HJKMNP-TV-Z]{12}$/;

export function normalizeWorkspaceInbox(value: unknown, todoLists: TodoListConfig[]): WorkspaceInbox | undefined {
  if (!isPlainObject(value)) return undefined;
  const typed = value as Record<string, unknown>;
  if (typeof typed.code !== "string" || !INBOX_CODE_PATTERN.test(typed.code)) return undefined;
  const todoListId = todoLists.some((list) => list.id === typed.todoListId)
    ? (typed.todoListId as TodoListId)
    : todoLists[0]?.id;
  if (!todoListId) return undefined;
  const noteTarget: WorkspaceInboxNoteTarget =
    typed.noteTarget === "workspace" || typed.noteTarget === "storage" ? typed.noteTarget : "note";
  const lastSeenAt = typeof typed.lastSeenAt === "number" && Number.isFinite(typed.lastSeenAt) ? typed.lastSeenAt : 0;
  return { code: typed.code, todoListId, noteTarget, lastSeenAt };
}
```

类型导入：`normalize.ts` 顶部 `import type { ... }` 列表中加入 `WorkspaceInbox` 与 `WorkspaceInboxNoteTarget`。

`src/state/storage/serialize.ts` —— `getSerializableWorkspace` 的 return 对象中 `zoneVisibility` 之后加：

```ts
    ...(workspace.inbox ? { inbox: { ...workspace.inbox } } : {}),
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/__tests__/workspace-inbox.test.ts`
Expected: PASS（7 个用例）。

- [ ] **Step 5: 全量回归**

Run: `npm test`
Expected: PASS（现有套件不受影响）。

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/state/storage/normalize.ts src/state/storage/serialize.ts src/__tests__/workspace-inbox.test.ts
git commit -m "feat: WorkspaceData 新增 inbox 配对字段（normalize/serialize 水位线清洗）"
```

---

### Task 2: `src/sync/config.ts` + `pairing.ts`（码生成/校验/地址/fragment）

**Files:**
- Create: `src/sync/config.ts`
- Create: `src/sync/pairing.ts`
- Test: `src/__tests__/sync-pairing.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `src/__tests__/sync-pairing.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { buildInboxAddress, generateInboxCode, isValidInboxCode, parseInboxFragment } from "../sync/pairing";

describe("generateInboxCode", () => {
  it("生成 12 位 Crockford base32（不含 I L O U）", () => {
    for (let i = 0; i < 50; i += 1) {
      const code = generateInboxCode();
      expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{12}$/);
    }
  });

  it("两次生成不重复", () => {
    expect(new Set(Array.from({ length: 20 }, () => generateInboxCode())).size).toBe(20);
  });
});

describe("isValidInboxCode", () => {
  it("接受合法码，拒绝小写/含禁用字母/错误长度/非字符串", () => {
    expect(isValidInboxCode("AB2CDE4FGHJK")).toBe(true);
    expect(isValidInboxCode("ab2cde4fghjk")).toBe(false);
    expect(isValidInboxCode("ABCDEFGHIJKL")).toBe(false);
    expect(isValidInboxCode("AB2CDE4FGHJ")).toBe(false);
    expect(isValidInboxCode(123 as unknown as string)).toBe(false);
  });
});

describe("地址与 fragment", () => {
  it("parseInboxFragment 提取合法码，拒绝非法值", () => {
    expect(parseInboxFragment("#inbox=AB2CDE4FGHJK")).toBe("AB2CDE4FGHJK");
    expect(parseInboxFragment("")).toBeNull();
    expect(parseInboxFragment("#inbox=short")).toBeNull();
    expect(parseInboxFragment("#other=AB2CDE4FGHJK")).toBeNull();
  });

  it("buildInboxAddress 拼装当前 origin + fragment", () => {
    const address = buildInboxAddress("AB2CDE4FGHJK");
    expect(address).toBe(`${window.location.origin}${window.location.pathname}#inbox=AB2CDE4FGHJK`);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/__tests__/sync-pairing.test.ts`
Expected: FAIL —— 模块不存在。

- [ ] **Step 3: 实现**

创建 `src/sync/config.ts`：

```ts
/** 中转 Worker 地址。本地联调用 .env.local 里 VITE_INBOX_WORKER_URL=http://127.0.0.1:8787 覆盖。 */
export const INBOX_WORKER_URL: string =
  (import.meta.env.VITE_INBOX_WORKER_URL as string | undefined) ?? "https://mini-desk-inbox.xiangjianan.workers.dev";

export const INBOX_PLAINTEXT_MAX_CHARS = 500;
export const INBOX_CIPHER_MAX_BYTES = 4096;
export const INBOX_PULL_INTERVAL_MS = 5 * 60 * 1000;
export const INBOX_FOCUS_THROTTLE_MS = 60 * 1000;
```

创建 `src/sync/pairing.ts`：

```ts
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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/__tests__/sync-pairing.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/sync/config.ts src/sync/pairing.ts src/__tests__/sync-pairing.test.ts
git commit -m "feat: 手机速记配对码生成/校验与地址拼装"
```

---

### Task 3: `src/sync/crypto.ts`（PBKDF2 + AES-GCM + keyHash）+ 测试环境 polyfill

**Files:**
- Modify: `src/test/setup.ts`
- Create: `src/sync/crypto.ts`
- Test: `src/__tests__/sync-crypto.test.ts`

- [ ] **Step 1: 测试环境补 Web Crypto**

jsdom 的 `crypto` 没有 `subtle`。在 `src/test/setup.ts` 顶部（`import { vi } from "vitest";` 之后）加：

```ts
import { webcrypto } from "node:crypto";

// jsdom 只提供 getRandomValues；同步加解密测试需要 Node 的 WebCrypto。
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    writable: true,
    value: webcrypto,
  });
}
```

Run: `npx vitest run src/__tests__/messages.test.ts`
Expected: PASS（确认 setup 改动不破坏现有测试）。

- [ ] **Step 2: 写失败测试**

创建 `src/__tests__/sync-crypto.test.ts`：

```ts
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

  it("inboxKeyHash 返回 64 位 hex 且与码一一对应", async () => {
    const hash = await inboxKeyHash(CODE);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await inboxKeyHash("ZZ9ZZ9ZZ9ZZ9")).not.toBe(hash);
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `npx vitest run src/__tests__/sync-crypto.test.ts`
Expected: FAIL —— 模块不存在。

- [ ] **Step 4: 实现**

创建 `src/sync/crypto.ts`：

```ts
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

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveAesKey(code: string, salt: Uint8Array): Promise<CryptoKey> {
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
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npx vitest run src/__tests__/sync-crypto.test.ts`
Expected: PASS（PBKDF2 600k 迭代，单文件约需数秒，属预期）。

- [ ] **Step 6: Commit**

```bash
git add src/test/setup.ts src/sync/crypto.ts src/__tests__/sync-crypto.test.ts
git commit -m "feat: 手机速记端到端加密（配对码派生 AES-GCM，码哈希路由键）"
```

---

### Task 4: 中转 Worker（密文队列）

**Files:**
- Create: `worker/index.ts`
- Create: `worker/wrangler.toml`
- Modify: `package.json`
- Test: `worker/__tests__/inbox-worker.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `worker/__tests__/inbox-worker.test.ts`（文件第一行必须是 node 环境声明）：

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { handleInboxRequest, type InboxEnv, type InboxKVStore } from "../index";

const ORIGIN = "https://todolist.pages.dev";
const KEY = "a".repeat(64);
const OTHER = "b".repeat(64);

class MockKV implements InboxKVStore {
  store = new Map<string, { value: string; metadata?: Record<string, unknown> }>();
  async get(key: string): Promise<string | null> {
    return this.store.get(key)?.value ?? null;
  }
  async put(key: string, value: string, options?: { expirationTtl?: number; metadata?: Record<string, unknown> }): Promise<void> {
    this.store.set(key, { value, metadata: options?.metadata });
  }
  async list(options: { prefix: string }): Promise<{ keys: { name: string; metadata?: Record<string, unknown> }[] }> {
    return {
      keys: Array.from(this.store.keys())
        .filter((name) => name.startsWith(options.prefix))
        .map((name) => ({ name, metadata: this.store.get(name)?.metadata })),
    };
  }
}

function makeEnv(): InboxEnv {
  return { INBOX: new MockKV(), ALLOWED_ORIGINS: `${ORIGIN},http://localhost:5173` };
}

function post(env: InboxEnv, keyHash: string, body: unknown, origin = ORIGIN): Promise<Response> {
  return handleInboxRequest(
    new Request(`https://worker.test/inbox/${keyHash}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify(body),
    }),
    env,
  );
}

function get(env: InboxEnv, keyHash: string, origin = ORIGIN): Promise<Response> {
  return handleInboxRequest(new Request(`https://worker.test/inbox/${keyHash}`, { headers: { Origin: origin } }), env);
}

describe("inbox worker", () => {
  it("POST 后 GET 返回条目并按 createdAt 排序", async () => {
    const env = makeEnv();
    expect((await post(env, KEY, { id: "i1", payload: "AAA" })).status).toBe(200);
    expect((await post(env, KEY, { id: "i2", payload: "BBB" })).status).toBe(200);
    const response = await get(env, KEY);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { items: { id: string; payload: string; createdAt: number }[] };
    expect(body.items.map((item) => item.id)).toEqual(["i1", "i2"]);
    expect(body.items[0].createdAt).toBeGreaterThan(0);
    expect(await response.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
  });

  it("重复 id 覆盖而非新增（幂等重试）", async () => {
    const env = makeEnv();
    await post(env, KEY, { id: "i1", payload: "AAA" });
    await post(env, KEY, { id: "i1", payload: "CCC" });
    const body = (await (await get(env, KEY)).json()) as { items: unknown[] };
    expect(body.items).toHaveLength(1);
  });

  it("非法 keyHash / body 返回 400 或 404", async () => {
    const env = makeEnv();
    expect((await post(env, "XYZ", { id: "i1", payload: "AAA" })).status).toBe(404);
    expect((await post(env, KEY, { id: "", payload: "AAA" })).status).toBe(400);
    expect((await post(env, KEY, { id: "i1" })).status).toBe(400);
  });

  it("超长 payload 返回 413", async () => {
    const env = makeEnv();
    const big = "A".repeat(6000);
    expect((await post(env, KEY, { id: "i1", payload: big })).status).toBe(413);
  });

  it("队列超 200 条且非重复 id 时返回 409", async () => {
    const env = makeEnv();
    for (let i = 0; i < 200; i += 1) {
      await post(env, KEY, { id: `item-${i}`, payload: "AAA" });
    }
    expect((await post(env, KEY, { id: "new", payload: "AAA" })).status).toBe(409);
    expect((await post(env, KEY, { id: "item-0", payload: "BBB" })).status).toBe(200); // 已存在的 id 仍可覆盖
  });

  it("每日 60 条写入限流返回 429", async () => {
    const env = makeEnv();
    for (let i = 0; i < 60; i += 1) {
      await post(env, OTHER, { id: `item-${i}`, payload: "AAA" });
    }
    expect((await post(env, OTHER, { id: "overflow", payload: "AAA" })).status).toBe(429);
  });

  it("CORS：白名单外 Origin 不回显，OPTIONS 返回 204", async () => {
    const env = makeEnv();
    const foreign = await get(env, KEY, "https://evil.example");
    expect(foreign.headers.get("Access-Control-Allow-Origin")).not.toBe("https://evil.example");
    const preflight = await handleInboxRequest(
      new Request(`https://worker.test/inbox/${KEY}`, { method: "OPTIONS", headers: { Origin: ORIGIN } }),
      env,
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run worker/__tests__/inbox-worker.test.ts`
Expected: FAIL —— `worker/index.ts` 不存在。

- [ ] **Step 3: 实现**

创建 `worker/index.ts`：

```ts
/**
 * 手机速记中转 Worker：只存 AES-GCM 密文队列。
 * 路由键是 SHA-256(配对码) 的 hex；条目 TTL 30 天，无账号、无按条删除
 * （多台桌面共用一个码，回收交给 TTL）。幂等：同 id 覆盖。
 */

export interface InboxKVStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number; metadata?: Record<string, unknown> }): Promise<void>;
  list(options: { prefix: string }): Promise<{ keys: { name: string; metadata?: Record<string, unknown> }[] }>;
}

export interface InboxEnv {
  INBOX: InboxKVStore;
  ALLOWED_ORIGINS?: string;
}

const KEY_HASH_PATTERN = /^[0-9a-f]{64}$/;
const MAX_CIPHER_BYTES = 4096;
const MAX_QUEUE_ITEMS = 200;
const DAILY_WRITE_LIMIT = 60;
const ITEM_TTL_SECONDS = 30 * 24 * 60 * 60;
const DAY_TTL_SECONDS = 2 * 24 * 60 * 60;
const MAX_ID_LENGTH = 64;

function corsHeaders(origin: string | null, env: InboxEnv): Record<string, string> {
  const allowed = (env.ALLOWED_ORIGINS ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  const allow = origin && allowed.includes(origin) ? origin : allowed[0] ?? "";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function jsonResponse(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors } });
}

function itemKey(keyHash: string, id: string): string {
  return `${keyHash}:item:${id}`;
}

function dayKey(keyHash: string): string {
  return `${keyHash}:day:${new Date().toISOString().slice(0, 10)}`;
}

export async function handleInboxRequest(request: Request, env: InboxEnv): Promise<Response> {
  const cors = corsHeaders(request.headers.get("Origin"), env);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const url = new URL(request.url);
  const match = /^\/inbox\/([0-9a-f]{64})$/.exec(url.pathname);
  if (!match || !KEY_HASH_PATTERN.test(match[1])) return jsonResponse({ error: "not_found" }, 404, cors);
  const keyHash = match[1];
  if (request.method === "POST") return handlePost(request, env, keyHash, cors);
  if (request.method === "GET") return handleGet(env, keyHash, cors);
  return jsonResponse({ error: "method_not_allowed" }, 405, cors);
}

async function handlePost(request: Request, env: InboxEnv, keyHash: string, cors: Record<string, string>): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "bad_request" }, 400, cors);
  }
  if (typeof body !== "object" || body === null) return jsonResponse({ error: "bad_request" }, 400, cors);
  const { id, payload } = body as Record<string, unknown>;
  if (typeof id !== "string" || !id || id.length > MAX_ID_LENGTH) return jsonResponse({ error: "bad_request" }, 400, cors);
  if (typeof payload !== "string" || !payload) return jsonResponse({ error: "bad_request" }, 400, cors);
  // base64 每 4 字符约 3 字节密文
  if (payload.length * 0.75 > MAX_CIPHER_BYTES) return jsonResponse({ error: "payload_too_large" }, 413, cors);
  const day = dayKey(keyHash);
  const usedToday = Number((await env.INBOX.get(day)) ?? "0");
  if (usedToday >= DAILY_WRITE_LIMIT) return jsonResponse({ error: "rate_limited" }, 429, cors);
  const listed = await env.INBOX.list({ prefix: `${keyHash}:item:` });
  const isRetry = listed.keys.some((key) => key.name === itemKey(keyHash, id));
  if (listed.keys.length >= MAX_QUEUE_ITEMS && !isRetry) return jsonResponse({ error: "queue_full" }, 409, cors);
  await env.INBOX.put(itemKey(keyHash, id), payload, { expirationTtl: ITEM_TTL_SECONDS, metadata: { createdAt: Date.now() } });
  await env.INBOX.put(day, String(usedToday + 1), { expirationTtl: DAY_TTL_SECONDS });
  return jsonResponse({ ok: true }, 200, cors);
}

async function handleGet(env: InboxEnv, keyHash: string, cors: Record<string, string>): Promise<Response> {
  const listed = await env.INBOX.list({ prefix: `${keyHash}:item:` });
  const prefixLength = `${keyHash}:item:`.length;
  const items = (
    await Promise.all(
      listed.keys.map(async (key) => {
        const value = await env.INBOX.get(key.name);
        if (value === null) return null;
        const createdAt = key.metadata?.createdAt;
        return {
          id: key.name.slice(prefixLength),
          payload: value,
          createdAt: typeof createdAt === "number" ? createdAt : 0,
        };
      }),
    )
  )
    .filter((item): item is { id: string; payload: string; createdAt: number } => item !== null)
    .sort((a, b) => a.createdAt - b.createdAt);
  return jsonResponse({ items }, 200, cors);
}

export default {
  async fetch(request: Request, env: InboxEnv): Promise<Response> {
    return handleInboxRequest(request, env);
  },
};
```

`package.json` scripts 加：

```json
    "deploy:worker": "npx wrangler deploy --config worker/wrangler.toml",
```

创建 `worker/wrangler.toml`（`id` 留待 Step 5 填入真实值）：

```toml
name = "mini-desk-inbox"
main = "index.ts"
compatibility_date = "2026-08-23"

[[kv_namespaces]]
binding = "INBOX"
id = "PENDING-KV-NAMESPACE-ID"

[vars]
ALLOWED_ORIGINS = "https://todolist.pages.dev,http://localhost:5173,http://127.0.0.1:5173"
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run worker/__tests__/inbox-worker.test.ts`
Expected: PASS（7 个用例）。

- [ ] **Step 5: 创建 KV namespace 并填入 id**

Run: `npx wrangler kv namespace create INBOX --config worker/wrangler.toml`
Expected: 输出包含 `id = "<64 位 hex>"`。把 `worker/wrangler.toml` 中的 `PENDING-KV-NAMESPACE-ID` 替换为该 id。
（此步需要 Cloudflare 登录；若执行环境未登录，标注留待用户执行，不阻塞后续任务。）

- [ ] **Step 6: Commit**

```bash
git add worker/ package.json
git commit -m "feat: 手机速记中转 Worker（密文队列、限流、幂等、CORS 白名单）"
```

---

### Task 5: `src/sync/inboxClient.ts`（Worker API 客户端）

**Files:**
- Create: `src/sync/inboxClient.ts`
- Test: `src/__tests__/sync-inbox-client.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `src/__tests__/sync-inbox-client.test.ts`：

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchInboxItems, postInboxItem } from "../sync/inboxClient";

const KEY = "a".repeat(64);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("inboxClient", () => {
  it("postInboxItem 成功返回 true，失败/网络错误返回 false", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{\"ok\":true}", { status: 200 })));
    expect(await postInboxItem(KEY, "i1", "AAA")).toBe(true);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 429 })));
    expect(await postInboxItem(KEY, "i1", "AAA")).toBe(false);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    expect(await postInboxItem(KEY, "i1", "AAA")).toBe(false);
  });

  it("fetchInboxItems 解析并过滤结构非法的条目", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ items: [
        { id: "i1", payload: "AAA", createdAt: 1 },
        { id: 42, payload: "BBB", createdAt: 2 },
        "junk",
      ] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )));
    expect(await fetchInboxItems(KEY)).toEqual([{ id: "i1", payload: "AAA", createdAt: 1 }]);
  });

  it("fetchInboxItems 失败返回 null（静默重试交给下次触发）", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 404 })));
    expect(await fetchInboxItems(KEY)).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    expect(await fetchInboxItems(KEY)).toBeNull();
  });

  it("请求打到 /inbox/:keyHash 且 POST 带 JSON body", async () => {
    const fetchMock = vi.fn(async () => new Response("{\"ok\":true}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await postInboxItem(KEY, "i1", "AAA");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url.endsWith(`/inbox/${KEY}`)).toBe(true);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ id: "i1", payload: "AAA" });
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/__tests__/sync-inbox-client.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

创建 `src/sync/inboxClient.ts`：

```ts
import { INBOX_WORKER_URL } from "./config";

export interface InboxStoredItem {
  id: string;
  payload: string;
  createdAt: number;
}

function inboxUrl(keyHash: string): string {
  return `${INBOX_WORKER_URL.replace(/\/+$/, "")}/inbox/${keyHash}`;
}

/** 失败一律返回 false，不抛异常——手机端据此提示重试。 */
export async function postInboxItem(keyHash: string, id: string, payload: string): Promise<boolean> {
  try {
    const response = await fetch(inboxUrl(keyHash), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, payload }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** 失败一律返回 null，不抛异常——桌面端静默等下次触发。 */
export async function fetchInboxItems(keyHash: string): Promise<InboxStoredItem[] | null> {
  try {
    const response = await fetch(inboxUrl(keyHash));
    if (!response.ok) return null;
    const data: unknown = await response.json();
    if (typeof data !== "object" || data === null) return null;
    const items = (data as { items?: unknown }).items;
    if (!Array.isArray(items)) return null;
    return items.flatMap((item): InboxStoredItem[] => {
      if (typeof item !== "object" || item === null) return [];
      const typed = item as Record<string, unknown>;
      if (typeof typed.id !== "string" || typeof typed.payload !== "string" || typeof typed.createdAt !== "number") return [];
      return [{ id: typed.id, payload: typed.payload, createdAt: typed.createdAt }];
    });
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/__tests__/sync-inbox-client.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/sync/inboxClient.ts src/__tests__/sync-inbox-client.test.ts
git commit -m "feat: 手机速记 Worker API 客户端（静默失败语义）"
```

---

### Task 6: `src/sync/pull.ts`（水位线过滤 + 纯函数合并 + 多工作区编排）

**Files:**
- Create: `src/sync/pull.ts`
- Test: `src/__tests__/sync-pull.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `src/__tests__/sync-pull.test.ts`（mock client 与 crypto，避免网络和 PBKDF2 耗时）：

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultWorkspace } from "../state/defaults";
import type { WorkspaceData, WorkspaceInbox } from "../types";

vi.mock("../sync/inboxClient", () => ({
  fetchInboxItems: vi.fn(),
}));
vi.mock("../sync/crypto", () => ({
  inboxKeyHash: vi.fn(async (code: string) => `hash-of-${code}`),
  decryptInboxPayload: vi.fn(async (code: string, payload: string) => {
    if (payload === "BAD") return null;
    const [kind, text, createdAt] = payload.split("|");
    return { kind, text, createdAt: Number(createdAt) };
  }),
}));

import { fetchInboxItems } from "../sync/inboxClient";
import { applyInboxItems, pullAllInboxes } from "../sync/pull";
import type { InboxPlainItem } from "../sync/crypto";

const fetchMock = vi.mocked(fetchInboxItems);

function workspace(id: string, inbox?: WorkspaceInbox): WorkspaceData {
  return { ...defaultWorkspace(id), ...(inbox ? { inbox } : {}) };
}

function inbox(overrides: Partial<WorkspaceInbox> = {}): WorkspaceInbox {
  return { code: "AB2CDE4FGHJK", todoListId: "morning", noteTarget: "note", lastSeenAt: 0, ...overrides };
}

function item(id: string, createdAt: number, payload?: string): { id: string; payload: string; createdAt: number } {
  return { id, payload: payload ?? `todo|条目${id}|${createdAt}`, createdAt };
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe("applyInboxItems", () => {
  it("todo 追加到落点清单为未完成条目，note 追加一行 indent 0，水位线推进", () => {
    const base = workspace("a", inbox({ todoListId: "morning", noteTarget: "note" }));
    const plains: InboxPlainItem[] = [
      { kind: "todo", text: "买牛奶", createdAt: 1 },
      { kind: "note", text: "想法", createdAt: 2 },
    ];
    const merged = applyInboxItems(base, plains, 2);
    expect(merged.todos.morning.at(-1)).toMatchObject({ text: "买牛奶", done: false });
    expect(merged.todos.morning.at(-1)?.id).toBeTruthy();
    expect(merged.noteLines.at(-1)).toEqual({ text: "想法", indent: 0 });
    expect(merged.inbox?.lastSeenAt).toBe(2);
    // 不改原对象（不可变）
    expect(base.todos.morning.at(-1)?.text).not.toBe("买牛奶");
  });

  it("noteTarget 路由到 workspaceLines/storageLines", () => {
    const merged = applyInboxItems(
      workspace("a", inbox({ noteTarget: "storage" })),
      [{ kind: "note", text: "x", createdAt: 1 }],
      1,
    );
    expect(merged.storageLines).toEqual([{ text: "x", indent: 0 }]);
    expect(merged.noteLines).toEqual([]);
  });

  it("todoListId 失效时回退第一个清单；文本裁剪 500 字", () => {
    const merged = applyInboxItems(
      workspace("a", inbox({ todoListId: "ghost" })),
      [{ kind: "todo", text: "y".repeat(600), createdAt: 1 }],
      1,
    );
    expect(merged.todos.morning.at(-1)?.text).toHaveLength(500);
  });
});

describe("pullAllInboxes", () => {
  it("只拉取配置了 inbox 的工作区，解密过滤后合并并出报告", async () => {
    const plain = workspace("plain");
    const paired = workspace("paired", inbox());
    fetchMock.mockResolvedValue([item("i1", 10), item("i2", 20), item("i3", 5)]); // i3 <= lastSeenAt=0? 5>0 会导入——见下个用例
    const { workspaces, reports } = await pullAllInboxes([plain, paired]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("hash-of-AB2CDE4FGHJK");
    expect(workspaces[0]).toBe(plain);
    expect(workspaces[1].todos.morning).toHaveLength(3);
    expect(workspaces[1].inbox?.lastSeenAt).toBe(20);
    expect(reports).toEqual([{ workspaceId: "paired", imported: 3 }]);
  });

  it("水位线跳过已消费条目；解密失败条目跳过但水位线照常推进", async () => {
    const paired = workspace("paired", inbox({ lastSeenAt: 10 }));
    fetchMock.mockResolvedValue([item("i1", 5), item("bad", 15, "BAD"), item("i3", 20)]);
    const { workspaces, reports } = await pullAllInboxes([paired]);
    expect(workspaces[0].todos.morning.map((todo) => todo.text)).toEqual(["条目i3"]);
    expect(workspaces[0].inbox?.lastSeenAt).toBe(20);
    expect(reports).toEqual([{ workspaceId: "paired", imported: 1 }]);
  });

  it("无新条目时只推水位线；拉取失败时原样返回且无报告", async () => {
    const paired = workspace("paired", inbox({ lastSeenAt: 10 }));
    fetchMock.mockResolvedValue([item("i1", 5)]);
    const advanced = await pullAllInboxes([paired]);
    expect(advanced.workspaces[0].inbox?.lastSeenAt).toBe(10); // max(10,5)=10 不变
    expect(advanced.workspaces[0]).not.toBe(paired); // 返回了新数组但内容相同

    fetchMock.mockResolvedValue(null);
    const failed = await pullAllInboxes([paired]);
    expect(failed.workspaces[0]).toBe(paired);
    expect(failed.reports).toEqual([]);
  });

  it("多工作区并发互不影响", async () => {
    const a = workspace("a", inbox({ code: "AAAAAAAAAAAA".replace(/A/g, "A") }));
    const b = workspace("b", inbox({ code: "BBBBBBBBBBBB" }));
    fetchMock.mockImplementation(async (keyHash: string) =>
      keyHash === "hash-of-AAAAAAAAAAAA" ? [item("i1", 10)] : [item("j1", 10), item("j2", 12)],
    );
    const { reports } = await pullAllInboxes([a, b]);
    expect(reports).toEqual([
      { workspaceId: "a", imported: 1 },
      { workspaceId: "b", imported: 2 },
    ]);
  });
});
```

注意：`AAAAAAAAAAAA` 含字母 A，合法（A 在字母表内）。

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/__tests__/sync-pull.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

创建 `src/sync/pull.ts`：

```ts
import { createId } from "../state/storage/shared";
import type { LineItem, TodoListId, WorkspaceData, WorkspaceInbox } from "../types";
import { INBOX_PLAINTEXT_MAX_CHARS } from "./config";
import { decryptInboxPayload, inboxKeyHash, type InboxPlainItem } from "./crypto";
import { fetchInboxItems } from "./inboxClient";

export interface InboxPullReport {
  workspaceId: string;
  imported: number;
}

export interface InboxPullResult {
  workspaces: WorkspaceData[];
  reports: InboxPullReport[];
}

export function applyInboxItems(workspace: WorkspaceData, plains: InboxPlainItem[], lastSeenAt: number): WorkspaceData {
  const inbox = workspace.inbox;
  if (!inbox) return workspace;
  const todos = plains.filter((plain) => plain.kind === "todo");
  const notes = plains.filter((plain) => plain.kind === "note");
  let next: WorkspaceData = { ...workspace, inbox: { ...inbox, lastSeenAt } };
  if (todos.length > 0) {
    const listId = resolveTodoListId(next, inbox.todoListId);
    next = {
      ...next,
      todos: {
        ...next.todos,
        [listId]: [
          ...(next.todos[listId] ?? []),
          ...todos.map((plain) => ({
            id: createId(),
            text: plain.text.slice(0, INBOX_PLAINTEXT_MAX_CHARS),
            done: false,
          })),
        ],
      },
    };
  }
  if (notes.length > 0) {
    const appended: LineItem[] = notes.map((plain) => ({ text: plain.text.slice(0, INBOX_PLAINTEXT_MAX_CHARS), indent: 0 }));
    if (inbox.noteTarget === "workspace") next = { ...next, workspaceLines: [...next.workspaceLines, ...appended] };
    else if (inbox.noteTarget === "storage") next = { ...next, storageLines: [...next.storageLines, ...appended] };
    else next = { ...next, noteLines: [...next.noteLines, ...appended] };
  }
  return next;
}

function resolveTodoListId(workspace: WorkspaceData, preferred: TodoListId): TodoListId {
  return workspace.todoLists.some((list) => list.id === preferred) ? preferred : workspace.todoLists[0]?.id ?? preferred;
}

/** 遍历所有配置了 inbox 的工作区：拉取 → 解密 → 水位线过滤 → 返回合并后的新数组。失败静默，不抛异常。 */
export async function pullAllInboxes(workspaces: WorkspaceData[]): Promise<InboxPullResult> {
  const results = await Promise.allSettled(
    workspaces.map(async (workspace): Promise<{ workspace: WorkspaceData; imported: number } | null> => {
      const inbox = workspace.inbox;
      if (!inbox) return null;
      const stored = await fetchInboxItems(await inboxKeyHash(inbox.code));
      if (!stored) return null;
      const maxSeenAt = stored.reduce((max, entry) => Math.max(max, entry.createdAt), inbox.lastSeenAt);
      if (maxSeenAt <= inbox.lastSeenAt) return null;
      const plains: InboxPlainItem[] = [];
      for (const entry of stored) {
        if (entry.createdAt <= inbox.lastSeenAt) continue;
        const plain = await decryptInboxPayload(inbox.code, entry.payload);
        if (plain) plains.push(plain);
        else console.warn("[inbox] 跳过无法解密的条目", { workspaceId: workspace.id, itemId: entry.id });
      }
      return { workspace: applyInboxItems(workspace, plains, maxSeenAt), imported: plains.length };
    }),
  );
  const reports: InboxPullReport[] = [];
  let changed = false;
  const nextWorkspaces = workspaces.map((workspace, index) => {
    const result = results[index];
    if (result.status !== "fulfilled" || !result.value) return workspace;
    changed = true;
    if (result.value.imported > 0) reports.push({ workspaceId: workspace.id, imported: result.value.imported });
    return result.value.workspace;
  });
  return { workspaces: changed ? nextWorkspaces : workspaces, reports };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/__tests__/sync-pull.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/sync/pull.ts src/__tests__/sync-pull.test.ts
git commit -m "feat: 手机速记拉取合并（水位线去重、按落点路由、多工作区并发）"
```

---

### Task 7: i18n 文案（zh/en 成对）

**Files:**
- Modify: `src/state/i18n.ts`

- [ ] **Step 1: 加 zh 文案**

在 `src/state/i18n.ts` 的 zh `app` 对象中 `mobileDescription: "这个看板为桌面端工作流设计…"`（:537）之后插入：

```ts
      inboxPair: "配对手机",
      inboxDialogTitle: "手机速记配对",
      inboxDialogIntro: "在手机上打开下面的地址（或扫码），输入的内容会发送到这个工作区。",
      inboxCodeLabel: "配对码",
      inboxAddressLabel: "配对地址",
      inboxTodoTargetLabel: "待办落点",
      inboxNoteTargetLabel: "便签落点",
      inboxTargetNote: "便签",
      inboxTargetWorkspace: "工作空间",
      inboxTargetStorage: "仓库",
      inboxGenerate: "生成配对码",
      inboxRotate: "轮换配对码",
      inboxRotateConfirm: "轮换后旧地址立即失效，未读取的条目将无法解密。确定轮换吗？",
      inboxClear: "清除配对",
      inboxClearConfirm: "清除后手机将无法再向这个工作区发送内容。确定清除吗？",
      inboxSave: "保存",
      inboxCancel: "取消",
      inboxSaved: "配对设置已保存",
      inboxCleared: "已清除手机配对",
      inboxReceived: "工作区「{title}」收到 {count} 条来自手机的记录",
      inboxImportNotice: "导入的内容包含配对码；若此文件来自他人，建议在配对设置中轮换配对码。",
      mobileInboxHeading: "手机速记",
      mobileInboxEnterCode: "已有配对码？在这里输入",
      mobileInboxCodePlaceholder: "12 位配对码",
      mobileInboxCodeConfirm: "开始记录",
      mobileInboxCodeInvalid: "配对码格式不对，请检查后重试",
      mobileInboxTodo: "提醒事项",
      mobileInboxNote: "便签",
      mobileInboxPlaceholder: "记点什么…",
      mobileInboxSend: "发送",
      mobileInboxSending: "发送中…",
      mobileInboxSent: "已发送，回到电脑端就能看到 (｡•̀ᴗ-)✧",
      mobileInboxError: "发送失败，请稍后重试",
```

- [ ] **Step 2: 加 en 文案**

在 en `app` 对象中 `mobileDescription: "This board is designed for desktop workflows…"`（:874）之后插入成对文案：

```ts
      inboxPair: "Pair phone",
      inboxDialogTitle: "Mobile capture pairing",
      inboxDialogIntro: "Open the address below on your phone (or scan the code); whatever you type there lands in this workspace.",
      inboxCodeLabel: "Pairing code",
      inboxAddressLabel: "Pairing address",
      inboxTodoTargetLabel: "Todo destination",
      inboxNoteTargetLabel: "Note destination",
      inboxTargetNote: "Notes",
      inboxTargetWorkspace: "Workspace",
      inboxTargetStorage: "Storage",
      inboxGenerate: "Generate code",
      inboxRotate: "Rotate code",
      inboxRotateConfirm: "Rotating invalidates the old address immediately and unread items become undecryptable. Rotate anyway?",
      inboxClear: "Clear pairing",
      inboxClearConfirm: "After clearing, phones can no longer send to this workspace. Clear anyway?",
      inboxSave: "Save",
      inboxCancel: "Cancel",
      inboxSaved: "Pairing settings saved",
      inboxCleared: "Phone pairing cleared",
      inboxReceived: "Workspace \"{title}\" received {count} item(s) from your phone",
      inboxImportNotice: "The imported data contains a pairing code; if this file came from someone else, rotate it in pairing settings.",
      mobileInboxHeading: "Quick capture",
      mobileInboxEnterCode: "Have a pairing code? Enter it here",
      mobileInboxCodePlaceholder: "12-character code",
      mobileInboxCodeConfirm: "Start capturing",
      mobileInboxCodeInvalid: "That code doesn't look right; please check and retry",
      mobileInboxTodo: "Reminder",
      mobileInboxNote: "Note",
      mobileInboxPlaceholder: "Type something…",
      mobileInboxSend: "Send",
      mobileInboxSending: "Sending…",
      mobileInboxSent: "Sent! Check your desktop board (｡•̀ᴗ-)✧",
      mobileInboxError: "Failed to send; please retry",
```

- [ ] **Step 3: 跑 i18n 与类型检查**

Run: `npx vitest run src/__tests__/i18n.test.ts && npx vue-tsc --noEmit`
Expected: PASS / 无错误（zh/en key 对齐）。

- [ ] **Step 4: Commit**

```bash
git add src/state/i18n.ts
git commit -m "feat: 手机速记中英文案"
```

---

### Task 8: 配对弹窗 + 工作区菜单入口 + App 接线

**Files:**
- Modify: `package.json`（依赖）
- Create: `src/components/WorkspaceInboxDialog.vue`
- Modify: `src/components/WorkspaceSwitcher.vue`
- Modify: `src/App.vue`
- Test: `src/__tests__/workspace-inbox-dialog.test.ts`
- Test: `src/__tests__/workspace-switcher.test.ts`（追加用例）

- [ ] **Step 1: 安装依赖**

```bash
npm install qrcode && npm install -D @types/qrcode
```

- [ ] **Step 2: 写失败测试**

创建 `src/__tests__/workspace-inbox-dialog.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import WorkspaceInboxDialog from "../components/WorkspaceInboxDialog.vue";
import { defaultWorkspace } from "../state/defaults";
import type { WorkspaceInbox } from "../types";

const INBOX: WorkspaceInbox = { code: "AB2CDE4FGHJK", todoListId: "morning", noteTarget: "note", lastSeenAt: 42 };

function mountDialog(inbox?: WorkspaceInbox) {
  return mount(WorkspaceInboxDialog, {
    props: { workspace: { ...defaultWorkspace("a"), ...(inbox ? { inbox } : {}) }, language: "zh" },
  });
}

describe("WorkspaceInboxDialog", () => {
  it("无配对时显示生成按钮，点击生成合法码", async () => {
    const wrapper = mountDialog();
    expect(wrapper.text()).toContain("生成配对码");
    await wrapper.find('[data-testid="inbox-generate"]').trigger("click");
    expect(wrapper.find('[data-testid="inbox-code"]').text()).toMatch(/^[0-9A-HJKMNP-TV-Z]{12}$/);
  });

  it("已配对时展示码与含 #inbox= 的地址", () => {
    const wrapper = mountDialog(INBOX);
    expect(wrapper.find('[data-testid="inbox-code"]').text()).toBe("AB2CDE4FGHJK");
    expect(wrapper.find('[data-testid="inbox-address"]').text()).toContain("#inbox=AB2CDE4FGHJK");
  });

  it("保存时 emit update 并保留水位线与落点", async () => {
    const wrapper = mountDialog(INBOX);
    await wrapper.find('[data-testid="inbox-save"]').trigger("click");
    const emitted = wrapper.emitted("update");
    expect(emitted).toHaveLength(1);
    expect(emitted?.[0]?.[0]).toEqual(INBOX);
  });

  it("清除配对（confirm 通过）emit update(null)", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const wrapper = mountDialog(INBOX);
    await wrapper.find('[data-testid="inbox-clear"]').trigger("click");
    expect(wrapper.emitted("update")?.[0]?.[0]).toBeNull();
  });
});
```

文件顶部补 `import { vi } from "vitest";`（与第一行 import 合并）。

`src/__tests__/workspace-switcher.test.ts` 末尾追加：

```ts
describe("WorkspaceSwitcher 配对入口", () => {
  it("每个工作区提供配对手机按钮并 emit pairInbox", async () => {
    const wrapper = mount(WorkspaceSwitcher, {
      props: { workspaces, activeWorkspaceId: "a", theme: "light", language: "zh" },
    });
    await wrapper.find('[data-testid="workspace-trigger"]').trigger("click");
    await wrapper.find('[data-testid="workspace-pair-a"]').trigger("click");
    expect(wrapper.emitted("pairInbox")).toHaveLength(1);
    expect(wrapper.emitted("pairInbox")?.[0]).toEqual(["a"]);
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `npx vitest run src/__tests__/workspace-inbox-dialog.test.ts src/__tests__/workspace-switcher.test.ts`
Expected: FAIL —— 组件/入口不存在。

- [ ] **Step 4: 实现 WorkspaceInboxDialog.vue**

创建 `src/components/WorkspaceInboxDialog.vue`：

```vue
<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { NButton, NModal, NSelect } from "naive-ui";
import QRCode from "qrcode";
import { getUiText } from "../state/i18n";
import { buildInboxAddress, generateInboxCode, isValidInboxCode } from "../sync/pairing";
import type { AppLanguage, TodoListId, WorkspaceData, WorkspaceInbox } from "../types";

const props = defineProps<{
  workspace: WorkspaceData;
  language: AppLanguage;
}>();

const emit = defineEmits<{
  update: [inbox: WorkspaceInbox | null];
  close: [];
}>();

const text = computed(() => getUiText(props.language));
const code = ref(props.workspace.inbox?.code ?? "");
const todoListId = ref<TodoListId>(props.workspace.inbox?.todoListId ?? props.workspace.todoLists[0]?.id ?? "morning");
const noteTarget = ref<WorkspaceInbox["noteTarget"]>(props.workspace.inbox?.noteTarget ?? "note");
const show = ref(true);
const canvasRef = ref<HTMLCanvasElement | null>(null);

const address = computed(() => (isValidInboxCode(code.value) ? buildInboxAddress(code.value) : ""));
const todoOptions = computed(() => props.workspace.todoLists.map((list) => ({ label: list.title, value: list.id })));
const noteOptions = computed(() => [
  { label: text.value.app.inboxTargetNote, value: "note" as const },
  { label: text.value.app.inboxTargetWorkspace, value: "workspace" as const },
  { label: text.value.app.inboxTargetStorage, value: "storage" as const },
]);

onMounted(() => {
  void renderQr(address.value);
});
watch(address, (value) => {
  void renderQr(value);
});

async function renderQr(value: string): Promise<void> {
  const canvas = canvasRef.value;
  if (!canvas || !value) return;
  try {
    await QRCode.toCanvas(canvas, value, { width: 148 });
  } catch {
    // 测试环境无 canvas 上下文；地址文本仍然可见可用。
  }
}

function generate(): void {
  code.value = generateInboxCode();
}

function rotate(): void {
  if (!window.confirm(text.value.app.inboxRotateConfirm)) return;
  code.value = generateInboxCode();
}

function clear(): void {
  if (!window.confirm(text.value.app.inboxClearConfirm)) return;
  emit("update", null);
}

function save(): void {
  if (!isValidInboxCode(code.value)) return;
  emit("update", {
    code: code.value,
    todoListId: todoListId.value,
    noteTarget: noteTarget.value,
    lastSeenAt: props.workspace.inbox?.lastSeenAt ?? 0,
  });
}
</script>

<template>
  <NModal
    :show="show"
    preset="card"
    class="workspace-inbox-dialog"
    :title="text.app.inboxDialogTitle"
    style="width: min(360px, 92vw)"
    @update:show="emit('close')"
  >
    <p class="workspace-inbox-intro">{{ text.app.inboxDialogIntro }}</p>

    <div v-if="!isValidInboxCode(code)" class="workspace-inbox-empty">
      <NButton size="small" type="primary" data-testid="inbox-generate" @click="generate">
        {{ text.app.inboxGenerate }}
      </NButton>
    </div>

    <template v-else>
      <div class="workspace-inbox-field">
        <span class="workspace-inbox-label">{{ text.app.inboxCodeLabel }}</span>
        <span class="workspace-inbox-code" data-testid="inbox-code">{{ code }}</span>
        <button type="button" class="workspace-inbox-rotate" data-testid="inbox-rotate" @click="rotate">
          {{ text.app.inboxRotate }}
        </button>
      </div>
      <div class="workspace-inbox-field">
        <span class="workspace-inbox-label">{{ text.app.inboxAddressLabel }}</span>
        <span class="workspace-inbox-address" data-testid="inbox-address">{{ address }}</span>
      </div>
      <canvas ref="canvasRef" class="workspace-inbox-qr" width="148" height="148" aria-hidden="true" />
      <div class="workspace-inbox-field">
        <span class="workspace-inbox-label">{{ text.app.inboxTodoTargetLabel }}</span>
        <NSelect v-model:value="todoListId" size="small" :options="todoOptions" />
      </div>
      <div class="workspace-inbox-field">
        <span class="workspace-inbox-label">{{ text.app.inboxNoteTargetLabel }}</span>
        <NSelect v-model:value="noteTarget" size="small" :options="noteOptions" />
      </div>
    </template>

    <template #footer>
      <div class="workspace-inbox-footer">
        <NButton v-if="isValidInboxCode(code)" size="small" quaternary type="error" data-testid="inbox-clear" @click="clear">
          {{ text.app.inboxClear }}
        </NButton>
        <NButton size="small" data-testid="inbox-close" @click="emit('close')">
          {{ text.app.inboxCancel }}
        </NButton>
        <NButton size="small" type="primary" :disabled="!isValidInboxCode(code)" data-testid="inbox-save" @click="save">
          {{ text.app.inboxSave }}
        </NButton>
      </div>
    </template>
  </NModal>
</template>
```

- [ ] **Step 5: 实现 WorkspaceSwitcher 入口**

`src/components/WorkspaceSwitcher.vue`：
1. 图标导入行加入 `PhonePortraitOutline`。
2. emits 类型加 `pairInbox: [id: string];`。
3. `handleExport` 之后新增：

```ts
function handlePair(event: MouseEvent, id: string): void {
  event.stopPropagation();
  emit("pairInbox", id);
  close();
}
```

4. 模板中导出按钮（`data-testid="workspace-export-..."`）之后插入：

```html
            <button
              type="button"
              class="workspace-switcher-action"
              :data-testid="`workspace-pair-${workspace.id}`"
              :aria-label="text.app.inboxPair"
              @click="handlePair($event, workspace.id)"
            >
              <NIcon :component="PhonePortraitOutline" size="14" />
            </button>
```

- [ ] **Step 6: App.vue 接线**

`src/App.vue`：
1. 导入区加：

```ts
import WorkspaceInboxDialog from "./components/WorkspaceInboxDialog.vue";
import type { WorkspaceInbox } from "./types";
```

（`WorkspaceData` 等类型按现有导入情况合并。）

2. 状态区（`workspaceDraftSlogan` 附近）加：

```ts
const inboxPairingWorkspaceId = ref<string | null>(null);
const inboxPairTarget = computed(() =>
  state.workspaces.find((workspace) => workspace.id === inboxPairingWorkspaceId.value) ?? null,
);
```

3. `exportWorkspaceById` 附近新增：

```ts
function handleInboxUpdate(inbox: WorkspaceInbox | null): void {
  const id = inboxPairingWorkspaceId.value;
  if (!id) return;
  state.workspaces = state.workspaces.map((workspace) => {
    if (workspace.id !== id) return workspace;
    if (!inbox) {
      const next: WorkspaceData = { ...workspace };
      delete next.inbox;
      return next;
    }
    return { ...workspace, inbox };
  });
  persistNow();
  showBubbleText(inbox ? uiText.value.app.inboxSaved : uiText.value.app.inboxCleared, undefined, { hideCompanionAfter: true });
  inboxPairingWorkspaceId.value = null;
}
```

（`WorkspaceData` 类型若未导入则加入 type import。）

4. 模板 `<WorkspaceSwitcher ... @export-workspace="exportWorkspaceById"` 处加事件：

```html
          @pair-inbox="(id: string) => { inboxPairingWorkspaceId = id; }"
```

5. 模板 `<ImagePreview` 之前插入：

```html
    <WorkspaceInboxDialog
      v-if="inboxPairTarget"
      :workspace="inboxPairTarget"
      :language="state.language"
      @update="handleInboxUpdate"
      @close="inboxPairingWorkspaceId = null"
    />
```

- [ ] **Step 7: 追加样式**

`src/styles.css` 末尾追加：

```css
/* ---- 手机速记配对弹窗 ---- */
.workspace-inbox-intro {
  margin: 0 0 10px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.6;
}
.workspace-inbox-field {
  display: grid;
  grid-template-columns: 64px 1fr;
  align-items: center;
  gap: 8px;
  margin: 8px 0;
}
.workspace-inbox-label {
  color: var(--muted);
  font-size: 12px;
}
.workspace-inbox-code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 2px;
  font-weight: 600;
}
.workspace-inbox-rotate {
  justify-self: end;
  border: none;
  background: none;
  color: var(--primary);
  font-size: 12px;
  cursor: pointer;
  padding: 2px 4px;
}
.workspace-inbox-address {
  font-size: 11px;
  color: var(--muted);
  word-break: break-all;
  user-select: all;
}
.workspace-inbox-qr {
  display: block;
  margin: 8px auto;
  border: 1px solid var(--line-subtle);
  border-radius: 8px;
}
.workspace-inbox-empty {
  display: flex;
  justify-content: center;
  padding: 12px 0;
}
.workspace-inbox-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
```

- [ ] **Step 8: 跑测试确认通过**

Run: `npx vitest run src/__tests__/workspace-inbox-dialog.test.ts src/__tests__/workspace-switcher.test.ts && npx vue-tsc --noEmit`
Expected: PASS / 无类型错误。

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json src/components/WorkspaceInboxDialog.vue src/components/WorkspaceSwitcher.vue src/App.vue src/styles.css src/__tests__/workspace-inbox-dialog.test.ts src/__tests__/workspace-switcher.test.ts
git commit -m "feat: 工作区配对弹窗（生成/轮换/清除配对码、二维码、落点选择）"
```

---

### Task 9: 桌面端拉取接线（启动/聚焦/定时/Ctrl+S + 气泡）

**Files:**
- Modify: `src/App.vue`

（核心逻辑已在 Task 6 测试覆盖；本任务是纯接线，验证方式为全量回归 + 手动验证。）

- [ ] **Step 1: 导入与状态**

`src/App.vue` 导入区加：

```ts
import { pullAllInboxes } from "./sync/pull";
import { INBOX_FOCUS_THROTTLE_MS, INBOX_PULL_INTERVAL_MS } from "./sync/config";
import { getWorkspaceBoardTitle } from "./state/workspaces";
```

（`getWorkspaceBoardTitle` 若已导入则跳过。）

状态区加：

```ts
let inboxPullTimer: number | undefined;
let inboxLastPullAt = 0;
const hasInboxConfigured = computed(() => state.workspaces.some((workspace) => workspace.inbox));
```

- [ ] **Step 2: 拉取函数**

`handleInboxUpdate` 之后新增：

```ts
async function pullInboxes(): Promise<void> {
  if (!appMounted || !hasInboxConfigured.value) return;
  inboxLastPullAt = Date.now();
  const { workspaces, reports } = await pullAllInboxes(state.workspaces);
  if (workspaces !== state.workspaces) {
    state.workspaces = workspaces;
    persistNow();
  }
  for (const report of reports) {
    const workspace = workspaces.find((item) => item.id === report.workspaceId);
    if (!workspace) continue;
    showBubbleText(
      uiText.value.app.inboxReceived.replace("{title}", getWorkspaceBoardTitle(workspace)).replace("{count}", String(report.imported)),
      undefined,
      { hideCompanionAfter: true },
    );
  }
}

function startInboxPolling(): void {
  if (inboxPullTimer !== undefined) return;
  inboxPullTimer = window.setInterval(() => {
    void pullInboxes();
  }, INBOX_PULL_INTERVAL_MS);
}

function stopInboxPolling(): void {
  if (inboxPullTimer === undefined) return;
  window.clearInterval(inboxPullTimer);
  inboxPullTimer = undefined;
}

function handleWindowFocusInbox(): void {
  if (Date.now() - inboxLastPullAt < INBOX_FOCUS_THROTTLE_MS) return;
  void pullInboxes();
}
```

- [ ] **Step 3: 生命周期接线**

`onMounted`（:402）内 `startVersionPolling();` 之前加：

```ts
  window.addEventListener("focus", handleWindowFocusInbox);
  if (hasInboxConfigured.value) {
    void pullInboxes();
    startInboxPolling();
  }
```

`onUnmounted`（:451）内 `teardownMobileBreakpoint();` 之前加：

```ts
  window.removeEventListener("focus", handleWindowFocusInbox);
  stopInboxPolling();
```

配置变化时启停定时器（放在 `pullInboxes` 定义之后）：

```ts
watch(hasInboxConfigured, (configured) => {
  if (configured) startInboxPolling();
  else stopInboxPolling();
});
```

- [ ] **Step 4: Ctrl+S 顺带拉取**

`handleGlobalKeydown` 的 Ctrl+S 分支（:2488-2493）改为：

```ts
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    flushTodoSave();
    flushTextSave();
    showSaveBubble();
    void pullInboxes();
  }
```

- [ ] **Step 5: 全量回归**

Run: `npm test && npx vue-tsc --noEmit`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add src/App.vue
git commit -m "feat: 桌面端收件箱拉取接线（启动/聚焦节流/定时/Ctrl+S，气泡提示）"
```

---

### Task 10: 手机端速记页

**Files:**
- Create: `src/components/MobileInboxCapture.vue`
- Modify: `src/App.vue`
- Modify: `src/styles.css`
- Test: `src/__tests__/mobile-inbox-capture.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `src/__tests__/mobile-inbox-capture.test.ts`：

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import MobileInboxCapture from "../components/MobileInboxCapture.vue";

const postMock = vi.fn(async () => true);

vi.mock("../sync/inboxClient", () => ({
  postInboxItem: (...args: unknown[]) => postMock(...(args as [string, string, string])),
}));

beforeEach(() => {
  postMock.mockClear();
  postMock.mockResolvedValue(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function mountCapture() {
  return mount(MobileInboxCapture, { props: { code: "AB2CDE4FGHJK", language: "zh" } });
}

async function fillAndSend(wrapper: ReturnType<typeof mountCapture>, text: string) {
  await wrapper.find('[data-testid="mobile-inbox-text"]').setValue(text);
  await wrapper.find('[data-testid="mobile-inbox-send"]').trigger("click");
}

describe("MobileInboxCapture", () => {
  it("渲染待办/便签切换与输入框", () => {
    const wrapper = mountCapture();
    expect(wrapper.text()).toContain("提醒事项");
    expect(wrapper.text()).toContain("便签");
    expect(wrapper.find('[data-testid="mobile-inbox-text"]').exists()).toBe(true);
  });

  it("提交加密 payload 到码的哈希路由并显示成功，清空输入", async () => {
    const wrapper = mountCapture();
    await fillAndSend(wrapper, "买牛奶");
    expect(postMock).toHaveBeenCalledTimes(1);
    const [keyHash, , payload] = postMock.mock.calls[0] as [string, string, string];
    expect(keyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(typeof payload).toBe("string");
    expect(payload.length).toBeGreaterThan(40);
    expect(wrapper.text()).toContain("已发送");
    expect((wrapper.find('[data-testid="mobile-inbox-text"]').element as HTMLTextAreaElement).value).toBe("");
  });

  it("空文本不提交；发送失败显示错误并保留文本", async () => {
    const wrapper = mountCapture();
    await fillAndSend(wrapper, "   ");
    expect(postMock).not.toHaveBeenCalled();

    postMock.mockResolvedValue(false);
    await fillAndSend(wrapper, "买牛奶");
    expect(wrapper.text()).toContain("发送失败");
    expect((wrapper.find('[data-testid="mobile-inbox-text"]').element as HTMLTextAreaElement).value).toBe("买牛奶");
  });

  it("切换到便签后 kind 为 note（通过解密回验 payload）", async () => {
    const wrapper = mountCapture();
    await wrapper.find('[data-testid="mobile-inbox-kind-note"]').trigger("click");
    await fillAndSend(wrapper, "一个想法");
    const [, , payload] = postMock.mock.calls[0] as [string, string, string];
    const { decryptInboxPayload } = await import("../sync/crypto");
    const plain = await decryptInboxPayload("AB2CDE4FGHJK", payload);
    expect(plain).toMatchObject({ kind: "note", text: "一个想法" });
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/__tests__/mobile-inbox-capture.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现 MobileInboxCapture.vue**

创建 `src/components/MobileInboxCapture.vue`：

```vue
<script setup lang="ts">
import { computed, ref } from "vue";
import { NButton } from "naive-ui";
import { getUiText } from "../state/i18n";
import { createId } from "../state/storage/shared";
import { INBOX_PLAINTEXT_MAX_CHARS } from "../sync/config";
import { encryptInboxPayload, inboxKeyHash, type InboxPlainItem } from "../sync/crypto";
import { postInboxItem } from "../sync/inboxClient";
import type { AppLanguage } from "../types";

const props = defineProps<{
  code: string;
  language: AppLanguage;
}>();

const text = computed(() => getUiText(props.language));
const kind = ref<InboxPlainItem["kind"]>("todo");
const draft = ref("");
const status = ref<"idle" | "sending" | "sent" | "error">("idle");

async function send(): Promise<void> {
  const trimmed = draft.value.trim().slice(0, INBOX_PLAINTEXT_MAX_CHARS);
  if (!trimmed || status.value === "sending") return;
  status.value = "sending";
  try {
    const payload = await encryptInboxPayload(props.code, { kind: kind.value, text: trimmed, createdAt: Date.now() });
    const ok = await postInboxItem(await inboxKeyHash(props.code), createId(), payload);
    if (ok) {
      status.value = "sent";
      draft.value = "";
    } else {
      status.value = "error";
    }
  } catch {
    status.value = "error";
  }
}
</script>

<template>
  <section class="mobile-inbox-form" :aria-label="text.app.mobileInboxHeading">
    <h2 class="mobile-inbox-heading">{{ text.app.mobileInboxHeading }}</h2>
    <div class="mobile-inbox-toggle" role="tablist">
      <button
        type="button"
        role="tab"
        :aria-selected="kind === 'todo'"
        :class="{ 'is-active': kind === 'todo' }"
        data-testid="mobile-inbox-kind-todo"
        @click="kind = 'todo'"
      >
        {{ text.app.mobileInboxTodo }}
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="kind === 'note'"
        :class="{ 'is-active': kind === 'note' }"
        data-testid="mobile-inbox-kind-note"
        @click="kind = 'note'"
      >
        {{ text.app.mobileInboxNote }}
      </button>
    </div>
    <textarea
      v-model="draft"
      class="mobile-inbox-textarea"
      data-testid="mobile-inbox-text"
      :placeholder="text.app.mobileInboxPlaceholder"
      rows="4"
      maxlength="500"
    />
    <NButton
      size="small"
      type="primary"
      block
      data-testid="mobile-inbox-send"
      :loading="status === 'sending'"
      @click="send"
    >
      {{ status === "sending" ? text.app.mobileInboxSending : text.app.mobileInboxSend }}
    </NButton>
    <p class="mobile-inbox-status" :data-status="status">
      {{ status === "sent" ? text.app.mobileInboxSent : status === "error" ? text.app.mobileInboxError : "" }}
    </p>
  </section>
</template>
```

- [ ] **Step 4: App.vue 移动端集成**

`src/App.vue`：
1. 导入区加：

```ts
import MobileInboxCapture from "./components/MobileInboxCapture.vue";
import { buildInboxAddress, isValidInboxCode, parseInboxFragment } from "./sync/pairing";
```

2. `isMobileBlocked`（:270）附近加状态与处理：

```ts
const mobileInboxCode = ref<string | null>(parseInboxFragment(window.location.hash));
const mobileInboxDraftCode = ref("");

function handleHashChange(): void {
  const code = parseInboxFragment(window.location.hash);
  if (code) mobileInboxCode.value = code;
}

function confirmMobileInboxCode(): void {
  const code = mobileInboxDraftCode.value.trim().toUpperCase();
  if (!isValidInboxCode(code)) {
    showBubbleText(uiText.value.app.mobileInboxCodeInvalid, undefined, { hideCompanionAfter: true });
    return;
  }
  mobileInboxCode.value = code;
  window.location.hash = `#inbox=${code}`;
}
```

3. `onMounted` 中 `window.addEventListener("focus", handleWindowFocusInbox);` 之后加：

```ts
  window.addEventListener("hashchange", handleHashChange);
```

`onUnmounted` 对应位置加 `window.removeEventListener("hashchange", handleHashChange);`。

4. 移动端模板（:3146-3152）把 `.mobile-handoff-body` 内部替换为：

```html
      <section class="mobile-handoff-body" aria-labelledby="mobile-handoff-title">
        <div v-if="mobileInboxCode" class="mobile-inbox-wrap">
          <MobileInboxCapture :code="mobileInboxCode" :language="state.language" />
        </div>
        <div v-else class="mobile-handoff-message">
          <h2 id="mobile-handoff-title">{{ uiText.app.mobileHeading }}</h2>
          <p>{{ uiText.app.mobileDescription }}</p>
          <p>{{ uiText.app.mobileMessage }}</p>
          <div class="mobile-inbox-code-entry">
            <span class="mobile-inbox-code-label">{{ uiText.app.mobileInboxEnterCode }}</span>
            <input
              v-model="mobileInboxDraftCode"
              class="mobile-inbox-code-input"
              type="text"
              :placeholder="uiText.app.mobileInboxCodePlaceholder"
              maxlength="12"
              autocomplete="off"
              @keydown.enter="confirmMobileInboxCode"
            />
            <NButton size="tiny" type="primary" @click="confirmMobileInboxCode">
              {{ uiText.app.mobileInboxCodeConfirm }}
            </NButton>
          </div>
        </div>
      </section>
```

- [ ] **Step 5: 追加样式**

`src/styles.css` 末尾追加：

```css
/* ---- 手机速记表单 ---- */
.mobile-inbox-wrap {
  width: 100%;
  display: flex;
  justify-content: center;
}
.mobile-inbox-form {
  display: grid;
  gap: 10px;
  width: min(320px, 86vw);
}
.mobile-inbox-heading {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}
.mobile-inbox-toggle {
  display: inline-flex;
  border: 1px solid var(--line-main);
  border-radius: 8px;
  overflow: hidden;
}
.mobile-inbox-toggle button {
  flex: 1;
  padding: 6px 0;
  border: none;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  cursor: pointer;
}
.mobile-inbox-toggle button.is-active {
  background: var(--accent);
  color: var(--accent-foreground);
  font-weight: 600;
}
.mobile-inbox-textarea {
  width: 100%;
  min-height: 88px;
  resize: vertical;
  border: 1px solid var(--line-main);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 13px;
  font-family: inherit;
  background: var(--panel);
  color: var(--text);
}
.mobile-inbox-status {
  min-height: 18px;
  margin: 0;
  font-size: 12px;
  color: var(--muted);
  text-align: center;
}
.mobile-inbox-status[data-status="error"] {
  color: var(--destructive);
}
.mobile-inbox-code-entry {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px dashed var(--line-subtle);
}
.mobile-inbox-code-label {
  font-size: 12px;
  color: var(--muted);
}
.mobile-inbox-code-entry .n-button {
  align-self: flex-end;
}
.mobile-inbox-code-input {
  border: 1px solid var(--line-main);
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 13px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 2px;
  background: var(--panel);
  color: var(--text);
}
```

- [ ] **Step 6: 跑测试确认通过**

Run: `npx vitest run src/__tests__/mobile-inbox-capture.test.ts && npm test`
Expected: PASS（全量含既有移动端壳测试——若 `workbench-shell`/渲染断言因模板改动失败，按新结构修正断言，不改产品行为）。

- [ ] **Step 7: Commit**

```bash
git add src/components/MobileInboxCapture.vue src/App.vue src/styles.css src/__tests__/mobile-inbox-capture.test.ts
git commit -m "feat: 移动端速记表单（配对码 fragment 解析、待办/便签切换、加密提交）"
```

---

### Task 11: 导入带配对码的安全提示

**Files:**
- Modify: `src/App.vue`
- Test: `src/__tests__/workspace-inbox.test.ts`（追加 helper 用例——helper 放 App 外不现实，此处以纯函数形式放 `src/sync/pairing.ts`）

**调整：** 为可测试性，helper 放 `src/sync/pairing.ts`。

- [ ] **Step 1: 写失败测试**

`src/__tests__/sync-pairing.test.ts` 追加：

```ts
import { importedPayloadHasInbox } from "../sync/pairing";

describe("importedPayloadHasInbox", () => {
  it("识别单工作区与多工作区导出中的 inbox", () => {
    expect(importedPayloadHasInbox({ workspace: { inbox: { code: "AB2CDE4FGHJK" } } })).toBe(true);
    expect(importedPayloadHasInbox({ workspaces: [{}, { inbox: { code: "AB2CDE4FGHJK" } }] })).toBe(true);
  });

  it("无 inbox 或结构非法返回 false", () => {
    expect(importedPayloadHasInbox({ workspace: {} })).toBe(false);
    expect(importedPayloadHasInbox({ workspaces: [{ inbox: null }] })).toBe(false);
    expect(importedPayloadHasInbox("junk")).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/__tests__/sync-pairing.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现 helper**

`src/sync/pairing.ts` 末尾追加：

```ts
/** 导入载荷（单工作区 `workspace` 或全量 `workspaces[]`）是否携带配对码——用于导入后的轮换提醒。 */
export function importedPayloadHasInbox(parsed: unknown): boolean {
  if (typeof parsed !== "object" || parsed === null) return false;
  const typed = parsed as Record<string, unknown>;
  const candidates: unknown[] = Array.isArray(typed.workspaces) ? typed.workspaces : [typed.workspace];
  return candidates.some((item) => {
    if (typeof item !== "object" || item === null) return false;
    const inbox = (item as Record<string, unknown>).inbox;
    return typeof inbox === "object" && inbox !== null && typeof (inbox as Record<string, unknown>).code === "string";
  });
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/__tests__/sync-pairing.test.ts`
Expected: PASS。

- [ ] **Step 5: 接入 importData**

`src/App.vue` 导入区加 `importedPayloadHasInbox`（并入 Task 10 的 pairing 导入）。`importData`（:2285）中，`isImportPayload(parsed)` 校验通过之后（:2309 之后）加：

```ts
  const importedHasInbox = importedPayloadHasInbox(parsed);
```

`importData` 内**两处**成功气泡 `showBubble("dataImported", importFeedbackAnchor.value, { hideCompanionAfter: true });` 之后各加一行：

```ts
      if (importedHasInbox) {
        showBubbleText(uiText.value.app.inboxImportNotice, undefined, { hideCompanionAfter: true });
      }
```

（第二处在全量导入分支；用 `grep -n 'showBubble("dataImported"' src/App.vue` 确认两处都在 `importData` 内，`exportWorkspaceById` 里的 `dataExported` 不动。）

- [ ] **Step 6: 回归 + Commit**

Run: `npm test && npx vue-tsc --noEmit`
Expected: PASS。

```bash
git add src/sync/pairing.ts src/App.vue src/__tests__/sync-pairing.test.ts
git commit -m "feat: 导入包含配对码时提示轮换建议"
```

---

### Task 12: 部署、文档与手动验证

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: 部署 Worker**

Run: `npm run deploy:worker`
Expected: 输出部署 URL（形如 `https://mini-desk-inbox.<account-subdomain>.workers.dev`）。若与 `src/sync/config.ts` 中的默认值不同，把 `INBOX_WORKER_URL` 默认值改为实际 URL 并提交。

Run: `curl -s -o /dev/null -w "%{http_code}" -X POST https://<部署URL>/inbox/$(printf 'a%.0s' {1..64}) -H 'Content-Type: application/json' -d '{"id":"smoke","payload":"QUJD"}'`
Expected: `200`（冒烟通过；条目 30 天后自动过期）。

- [ ] **Step 2: 本地端到端手动验证**

```bash
npx wrangler dev --config worker/wrangler.toml &
echo 'VITE_INBOX_WORKER_URL=http://127.0.0.1:8787' > .env.local
npm run dev
```

验证清单：
1. 桌面浏览器（≥900px 宽）：工作区菜单 → 配对手机 → 生成配对码 → 显示地址与二维码 → 选落点 → 保存。
2. 窄视口（DevTools 手机模拟）：带 `#inbox=码` 打开 → 输入待办与便签各一条 → 发送 → 见「已发送」。
3. 桌面端 Ctrl+S / 切走再切回窗口 → 条目落入所选清单/面板 → 气泡「收到 N 条」；再次拉取无重复。
4. 轮换配对码 → 旧地址提交的内容桌面端不再解出；清除配对 → 定时器停（DevTools Network 无轮询请求）。
5. 导出该工作区 → 清空 localStorage → 导入文件 → 提示轮换建议；旧条目不重灌（水位线随文件迁移）。
6. `npm run preview` 确认 SW 缓存的应用壳下功能仍可用（离线时拉取静默失败，无报错弹窗）。

- [ ] **Step 3: 更新文档**

`README.md` 「数据位置」章节末尾追加：

```markdown
手机速记的中转 Worker 只存储端到端加密后的密文（配对码即密钥，服务器只见配对码哈希），条目送达桌面端或 30 天过期后即不可再读。中转不保存看板数据、图片或任何账号信息。
```

`README.md` 「移动端说明」章节替换为：

```markdown
移动端会显示引导页，提示用户在电脑浏览器打开以获得完整体验。已配对手机速记的工作区可通过配对地址在移动端录入提醒事项与便签，内容经加密中转同步到桌面端。
```

`CLAUDE.md` 「State Management」小节 `WorkspaceData` 代码块中 `todoLists` 行之前加一行：

```
  inbox?: { code, todoListId, noteTarget: "note"|"workspace"|"storage", lastSeenAt },  // 手机速记配对；存在即启用拉取
```

`CLAUDE.md` 「Development」的命令说明后追加一行：

```
- `npm run deploy:worker` 部署手机速记中转 Worker（Cloudflare Worker + KV，配置在 `worker/wrangler.toml`）。
```

- [ ] **Step 4: 全量验证**

Run: `npm test && npm run build`
Expected: PASS + 构建成功。

- [ ] **Step 5: Commit**

```bash
git add README.md CLAUDE.md src/sync/config.ts
git commit -m "docs: 手机速记数据位置说明与部署文档"
```

---

## 自审记录（Self-Review）

- **Spec 覆盖**：Worker 接口/约束（Task 4）、加密方案（Task 3）、状态模型与水位线（Task 1/6）、配对 UI 与轮换/清除（Task 8）、拉取触发四类（Task 9）、手机端 fragment/输码/表单（Task 10）、导出导入与提示（Task 1/11）、防滥用与 CORS（Task 4）、i18n（Task 7）、部署与文档（Task 12）——逐一对应。
- **修正**：spec 中「导出无需特判」与实际不符——`getSerializableWorkspace` 是显式白名单，Task 1 已改为显式加入 `inbox` 克隆。
- **类型一致性**：`WorkspaceInbox` 四字段命名、`InboxPlainItem`/`InboxStoredItem`/`InboxPullReport`、`pairInbox` emit 名、`data-testid` 前缀（`inbox-`/`mobile-inbox-`/`workspace-pair-`）在各任务间一致。
