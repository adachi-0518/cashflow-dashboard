import { getCardBalanceMetrics } from "../cardMetrics";
import type {
  BalanceTimelinePoint,
  ForecastAlert,
  ForecastEvent,
  ForecastResult,
  WithdrawalResilience,
} from "../../types/forecast";
import type { AppData } from "../../types/models";
import { getMonthEnd, getNextMonthStart, compareDateStrings } from "../../utils/date";
import { formatDate, formatYearMonth } from "../../utils/format";
import { createId } from "../../utils/id";
import type { ForecastEventSeed } from "./generateForecastEvents";

interface CalculateForecastParams {
  data: AppData;
  today: string;
  horizonEnd: string;
  events: ForecastEventSeed[];
  baseAlerts: ForecastAlert[];
}

interface AccountCashSnapshot {
  balances: Record<string, number>;
  totalCash: number;
}

export function calculateForecast({
  data,
  today,
  horizonEnd,
  events,
  baseAlerts,
}: CalculateForecastParams): ForecastResult {
  const activeAccounts = data.accounts.filter(isEnabled);
  const activeCards = data.cards.filter(isEnabled);
  const cardMetricsMap = new Map(
    activeCards.map((card) => [card.id, getCardBalanceMetrics(card)]),
  );
  const accountIds = activeAccounts.map((account) => account.id);
  const accountNameMap = new Map(activeAccounts.map((account) => [account.id, account.name]));
  const accountBalances = new Map(activeAccounts.map((account) => [account.id, account.balance]));
  const cardOutstanding = new Map(
    activeCards.map((card) => [card.id, cardMetricsMap.get(card.id)?.nextBillingAmount ?? 0]),
  );
  let totalCash = activeAccounts.reduce((sum, account) => sum + account.balance, 0);
  const alerts = [...baseAlerts];
  const simulatedEvents: ForecastEvent[] = [];
  const accountSnapshots: AccountCashSnapshot[] = [
    createAccountCashSnapshot(accountBalances, accountIds, totalCash),
  ];
  const initialShortageAccounts = findShortageAccounts(accountBalances);
  let previousShortageSignature = [...initialShortageAccounts].sort().join("|");
  // 日付をキーにすることで、同じ日に複数イベントがあっても最後の1件（＝その日の
  // 終わりの残高）だけが残る。Map は最初の挿入位置を保つので日付順も崩れない。
  const timelineByDate = new Map<string, BalanceTimelinePoint>([
    [today, createTimelinePoint(today, accountBalances, accountIds, totalCash)],
  ]);

  if (initialShortageAccounts.length > 0) {
    alerts.push({
      id: createId("alert"),
      level: "danger",
      title: "現在残高ですでに不足している口座があります",
      message: `開始時点で ${initialShortageAccounts
        .map((accountId) => accountNameMap.get(accountId) ?? accountId)
        .join("、")} がマイナスです。`,
    });
  }

  for (const event of events) {
    let accountBalanceAfter: number | undefined;
    let cardOutstandingAfter: number | undefined;
    let counterpartyAccountBalanceAfter: number | undefined;

    if (event.kind === "card-charge") {
      const currentOutstanding = cardOutstanding.get(event.targetId) ?? 0;
      const nextOutstanding = currentOutstanding + event.amount;
      cardOutstanding.set(event.targetId, nextOutstanding);
      cardOutstandingAfter = nextOutstanding;
    } else if (event.targetType === "account") {
      const currentBalance = accountBalances.get(event.targetId) ?? 0;
      const nextBalance = currentBalance + event.cashImpact;
      accountBalances.set(event.targetId, nextBalance);
      totalCash += event.cashImpact;
      accountBalanceAfter = nextBalance;

      if (event.kind === "card-withdrawal" && event.linkedCardId) {
        const currentOutstanding = cardOutstanding.get(event.linkedCardId) ?? 0;
        if (currentOutstanding > 0) {
          const nextOutstanding = Math.max(0, currentOutstanding - event.amount);
          cardOutstanding.set(event.linkedCardId, nextOutstanding);
          cardOutstandingAfter = nextOutstanding;
        }
      }
    }

    if (
      event.counterpartyTargetId &&
      typeof event.counterpartyCashImpact === "number"
    ) {
      const currentCounterpartyBalance = accountBalances.get(event.counterpartyTargetId) ?? 0;
      const nextCounterpartyBalance =
        currentCounterpartyBalance + event.counterpartyCashImpact;
      accountBalances.set(event.counterpartyTargetId, nextCounterpartyBalance);
      totalCash += event.counterpartyCashImpact;
      counterpartyAccountBalanceAfter = nextCounterpartyBalance;
    }

    const shortageAccountsAfter = findShortageAccounts(accountBalances);
    const minimumAccountBalanceAfter = getMinimumAccountBalance(accountBalances);
    const shortageSignature = [...shortageAccountsAfter].sort().join("|");

    if (shortageAccountsAfter.length > 0 && shortageSignature !== previousShortageSignature) {
      alerts.push({
        id: createId("alert"),
        level: "danger",
        title: "将来の残高不足を検知しました",
        message: `${formatDate(event.date)} の「${event.title}」後に ${shortageAccountsAfter
          .map((accountId) => accountNameMap.get(accountId) ?? accountId)
          .join("、")} が不足します。`,
        date: event.date,
        eventId: event.id,
      });
    }

    previousShortageSignature = shortageSignature;

    simulatedEvents.push({
      ...event,
      totalCashAfter: totalCash,
      accountBalanceAfter,
      cardOutstandingAfter,
      counterpartyAccountBalanceAfter,
      minimumAccountBalanceAfter,
      shortageAccountsAfter,
    });

    if (event.affectsCash) {
      accountSnapshots.push(createAccountCashSnapshot(accountBalances, accountIds, totalCash));
      timelineByDate.set(
        event.date,
        createTimelinePoint(event.date, accountBalances, accountIds, totalCash),
      );
    }
  }

  // 最終イベント以降は残高が動かないので、予測期間の終端まで水平に伸ばす
  const timelinePoints = [...timelineByDate.values()];
  const lastTimelinePoint = timelinePoints[timelinePoints.length - 1];

  if (lastTimelinePoint && lastTimelinePoint.date !== horizonEnd) {
    timelinePoints.push({ ...lastTimelinePoint, date: horizonEnd });
  }

  const monthEnd = getMonthEnd(today);
  const nextMonthStart = getNextMonthStart(today);
  const nextMonthEnd = getMonthEnd(nextMonthStart);
  const nextMonthLabel = formatYearMonth(nextMonthStart);
  const cashEvents = simulatedEvents.filter((event) => event.affectsCash);
  const monthEndCashEvent = [...cashEvents]
    .reverse()
    .find((event) => compareDateStrings(event.date, monthEnd) <= 0);
  const nextCashEvent = cashEvents[0];
  const nextMonthWithdrawals = simulatedEvents.filter(
    (event) =>
      event.kind === "card-withdrawal" &&
      compareDateStrings(event.date, nextMonthStart) >= 0 &&
      compareDateStrings(event.date, nextMonthEnd) <= 0,
  );

  const hasBlockingDanger =
    baseAlerts.some((alert) => alert.level === "danger") || initialShortageAccounts.length > 0;
  const safeToSpendNow = hasBlockingDanger
    ? 0
    : calculateSpendableAmount(accountSnapshots, 0);
  const nextEventSpendableValue = hasBlockingDanger
    ? 0
    : calculateSpendableAmount(accountSnapshots, nextCashEvent ? 1 : 0);
  const withdrawalResilience = buildWithdrawalResilience(
    nextMonthWithdrawals,
    accountNameMap,
    nextMonthLabel,
  );

  return {
    events: simulatedEvents,
    alerts,
    balanceTimeline: timelinePoints,
    assumptions: [
      "予測対象は今日から90日先までです。",
      "同日の処理順は、カード利用計上 → 口座振替 → 口座からの支出・引き落とし → 収入の順です。",
      "安全に使える額は、各口座の将来最小残高を合計して算出し、どこか1口座でも不足見込みがあれば 0 円にします。",
      "カードの次回請求額と未確定利用額は、各カードの入力時点日と引落タイミング設定を基準に引き落とし月へ割り当てます。",
      "サブスクとカード払いの支出は、カード情報の時点日から数えます。時点日から今日までの利用は利用可能額にまだ入っていないためです。",
      "カード未確定利用額は原則「利用枠 - 利用可能額 - 直近の引落額」で自動計算し、必要時は手動上書きを優先します。",
    ],
    summary: {
      safeToSpendNow,
      nextEventSpendable: {
        value: nextEventSpendableValue,
        label: nextCashEvent ? nextCashEvent.title : "今後90日に現金イベントなし",
        date: nextCashEvent?.date,
      },
      monthEndFreeCash: monthEndCashEvent ? monthEndCashEvent.totalCashAfter : totalCashAtStart(activeAccounts),
      withdrawalResilience,
      emergencyCreditHeadroom: activeCards.reduce((sum, card) => {
        const metrics = cardMetricsMap.get(card.id);

        return sum + (metrics?.availableAmount ?? 0);
      }, 0),
      alertCount: alerts.length,
      baselineTotalCash: totalCashAtStart(activeAccounts),
      forecastHorizonEnd: horizonEnd,
    },
  };
}

function totalCashAtStart(accounts: AppData["accounts"]): number {
  return accounts.reduce((sum, account) => sum + account.balance, 0);
}

function findShortageAccounts(accountBalances: Map<string, number>): string[] {
  return [...accountBalances.entries()]
    .filter(([, balance]) => balance < 0)
    .map(([accountId]) => accountId);
}

function getMinimumAccountBalance(accountBalances: Map<string, number>): number {
  if (accountBalances.size === 0) {
    return 0;
  }

  return Math.min(...accountBalances.values());
}

function isEnabled<T extends { enabled?: boolean }>(item: T): boolean {
  return item.enabled !== false;
}

function createAccountCashSnapshot(
  accountBalances: Map<string, number>,
  accountIds: string[],
  totalCash: number,
): AccountCashSnapshot {
  return {
    balances: Object.fromEntries(
      accountIds.map((accountId) => [accountId, accountBalances.get(accountId) ?? 0]),
    ),
    totalCash,
  };
}

function createTimelinePoint(
  date: string,
  accountBalances: Map<string, number>,
  accountIds: string[],
  totalCash: number,
): BalanceTimelinePoint {
  return {
    date,
    ...createAccountCashSnapshot(accountBalances, accountIds, totalCash),
  };
}

function calculateSpendableAmount(
  snapshots: AccountCashSnapshot[],
  startIndex: number,
): number {
  const slice = snapshots.slice(startIndex);

  if (slice.length === 0) {
    return 0;
  }

  const accountIds = Object.keys(slice[0].balances);
  let spendable = 0;

  for (const accountId of accountIds) {
    let minimumBalance = Number.POSITIVE_INFINITY;

    for (const snapshot of slice) {
      minimumBalance = Math.min(minimumBalance, snapshot.balances[accountId] ?? 0);
    }

    if (minimumBalance < 0) {
      return 0;
    }

    spendable += Math.max(0, minimumBalance);
  }

  return spendable;
}

function buildWithdrawalResilience(
  withdrawals: ForecastEvent[],
  accountNameMap: Map<string, string>,
  targetMonthLabel: string,
): WithdrawalResilience {
  if (withdrawals.length === 0) {
    return {
      status: "none",
      label: `${targetMonthLabel}のカード引き落とし予定はありません`,
      note: `${targetMonthLabel}の引き落としイベントがないため、耐性評価は不要です。`,
      minimumMargin: null,
      riskyAccountNames: [],
    };
  }

  const riskyAccountIds = new Set<string>();
  let minimumMargin = Number.POSITIVE_INFINITY;

  for (const event of withdrawals) {
    minimumMargin = Math.min(minimumMargin, event.minimumAccountBalanceAfter);

    for (const accountId of event.shortageAccountsAfter) {
      riskyAccountIds.add(accountId);
    }
  }

  const riskyAccountNames = [...riskyAccountIds].map(
    (accountId) => accountNameMap.get(accountId) ?? accountId,
  );

  if (riskyAccountNames.length > 0) {
    return {
      status: "risk",
      label: `${targetMonthLabel}の引き落としで不足リスクがあります`,
      note: `${riskyAccountNames.join("、")} の残高不足が予測されます。`,
      minimumMargin: Number.isFinite(minimumMargin) ? minimumMargin : null,
      riskyAccountNames,
    };
  }

  return {
    status: "safe",
    label: `${targetMonthLabel}の引き落としは耐えられる見込みです`,
    note: `${targetMonthLabel}の引き落とし後の最小残高は ${Math.round(minimumMargin).toLocaleString("ja-JP")} 円です。`,
    minimumMargin: Number.isFinite(minimumMargin) ? minimumMargin : null,
    riskyAccountNames: [],
  };
}
