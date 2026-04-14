import { FORECAST_DAYS } from "../../data/constants";
import { getCardBalanceMetrics } from "../cardMetrics";
import type { ForecastAlert, ForecastEventKind, ForecastReasonItem } from "../../types/forecast";
import type { AppData, CreditCard, IsoDateString } from "../../types/models";
import {
  addDays,
  compareDateStrings,
  enumerateMonthlyDatesByDay,
  enumerateMonthlyDatesFromTemplate,
  isDateInRange,
} from "../../utils/date";
import { createId } from "../../utils/id";
import { resolveCardWithdrawalDate, resolveNextBillingDate } from "./cardBilling";

export interface ForecastEventSeed {
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
  reasonItems: ForecastReasonItem[];
  note?: string;
}

interface ChargeProjection {
  id: string;
  date: IsoDateString;
  card: CreditCard;
  title: string;
  amount: number;
  reasonItems: ForecastReasonItem[];
  note?: string;
}

interface WithdrawalBucket {
  card: CreditCard;
  date: IsoDateString;
  amount: number;
  reasonItems: ForecastReasonItem[];
}

export interface GeneratedForecastEvents {
  events: ForecastEventSeed[];
  alerts: ForecastAlert[];
  horizonEnd: IsoDateString;
}

export function generateForecastEvents(
  data: AppData,
  today: IsoDateString,
  horizonDays: number = FORECAST_DAYS,
): GeneratedForecastEvents {
  const horizonEnd = addDays(today, horizonDays - 1);
  const accountMap = new Map(data.accounts.map((account) => [account.id, account]));
  const cardMap = new Map(data.cards.map((card) => [card.id, card]));
  const cardMetricsMap = new Map(
    data.cards.map((card) => [card.id, getCardBalanceMetrics(card)]),
  );
  const alerts: ForecastAlert[] = [];
  const seeds: ForecastEventSeed[] = [];
  const chargeProjections: ChargeProjection[] = [];

  for (const income of data.incomePlans) {
    const account = accountMap.get(income.accountId);

    if (!account) {
      alerts.push({
        id: createId("alert"),
        level: "warning",
        title: "収入予定の口座が未設定です",
        message: `「${income.name}」は存在しない口座に紐づいているため、予測から除外しました。`,
      });
      continue;
    }

    const dates =
      income.recurring === "monthly"
        ? enumerateMonthlyDatesFromTemplate(income.date, today, horizonEnd)
        : isDateInRange(income.date, today, horizonEnd)
          ? [income.date]
          : [];

    for (const date of dates) {
      seeds.push({
        id: createId("event"),
        date,
        kind: "income",
        title: income.name,
        amount: income.amount,
        direction: "in",
        targetType: "account",
        targetId: account.id,
        targetName: account.name,
        affectsCash: true,
        cashImpact: income.amount,
        reasonItems: [
          {
            label:
              income.recurring === "monthly"
                ? "毎月の入金予定として口座残高に加算"
                : "単発の入金予定として口座残高に加算",
            amount: income.amount,
          },
        ],
      });
    }
  }

  for (const expense of data.oneTimeExpenses) {
    if (!isDateInRange(expense.date, today, horizonEnd)) {
      continue;
    }

    if (expense.paymentType === "account") {
      const account = expense.accountId ? accountMap.get(expense.accountId) : undefined;

      if (!account) {
        alerts.push({
          id: createId("alert"),
          level: "warning",
          title: "単発支出の口座が未設定です",
          message: `「${expense.name}」は存在しない口座に紐づいているため、予測から除外しました。`,
        });
        continue;
      }

      seeds.push({
        id: createId("event"),
        date: expense.date,
        kind: "account-expense",
        title: expense.name,
        amount: expense.amount,
        direction: "out",
        targetType: "account",
        targetId: account.id,
        targetName: account.name,
        affectsCash: true,
        cashImpact: -expense.amount,
        reasonItems: [
          {
            label: "単発の口座支出として即時に残高から控除",
            amount: expense.amount,
          },
        ],
      });
      continue;
    }

    const card = expense.cardId ? cardMap.get(expense.cardId) : undefined;

    if (!card) {
      alerts.push({
        id: createId("alert"),
        level: "warning",
        title: "単発支出のカードが未設定です",
        message: `「${expense.name}」は存在しないカードに紐づいているため、予測から除外しました。`,
      });
      continue;
    }

    pushChargeProjection(chargeProjections, {
      id: expense.id,
      date: expense.date,
      card,
      title: expense.name,
      amount: expense.amount,
      reasonItems: [
        {
          label: "カード利用予定として将来の請求に加算",
          amount: expense.amount,
        },
      ],
    });
  }

  for (const subscription of data.subscriptions) {
    const card = cardMap.get(subscription.cardId);

    if (!card) {
      alerts.push({
        id: createId("alert"),
        level: "warning",
        title: "サブスクのカードが未設定です",
        message: `「${subscription.name}」は存在しないカードに紐づいているため、予測から除外しました。`,
      });
      continue;
    }

    const dates = enumerateMonthlyDatesByDay(subscription.billingDay, today, horizonEnd);

    for (const date of dates) {
      pushChargeProjection(chargeProjections, {
        id: subscription.id,
        date,
        card,
        title: subscription.name,
        amount: subscription.monthlyAmount,
        reasonItems: [
          {
            label: "毎月サブスク利用として将来請求に反映",
            amount: subscription.monthlyAmount,
          },
        ],
      });
    }
  }

  for (const card of data.cards) {
    const metrics = cardMetricsMap.get(card.id);

    if (metrics && metrics.unsettledAmount > 0) {
      pushChargeProjection(chargeProjections, {
        id: `${card.id}-carry`,
        date: today,
        card,
        title: `${card.name} 未確定利用額`,
        amount: metrics.unsettledAmount,
        reasonItems: [
          {
            label:
              metrics.unsettledAmountMode === "manual"
                ? "手動上書きした未確定利用額を今日時点のカード利用として繰り入れ"
                : "利用可能額から自動計算した未確定利用額を今日時点のカード利用として繰り入れ",
            amount: metrics.unsettledAmount,
          },
        ],
      });
    }
  }

  const withdrawalBuckets = new Map<string, WithdrawalBucket>();

  for (const charge of chargeProjections) {
    const withdrawalDate = resolveCardWithdrawalDate(charge.card, charge.date);
    const note =
      compareDateStrings(withdrawalDate, horizonEnd) <= 0
        ? `引落予定日 ${withdrawalDate}`
        : `引落予定日 ${withdrawalDate}（90日予測の外）`;

    seeds.push({
      id: createId("event"),
      date: charge.date,
      kind: "card-charge",
      title: charge.title,
      amount: charge.amount,
      direction: "out",
      targetType: "card",
      targetId: charge.card.id,
      targetName: charge.card.name,
      affectsCash: false,
      cashImpact: 0,
      reasonItems: charge.reasonItems,
      note,
    });

    if (compareDateStrings(withdrawalDate, horizonEnd) > 0) {
      continue;
    }

    const bucketKey = `${charge.card.id}-${withdrawalDate}`;
    const existingBucket = withdrawalBuckets.get(bucketKey);

    if (existingBucket) {
      existingBucket.amount += charge.amount;
      existingBucket.reasonItems.push({
        label: charge.title,
        amount: charge.amount,
        note: `利用日 ${charge.date}`,
      });
      continue;
    }

    withdrawalBuckets.set(bucketKey, {
      card: charge.card,
      date: withdrawalDate,
      amount: charge.amount,
      reasonItems: [
        {
          label: charge.title,
          amount: charge.amount,
          note: `利用日 ${charge.date}`,
        },
      ],
    });
  }

  for (const card of data.cards) {
    const metrics = cardMetricsMap.get(card.id);

    if (!metrics || metrics.nextBillingAmount <= 0) {
      continue;
    }

    const nextBillingDate = resolveNextBillingDate(card, today);
    const bucketKey = `${card.id}-${nextBillingDate}`;
    const existingBucket = withdrawalBuckets.get(bucketKey);

    if (existingBucket) {
      existingBucket.amount += metrics.nextBillingAmount;
      existingBucket.reasonItems.unshift({
        label: "確定済みの次回請求額",
        amount: metrics.nextBillingAmount,
      });
      continue;
    }

    withdrawalBuckets.set(bucketKey, {
      card,
      date: nextBillingDate,
      amount: metrics.nextBillingAmount,
      reasonItems: [
        {
          label: "確定済みの次回請求額",
          amount: metrics.nextBillingAmount,
        },
      ],
    });
  }

  for (const bucket of withdrawalBuckets.values()) {
    const withdrawalAccount = accountMap.get(bucket.card.withdrawalAccountId);

    if (!withdrawalAccount) {
      alerts.push({
        id: createId("alert"),
        level: "danger",
        title: "カード引き落とし口座が未設定です",
        message: `「${bucket.card.name}」の引き落とし口座が存在しないため、${bucket.date} の予測を作れませんでした。`,
        date: bucket.date,
      });
      continue;
    }

    if (compareDateStrings(bucket.date, horizonEnd) > 0) {
      continue;
    }

    seeds.push({
      id: createId("event"),
      date: bucket.date,
      kind: "card-withdrawal",
      title: `${bucket.card.name} 引き落とし`,
      amount: bucket.amount,
      direction: "out",
      targetType: "account",
      targetId: withdrawalAccount.id,
      targetName: withdrawalAccount.name,
      linkedCardId: bucket.card.id,
      affectsCash: true,
      cashImpact: -bucket.amount,
      reasonItems: bucket.reasonItems,
      note: `${bucket.card.name} の請求を ${withdrawalAccount.name} から支払い`,
    });
  }

  seeds.sort(compareSeeds);

  return {
    events: seeds,
    alerts,
    horizonEnd,
  };
}

function pushChargeProjection(list: ChargeProjection[], item: ChargeProjection) {
  list.push(item);
}

function compareSeeds(left: ForecastEventSeed, right: ForecastEventSeed): number {
  const dateOrder = compareDateStrings(left.date, right.date);

  if (dateOrder !== 0) {
    return dateOrder;
  }

  const priorityOrder = getSeedPriority(left) - getSeedPriority(right);

  if (priorityOrder !== 0) {
    return priorityOrder;
  }

  return left.title.localeCompare(right.title, "ja-JP");
}

function getSeedPriority(seed: ForecastEventSeed): number {
  if (seed.kind === "card-charge") {
    return 10;
  }

  if (seed.direction === "out") {
    return 20;
  }

  return 30;
}
