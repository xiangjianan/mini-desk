export const DEADLINE_TIME_OPTIONS = ["09:00", "12:00", "15:00", "18:00", "21:00"] as const;
export const DEFAULT_DEADLINE_TIME = "18:00";

export type DeadlineTimeOption = typeof DEADLINE_TIME_OPTIONS[number];
export type DeadlineUrgency = "overdue" | "due-soon" | "upcoming" | "later";

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
  const hour = String(deadlineDate.getHours()).padStart(2, "0");

  if (dayDistance === 0) {
    return {
      label: `! 今天 ${hour}`,
      urgency: "due-soon",
    };
  }

  if (dayDistance === 1) {
    return {
      label: `! 明天 ${hour}`,
      urgency: "due-soon",
    };
  }

  if (dayDistance <= 3) {
    return {
      label: `${dayDistance}天后 ${hour}`,
      urgency: "upcoming",
    };
  }

  return {
    label: `${deadlineDate.getMonth() + 1}/${deadlineDate.getDate()} ${hour}`,
    urgency: "later",
  };
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

function getLocalDayDistance(from: number, to: number): number {
  const fromDate = new Date(from);
  const toDate = new Date(to);
  const fromStart = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate()).getTime();
  const toStart = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate()).getTime();
  return Math.round((toStart - fromStart) / ONE_DAY_MS);
}
