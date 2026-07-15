import type { ForecastEventKind } from "../types/forecast";
import type { IsoDateString } from "../types/models";
import { parseDateString } from "./date";

const currencyFormatter = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
});

const shortDateFormatter = new Intl.DateTimeFormat("ja-JP", {
  month: "short",
  day: "numeric",
  weekday: "short",
});

const mediumDateFormatter = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

const yearMonthFormatter = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "long",
});

export function formatCurrency(value: number): string {
  return currencyFormatter.format(Math.round(value));
}

/** 軸ラベル用。¥388,000 では長すぎるので「38.8万」に縮める。 */
export function formatCompactCurrency(value: number): string {
  const rounded = Math.round(value);

  if (rounded === 0) {
    return "0";
  }

  if (Math.abs(rounded) < 10_000) {
    return rounded.toLocaleString("ja-JP");
  }

  const man = rounded / 10_000;

  return `${Number.isInteger(man) ? man : man.toFixed(1)}万`;
}

export function formatDate(dateString: IsoDateString): string {
  return mediumDateFormatter.format(parseDateString(dateString));
}

export function formatYearMonth(dateString: IsoDateString): string {
  return yearMonthFormatter.format(parseDateString(dateString));
}

export function formatShortDate(dateString: IsoDateString): string {
  return shortDateFormatter.format(parseDateString(dateString));
}

export function getEventKindLabel(kind: ForecastEventKind): string {
  switch (kind) {
    case "income":
      return "収入";
    case "account-expense":
      return "口座支出";
    case "account-transfer":
      return "口座振替";
    case "card-charge":
      return "カード利用";
    case "card-withdrawal":
      return "カード引落";
    default:
      return kind;
  }
}
