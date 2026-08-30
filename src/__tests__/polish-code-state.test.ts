import { describe, expect, it } from "vitest";
import { defaultState } from "../state/defaults";
import { getSerializableState, normalizeImportedState } from "../state/storage";

describe("state.polishCode", () => {
  it("序列化保留合法码、缺失时省略字段", () => {
    expect(getSerializableState({ ...defaultState(), polishCode: "AB2CDE4FGHJK" }).polishCode).toBe("AB2CDE4FGHJK");
    expect(getSerializableState(defaultState()).polishCode).toBeUndefined();
  });

  it("导入归一化：合法码保留，非法值丢弃", () => {
    const base = defaultState();
    expect(normalizeImportedState({ ...base, polishCode: "AB2CDE4FGHJK" }).polishCode).toBe("AB2CDE4FGHJK");
    expect(normalizeImportedState({ ...base, polishCode: "short" }).polishCode).toBeUndefined();
    expect(normalizeImportedState({ ...base, polishCode: 42 }).polishCode).toBeUndefined();
    expect(normalizeImportedState({ ...base }).polishCode).toBeUndefined();
  });
});
