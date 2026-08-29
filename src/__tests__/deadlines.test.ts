import { describe, expect, it } from "vitest";
import {
  getDefaultNotifyDateTimeValue,
  getNotifyDisplay,
  getLocalDateInputValue,
  getNotifyPresets,
  withDefaultNotifyTime,
} from "../state/deadlines";

describe("notification time helpers", () => {
  it("formats local dates for native date inputs", () => {
    expect(getLocalDateInputValue(new Date(2026, 4, 7, 9))).toBe("2026-05-07");
  });

  it("defaults new notification picker values to today at 09:00", () => {
    const value = getDefaultNotifyDateTimeValue(new Date(2026, 4, 25, 23, 30));

    expect(value).toBe(new Date(2026, 4, 25, 9, 0, 0, 0).getTime());
  });

  it("defaults notify time to the next whole hour today and 09:00 on other days", () => {
    const now = new Date(2026, 4, 25, 8, 30);
    const today = new Date(2026, 4, 25, 0, 0).getTime();
    const otherDay = new Date(2026, 5, 2, 0, 0).getTime();

    expect(withDefaultNotifyTime(today, now)).toBe(new Date(2026, 4, 25, 9, 0, 0, 0).getTime());
    expect(withDefaultNotifyTime(otherDay, now)).toBe(new Date(2026, 5, 2, 9, 0, 0, 0).getTime());
  });

  it("clamps today's default time to 23:00 instead of rolling into tomorrow when it is already late", () => {
    const now = new Date(2026, 4, 25, 23, 30);
    const today = new Date(2026, 4, 25, 0, 0).getTime();

    expect(withDefaultNotifyTime(today, now)).toBe(new Date(2026, 4, 25, 23, 0, 0, 0).getTime());
  });

  it("classifies overdue, due-soon, upcoming, and later notification times", () => {
    const now = new Date(2026, 4, 25, 10).getTime();

    expect(getNotifyDisplay(new Date(2026, 4, 25, 9).getTime(), now)).toEqual({
      label: "今天上午 9:00",
      compactLabel: "今天 09",
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
      label: "后天下午 6:00",
      compactLabel: "后天 18",
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
      label: "明天晚上 11:00",
      compactLabel: "明天 23",
      urgency: "upcoming",
    });
  });

  it("labels upcoming times up to one week and falls back to dates beyond it", () => {
    const now = new Date(2026, 4, 25, 10).getTime();

    expect(getNotifyDisplay(new Date(2026, 4, 29, 18).getTime(), now)).toEqual({
      label: "4天后 下午 6:00",
      compactLabel: "4天后 18",
      urgency: "upcoming",
    });
    expect(getNotifyDisplay(new Date(2026, 5, 1, 18).getTime(), now)).toEqual({
      label: "1周后 下午 6:00",
      compactLabel: "1周后 18",
      urgency: "upcoming",
    });
    expect(getNotifyDisplay(new Date(2026, 5, 2, 18).getTime(), now)).toEqual({
      label: "6/2 下午 6:00",
      compactLabel: "6/2 18",
      urgency: "later",
    });
  });

  it("labels overdue times up to one week ago and falls back to dates beyond it", () => {
    const now = new Date(2026, 4, 25, 10).getTime();

    expect(getNotifyDisplay(new Date(2026, 4, 22, 18).getTime(), now)).toEqual({
      label: "3天前 下午 6:00",
      compactLabel: "3天前 18",
      urgency: "overdue",
    });
    expect(getNotifyDisplay(new Date(2026, 4, 18, 18).getTime(), now)).toEqual({
      label: "1周前 下午 6:00",
      compactLabel: "1周前 18",
      urgency: "overdue",
    });
    expect(getNotifyDisplay(new Date(2026, 4, 17, 18).getTime(), now)).toEqual({
      label: "5/17 下午 6:00",
      compactLabel: "5/17 18",
      urgency: "overdue",
    });
  });

  it("returns null for missing or invalid notification timestamps", () => {
    expect(getNotifyDisplay(undefined)).toBeNull();
    expect(getNotifyDisplay(Number.NaN)).toBeNull();
    expect(getNotifyDisplay(-1)).toBeNull();
  });

  it("builds quick presets in relative and time-of-day groups", () => {
    // 2024-01-15 10:30 — 10:00 has passed, 14:00/19:00 still upcoming today.
    const now = new Date(2024, 0, 15, 10, 30, 0, 0);
    const presets = getNotifyPresets(now);

    expect(presets.map((preset) => preset.key)).toEqual([
      "in15m", "in30m", "in1h", "in3h", "in6h", // relative group
      "at10", "at14", "at19", "tomorrow9", "dayAfter9", // time-of-day group
    ]);
    expect(presets.map((preset) => preset.group)).toEqual([
      "relative", "relative", "relative", "relative", "relative",
      "time", "time", "time", "time", "time",
    ]);

    // Relative durations add to now, seconds cleared.
    expect(presets[0].at).toBe(new Date(2024, 0, 15, 10, 45, 0, 0).getTime()); // +15m → 10:45
    expect(presets[1].at).toBe(new Date(2024, 0, 15, 11, 0, 0, 0).getTime()); // +30m → 11:00
    expect(presets[2].at).toBe(new Date(2024, 0, 15, 11, 30, 0, 0).getTime()); // +1h → 11:30
    expect(presets[3].at).toBe(new Date(2024, 0, 15, 13, 30, 0, 0).getTime()); // +3h → 13:30
    expect(presets[4].at).toBe(new Date(2024, 0, 15, 16, 30, 0, 0).getTime()); // +6h → 16:30

    // Time-of-day: 10:00/14:00/19:00 always land on today (even 10:00, which
    // has already passed); tomorrow9 / dayAfter9 are fixed +1 / +2 day offsets.
    expect(presets[5].at).toBe(new Date(2024, 0, 15, 10, 0, 0, 0).getTime()); // 10:00 today
    expect(presets[6].at).toBe(new Date(2024, 0, 15, 14, 0, 0, 0).getTime()); // 14:00 today
    expect(presets[7].at).toBe(new Date(2024, 0, 15, 19, 0, 0, 0).getTime()); // 19:00 today
    expect(presets[8].at).toBe(new Date(2024, 0, 16, 9, 0, 0, 0).getTime()); // tomorrow 09:00
    expect(presets[9].at).toBe(new Date(2024, 0, 17, 9, 0, 0, 0).getTime()); // day after tomorrow 09:00
  });

  it("keeps time-of-day presets on today even when late in the day", () => {
    // 20:00 — 10:00/14:00/19:00 have all passed today, but still land on today.
    const now = new Date(2024, 0, 15, 20, 0, 0, 0);
    const presets = getNotifyPresets(now);

    expect(presets[5].at).toBe(new Date(2024, 0, 15, 10, 0, 0, 0).getTime()); // 10:00 today
    expect(presets[6].at).toBe(new Date(2024, 0, 15, 14, 0, 0, 0).getTime()); // 14:00 today
    expect(presets[7].at).toBe(new Date(2024, 0, 15, 19, 0, 0, 0).getTime()); // 19:00 today
    expect(presets[9].at).toBe(new Date(2024, 0, 17, 9, 0, 0, 0).getTime()); // day after tomorrow 09:00
  });
});
