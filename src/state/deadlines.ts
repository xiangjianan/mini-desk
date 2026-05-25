export const NOTIFY_TIME_OPTIONS = ["09:00", "12:00", "15:00", "18:00", "21:00"] as const;
export const DEFAULT_NOTIFY_TIME = "09:00";

export type NotifyTimeOption = typeof NOTIFY_TIME_OPTIONS[number];
export type NotifyUrgency = "overdue" | "due-soon" | "upcoming" | "later";

const NOTIFY_TIME_LABELS: Record<NotifyTimeOption, string> = {
  "09:00": "上午 9 点",
  "12:00": "中午 12 点",
  "15:00": "下午 3 点",
  "18:00": "下午 6 点",
  "21:00": "晚上 9 点",
};

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
const WHOLE_HOUR_PATTERN = /^([01]\d|2[0-3]):00$/;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function getLocalDateInputValue(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function createNotifyAt(dateValue: string, timeValue = DEFAULT_NOTIFY_TIME): number | null {
  const parsedDate = parseLocalDateValue(dateValue);
  const parsedHour = parseWholeHourValue(timeValue);
  if (!parsedDate || parsedHour === null) return null;

  return new Date(parsedDate.year, parsedDate.month - 1, parsedDate.day, parsedHour, 0, 0, 0).getTime();
}

export function getDefaultNotifySelection(now = new Date()): { date: string; time: NotifyTimeOption } {
  const nextToday = NOTIFY_TIME_OPTIONS.find((time) => {
    const hour = parseWholeHourValue(time);
    if (hour === null) return false;
    const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, 0, 0, 0);
    return candidate.getTime() > now.getTime();
  });

  if (nextToday) {
    return {
      date: getLocalDateInputValue(now),
      time: nextToday,
    };
  }

  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return {
    date: getLocalDateInputValue(tomorrow),
    time: DEFAULT_NOTIFY_TIME,
  };
}

export function getNotifyDisplay(notifyAt: number | undefined, now = Date.now()): NotifyDisplay | null {
  if (!isValidNotifyAt(notifyAt) || !isValidNotifyAt(now)) return null;

  if (notifyAt < now) {
    return {
      label: "! 已超期",
      compactLabel: "! 已超期",
      urgency: "overdue",
    };
  }

  const notifyDate = new Date(notifyAt);
  const dayDistance = getLocalDayDistance(now, notifyAt);
  const isWithinDueSoonWindow = notifyAt - now <= ONE_DAY_MS;
  const timeLabel = getDisplayTimeLabel(notifyDate);
  const compactTimeLabel = getCompactTimeLabel(notifyDate);

  if (isWithinDueSoonWindow && dayDistance === 0) {
    return {
      label: `今天${timeLabel}`,
      compactLabel: `今天 ${compactTimeLabel}`,
      urgency: "due-soon",
    };
  }

  if (isWithinDueSoonWindow && dayDistance === 1) {
    return {
      label: `明天${timeLabel}`,
      compactLabel: `明天 ${compactTimeLabel}`,
      urgency: "due-soon",
    };
  }

  if (dayDistance <= 3) {
    return {
      label: `${dayDistance}天后 ${timeLabel}`,
      compactLabel: `${dayDistance}天后 ${compactTimeLabel}`,
      urgency: "upcoming",
    };
  }

  return {
    label: `${notifyDate.getMonth() + 1}/${notifyDate.getDate()} ${timeLabel}`,
    compactLabel: `${notifyDate.getMonth() + 1}/${notifyDate.getDate()} ${compactTimeLabel}`,
    urgency: "later",
  };
}

export function getNotifyTimeLabel(time: NotifyTimeOption): string {
  return NOTIFY_TIME_LABELS[time];
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

function parseWholeHourValue(timeValue: string): number | null {
  const match = WHOLE_HOUR_PATTERN.exec(timeValue);
  if (!match) return null;
  return Number(match[1]);
}

function getDisplayTimeLabel(date: Date): string {
  const hour = date.getHours();
  if (hour === 0) return "凌晨 12:00";
  if (hour < 6) return `凌晨 ${hour}:00`;
  if (hour < 12) return `上午 ${hour}:00`;
  if (hour === 12) return "中午 12:00";
  if (hour <= 18) return `下午 ${hour - 12}:00`;
  return `晚上 ${hour - 12}:00`;
}

function getCompactTimeLabel(date: Date): string {
  return String(date.getHours()).padStart(2, "0");
}

function getLocalDayDistance(from: number, to: number): number {
  const fromDate = new Date(from);
  const toDate = new Date(to);
  const fromStart = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate()).getTime();
  const toStart = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate()).getTime();
  return Math.round((toStart - fromStart) / ONE_DAY_MS);
}
