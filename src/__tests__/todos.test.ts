import { describe, expect, it } from "vitest";
import type { TodoItem, TodoMap } from "../types";
import { collectTodoFocusPayloadIds, formatFocusDuration, getTodoReorderTarget, updateTodoFocus } from "../state/todos";
import { extractRetainedImageIds } from "../composables/useUndoHistory";
import { defaultState } from "../state/defaults";
import { getSerializableState, normalizeImportedState } from "../state/storage";

describe("getTodoReorderTarget — Ctrl+Up/Down 换算为 moveTodo 落位目标", () => {
  const todos = [
    { id: "a", text: "a", done: false },
    { id: "b", text: "b", done: false },
    { id: "c", text: "c", done: false },
  ];

  it("上移：目标是上一个同组成员（插到它前面 = 交换）", () => {
    expect(getTodoReorderTarget(todos, "b", -1)).toEqual({ targetId: "a" });
  });

  it("下移：目标是下一个同组成员（moveTodo 落在其原索引之后）", () => {
    expect(getTodoReorderTarget(todos, "a", 1)).toEqual({ targetId: "b" });
  });

  it("下移到组内末尾：返回 null", () => {
    expect(getTodoReorderTarget(todos, "c", 1)).toBeNull();
  });

  it("组边界返回 null（无操作）", () => {
    expect(getTodoReorderTarget(todos, "a", -1)).toBeNull();
    expect(getTodoReorderTarget(todos, "missing", 1)).toBeNull();
  });

  it("不跨越 完成/星标 分组边界", () => {
    const mixed = [
      { id: "s", text: "s", done: false, starred: true },
      { id: "o", text: "o", done: false },
      { id: "d", text: "d", done: true },
    ];
    expect(getTodoReorderTarget(mixed, "s", 1)).toBeNull();
    expect(getTodoReorderTarget(mixed, "d", -1)).toBeNull();
    expect(getTodoReorderTarget(mixed, "o", -1)).toBeNull();
  });

  it("星标组内同样可移动", () => {
    const starred = [
      { id: "s1", text: "s1", done: false, starred: true },
      { id: "s2", text: "s2", done: false, starred: true },
      { id: "o1", text: "o1", done: false },
    ];
    expect(getTodoReorderTarget(starred, "s1", 1)).toStrictEqual({ targetId: "s2" });
  });
});

describe("updateTodoFocus", () => {
  const base: TodoMap = { morning: [{ id: "t1", text: "写周报", done: false }] };

  it("增量合并专注时长，未计时任务从零起算", () => {
    expect(updateTodoFocus(base, "morning", "t1", { addElapsedMs: 90_000 })).toEqual({
      morning: [{ id: "t1", text: "写周报", done: false, focusElapsedMs: 90_000 }],
    });
  });

  it("在既有累计之上累加", () => {
    const seeded = { morning: [{ id: "t1", text: "写周报", done: false, focusElapsedMs: 60_000 }] };
    expect(updateTodoFocus(seeded, "morning", "t1", { addElapsedMs: 1_500 })).toEqual({
      morning: [{ id: "t1", text: "写周报", done: false, focusElapsedMs: 61_500 }],
    });
  });

  it("负增量把累计清到零及以下时删除字段", () => {
    const seeded = { morning: [{ id: "t1", text: "写周报", done: false, focusElapsedMs: 60_000 }] };
    const next = updateTodoFocus(seeded, "morning", "t1", { addElapsedMs: -60_000 });
    expect(next.morning[0].focusElapsedMs).toBeUndefined();
  });

  it("负增量部分抵扣时钳制到剩余值", () => {
    const seeded = { morning: [{ id: "t1", text: "写周报", done: false, focusElapsedMs: 60_000 }] };
    const next = updateTodoFocus(seeded, "morning", "t1", { addElapsedMs: -5_000 });
    expect(next.morning[0].focusElapsedMs).toBe(55_000);
  });

  it("笔记与图片整体替换；空数组删除字段保持无痕", () => {
    const seeded = {
      morning: [{
        id: "t1", text: "写周报", done: false,
        focusElapsedMs: 1_000,
        focusNotes: [{ text: "旧", indent: 0 }],
        focusImages: [{ id: "img1", createdAt: 1 }],
      }],
    };
    const next = updateTodoFocus(seeded, "morning", "t1", { focusNotes: [], focusImages: [] });
    expect(next.morning[0].focusNotes).toBeUndefined();
    expect(next.morning[0].focusImages).toBeUndefined();
    expect(next.morning[0].focusElapsedMs).toBe(1_000);
  });

  it("任务不存在时原样返回（引用相等）", () => {
    expect(updateTodoFocus(base, "morning", "nope", { addElapsedMs: 1 })).toBe(base);
  });

  it("不修改原对象（不可变）", () => {
    updateTodoFocus(base, "morning", "t1", { addElapsedMs: 1 });
    expect(base.morning[0].focusElapsedMs).toBeUndefined();
  });
});

describe("focus 字段的序列化与归一化屏障", () => {
  const focusTodo: TodoItem = {
    id: "t1", text: "写周报", done: false,
    focusElapsedMs: 5_000,
    focusNotes: [{ text: "要点", indent: 1, marks: [{ type: "highlight", start: 0, end: 2, color: "amber" }] }],
    focusImages: [{ id: "img1", payloadId: "pay-1", src: "data:image/png;base64,AAAA", createdAt: 9 }],
  };

  it("saveState 序列化剥除 focusImages 载荷只留元数据", () => {
    const state = defaultState();
    state.workspaces[0].todos.morning = [JSON.parse(JSON.stringify(focusTodo))];
    const serialized = getSerializableState(state);
    const todo = serialized.workspaces[0].todos.morning[0];
    expect(todo.focusImages?.[0].src).toBeUndefined();
    expect(todo.focusImages?.[0].id).toBe("img1");
    // payloadId 是 IndexedDB 懒水合键（getImagePayloadId = payloadId ?? id），必须随元数据存活。
    expect(todo.focusImages?.[0].payloadId).toBe("pay-1");
    expect(todo.focusImages?.[0].createdAt).toBe(9);
  });

  it("normalizeImportedState 放行合法 focus 字段（含 marks）", () => {
    const state = defaultState();
    state.workspaces[0].todos.morning = [JSON.parse(JSON.stringify(focusTodo))];
    const restored = normalizeImportedState(JSON.parse(JSON.stringify(getSerializableState(state))));
    const todo = restored.workspaces[0].todos.morning[0];
    expect(todo.focusElapsedMs).toBe(5_000);
    expect(todo.focusNotes?.[0].text).toBe("要点");
    expect(todo.focusNotes?.[0].marks?.length).toBe(1);
    expect(todo.focusImages?.[0].id).toBe("img1");
    expect(todo.focusImages?.[0].src).toBeUndefined();
  });

  it("normalizeImportedState 丢弃非法 focus 字段", () => {
    const state = defaultState();
    state.workspaces[0].todos.morning = [{
      ...focusTodo,
      focusElapsedMs: -3,
      focusNotes: "不是数组" as never,
      focusImages: [{ id: "ok1", createdAt: 1 }, { nope: true }, "x"] as never,
    }];
    const restored = normalizeImportedState(JSON.parse(JSON.stringify(state)));
    const todo = restored.workspaces[0].todos.morning[0];
    expect(todo.focusElapsedMs).toBeUndefined();
    expect(todo.focusNotes).toBeUndefined();
    expect(todo.focusImages).toEqual([{ id: "ok1", createdAt: 1 }]);
  });
});

describe("collectTodoFocusPayloadIds", () => {
  it("收集全部 focusImages 的载荷 id（payloadId 优先）", () => {
    const todos = [
      { id: "t1", text: "a", done: false, focusImages: [{ id: "i1", payloadId: "p1", createdAt: 1 }] },
      { id: "t2", text: "b", done: false },
      { id: "t3", text: "c", done: false, focusImages: [{ id: "i2", createdAt: 2 }] },
    ];
    expect(collectTodoFocusPayloadIds(todos)).toEqual(["p1", "i2"]);
  });
  it("无 focusImages 时返回空数组", () => {
    expect(collectTodoFocusPayloadIds([{ id: "t", text: "a", done: false }])).toEqual([]);
  });
});

describe("extractRetainedImageIds 覆盖 focusImages", () => {
  it("扫描撤销快照 JSON 里 todos 下的 focusImages", () => {
    const parsed = {
      workspaces: [{
        id: "w1", images: [{ id: "board-img" }],
        todos: { morning: [{ id: "t1", focusImages: [{ id: "f1", payloadId: "fp1" }] }] },
      }],
    };
    const retained = extractRetainedImageIds(parsed);
    expect(retained.has("board-img")).toBe(true);
    expect(retained.has("fp1")).toBe(true);
  });
});

describe("formatFocusDuration", () => {
  it("不足一小时显示 mm:ss", () => {
    expect(formatFocusDuration(0)).toBe("00:00");
    expect(formatFocusDuration(754_000)).toBe("12:34");
    expect(formatFocusDuration(59_999)).toBe("01:00"); // 向上取整到秒
  });
  it("超过一小时显示 h:mm:ss", () => {
    expect(formatFocusDuration(3_723_000)).toBe("1:02:03");
    expect(formatFocusDuration(3_600_000)).toBe("1:00:00");
  });
});
