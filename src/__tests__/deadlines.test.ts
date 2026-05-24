import { describe, expect, it } from "vitest";
import {
  DEADLINE_TIME_OPTIONS,
  DEFAULT_DEADLINE_TIME,
  createDeadlineAt,
  getDeadlineDisplay,
  getLocalDateInputValue,
} from "../state/deadlines";

describe("deadline helpers", () => {
  it("uses a small set of common whole-hour choices", () => {
    expect(DEADLINE_TIME_OPTIONS).toEqual(["09:00", "12:00", "15:00", "18:00", "21:00"]);
    expect(DEFAULT_DEADLINE_TIME).toBe("18:00");
  });

  it("creates a local timestamp from a date and whole-hour time", () => {
    const timestamp = createDeadlineAt("2026-05-30", "15:00");

    expect(timestamp).toBe(new Date(2026, 4, 30, 15, 0, 0, 0).getTime());
  });

  it("defaults missing time to 18:00 and rejects malformed dates", () => {
    expect(createDeadlineAt("2026-05-30")).toBe(new Date(2026, 4, 30, 18, 0, 0, 0).getTime());
    expect(createDeadlineAt("", "18:00")).toBeNull();
    expect(createDeadlineAt("2026/05/30", "18:00")).toBeNull();
    expect(createDeadlineAt("2026-13-30", "18:00")).toBeNull();
    expect(createDeadlineAt("2026-05-30", "18:30")).toBeNull();
  });

  it("formats local dates for native date inputs", () => {
    expect(getLocalDateInputValue(new Date(2026, 4, 7, 9))).toBe("2026-05-07");
  });

  it("classifies overdue, due-soon, upcoming, and later deadlines", () => {
    const now = new Date(2026, 4, 25, 10).getTime();

    expect(getDeadlineDisplay(new Date(2026, 4, 25, 9).getTime(), now)).toEqual({
      label: "! 已超期",
      urgency: "overdue",
    });
    expect(getDeadlineDisplay(new Date(2026, 4, 25, 18).getTime(), now)).toEqual({
      label: "! 今天 18",
      urgency: "due-soon",
    });
    expect(getDeadlineDisplay(new Date(2026, 4, 26, 9).getTime(), now)).toEqual({
      label: "! 明天 09",
      urgency: "due-soon",
    });
    expect(getDeadlineDisplay(new Date(2026, 4, 27, 18).getTime(), now)).toEqual({
      label: "2天后 18",
      urgency: "upcoming",
    });
    expect(getDeadlineDisplay(new Date(2026, 5, 2, 18).getTime(), now)).toEqual({
      label: "6/2 18",
      urgency: "later",
    });
  });

  it("keeps next-day deadlines outside 24 hours in the upcoming bucket", () => {
    const now = new Date(2026, 4, 25, 0, 1).getTime();

    expect(getDeadlineDisplay(new Date(2026, 4, 26, 23).getTime(), now)).toEqual({
      label: "1天后 23",
      urgency: "upcoming",
    });
  });

  it("returns null for missing or invalid deadline timestamps", () => {
    expect(getDeadlineDisplay(undefined)).toBeNull();
    expect(getDeadlineDisplay(Number.NaN)).toBeNull();
    expect(getDeadlineDisplay(-1)).toBeNull();
  });
});
