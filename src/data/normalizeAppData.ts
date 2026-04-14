import { inferAvailableAmount } from "../lib/cardMetrics";
import type {
  Account,
  AppData,
  CardUnsettledAmountMode,
  CreditCard,
  IncomePlan,
  OneTimeExpense,
  Subscription,
} from "../types/models";
import { getTodayDateString } from "../utils/date";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function getArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function getString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function getNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function getNonNegativeNumber(value: unknown, fallback: number): number {
  return Math.max(0, getNumber(value, fallback));
}

function getDay(value: unknown, fallback: number): number {
  return Math.min(31, Math.max(1, Math.round(getNumber(value, fallback))));
}

function normalizeAccount(value: unknown, index: number): Account {
  const record = isRecord(value) ? value : {};

  return {
    id: getString(record.id, `account-${index + 1}`),
    name: getString(record.name, `口座 ${index + 1}`),
    balance: getNumber(record.balance, 0),
  };
}

function normalizeCard(value: unknown, index: number): CreditCard {
  const record = isRecord(value) ? value : {};
  const limit = getNonNegativeNumber(record.limit, 0);
  const nextBillingAmount = getNonNegativeNumber(record.nextBillingAmount, 0);
  const legacyUnsettledAmount = getNonNegativeNumber(record.unsettledAmount, 0);
  const unsettledAmountMode: CardUnsettledAmountMode =
    record.unsettledAmountMode === "manual" ? "manual" : "auto";
  const manualUnsettledAmount =
    unsettledAmountMode === "manual"
      ? getNonNegativeNumber(record.manualUnsettledAmount, legacyUnsettledAmount)
      : undefined;
  const availableAmount =
    typeof record.availableAmount === "number"
      ? Math.min(limit, getNonNegativeNumber(record.availableAmount, limit))
      : inferAvailableAmount(
          limit,
          nextBillingAmount,
          manualUnsettledAmount ?? legacyUnsettledAmount,
        );

  return {
    id: getString(record.id, `card-${index + 1}`),
    name: getString(record.name, `カード ${index + 1}`),
    limit,
    closingDay: getDay(record.closingDay, 20),
    withdrawalDay: getDay(record.withdrawalDay, 10),
    withdrawalAccountId: getString(record.withdrawalAccountId, ""),
    availableAmount,
    nextBillingAmount,
    unsettledAmountMode,
    manualUnsettledAmount,
  };
}

function normalizeSubscription(value: unknown, index: number): Subscription {
  const record = isRecord(value) ? value : {};

  return {
    id: getString(record.id, `subscription-${index + 1}`),
    name: getString(record.name, `サブスク ${index + 1}`),
    monthlyAmount: getNonNegativeNumber(record.monthlyAmount, 0),
    billingDay: getDay(record.billingDay, 1),
    cardId: getString(record.cardId, ""),
  };
}

function normalizeIncomePlan(value: unknown, index: number, today: string): IncomePlan {
  const record = isRecord(value) ? value : {};

  return {
    id: getString(record.id, `income-${index + 1}`),
    name: getString(record.name, `収入予定 ${index + 1}`),
    amount: getNonNegativeNumber(record.amount, 0),
    date: getString(record.date, today),
    accountId: getString(record.accountId, ""),
    recurring: record.recurring === "once" ? "once" : "monthly",
  };
}

function normalizeOneTimeExpense(value: unknown, index: number, today: string): OneTimeExpense {
  const record = isRecord(value) ? value : {};
  const paymentType = record.paymentType === "card" ? "card" : "account";

  return {
    id: getString(record.id, `expense-${index + 1}`),
    name: getString(record.name, `単発支出 ${index + 1}`),
    amount: getNonNegativeNumber(record.amount, 0),
    date: getString(record.date, today),
    paymentType,
    accountId: paymentType === "account" ? getString(record.accountId, "") : undefined,
    cardId: paymentType === "card" ? getString(record.cardId, "") : undefined,
  };
}

export function normalizeAppData(value: unknown): AppData {
  const record = isRecord(value) ? value : {};
  const today = getTodayDateString();

  return {
    accounts: getArray(record.accounts).map(normalizeAccount),
    cards: getArray(record.cards).map(normalizeCard),
    subscriptions: getArray(record.subscriptions).map(normalizeSubscription),
    incomePlans: getArray(record.incomePlans).map((item, index) =>
      normalizeIncomePlan(item, index, today),
    ),
    oneTimeExpenses: getArray(record.oneTimeExpenses).map((item, index) =>
      normalizeOneTimeExpense(item, index, today),
    ),
  };
}
