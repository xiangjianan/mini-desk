export const DEADLINE_TIME_OPTIONS = ["09:00", "12:00", "15:00", "18:00", "21:00"] as const;
export const DEFAULT_DEADLINE_TIME = "09:00";

export type DeadlineTimeOption = typeof DEADLINE_TIME_OPTIONS[number];
export type DeadlineUrgency = "overdue" | "due-soon" | "upcoming" | "later";

const DEADLINE_TIME_LABELS: Record<DeadlineTimeOption, string> = {
  "09:00": "上午 9 点",
  "12:00": "中午 12 点",
  "15:00": "下午 3 点",
  "18:00": "下午 6 点",
  "21:00": "晚上 9 点",
};

export interface DeadlineDisplay {
  label: string;
  urgency: DeadlineUrgency;
}

const DATE_INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const WHOLE_HOUR_PATTERN = /^([01]\d|2[0-3]):00$/;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function getLocalDateInputValue(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function createDeadlineAt(dateValue: string, timeValue = DEFAULT_DEADLINE_TIME): number | null {
  const parsedDate = parseLocalDateValue(dateValue);
  const parsedHour = parseWholeHourValue(timeValue);
  if (!parsedDate || parsedHour === null) return null;

  return new Date(parsedDate.year, parsedDate.month - 1, parsedDate.day, parsedHour, 0, 0, 0).getTime();
}

export function getDefaultDeadlineSelection(now = new Date()): { date: string; time: DeadlineTimeOption } {
  const nextToday = DEADLINE_TIME_OPTIONS.find((time) => {
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
    time: DEFAULT_DEADLINE_TIME,
  };
}

export function getDeadlineDisplay(deadlineAt: number | undefined, now = Date.now()): DeadlineDisplay | null {
  if (!isValidDeadlineAt(deadlineAt) || !isValidDeadlineAt(now)) return null;

  if (deadlineAt < now) {
    return {
      label: "! 已超期",
      urgency: "overdue",
    };
  }

  const deadlineDate = new Date(deadlineAt);
  const dayDistance = getLocalDayDistance(now, deadlineAt);
  const isWithinDueSoonWindow = deadlineAt - now <= ONE_DAY_MS;
  const timeLabel = getDisplayTimeLabel(deadlineDate);

  if (isWithinDueSoonWindow && dayDistance === 0) {
    return {
      label: `今天${timeLabel}`,
      urgency: "due-soon",
    };
  }

  if (isWithinDueSoonWindow && dayDistance === 1) {
    return {
      label: `明天${timeLabel}`,
      urgency: "due-soon",
    };
  }

  if (dayDistance <= 3) {
    return {
      label: `${dayDistance}天后 ${timeLabel}`,
      urgency: "upcoming",
    };
  }

  return {
    label: `${deadlineDate.getMonth() + 1}/${deadlineDate.getDate()} ${timeLabel}`,
    urgency: "later",
  };
}

export function getDeadlineTimeLabel(time: DeadlineTimeOption): string {
  return DEADLINE_TIME_LABELS[time];
}

export function isValidDeadlineAt(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

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

function getLocalDayDistance(from: number, to: number): number {
  const fromDate = new Date(from);
  const toDate = new Date(to);
  const fromStart = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate()).getTime();
  const toStart = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate()).getTime();
  return Math.round((toStart - fromStart) / ONE_DAY_MS);
}
