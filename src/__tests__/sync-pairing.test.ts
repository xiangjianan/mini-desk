import { describe, expect, it } from "vitest";
import {
  buildInboxAddress,
  clearRememberedInboxCode,
  formatInboxCode,
  generateInboxCode,
  importedPayloadHasInbox,
  isValidInboxCode,
  loadRememberedInboxCode,
  normalizeInboxCode,
  parseInboxFragment,
  REMEMBERED_INBOX_CODE_KEY,
  saveRememberedInboxCode,
} from "../sync/pairing";

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

describe("normalizeInboxCode", () => {
  it("去空白、大写、混淆字符归一（I/L→1、O→0）", () => {
    expect(normalizeInboxCode(" ab2cdeiloghjk ")).toBe("AB2CDE110GHJK");
  });

  it("U 不做映射直接保留（字母表不含 U，交给 isValidInboxCode 拒绝）", () => {
    expect(normalizeInboxCode("abucde4fghjk")).toBe("ABUCDE4FGHJK");
    expect(isValidInboxCode(normalizeInboxCode("abucde4fghjk"))).toBe(false);
  });

  it("归一后的常规手输码通过校验", () => {
    expect(isValidInboxCode(normalizeInboxCode("ab2cde4fghjk"))).toBe(true);
    expect(isValidInboxCode(normalizeInboxCode("  oB2cde4fghjI "))).toBe(true);
  });

  it("移除分组粘贴的内部空白后得到合法码", () => {
    expect(normalizeInboxCode("ab2c de4f ghjk")).toBe("AB2CDE4FGHJK");
    expect(isValidInboxCode(normalizeInboxCode("ab2c de4f ghjk"))).toBe(true);
  });
});

describe("地址与 fragment", () => {
  it("parseInboxFragment 提取合法码，拒绝非法值", () => {
    expect(parseInboxFragment("#inbox=AB2CDE4FGHJK")).toBe("AB2CDE4FGHJK");
    expect(parseInboxFragment("")).toBeNull();
    expect(parseInboxFragment("#inbox=short")).toBeNull();
    expect(parseInboxFragment("#other=AB2CDE4FGHJK")).toBeNull();
    expect(parseInboxFragment("#inbox=AB2CDE4FGHJK&x=1")).toBeNull();
    expect(parseInboxFragment("inbox=AB2CDE4FGHJK")).toBeNull();
  });

  it("buildInboxAddress 拼装当前 origin + fragment", () => {
    const address = buildInboxAddress("AB2CDE4FGHJK");
    expect(address).toBe(`${window.location.origin}${window.location.pathname}#inbox=AB2CDE4FGHJK`);
  });

  it("生成→地址→解析往返一致", () => {
    const code = generateInboxCode();
    const address = buildInboxAddress(code);
    const hash = address.slice(address.indexOf("#"));
    expect(parseInboxFragment(hash)).toBe(code);
  });
});

describe("importedPayloadHasInbox", () => {
  it("识别单工作区与多工作区导出中的 inbox", () => {
    expect(importedPayloadHasInbox({ workspace: { inbox: { code: "AB2CDE4FGHJK" } } })).toBe(true);
    expect(importedPayloadHasInbox({ workspaces: [{}, { inbox: { code: "AB2CDE4FGHJK" } }] })).toBe(true);
  });

  it("识别真实单工作区导出信封中的 inbox", () => {
    expect(
      importedPayloadHasInbox({
        miniDeskWorkspaceExport: true,
        version: 1,
        workspace: { inbox: { code: "AB2CDE4FGHJK", todoListId: "morning", noteTarget: "workspace", lastSeenAt: 0 } },
      }),
    ).toBe(true);
  });

  it("码不合法（会被 normalize 丢弃）不触发提示，与导入侧校验对齐", () => {
    expect(importedPayloadHasInbox({ workspace: { inbox: { code: "short" } } })).toBe(false);
    expect(importedPayloadHasInbox({ workspaces: [{ inbox: { code: "ab2cde4fghjk" } }] })).toBe(false);
  });

  it("workspaces 非数组时回退检查 workspace 键", () => {
    expect(importedPayloadHasInbox({ workspaces: "junk", workspace: { inbox: { code: "AB2CDE4FGHJK" } } })).toBe(true);
    expect(importedPayloadHasInbox({ workspaces: "junk" })).toBe(false);
  });

  it("无 inbox 或结构非法返回 false", () => {
    expect(importedPayloadHasInbox({ workspace: {} })).toBe(false);
    expect(importedPayloadHasInbox({ workspaces: [{ inbox: null }] })).toBe(false);
    expect(importedPayloadHasInbox("junk")).toBe(false);
  });
});

/** 与全局 localStorage 隔离的内存 Storage，避免单测间状态串扰。 */
function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => {
      map.delete(key);
    },
    setItem: (key: string, value: string) => {
      map.set(key, String(value));
    },
  };
}

describe("手机壳配对码记忆", () => {
  it("save→load 往返一致；clear 后 load 返回 null", () => {
    const storage = createMemoryStorage();

    saveRememberedInboxCode("AB2CDE4FGHJK", storage);
    expect(loadRememberedInboxCode(storage)).toBe("AB2CDE4FGHJK");

    clearRememberedInboxCode(storage);
    expect(loadRememberedInboxCode(storage)).toBeNull();
  });

  it("重复保存以后写的码优先（最后使用的配对优先）", () => {
    const storage = createMemoryStorage();

    saveRememberedInboxCode("AB2CDE4FGHJK", storage);
    saveRememberedInboxCode("ZZZ0ZZZ0ZZZ0", storage);

    expect(loadRememberedInboxCode(storage)).toBe("ZZZ0ZZZ0ZZZ0");
  });

  it("损坏/非法/缺失的存储值返回 null，落回输码表单自愈", () => {
    const storage = createMemoryStorage();

    storage.setItem(REMEMBERED_INBOX_CODE_KEY, "corrupted");
    expect(loadRememberedInboxCode(storage)).toBeNull();

    storage.setItem(REMEMBERED_INBOX_CODE_KEY, "ab2cde4fghjk");
    expect(loadRememberedInboxCode(storage)).toBeNull();

    storage.removeItem(REMEMBERED_INBOX_CODE_KEY);
    expect(loadRememberedInboxCode(storage)).toBeNull();
  });
});

describe("formatInboxCode", () => {
  it("12 位码按 4 位分组展示", () => {
    expect(formatInboxCode("AB2CDE4FGHJK")).toBe("AB2C DE4F GHJK");
  });
});
