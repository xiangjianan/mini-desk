export type NotifyUrgency = "overdue" | "due-soon" | "upcoming" | "later";

export interface NotifyDisplay {
  label: string;
  compactLabel: string;
  urgency: NotifyUrgency;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function getLocalDateInputValue(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

export type NotifyPresetGroup = "relative" | "time";

export type NotifyPresetKey =
  | "in15m" | "in30m" | "in1h" | "in3h" | "in6h"
  | "at10" | "at14" | "at19" | "tomorrow9" | "dayAfter9";

export interface NotifyPreset {
  key: NotifyPresetKey;
  group: NotifyPresetGroup;
  at: number;
}

/**
 * Quick deadline presets for the notify picker, in two groups: relative
 * durations and time-of-day slots. Durations add to `now` (seconds cleared).
 * The 上午 10 点 / 下午 2 点 / 晚上 7 点 slots always land on today (the picker's
 * default date); 明天 9 点 / 后天 9 点 are explicit +1 / +2 day offsets. Picked
 * presets commit immediately; the user can still shift the date via the picker.
 */
export function getNotifyPresets(now = new Date()): NotifyPreset[] {
  const inMinutes = (minutes: number): number => {
    const next = new Date(now.getTime() + minutes * 60 * 1000);
    next.setSeconds(0, 0);
    return next.getTime();
  };

  const todayAt = (hour: number): number =>
    new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, 0, 0, 0).getTime();

  const tomorrowAt = (hour: number): number =>
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, hour, 0, 0, 0).getTime();

  const dayAfterAt = (hour: number): number =>
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2, hour, 0, 0, 0).getTime();

  return [
    { key: "in15m", group: "relative", at: inMinutes(15) },
    { key: "in30m", group: "relative", at: inMinutes(30) },
    { key: "in1h", group: "relative", at: inMinutes(60) },
    { key: "in3h", group: "relative", at: inMinutes(180) },
    { key: "in6h", group: "relative", at: inMinutes(360) },
    { key: "at10", group: "time", at: todayAt(10) },
    { key: "at14", group: "time", at: todayAt(14) },
    { key: "at19", group: "time", at: todayAt(19) },
    { key: "tomorrow9", group: "time", at: tomorrowAt(9) },
    { key: "dayAfter9", group: "time", at: dayAfterAt(9) },
  ];
}

export function isValidNotifyAt(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
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
