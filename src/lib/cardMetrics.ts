import type { CardUnsettledAmountMode, CreditCard, IsoDateString } from "../types/models";

export interface CardSnapshotDraftValues {
  snapshotDate: IsoDateString;
  nextBillingAmount: number;
  availableAmount: number;
  unsettledAmountMode: CardUnsettledAmountMode;
  manualUnsettledAmount?: number;
}

interface CardBalanceInput extends CardSnapshotDraftValues {
  limit: number;
}

export interface CardBalanceMetrics extends CardBalanceInput {
  currentUsageTotal: number;
  autoUnsettledAmount: number;
  unsettledAmount: number;
  utilizationRate: number;
  errors: string[];
  warnings: string[];
}

function toFiniteNumber(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toNonNegative(value: number | undefined): number {
  return Math.max(0, toFiniteNumber(value));
}

export function inferAvailableAmount(
  limit: number,
  nextBillingAmount: number,
  unsettledAmount: number,
): number {
  const safeLimit = toNonNegative(limit);
  const safeNextBillingAmount = toNonNegative(nextBillingAmount);
  const safeUnsettledAmount = toNonNegative(unsettledAmount);

  return clamp(safeLimit - safeNextBillingAmount - safeUnsettledAmount, 0, safeLimit);
}

export function getCardBalanceMetrics(input: CardBalanceInput): CardBalanceMetrics {
  const rawLimit = toFiniteNumber(input.limit);
  const rawNextBillingAmount = toFiniteNumber(input.nextBillingAmount);
  const rawAvailableAmount = toFiniteNumber(input.availableAmount);
  const rawManualUnsettledAmount = toFiniteNumber(input.manualUnsettledAmount);
  const limit = toNonNegative(input.limit);
  const nextBillingAmount = toNonNegative(input.nextBillingAmount);
  const availableAmount = clamp(toNonNegative(input.availableAmount), 0, limit);
  const unsettledAmountMode = input.unsettledAmountMode === "manual" ? "manual" : "auto";
  const manualUnsettledAmount =
    unsettledAmountMode === "manual" ? toNonNegative(input.manualUnsettledAmount) : undefined;
  const currentUsageTotal = Math.max(0, limit - availableAmount);
  const rawAutoUnsettledAmount = currentUsageTotal - nextBillingAmount;
  const autoUnsettledAmount = Math.max(0, rawAutoUnsettledAmount);
  const unsettledAmount =
    unsettledAmountMode === "manual"
      ? manualUnsettledAmount ?? 0
      : autoUnsettledAmount;
  const utilizationRate = limit > 0 ? currentUsageTotal / limit : 0;
  const errors: string[] = [];
  const warnings: string[] = [];

  if (rawLimit < 0) {
    errors.push("利用枠は 0 円以上で設定してください。");
  }

  if (rawNextBillingAmount < 0) {
    errors.push("次回支払い額は 0 円以上で入力してください。");
  }

  if (rawAvailableAmount < 0) {
    errors.push("利用可能額は 0 円以上で入力してください。");
  }

  if (rawAvailableAmount > limit) {
    errors.push("利用可能額が利用枠を超えています。");
  }

  if (unsettledAmountMode === "manual" && rawManualUnsettledAmount < 0) {
    errors.push("手動の未確定利用額は 0 円以上で入力してください。");
  }

  if (rawAutoUnsettledAmount < 0) {
    warnings.push(
      "現在利用総額が次回支払い額を下回るため、未確定利用額は 0 円として扱います。",
    );
  }

  return {
    snapshotDate: input.snapshotDate,
    limit,
    nextBillingAmount,
    availableAmount,
    unsettledAmountMode,
    manualUnsettledAmount,
    currentUsageTotal,
    autoUnsettledAmount,
    unsettledAmount,
    utilizationRate,
    errors,
    warnings,
  };
}

export function createCardSnapshotDraft(card: CreditCard): CardSnapshotDraftValues {
  return {
    snapshotDate: card.snapshotDate,
    nextBillingAmount: card.nextBillingAmount,
    availableAmount: card.availableAmount,
    unsettledAmountMode: card.unsettledAmountMode,
    manualUnsettledAmount:
      card.unsettledAmountMode === "manual"
        ? card.manualUnsettledAmount ?? 0
        : undefined,
  };
}

export function createCardSnapshotPatch(
  input: CardBalanceInput,
): Pick<
  CreditCard,
  | "snapshotDate"
  | "nextBillingAmount"
  | "availableAmount"
  | "unsettledAmountMode"
  | "manualUnsettledAmount"
> {
  const metrics = getCardBalanceMetrics(input);

  return {
    snapshotDate: input.snapshotDate,
    nextBillingAmount: metrics.nextBillingAmount,
    availableAmount: metrics.availableAmount,
    unsettledAmountMode: metrics.unsettledAmountMode,
    manualUnsettledAmount:
      metrics.unsettledAmountMode === "manual" ? metrics.manualUnsettledAmount ?? 0 : undefined,
  };
}
