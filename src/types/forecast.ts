import type { IsoDateString } from "./models";

export type ForecastEventKind =
  | "income"
  | "account-expense"
  | "card-charge"
  | "card-withdrawal";

export type AlertLevel = "danger" | "warning" | "info";

export interface ForecastReasonItem {
  label: string;
  amount: number;
  note?: string;
}

export interface ForecastEvent {
  id: string;
  date: IsoDateString;
  kind: ForecastEventKind;
  title: string;
  amount: number;
  direction: "in" | "out";
  targetType: "account" | "card";
  targetId: string;
  targetName: string;
  linkedCardId?: string;
  affectsCash: boolean;
  cashImpact: number;
  totalCashAfter: number;
  accountBalanceAfter?: number;
  cardOutstandingAfter?: number;
  shortageAccountsAfter: string[];
  reasonItems: ForecastReasonItem[];
  note?: string;
}

export interface ForecastAlert {
  id: string;
  level: AlertLevel;
  title: string;
  message: string;
  date?: IsoDateString;
  eventId?: string;
}

export interface NextEventSpendable {
  value: number;
  label: string;
  date?: IsoDateString;
}

export interface WithdrawalResilience {
  status: "safe" | "risk" | "none";
  label: string;
  note: string;
  minimumMargin: number | null;
  riskyAccountNames: string[];
}

export interface ForecastSummary {
  safeToSpendNow: number;
  nextEventSpendable: NextEventSpendable;
  monthEndFreeCash: number;
  withdrawalResilience: WithdrawalResilience;
  emergencyCreditHeadroom: number;
  alertCount: number;
  baselineTotalCash: number;
  forecastHorizonEnd: IsoDateString;
}

export interface ForecastResult {
  events: ForecastEvent[];
  alerts: ForecastAlert[];
  summary: ForecastSummary;
  assumptions: string[];
}
