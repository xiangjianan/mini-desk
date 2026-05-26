import { describe, expect, it } from "vitest";
import {
  NOTIFY_TIME_OPTIONS,
  DEFAULT_NOTIFY_TIME,
  createNotifyAt,
  getDefaultNotifySelection,
  getNotifyDisplay,
  getLocalDateInputValue,
} from "../state/deadlines";

describe("notification time helpers", () => {
  it("uses all whole-hour choices for the notification clock", () => {
    expect(NOTIFY_TIME_OPTIONS).toHaveLength(24);
    expect(NOTIFY_TIME_OPTIONS[0]).toBe("00:00");
    expect(NOTIFY_TIME_OPTIONS[23]).toBe("23:00");
    expect(DEFAULT_NOTIFY_TIME).toBe("09:00");
  });

  it("creates a local timestamp from a date and whole-hour time", () => {
    const timestamp = createNotifyAt("2026-05-30", "15:00");

    expect(timestamp).toBe(new Date(2026, 4, 30, 15, 0, 0, 0).getTime());
  });

  it("defaults missing time to 09:00 and rejects malformed dates", () => {
    expect(createNotifyAt("2026-05-30")).toBe(new Date(2026, 4, 30, 9, 0, 0, 0).getTime());
    expect(createNotifyAt("", "18:00")).toBeNull();
    expect(createNotifyAt("2026/05/30", "18:00")).toBeNull();
    expect(createNotifyAt("2026-13-30", "18:00")).toBeNull();
    expect(createNotifyAt("2026-05-30", "18:30")).toBeNull();
  });

  it("formats local dates for native date inputs", () => {
    expect(getLocalDateInputValue(new Date(2026, 4, 7, 9))).toBe("2026-05-07");
  });

  it("chooses the next whole-hour notification time by default", () => {
    expect(getDefaultNotifySelection(new Date(2026, 4, 25, 8, 0))).toEqual({
      date: "2026-05-25",
      time: "09:00",
    });
    expect(getDefaultNotifySelection(new Date(2026, 4, 25, 10, 0))).toEqual({
      date: "2026-05-25",
      time: "11:00",
    });
    expect(getDefaultNotifySelection(new Date(2026, 4, 25, 23, 30))).toEqual({
      date: "2026-05-26",
      time: "09:00",
    });
  });

  it("classifies overdue, due-soon, upcoming, and later notification times", () => {
    const now = new Date(2026, 4, 25, 10).getTime();

    expect(getNotifyDisplay(new Date(2026, 4, 25, 9).getTime(), now)).toEqual({
      label: "! 已超期",
      compactLabel: "! 已超期",
      urgency: "overdue",
    });
    expect(getNotifyDisplay(new Date(2026, 4, 25, 18).getTime(), now)).toEqual({
      label: "今天下午 6:00",
      compactLabel: "今天 18",
      urgency: "due-soon",
    });
    expect(getNotifyDisplay(new Date(2026, 4, 26, 9).getTime(), now)).toEqual({
      label: "明天上午 9:00",
      compactLabel: "明天 09",
      urgency: "due-soon",
    });
    expect(getNotifyDisplay(new Date(2026, 4, 27, 18).getTime(), now)).toEqual({
      label: "2天后 下午 6:00",
      compactLabel: "2天后 18",
      urgency: "upcoming",
    });
    expect(getNotifyDisplay(new Date(2026, 5, 2, 18).getTime(), now)).toEqual({
      label: "6/2 下午 6:00",
      compactLabel: "6/2 18",
      urgency: "later",
    });
  });

  it("keeps next-day deadlines outside 24 hours in the upcoming bucket", () => {
    const now = new Date(2026, 4, 25, 0, 1).getTime();

    expect(getNotifyDisplay(new Date(2026, 4, 26, 23).getTime(), now)).toEqual({
      label: "1天后 晚上 11:00",
      compactLabel: "1天后 23",
      urgency: "upcoming",
    });
  });

  it("returns null for missing or invalid notification timestamps", () => {
    expect(getNotifyDisplay(undefined)).toBeNull();
    expect(getNotifyDisplay(Number.NaN)).toBeNull();
    expect(getNotifyDisplay(-1)).toBeNull();
  });
});
