import { describe, expect, it } from "vitest";
import type { AppData } from "../../types/models";
import { generateForecastEvents } from "./generateForecastEvents";

function createData(overrides: Partial<AppData> = {}): AppData {
  return {
    accounts: [{ id: "account-main", name: "生活・引落口座", balance: 500000 }],
    cards: [
      {
        id: "card-main",
        name: "メインカード",
        limit: 600000,
        closingDay: 20,
        withdrawalDay: 10,
        withdrawalTiming: "next-month",
        withdrawalAccountId: "account-main",
        // 5日前に入力したきりのカード情報
        snapshotDate: "2026-07-10",
        availableAmount: 600000,
        nextBillingAmount: 0,
        unsettledAmountMode: "auto",
      },
    ],
    subscriptions: [],
    incomePlans: [],
    accountTransfers: [],
    oneTimeExpenses: [],
    ...overrides,
  };
}

function findWithdrawal(data: AppData, today: string, date: string) {
  return generateForecastEvents(data, today).events.find(
    (event) => event.kind === "card-withdrawal" && event.date === date,
  );
}

describe("カード利用の計上起点", () => {
  it("カード情報の時点日から今日までの間に来たサブスク請求を取りこぼさない", () => {
    // 7/10時点のカード情報しかない状態で、7/12にサブスク請求が発生し、今日は7/15。
    // 7/12の利用は利用可能額（7/10時点）にも入っておらず、今日起点で数えると
    // 丸ごと消えてしまう。7/20締め → 8/10引落に乗るのが正しい。
    const data = createData({
      subscriptions: [
        {
          id: "sub-video",
          name: "動画サブスク",
          monthlyAmount: 1490,
          billingDay: 12,
          cardId: "card-main",
        },
      ],
    });

    const withdrawal = findWithdrawal(data, "2026-07-15", "2026-08-10");

    expect(withdrawal).toBeDefined();
    expect(withdrawal?.amount).toBe(1490);
  });

  it("時点日より前のサブスク請求は、既にカード情報に反映済みとみなして二重計上しない", () => {
    // 7/8の請求は7/10時点の利用可能額に含まれているはずなので、改めて足さない。
    const data = createData({
      subscriptions: [
        {
          id: "sub-video",
          name: "動画サブスク",
          monthlyAmount: 1490,
          billingDay: 8,
          cardId: "card-main",
        },
      ],
    });

    // 8/8利用 → 8/20締め → 9/10引落。8/10には何も乗らない。
    expect(findWithdrawal(data, "2026-07-15", "2026-08-10")).toBeUndefined();
    expect(findWithdrawal(data, "2026-07-15", "2026-09-10")?.amount).toBe(1490);
  });

  it("時点日から今日までのカード払い単発支出も取りこぼさない", () => {
    const data = createData({
      oneTimeExpenses: [
        {
          id: "expense-travel",
          name: "旅行代金",
          amount: 68000,
          date: "2026-07-13",
          paymentType: "card",
          cardId: "card-main",
        },
      ],
    });

    expect(findWithdrawal(data, "2026-07-15", "2026-08-10")?.amount).toBe(68000);
  });

  it("口座払いの単発支出は、過去日なら残高に反映済みとして計上しない", () => {
    const data = createData({
      oneTimeExpenses: [
        {
          id: "expense-tax",
          name: "住民税",
          amount: 38000,
          date: "2026-07-13",
          paymentType: "account",
          accountId: "account-main",
        },
      ],
    });

    const events = generateForecastEvents(data, "2026-07-15").events;

    expect(events.filter((event) => event.kind === "account-expense")).toHaveLength(0);
  });

  it("既に過ぎた引落日は、口座残高に反映済みとして計上しない", () => {
    // 6/1時点の古いカード情報。6/2の利用は6/20締め → 7/10引落で、今日(7/15)には済んでいる。
    const data = createData({
      cards: [
        {
          ...createData().cards[0],
          snapshotDate: "2026-06-01",
        },
      ],
      subscriptions: [
        {
          id: "sub-video",
          name: "動画サブスク",
          monthlyAmount: 1490,
          billingDay: 2,
          cardId: "card-main",
        },
      ],
    });

    const events = generateForecastEvents(data, "2026-07-15").events;
    const pastWithdrawals = events.filter(
      (event) => event.kind === "card-withdrawal" && event.date < "2026-07-15",
    );

    expect(pastWithdrawals).toHaveLength(0);
  });
});

describe("予測期間の外", () => {
  it("90日より先の引落は現金イベントにしない", () => {
    const data = createData({
      oneTimeExpenses: [
        {
          id: "expense-far",
          name: "ずっと先の支出",
          amount: 50000,
          date: "2026-10-01",
          paymentType: "card",
          cardId: "card-main",
        },
      ],
    });

    // 10/1利用 → 10/20締め → 11/10引落。90日先（10/12）を超える。
    const events = generateForecastEvents(data, "2026-07-15").events;

    expect(events.some((event) => event.kind === "card-withdrawal")).toBe(false);
    expect(events.some((event) => event.kind === "card-charge" && event.affectsCash === false)).toBe(
      true,
    );
  });
});
