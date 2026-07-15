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
import { formatDate } from "../../utils/format";
import { createId } from "../../utils/id";
import { resolveCardWithdrawalDate, resolveNextBillingDate } from "./cardBilling";

export interface ForecastEventSeed {
  id: string;
  date: IsoDateString;
  kind: ForecastEventKind;
  title: string;
  amount: number;
  direction: "in" | "out" | "neutral";
  targetType: "account" | "card";
  targetId: string;
  targetName: string;
  linkedCardId?: string;
  counterpartyTargetId?: string;
  counterpartyTargetName?: string;
  counterpartyCashImpact?: number;
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
  const activeAccounts = data.accounts.filter(isEnabled);
  const activeCards = data.cards.filter(isEnabled);
  const accountMap = new Map(activeAccounts.map((account) => [account.id, account]));
  const cardMap = new Map(activeCards.map((card) => [card.id, card]));
  const cardMetricsMap = new Map(
    activeCards.map((card) => [card.id, getCardBalanceMetrics(card)]),
  );
  const cardSnapshotDates = new Map(
    activeCards.map((card) => [card.id, getEffectiveSnapshotDate(card, today)]),
  );
  const alerts: ForecastAlert[] = [];
  const seeds: ForecastEventSeed[] = [];
  const chargeProjections: ChargeProjection[] = [];

  for (const income of data.incomePlans.filter(isEnabled)) {
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

  for (const transfer of data.accountTransfers.filter(isEnabled)) {
    if (transfer.amount <= 0 || !isDateInRange(transfer.date, today, horizonEnd)) {
      continue;
    }

    const fromAccount = accountMap.get(transfer.fromAccountId);
    const toAccount = accountMap.get(transfer.toAccountId);

    if (!fromAccount || !toAccount) {
      alerts.push({
        id: createId("alert"),
        level: "warning",
        title: "口座振替の口座が未設定です",
        message: `「${transfer.name}」は存在しない口座を含むため、予測から除外しました。`,
      });
      continue;
    }

    if (fromAccount.id === toAccount.id) {
      alerts.push({
        id: createId("alert"),
        level: "warning",
        title: "口座振替の振替元と振替先が同じです",
        message: `「${transfer.name}」は同じ口座を指定しているため、予測から除外しました。`,
      });
      continue;
    }

    seeds.push({
      id: createId("event"),
      date: transfer.date,
      kind: "account-transfer",
      title: transfer.name,
      amount: transfer.amount,
      direction: "neutral",
      targetType: "account",
      targetId: fromAccount.id,
      targetName: fromAccount.name,
      counterpartyTargetId: toAccount.id,
      counterpartyTargetName: toAccount.name,
      counterpartyCashImpact: transfer.amount,
      affectsCash: true,
      cashImpact: -transfer.amount,
      reasonItems: [
        {
          label: `${fromAccount.name} から振替`,
          amount: transfer.amount,
        },
        {
          label: `${toAccount.name} へ着金`,
          amount: transfer.amount,
        },
      ],
      note: `${fromAccount.name} から ${toAccount.name} へ振替`,
    });
  }

  for (const expense of data.oneTimeExpenses.filter(isEnabled)) {
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

  for (const subscription of data.subscriptions.filter(isEnabled)) {
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

  for (const card of activeCards) {
    const metrics = cardMetricsMap.get(card.id);
    const snapshotDate = cardSnapshotDates.get(card.id) ?? today;
    const nextBillingDate = resolveNextBillingDate(card, snapshotDate);
    const unsettledWithdrawalDate = resolveCardWithdrawalDate(card, snapshotDate);
    const staleReasons: string[] = [];

    if (metrics?.nextBillingAmount && compareDateStrings(nextBillingDate, today) < 0) {
      staleReasons.push(`次回請求の引落予定日 ${formatDate(nextBillingDate)}`);
    }

    if (metrics?.unsettledAmount && compareDateStrings(unsettledWithdrawalDate, today) < 0) {
      staleReasons.push(`未確定利用の想定引落日 ${formatDate(unsettledWithdrawalDate)}`);
    }

    if (staleReasons.length > 0) {
      alerts.push({
        id: createId("alert"),
        level: "warning",
        title: "カード請求見込みの時点日が古い可能性があります",
        message: `「${card.name}」は ${formatDate(snapshotDate)} 時点の入力です。${staleReasons.join("、")} が基準日より前なので、カード情報を更新してください。`,
      });
    }

    if (
      metrics &&
      metrics.unsettledAmount > 0 &&
      compareDateStrings(unsettledWithdrawalDate, today) >= 0
    ) {
      pushChargeProjection(chargeProjections, {
        id: `${card.id}-carry`,
        date: snapshotDate,
        card,
        title: `${card.name} 未確定利用額`,
        amount: metrics.unsettledAmount,
        reasonItems: [
          {
            label:
              metrics.unsettledAmountMode === "manual"
                ? "入力時点で手動上書きした未確定利用額をカード利用として繰り入れ"
                : "入力時点で利用可能額から自動計算した未確定利用額をカード利用として繰り入れ",
            amount: metrics.unsettledAmount,
            note: `カード情報の時点日 ${formatDate(snapshotDate)}`,
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
        ? `引落予定日 ${formatDate(withdrawalDate)}`
        : `引落予定日 ${formatDate(withdrawalDate)}（90日予測の外）`;

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
        note: `利用日 ${formatDate(charge.date)}`,
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
          note: `利用日 ${formatDate(charge.date)}`,
        },
      ],
    });
  }

  for (const card of activeCards) {
    const metrics = cardMetricsMap.get(card.id);
    const snapshotDate = cardSnapshotDates.get(card.id) ?? today;
    const nextBillingDate = resolveNextBillingDate(card, snapshotDate);

    if (
      !metrics ||
      metrics.nextBillingAmount <= 0 ||
      compareDateStrings(nextBillingDate, today) < 0
    ) {
      continue;
    }
    const bucketKey = `${card.id}-${nextBillingDate}`;
    const existingBucket = withdrawalBuckets.get(bucketKey);

    if (existingBucket) {
      existingBucket.amount += metrics.nextBillingAmount;
      existingBucket.reasonItems.unshift({
        label: `${formatDate(nextBillingDate)}引落分の確定済み請求額`,
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
          label: `${formatDate(nextBillingDate)}引落分の確定済み請求額`,
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
        message: `「${bucket.card.name}」の引き落とし口座が存在しないため、${formatDate(bucket.date)} の予測を作れませんでした。`,
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
      title: `${bucket.card.name} ${formatDate(bucket.date)}引き落とし`,
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

function isEnabled<T extends { enabled?: boolean }>(item: T): boolean {
  return item.enabled !== false;
}

function getEffectiveSnapshotDate(card: CreditCard, today: IsoDateString): IsoDateString {
  return compareDateStrings(card.snapshotDate, today) > 0 ? today : card.snapshotDate;
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

  if (seed.kind === "account-transfer") {
    return 15;
  }

  if (seed.direction === "out") {
    return 20;
  }

  return 30;
}
