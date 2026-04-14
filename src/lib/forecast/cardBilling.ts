import type { CreditCard, IsoDateString } from "../../types/models";
import {
  clampDayToMonth,
  parseDateString,
  shiftYearMonth,
  getNextOccurrenceOnOrAfter,
  getNextOccurrenceAfter,
  buildDateString,
} from "../../utils/date";

export function resolveNextBillingDate(card: CreditCard, today: IsoDateString): IsoDateString {
  return getNextOccurrenceOnOrAfter(today, card.withdrawalDay);
}

export function resolveCardClosingDate(
  card: CreditCard,
  chargeDate: IsoDateString,
): IsoDateString {
  const base = parseDateString(chargeDate);
  let year = base.getFullYear();
  let monthIndex = base.getMonth();
  const currentMonthClosingDay = clampDayToMonth(year, monthIndex, card.closingDay);

  if (base.getDate() > currentMonthClosingDay) {
    const next = shiftYearMonth(year, monthIndex, 1);
    year = next.year;
    monthIndex = next.monthIndex;
  }

  const closingDay = clampDayToMonth(year, monthIndex, card.closingDay);

  return buildDateString(year, monthIndex, closingDay);
}

export function resolveCardWithdrawalDate(
  card: CreditCard,
  chargeDate: IsoDateString,
): IsoDateString {
  const closingDate = resolveCardClosingDate(card, chargeDate);

  return getNextOccurrenceAfter(closingDate, card.withdrawalDay);
}
