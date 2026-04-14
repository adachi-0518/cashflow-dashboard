import type { AppData } from "../types/models";
import { addDays, buildDateString, getTodayDateString, parseDateString } from "../utils/date";

export function createSampleData(baseDate: string = getTodayDateString()): AppData {
  const today = parseDateString(baseDate);
  const salaryDate = buildDateString(today.getFullYear(), today.getMonth(), 25);

  return {
    accounts: [
      {
        id: "account-main",
        name: "生活・引落口座",
        balance: 268000,
        enabled: true,
      },
      {
        id: "account-reserve",
        name: "予備口座",
        balance: 120000,
        enabled: true,
      },
    ],
    cards: [
      {
        id: "card-main",
        name: "メインカード",
        limit: 600000,
        closingDay: 20,
        withdrawalDay: 10,
        withdrawalAccountId: "account-main",
        availableAmount: 500000,
        nextBillingAmount: 72000,
        unsettledAmountMode: "auto",
        enabled: true,
      },
      {
        id: "card-sub",
        name: "サブカード",
        limit: 250000,
        closingDay: 5,
        withdrawalDay: 27,
        withdrawalAccountId: "account-main",
        availableAmount: 223000,
        nextBillingAmount: 18000,
        unsettledAmountMode: "auto",
        enabled: true,
      },
    ],
    subscriptions: [
      {
        id: "subscription-video",
        name: "動画サブスク",
        monthlyAmount: 1490,
        billingDay: 15,
        cardId: "card-main",
        enabled: true,
      },
      {
        id: "subscription-gym",
        name: "ジム",
        monthlyAmount: 8800,
        billingDay: 26,
        cardId: "card-sub",
        enabled: true,
      },
      {
        id: "subscription-storage",
        name: "クラウドストレージ",
        monthlyAmount: 1300,
        billingDay: 3,
        cardId: "card-main",
        enabled: true,
      },
    ],
    incomePlans: [
      {
        id: "income-salary",
        name: "給与",
        amount: 305000,
        date: salaryDate,
        accountId: "account-main",
        recurring: "monthly",
        enabled: true,
      },
      {
        id: "income-bonus",
        name: "副収入",
        amount: 42000,
        date: addDays(baseDate, 18),
        accountId: "account-main",
        recurring: "once",
        enabled: true,
      },
    ],
    oneTimeExpenses: [
      {
        id: "expense-tax",
        name: "住民税",
        amount: 38000,
        date: addDays(baseDate, 12),
        paymentType: "account",
        accountId: "account-main",
        enabled: true,
      },
      {
        id: "expense-travel",
        name: "旅行代金",
        amount: 68000,
        date: addDays(baseDate, 25),
        paymentType: "card",
        cardId: "card-main",
        enabled: true,
      },
    ],
  };
}

export function createEmptyData(): AppData {
  return {
    accounts: [],
    cards: [],
    subscriptions: [],
    incomePlans: [],
    oneTimeExpenses: [],
  };
}
