import { describe, expect, it } from "vitest";
import type { CreditCard } from "../../types/models";
import { resolveCardClosingDate, resolveCardWithdrawalDate, resolveNextBillingDate } from "./cardBilling";

function createCard(overrides: Partial<CreditCard> = {}): CreditCard {
  return {
    id: "card-test",
    name: "テストカード",
    limit: 500000,
    closingDay: 20,
    withdrawalDay: 10,
    withdrawalTiming: "next-month",
    withdrawalAccountId: "account-main",
    snapshotDate: "2026-07-15",
    availableAmount: 500000,
    nextBillingAmount: 0,
    unsettledAmountMode: "auto",
    ...overrides,
  };
}

describe("resolveCardClosingDate", () => {
  it("締め日前の利用は当月締め", () => {
    const card = createCard({ closingDay: 20 });

    expect(resolveCardClosingDate(card, "2026-07-05")).toBe("2026-07-20");
  });

  it("締め日当日の利用は当月締めに含める", () => {
    const card = createCard({ closingDay: 20 });

    expect(resolveCardClosingDate(card, "2026-07-20")).toBe("2026-07-20");
  });

  it("締め日を過ぎた利用は翌月締め", () => {
    const card = createCard({ closingDay: 20 });

    expect(resolveCardClosingDate(card, "2026-07-21")).toBe("2026-08-20");
  });

  it("締め日31日は、31日のない月では月末に丸める", () => {
    const card = createCard({ closingDay: 31 });

    expect(resolveCardClosingDate(card, "2026-02-10")).toBe("2026-02-28");
    expect(resolveCardClosingDate(card, "2024-02-10")).toBe("2024-02-29");
  });

  it("年をまたぐ", () => {
    const card = createCard({ closingDay: 20 });

    expect(resolveCardClosingDate(card, "2026-12-25")).toBe("2027-01-20");
  });
});

describe("resolveCardWithdrawalDate（締め月の翌月引落）", () => {
  it("20日締め・翌月10日引落の典型パターン", () => {
    const card = createCard({ closingDay: 20, withdrawalDay: 10, withdrawalTiming: "next-month" });

    // 7/5利用 → 7/20締め → 8/10引落
    expect(resolveCardWithdrawalDate(card, "2026-07-05")).toBe("2026-08-10");
    // 7/25利用 → 8/20締め → 9/10引落
    expect(resolveCardWithdrawalDate(card, "2026-07-25")).toBe("2026-09-10");
  });

  it("年をまたぐ", () => {
    const card = createCard({ closingDay: 20, withdrawalDay: 10, withdrawalTiming: "next-month" });

    // 12/25利用 → 1/20締め → 2/10引落
    expect(resolveCardWithdrawalDate(card, "2026-12-25")).toBe("2027-02-10");
  });

  it("引落日31日は月末に丸める", () => {
    const card = createCard({ closingDay: 20, withdrawalDay: 31, withdrawalTiming: "next-month" });

    // 1/5利用 → 1/20締め → 2/28引落（2026年は平年）
    expect(resolveCardWithdrawalDate(card, "2026-01-05")).toBe("2026-02-28");
  });
});

describe("resolveCardWithdrawalDate（締め日後の最初の引落）", () => {
  it("5日締め・27日引落なら同月内で引き落とす", () => {
    const card = createCard({ closingDay: 5, withdrawalDay: 27, withdrawalTiming: "after-closing" });

    // 7/3利用 → 7/5締め → 締め日後の最初の27日 = 7/27
    expect(resolveCardWithdrawalDate(card, "2026-07-03")).toBe("2026-07-27");
    // 7/6利用 → 8/5締め → 8/27
    expect(resolveCardWithdrawalDate(card, "2026-07-06")).toBe("2026-08-27");
  });

  it("引落日が締め日より前なら翌月へ回る", () => {
    const card = createCard({ closingDay: 20, withdrawalDay: 10, withdrawalTiming: "after-closing" });

    // 7/5利用 → 7/20締め → 締め日後の最初の10日 = 8/10
    expect(resolveCardWithdrawalDate(card, "2026-07-05")).toBe("2026-08-10");
  });

  it("締め日と引落日が同じ場合は翌月へ（同日引落にはしない）", () => {
    const card = createCard({ closingDay: 10, withdrawalDay: 10, withdrawalTiming: "after-closing" });

    expect(resolveCardWithdrawalDate(card, "2026-07-05")).toBe("2026-08-10");
  });
});

describe("resolveNextBillingDate", () => {
  it("基準日以降で最初の引落日を返す", () => {
    const card = createCard({ withdrawalDay: 10 });

    expect(resolveNextBillingDate(card, "2026-07-05")).toBe("2026-07-10");
    expect(resolveNextBillingDate(card, "2026-07-10")).toBe("2026-07-10");
    expect(resolveNextBillingDate(card, "2026-07-11")).toBe("2026-08-10");
  });
});
