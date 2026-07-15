import { describe, expect, it } from "vitest";
import type { AppData } from "../../types/models";
import { buildForecast } from "./index";

const TODAY = "2026-07-15";
const HORIZON_END = "2026-10-12";

function createData(overrides: Partial<AppData> = {}): AppData {
  return {
    accounts: [
      { id: "account-main", name: "生活・引落口座", balance: 200000 },
      { id: "account-reserve", name: "予備口座", balance: 50000 },
    ],
    cards: [],
    subscriptions: [],
    incomePlans: [],
    accountTransfers: [],
    oneTimeExpenses: [],
    ...overrides,
  };
}

describe("balanceTimeline", () => {
  it("イベントが無くても、今日から予測終端まで水平に伸びる", () => {
    const { balanceTimeline } = buildForecast(createData(), TODAY);

    expect(balanceTimeline).toHaveLength(2);
    expect(balanceTimeline[0].date).toBe(TODAY);
    expect(balanceTimeline[balanceTimeline.length - 1].date).toBe(HORIZON_END);
    expect(balanceTimeline[0].totalCash).toBe(250000);
    expect(balanceTimeline[balanceTimeline.length - 1].totalCash).toBe(250000);
  });

  it("同じ日に複数イベントがあっても、その日の点は1つ（＝日末残高）だけ", () => {
    const data = createData({
      incomePlans: [
        {
          id: "income-1",
          name: "入金A",
          amount: 30000,
          date: "2026-07-20",
          accountId: "account-main",
          recurring: "once",
        },
        {
          id: "income-2",
          name: "入金B",
          amount: 20000,
          date: "2026-07-20",
          accountId: "account-main",
          recurring: "once",
        },
      ],
    });

    const { balanceTimeline } = buildForecast(data, TODAY);
    const july20 = balanceTimeline.filter((point) => point.date === "2026-07-20");

    expect(july20).toHaveLength(1);
    // 2件とも反映された後の残高
    expect(july20[0].balances["account-main"]).toBe(250000);
    expect(july20[0].totalCash).toBe(300000);
  });

  it("日付順に並び、口座ごとの残高を持つ", () => {
    const data = createData({
      oneTimeExpenses: [
        {
          id: "expense-1",
          name: "大きい支出",
          amount: 80000,
          date: "2026-08-01",
          paymentType: "account",
          accountId: "account-main",
        },
      ],
      accountTransfers: [
        {
          id: "transfer-1",
          name: "予備から移す",
          amount: 50000,
          date: "2026-07-25",
          fromAccountId: "account-reserve",
          toAccountId: "account-main",
        },
      ],
    });

    const { balanceTimeline } = buildForecast(data, TODAY);
    const dates = balanceTimeline.map((point) => point.date);

    expect(dates).toEqual([...dates].sort());
    expect(dates).toContain("2026-07-25");
    expect(dates).toContain("2026-08-01");

    const afterTransfer = balanceTimeline.find((point) => point.date === "2026-07-25");
    expect(afterTransfer?.balances["account-main"]).toBe(250000);
    expect(afterTransfer?.balances["account-reserve"]).toBe(0);
    expect(afterTransfer?.totalCash).toBe(250000); // 振替は合算を動かさない

    const afterExpense = balanceTimeline.find((point) => point.date === "2026-08-01");
    expect(afterExpense?.balances["account-main"]).toBe(170000);
    expect(afterExpense?.totalCash).toBe(170000);
  });

  it("マイナスに沈む口座はそのまま負の値で記録する（チャートのゼロ割れ表示用）", () => {
    const data = createData({
      oneTimeExpenses: [
        {
          id: "expense-huge",
          name: "払えない支出",
          amount: 300000,
          date: "2026-08-01",
          paymentType: "account",
          accountId: "account-main",
        },
      ],
    });

    const { balanceTimeline } = buildForecast(data, TODAY);
    const afterExpense = balanceTimeline.find((point) => point.date === "2026-08-01");

    expect(afterExpense?.balances["account-main"]).toBe(-100000);
  });

  it("最終イベント以降も終端まで残高を保つ", () => {
    const data = createData({
      incomePlans: [
        {
          id: "income-1",
          name: "入金",
          amount: 10000,
          date: "2026-07-20",
          accountId: "account-main",
          recurring: "once",
        },
      ],
    });

    const { balanceTimeline } = buildForecast(data, TODAY);
    const last = balanceTimeline[balanceTimeline.length - 1];

    expect(last.date).toBe(HORIZON_END);
    expect(last.totalCash).toBe(260000);
  });
});
