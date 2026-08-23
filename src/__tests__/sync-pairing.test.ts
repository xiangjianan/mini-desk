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
