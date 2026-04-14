import type { IsoDateString } from "../types/models";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

interface YearMonth {
  year: number;
  monthIndex: number;
}

export function buildDateString(year: number, monthIndex: number, day: number): IsoDateString {
  const date = new Date(year, monthIndex, day, 12, 0, 0, 0);

  return toDateString(date);
}

export function parseDateString(value: IsoDateString): Date {
  if (!DATE_PATTERN.test(value)) {
    throw new Error(`Invalid ISO date string: ${value}`);
  }

  const [year, month, day] = value.split("-").map(Number);

  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function toDateString(date: Date): IsoDateString {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function getTodayDateString(): IsoDateString {
  const now = new Date();

  return toDateString(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0));
}

export function compareDateStrings(left: IsoDateString, right: IsoDateString): number {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}

export function addDays(dateString: IsoDateString, days: number): IsoDateString {
  const next = parseDateString(dateString);
  next.setDate(next.getDate() + days);

  return toDateString(next);
}

export function addMonths(dateString: IsoDateString, months: number): IsoDateString {
  const date = parseDateString(dateString);
  const nextYearMonth = shiftYearMonth(date.getFullYear(), date.getMonth(), months);
  const day = clampDayToMonth(nextYearMonth.year, nextYearMonth.monthIndex, date.getDate());

  return buildDateString(nextYearMonth.year, nextYearMonth.monthIndex, day);
}

export function getMonthStart(dateString: IsoDateString): IsoDateString {
  const date = parseDateString(dateString);

  return buildDateString(date.getFullYear(), date.getMonth(), 1);
}

export function getMonthEnd(dateString: IsoDateString): IsoDateString {
  const date = parseDateString(dateString);
  const lastDay = getDaysInMonth(date.getFullYear(), date.getMonth());

  return buildDateString(date.getFullYear(), date.getMonth(), lastDay);
}

export function getNextMonthStart(dateString: IsoDateString): IsoDateString {
  const next = addMonths(getMonthStart(dateString), 1);

  return getMonthStart(next);
}

export function getDaysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0, 12, 0, 0, 0).getDate();
}

export function clampDayToMonth(year: number, monthIndex: number, day: number): number {
  return Math.max(1, Math.min(day, getDaysInMonth(year, monthIndex)));
}

export function isDateInRange(
  value: IsoDateString,
  start: IsoDateString,
  end: IsoDateString,
): boolean {
  return compareDateStrings(value, start) >= 0 && compareDateStrings(value, end) <= 0;
}

export function getDateDay(dateString: IsoDateString): number {
  return parseDateString(dateString).getDate();
}

export function getNextOccurrenceOnOrAfter(
  fromDate: IsoDateString,
  day: number,
): IsoDateString {
  return getMonthlyOccurrence(fromDate, day, false);
}

export function getNextOccurrenceAfter(fromDate: IsoDateString, day: number): IsoDateString {
  return getMonthlyOccurrence(fromDate, day, true);
}

function getMonthlyOccurrence(
  fromDate: IsoDateString,
  day: number,
  strictlyAfter: boolean,
): IsoDateString {
  const base = parseDateString(fromDate);
  let year = base.getFullYear();
  let monthIndex = base.getMonth();
  let candidate = buildDateString(year, monthIndex, clampDayToMonth(year, monthIndex, day));

  if (
    compareDateStrings(candidate, fromDate) < 0 ||
    (strictlyAfter && compareDateStrings(candidate, fromDate) === 0)
  ) {
    const next = shiftYearMonth(year, monthIndex, 1);
    year = next.year;
    monthIndex = next.monthIndex;
    candidate = buildDateString(year, monthIndex, clampDayToMonth(year, monthIndex, day));
  }

  return candidate;
}

export function enumerateMonthlyDatesFromTemplate(
  templateDate: IsoDateString,
  start: IsoDateString,
  end: IsoDateString,
): IsoDateString[] {
  const template = parseDateString(templateDate);
  const anchor = compareDateStrings(templateDate, start) > 0 ? templateDate : start;

  return enumerateMonthlyDatesByDay(template.getDate(), anchor, end, templateDate);
}

export function enumerateMonthlyDatesByDay(
  day: number,
  start: IsoDateString,
  end: IsoDateString,
  minimumDate?: IsoDateString,
): IsoDateString[] {
  const startDate = parseDateString(start);
  const endDate = parseDateString(end);
  const result: IsoDateString[] = [];
  let cursor: YearMonth = {
    year: startDate.getFullYear(),
    monthIndex: startDate.getMonth(),
  };

  while (true) {
    const eventDate = buildDateString(
      cursor.year,
      cursor.monthIndex,
      clampDayToMonth(cursor.year, cursor.monthIndex, day),
    );

    if (
      compareDateStrings(eventDate, start) >= 0 &&
      compareDateStrings(eventDate, end) <= 0 &&
      (!minimumDate || compareDateStrings(eventDate, minimumDate) >= 0)
    ) {
      result.push(eventDate);
    }

    if (
      cursor.year > endDate.getFullYear() ||
      (cursor.year === endDate.getFullYear() && cursor.monthIndex >= endDate.getMonth())
    ) {
      break;
    }

    cursor = shiftYearMonth(cursor.year, cursor.monthIndex, 1);
  }

  return result;
}

export function shiftYearMonth(year: number, monthIndex: number, delta: number): YearMonth {
  const totalMonths = year * 12 + monthIndex + delta;
  const normalizedMonth = ((totalMonths % 12) + 12) % 12;
  const adjustedYear = Math.floor((totalMonths - normalizedMonth) / 12);

  return { year: adjustedYear, monthIndex: normalizedMonth };
}
