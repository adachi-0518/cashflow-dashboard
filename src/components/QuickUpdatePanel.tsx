import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { createCardSnapshotDraft, getCardBalanceMetrics } from "../lib/cardMetrics";
import type { CardSnapshotDraftValues } from "../lib/cardMetrics";
import type { Account, CreditCard, IncomePlan, OneTimeExpense } from "../types/models";
import { formatCurrency } from "../utils/format";
import { SectionCard } from "./SectionCard";

interface QuickUpdatePanelProps {
  today: string;
  accounts: Account[];
  cards: CreditCard[];
  onSaveAccountBalances: (updates: Record<string, number>) => void;
  onSaveCardSnapshots: (updates: Record<string, CardSnapshotDraftValues>) => void;
  onAddIncomePlan: (incomePlan: Omit<IncomePlan, "id">) => void;
  onAddOneTimeExpense: (expense: Omit<OneTimeExpense, "id">) => void;
}

function toNumber(value: string): number {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

function formatUtilizationRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function hasMessage(messages: string[], keyword: string): boolean {
  return messages.some((message) => message.includes(keyword));
}

export function QuickUpdatePanel({
  today,
  accounts,
  cards,
  onSaveAccountBalances,
  onSaveCardSnapshots,
  onAddIncomePlan,
  onAddOneTimeExpense,
}: QuickUpdatePanelProps) {
  const accountOptions = useMemo(() => accounts, [accounts]);
  const cardOptions = useMemo(() => cards, [cards]);
  const defaultAccountId = accountOptions[0]?.id ?? "";
  const defaultCardId = cardOptions[0]?.id ?? "";

  const [accountDrafts, setAccountDrafts] = useState<Record<string, number>>({});
  const [cardDrafts, setCardDrafts] = useState<Record<string, CardSnapshotDraftValues>>({});
  const [incomeForm, setIncomeForm] = useState({
    name: "単発収入",
    amount: 0,
    date: today,
    accountId: defaultAccountId,
  });
  const [expenseForm, setExpenseForm] = useState({
    name: "大きい単発支出",
    amount: 0,
    date: today,
    paymentType: "account" as OneTimeExpense["paymentType"],
    accountId: defaultAccountId,
    cardId: defaultCardId,
  });

  useEffect(() => {
    setAccountDrafts(
      Object.fromEntries(accounts.map((account) => [account.id, account.balance])),
    );
  }, [accounts]);

  useEffect(() => {
    setCardDrafts(
      Object.fromEntries(cards.map((card) => [card.id, createCardSnapshotDraft(card)])),
    );
  }, [cards]);

  useEffect(() => {
    setIncomeForm((current) => ({
      ...current,
      accountId: accountOptions.some((account) => account.id === current.accountId)
        ? current.accountId
        : defaultAccountId,
      date: current.date || today,
    }));
    setExpenseForm((current) => ({
      ...current,
      accountId: accountOptions.some((account) => account.id === current.accountId)
        ? current.accountId
        : defaultAccountId,
      cardId: cardOptions.some((card) => card.id === current.cardId)
        ? current.cardId
        : defaultCardId,
      date: current.date || today,
    }));
  }, [accountOptions, cardOptions, defaultAccountId, defaultCardId, today]);

  const cardMetricsById = useMemo(
    () =>
      Object.fromEntries(
        cards.map((card) => {
          const draft = cardDrafts[card.id] ?? createCardSnapshotDraft(card);

          return [
            card.id,
            getCardBalanceMetrics({
              limit: card.limit,
              ...draft,
            }),
          ];
        }),
      ),
    [cardDrafts, cards],
  );

  const hasCardErrors = cards.some((card) => {
    const metrics = cardMetricsById[card.id];

    return metrics ? metrics.errors.length > 0 : false;
  });

  function updateCardDraft(card: CreditCard, patch: Partial<CardSnapshotDraftValues>) {
    setCardDrafts((current) => ({
      ...current,
      [card.id]: {
        ...(current[card.id] ?? createCardSnapshotDraft(card)),
        ...patch,
      },
    }));
  }

  function handleSaveCardSnapshots() {
    if (hasCardErrors) {
      return;
    }

    onSaveCardSnapshots(
      Object.fromEntries(
        cards.map((card) => [card.id, cardDrafts[card.id] ?? createCardSnapshotDraft(card)]),
      ),
    );
  }

  function handleSubmitIncome(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!incomeForm.accountId || incomeForm.amount <= 0) {
      return;
    }

    onAddIncomePlan({
      name: incomeForm.name.trim() || "単発収入",
      amount: incomeForm.amount,
      date: incomeForm.date,
      accountId: incomeForm.accountId,
      recurring: "once",
    });

    setIncomeForm({
      name: "単発収入",
      amount: 0,
      date: today,
      accountId: defaultAccountId,
    });
  }

  function handleSubmitExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (expenseForm.amount <= 0) {
      return;
    }

    onAddOneTimeExpense({
      name: expenseForm.name.trim() || "大きい単発支出",
      amount: expenseForm.amount,
      date: expenseForm.date,
      paymentType: expenseForm.paymentType,
      accountId: expenseForm.paymentType === "account" ? expenseForm.accountId : undefined,
      cardId: expenseForm.paymentType === "card" ? expenseForm.cardId : undefined,
    });

    setExpenseForm({
      name: "大きい単発支出",
      amount: 0,
      date: today,
      paymentType: "account",
      accountId: defaultAccountId,
      cardId: defaultCardId,
    });
  }

  return (
    <SectionCard
      title="日々の更新"
      subtitle="残高や請求見込みの更新と、単発イベントの追加をここでまとめて行います。"
    >
      <div className="stack-layout">
        <div className="form-block">
          <div className="subsection-heading">
            <h3>現在の口座残高更新</h3>
            <button
              type="button"
              className="button button--primary"
              onClick={() => onSaveAccountBalances(accountDrafts)}
            >
              残高を保存
            </button>
          </div>
          {accounts.length === 0 ? (
            <div className="empty-state">口座が未登録です。下の設定エリアから追加してください。</div>
          ) : (
            <div className="mini-grid">
              {accounts.map((account) => (
                <label key={account.id} className="field">
                  <span>{account.name}</span>
                  <input
                    type="number"
                    step="1"
                    value={accountDrafts[account.id] ?? 0}
                    onChange={(event) =>
                      setAccountDrafts((current) => ({
                        ...current,
                        [account.id]: toNumber(event.target.value),
                      }))
                    }
                  />
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="form-block">
          <div className="subsection-heading subsection-heading--stack">
            <div>
              <h3>カード請求見込み更新</h3>
              <p className="form-note">
                日々は次回支払い額と利用可能額だけ更新します。未確定利用額は自動計算が基本です。
              </p>
            </div>
            <button
              type="button"
              className="button button--primary"
              onClick={handleSaveCardSnapshots}
              disabled={hasCardErrors}
            >
              カード情報を保存
            </button>
          </div>
          {hasCardErrors ? (
            <p className="form-note form-note--danger">
              入力エラーを解消すると保存できます。
            </p>
          ) : null}
          {cards.length === 0 ? (
            <div className="empty-state">カードが未登録です。下の設定エリアから追加してください。</div>
          ) : (
            <div className="card-draft-list">
              {cards.map((card) => {
                const draft = cardDrafts[card.id] ?? createCardSnapshotDraft(card);
                const metrics = cardMetricsById[card.id];

                return (
                  <div key={card.id} className="card-draft">
                    <div className="card-draft__header">
                      <div className="card-draft__meta">
                        <strong>{card.name}</strong>
                        <span>利用枠 {formatCurrency(card.limit)}</span>
                      </div>
                      <div className="card-draft__badges">
                        <span className="pill">
                          {metrics.unsettledAmountMode === "manual" ? "手動上書き中" : "自動計算"}
                        </span>
                        {metrics.errors.length > 0 ? (
                          <span className="warning-chip">入力エラー</span>
                        ) : null}
                      </div>
                    </div>

                    <div className="card-draft__fields">
                      <label
                        className={`field${
                          hasMessage(metrics.errors, "次回支払い額") ? " field--error" : ""
                        }`}
                      >
                        <span>次回支払い額</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={draft.nextBillingAmount}
                          onChange={(event) =>
                            updateCardDraft(card, {
                              nextBillingAmount: toNumber(event.target.value),
                            })
                          }
                        />
                      </label>
                      <label
                        className={`field${
                          hasMessage(metrics.errors, "利用可能額") ? " field--error" : ""
                        }`}
                      >
                        <span>利用可能額</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={draft.availableAmount}
                          onChange={(event) =>
                            updateCardDraft(card, {
                              availableAmount: toNumber(event.target.value),
                            })
                          }
                        />
                      </label>
                    </div>

                    <div className="card-draft__metrics">
                      <div className="card-metric">
                        <span>次回支払い額</span>
                        <strong>{formatCurrency(metrics.nextBillingAmount)}</strong>
                      </div>
                      <div className="card-metric">
                        <span>利用可能額</span>
                        <strong>{formatCurrency(metrics.availableAmount)}</strong>
                      </div>
                      <div className="card-metric">
                        <span>現在利用総額</span>
                        <strong>{formatCurrency(metrics.currentUsageTotal)}</strong>
                      </div>
                      <div className="card-metric">
                        <span>未確定利用額</span>
                        <strong>{formatCurrency(metrics.unsettledAmount)}</strong>
                      </div>
                      <div className="card-metric">
                        <span>利用率</span>
                        <strong>{formatUtilizationRate(metrics.utilizationRate)}</strong>
                      </div>
                    </div>

                    {metrics.errors.length > 0 || metrics.warnings.length > 0 ? (
                      <div className="card-draft__messages">
                        {metrics.errors.map((message) => (
                          <p key={`error-${card.id}-${message}`} className="card-draft__message card-draft__message--error">
                            {message}
                          </p>
                        ))}
                        {metrics.warnings.map((message) => (
                          <p key={`warning-${card.id}-${message}`} className="card-draft__message card-draft__message--warning">
                            {message}
                          </p>
                        ))}
                      </div>
                    ) : null}

                    <details className="card-draft__details">
                      <summary>詳細設定</summary>
                      <div className="card-draft__details-body">
                        <label className="field">
                          <span>未確定利用額の扱い</span>
                          <select
                            value={draft.unsettledAmountMode}
                            onChange={(event) =>
                              updateCardDraft(card, {
                                unsettledAmountMode: event.target.value as CardSnapshotDraftValues["unsettledAmountMode"],
                              })
                            }
                          >
                            <option value="auto">自動計算を使う</option>
                            <option value="manual">手動で上書きする</option>
                          </select>
                        </label>

                        <p className="form-note">
                          自動計算式: 利用枠 - 利用可能額 - 次回支払い額
                        </p>

                        {draft.unsettledAmountMode === "manual" ? (
                          <label
                            className={`field${
                              hasMessage(metrics.errors, "手動の未確定利用額")
                                ? " field--error"
                                : ""
                            }`}
                          >
                            <span>手動の未確定利用額</span>
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={draft.manualUnsettledAmount ?? 0}
                              onChange={(event) =>
                                updateCardDraft(card, {
                                  manualUnsettledAmount: toNumber(event.target.value),
                                })
                              }
                            />
                          </label>
                        ) : null}

                        <p className="form-note">
                          自動計算値: {formatCurrency(metrics.autoUnsettledAmount)}
                        </p>
                      </div>
                    </details>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="form-block">
          <div className="subsection-heading">
            <h3>単発収入を追加</h3>
          </div>
          <form className="inline-form" onSubmit={handleSubmitIncome}>
            <label className="field">
              <span>名称</span>
              <input
                type="text"
                value={incomeForm.name}
                onChange={(event) =>
                  setIncomeForm((current) => ({ ...current, name: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>金額</span>
              <input
                type="number"
                step="1"
                value={incomeForm.amount}
                onChange={(event) =>
                  setIncomeForm((current) => ({
                    ...current,
                    amount: toNumber(event.target.value),
                  }))
                }
              />
            </label>
            <label className="field">
              <span>日付</span>
              <input
                type="date"
                value={incomeForm.date}
                onChange={(event) =>
                  setIncomeForm((current) => ({ ...current, date: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>入金口座</span>
              <select
                value={incomeForm.accountId}
                onChange={(event) =>
                  setIncomeForm((current) => ({ ...current, accountId: event.target.value }))
                }
              >
                {accountOptions.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="button button--secondary">
              追加
            </button>
          </form>
        </div>

        <div className="form-block">
          <div className="subsection-heading">
            <h3>大きい単発支出を追加</h3>
          </div>
          <form className="inline-form" onSubmit={handleSubmitExpense}>
            <label className="field">
              <span>名称</span>
              <input
                type="text"
                value={expenseForm.name}
                onChange={(event) =>
                  setExpenseForm((current) => ({ ...current, name: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>金額</span>
              <input
                type="number"
                step="1"
                value={expenseForm.amount}
                onChange={(event) =>
                  setExpenseForm((current) => ({
                    ...current,
                    amount: toNumber(event.target.value),
                  }))
                }
              />
            </label>
            <label className="field">
              <span>日付</span>
              <input
                type="date"
                value={expenseForm.date}
                onChange={(event) =>
                  setExpenseForm((current) => ({ ...current, date: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>支払い方法</span>
              <select
                value={expenseForm.paymentType}
                onChange={(event) =>
                  setExpenseForm((current) => ({
                    ...current,
                    paymentType: event.target.value as OneTimeExpense["paymentType"],
                  }))
                }
              >
                <option value="account">口座から支払う</option>
                <option value="card">カードで支払う</option>
              </select>
            </label>
            {expenseForm.paymentType === "account" ? (
              <label className="field">
                <span>対象口座</span>
                <select
                  value={expenseForm.accountId}
                  onChange={(event) =>
                    setExpenseForm((current) => ({ ...current, accountId: event.target.value }))
                  }
                >
                  {accountOptions.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="field">
                <span>対象カード</span>
                <select
                  value={expenseForm.cardId}
                  onChange={(event) =>
                    setExpenseForm((current) => ({ ...current, cardId: event.target.value }))
                  }
                >
                  {cardOptions.map((card) => (
                    <option key={card.id} value={card.id}>
                      {card.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button type="submit" className="button button--secondary">
              追加
            </button>
          </form>
        </div>
      </div>
    </SectionCard>
  );
}
