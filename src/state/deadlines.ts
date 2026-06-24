export const NOTIFY_HOUR_OPTIONS = [
  "00",
  "01",
  "02",
  "03",
  "04",
  "05",
  "06",
  "07",
  "08",
  "09",
  "10",
  "11",
  "12",
  "13",
  "14",
  "15",
  "16",
  "17",
  "18",
  "19",
  "20",
  "21",
  "22",
  "23",
  "24",
] as const;
export const NOTIFY_MINUTE_OPTIONS = ["00", "15", "30", "45"] as const;
export const NOTIFY_TIME_OPTIONS = NOTIFY_HOUR_OPTIONS.flatMap((hour) =>
  NOTIFY_MINUTE_OPTIONS.map((minute) => `${hour}:${minute}`),
);
export const DEFAULT_NOTIFY_TIME = "09:00";

export type NotifyHourOption = typeof NOTIFY_HOUR_OPTIONS[number];
export type NotifyMinuteOption = typeof NOTIFY_MINUTE_OPTIONS[number];
export type NotifyTimeOption = `${NotifyHourOption}:${NotifyMinuteOption}`;
export type NotifyUrgency = "overdue" | "due-soon" | "upcoming" | "later";

export interface NotifyDisplay {
  label: string;
  compactLabel: string;
  urgency: NotifyUrgency;
}

export const DEADLINE_TIME_OPTIONS = NOTIFY_TIME_OPTIONS;
export const DEFAULT_DEADLINE_TIME = DEFAULT_NOTIFY_TIME;
export type DeadlineTimeOption = NotifyTimeOption;
export type DeadlineUrgency = NotifyUrgency;
export type DeadlineDisplay = NotifyDisplay;

const DATE_INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const QUARTER_HOUR_PATTERN = /^([01]\d|2[0-4]):(00|15|30|45)$/;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_NOTIFY_HOUR_OPTIONS = NOTIFY_HOUR_OPTIONS.slice(0, 24);

export function getLocalDateInputValue(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function createNotifyAt(dateValue: string, timeValue = DEFAULT_NOTIFY_TIME): number | null {
  const parsedDate = parseLocalDateValue(dateValue);
  const parsedTime = parseQuarterHourValue(timeValue);
  if (!parsedDate || !parsedTime) return null;

  const dayOffset = parsedTime.hour === 24 ? 1 : 0;
  const hour = parsedTime.hour === 24 ? 0 : parsedTime.hour;
  return new Date(
    parsedDate.year,
    parsedDate.month - 1,
    parsedDate.day + dayOffset,
    hour,
    parsedTime.minute,
    0,
    0,
  ).getTime();
}

export function getDefaultNotifySelection(now = new Date()): { date: string; time: NotifyTimeOption } {
  const nextToday = DEFAULT_NOTIFY_HOUR_OPTIONS.find((hourText) => {
    const hour = Number(hourText);
    const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, 0, 0, 0);
    return candidate.getTime() > now.getTime();
  });

  if (nextToday) {
    return {
      date: getLocalDateInputValue(now),
      time: `${nextToday}:00` as NotifyTimeOption,
    };
  }

  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return {
    date: getLocalDateInputValue(tomorrow),
    time: DEFAULT_NOTIFY_TIME,
  };
}

export function getDefaultNotifyDateTimeValue(now = new Date()): number {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0, 0).getTime();
}

/**
 * Applies the date-aware default notify time to a timestamp.
 * Selected date === today → next whole hour after `now` (clamped to 23:00 once it is past 23:00,
 * so the date never rolls into tomorrow); any other date → 09:00.
 */
export function withDefaultNotifyTime(dateTimestamp: number, now = new Date()): number {
  const target = new Date(dateTimestamp);
  const isToday = getLocalDateInputValue(target) === getLocalDateInputValue(now);
  if (!isToday) {
    target.setHours(9, 0, 0, 0);
    return target.getTime();
  }
  const nextHour = now.getHours() + 1;
  // Past 23:00 the next whole hour would be midnight (tomorrow); keep today and freeze at 23:00.
  target.setHours(nextHour > 23 ? 23 : nextHour, 0, 0, 0);
  return target.getTime();
}

export function getNotifyDisplay(notifyAt: number | undefined, now = Date.now(), language: AppLanguage = DEFAULT_LANGUAGE): NotifyDisplay | null {
  if (!isValidNotifyAt(notifyAt) || !isValidNotifyAt(now)) return null;
  const normalizedLanguage = normalizeLanguage(language);
  const en = normalizedLanguage === "en";

  const notifyDate = new Date(notifyAt);
  const dayDistance = getLocalDayDistance(now, notifyAt);
  const timeLabel = getDisplayTimeLabel(notifyDate, normalizedLanguage);
  const compactTimeLabel = getCompactTimeLabel(notifyDate);

  const isOverdue = notifyAt < now;
  const urgency: NotifyUrgency = isOverdue
    ? "overdue"
    : notifyAt - now <= ONE_DAY_MS
      ? "due-soon"
      : Math.abs(dayDistance) <= 7
        ? "upcoming"
        : "later";

  const phrases = getRelativeDayPhrases(dayDistance, normalizedLanguage);
  if (phrases) {
    // 今天/明天/后天/昨天/前天 attach directly to the zh time label; compound phrases (N天后/1周…) use a space.
    const simple = dayDistance >= -2 && dayDistance <= 2;
    const label = en || !simple ? `${phrases.label} ${timeLabel}` : `${phrases.label}${timeLabel}`;
    return {
      label,
      compactLabel: `${phrases.compact} ${compactTimeLabel}`,
      urgency,
    };
  }

  return {
    label: `${notifyDate.getMonth() + 1}/${notifyDate.getDate()} ${timeLabel}`,
    compactLabel: `${notifyDate.getMonth() + 1}/${notifyDate.getDate()} ${compactTimeLabel}`,
    urgency,
  };
}

/** Relative day phrases for |dayDistance| <= 7; null means fall back to an absolute date. */
function getRelativeDayPhrases(dayDistance: number, language: AppLanguage): { label: string; compact: string } | null {
  const en = normalizeLanguage(language) === "en";
  const future = dayDistance > 0;
  const abs = Math.abs(dayDistance);

  if (dayDistance === 0) {
    const text = en ? "Today" : "今天";
    return { label: text, compact: text };
  }
  if (dayDistance === 1) {
    const text = en ? "Tomorrow" : "明天";
    return { label: text, compact: text };
  }
  if (dayDistance === -1) {
    const text = en ? "Yesterday" : "昨天";
    return { label: text, compact: text };
  }
  if (dayDistance === 2) {
    return en ? { label: "Day after tomorrow", compact: "Day after" } : { label: "后天", compact: "后天" };
  }
  if (dayDistance === -2) {
    return en ? { label: "Day before yesterday", compact: "Day before" } : { label: "前天", compact: "前天" };
  }
  if (abs <= 6) {
    if (en) {
      const text = future ? `In ${abs} days` : `${abs} days ago`;
      return { label: text, compact: text };
    }
    const text = future ? `${abs}天后` : `${abs}天前`;
    return { label: text, compact: text };
  }
  if (abs === 7) {
    if (en) {
      const text = future ? "In 1 week" : "1 week ago";
      return { label: text, compact: text };
    }
    const text = future ? "1周后" : "1周前";
    return { label: text, compact: text };
  }
  return null;
}

export function getNotifyTimeLabel(time: NotifyTimeOption, language: AppLanguage = DEFAULT_LANGUAGE): string {
  const parsed = parseQuarterHourValue(time);
  if (!parsed) return time;
  const normalizedLanguage = normalizeLanguage(language);
  if (parsed.hour === 24) {
    return normalizedLanguage === "en"
      ? `Next day ${formatMinuteTime(0, parsed.minute)}`
      : `次日 ${formatMinuteTime(0, parsed.minute)}`;
  }
  return getDisplayTimeLabel(new Date(2000, 0, 1, parsed.hour, parsed.minute), normalizedLanguage);
}

export function isValidNotifyAt(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export const createDeadlineAt = createNotifyAt;
export const getDefaultDeadlineSelection = getDefaultNotifySelection;
export const getDeadlineDisplay = getNotifyDisplay;
export const getDeadlineTimeLabel = getNotifyTimeLabel;
export const isValidDeadlineAt = isValidNotifyAt;

function parseLocalDateValue(dateValue: string): { year: number; month: number; day: number } | null {
  const match = DATE_INPUT_PATTERN.exec(dateValue);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }

  return { year, month, day };
}

function parseQuarterHourValue(timeValue: string): { hour: number; minute: number } | null {
  const match = QUARTER_HOUR_PATTERN.exec(timeValue);
  if (!match) return null;
  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
  };
}

function getDisplayTimeLabel(date: Date, language: AppLanguage = DEFAULT_LANGUAGE): string {
  if (normalizeLanguage(language) === "en") return getCompactTimeLabel(date);
  const hour = date.getHours();
  const minute = date.getMinutes();
  if (hour === 0) return `凌晨 ${formatMinuteTime(12, minute)}`;
  if (hour < 6) return `凌晨 ${formatMinuteTime(hour, minute)}`;
  if (hour < 12) return `上午 ${formatMinuteTime(hour, minute)}`;
  if (hour === 12) return `中午 ${formatMinuteTime(12, minute)}`;
  if (hour <= 18) return `下午 ${formatMinuteTime(hour - 12, minute)}`;
  return `晚上 ${formatMinuteTime(hour - 12, minute)}`;
}

function getCompactTimeLabel(date: Date): string {
  const hour = String(date.getHours()).padStart(2, "0");
  if (date.getMinutes() === 0) return hour;
  return `${hour}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatMinuteTime(hour: number, minute: number): string {
  return `${hour}:${String(minute).padStart(2, "0")}`;
}

function getLocalDayDistance(from: number, to: number): number {
  const fromDate = new Date(from);
  const toDate = new Date(to);
  const fromStart = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate()).getTime();
  const toStart = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate()).getTime();
  return Math.round((toStart - fromStart) / ONE_DAY_MS);
}
import type { AppLanguage } from "../types";
import { DEFAULT_LANGUAGE, normalizeLanguage } from "./i18n";
