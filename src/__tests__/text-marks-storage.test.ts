import { describe, expect, it } from "vitest";
import { getSerializableState, normalizeImportedState } from "../state/storage";
import type { BoardState } from "../types";

function workspaceWithMarks() {
  return {
    workspaces: [{
      id: "ws-1",
      spaces: [{
        id: "sp-1",
        title: "便签",
        lines: [
          { text: "重点内容", indent: 0, marks: [{ type: "highlight", start: 0, end: 2, color: "amber" }] },
          { text: "作废", indent: 0, marks: [{ type: "strike", start: 0, end: 2 }, { type: "nope", start: 0, end: 1 }] },
          { text: "越界", indent: 0, marks: [{ type: "color", start: 0, end: 9, color: "rose" }] },
        ],
      }],
    }],
  };
}

describe("marks 存储链路", () => {
  it("normalizeImportedState 修剪非法 marks 并 clamp 越界", () => {
    const state = normalizeImportedState(workspaceWithMarks() as never) as BoardState;
    const lines = state.workspaces[0].spaces[0].lines;
    expect(lines[0].marks).toEqual([{ type: "highlight", start: 0, end: 2, color: "amber" }]);
    expect(lines[1].marks).toEqual([{ type: "strike", start: 0, end: 2 }]);
    expect(lines[2].marks).toEqual([{ type: "color", start: 0, end: 2, color: "rose" }]);
  });

  it("无 marks 字段的旧数据照常加载（零迁移）", () => {
    const payload = { workspaces: [{ id: "ws-1", spaces: [{ id: "sp-1", lines: [{ text: "旧数据", indent: 0 }] }] }] };
    const state = normalizeImportedState(payload as never) as BoardState;
    expect(state.workspaces[0].spaces[0].lines).toEqual([{ text: "旧数据", indent: 0 }]);
  });

  it("序列化深拷贝 marks（改副本不影响原件），且往返一致", () => {
    const state = normalizeImportedState(workspaceWithMarks() as never) as BoardState;
    const serialized = getSerializableState(state);
    const marks = serialized.workspaces[0].spaces[0].lines[0].marks!;
    marks[0] = { ...marks[0], color: "rose" };
    expect(state.workspaces[0].spaces[0].lines[0].marks?.[0].color).toBe("amber");
    const roundtrip = normalizeImportedState(JSON.parse(JSON.stringify(getSerializableState(state))) as never) as BoardState;
    expect(roundtrip.workspaces[0].spaces[0].lines[0].marks)
      .toEqual(state.workspaces[0].spaces[0].lines[0].marks);
  });
});
