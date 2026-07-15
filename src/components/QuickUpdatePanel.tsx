import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { createCardSnapshotDraft, getCardBalanceMetrics } from "../lib/cardMetrics";
import type { CardSnapshotDraftValues } from "../lib/cardMetrics";
import { resolveCardWithdrawalDate, resolveNextBillingDate } from "../lib/forecast/cardBilling";
import type {
  Account,
  AccountTransfer,
  CreditCard,
  IncomePlan,
  OneTimeExpense,
} from "../types/models";
import { compareDateStrings } from "../utils/date";
import { formatCurrency, formatDate, formatYearMonth } from "../utils/format";
import { SectionCard } from "./SectionCard";

function getAlternateAccountId(accounts: Account[], excludedAccountId: string): string {
  return accounts.find((account) => account.id !== excludedAccountId)?.id ?? "";
}

interface QuickUpdatePanelProps {
  today: string;
  accounts: Account[];
  cards: CreditCard[];
  onSaveAccountBalances: (updates: Record<string, number>) => void;
  onSaveCardSnapshots: (updates: Record<string, CardSnapshotDraftValues>) => void;
  onAddIncomePlan: (incomePlan: Omit<IncomePlan, "id">) => void;
  onAddAccountTransfer: (transfer: Omit<AccountTransfer, "id">) => void;
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

function removeKey<T>(source: Record<string, T>, key: string): Record<string, T> {
  const next = { ...source };
  delete next[key];

  return next;
}

export function QuickUpdatePanel({
  today,
  accounts,
  cards,
  onSaveAccountBalances,
  onSaveCardSnapshots,
  onAddIncomePlan,
  onAddAccountTransfer,
  onAddOneTimeExpense,
}: QuickUpdatePanelProps) {
  const accountOptions = useMemo(() => accounts, [accounts]);
  const cardOptions = useMemo(() => cards, [cards]);
  const defaultAccountId = accountOptions[0]?.id ?? "";
  const defaultCardId = cardOptions[0]?.id ?? "";
  const defaultTransferToAccountId = getAlternateAccountId(accountOptions, defaultAccountId);

  // 下書きには「ユーザーが実際に触った項目」だけを入れる。触っていない項目は
  // 保存済みの値をそのまま表示するので、他の編集で入力途中の値が消えない。
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
  const [transferForm, setTransferForm] = useState({
    name: "口座振替",
    amount: 0,
    date: today,
    fromAccountId: defaultAccountId,
    toAccountId: defaultTransferToAccountId,
  });

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
    setTransferForm((current) => {
      const nextFromAccountId = accountOptions.some(
        (account) => account.id === current.fromAccountId,
      )
        ? current.fromAccountId
        : defaultAccountId;
      const nextToAccountId = accountOptions
        .filter((account) => account.id !== nextFromAccountId)
        .some((account) => account.id === current.toAccountId)
        ? current.toAccountId
        : getAlternateAccountId(accountOptions, nextFromAccountId);

      return {
        ...current,
        date: current.date || today,
        fromAccountId: nextFromAccountId,
        toAccountId: nextToAccountId,
      };
    });
  }, [accountOptions, cardOptions, defaultAccountId, defaultCardId, today]);

  const cardViewById = useMemo(
    () =>
      Object.fromEntries(
        cards.map((card) => {
          const draft = cardDrafts[card.id] ?? createCardSnapshotDraft(card);

          return [
            card.id,
            {
              draft,
              metrics: getCardBalanceMetrics({ limit: card.limit, ...draft }),
              isDirty: card.id in cardDrafts,
            },
          ];
        }),
      ),
    [cardDrafts, cards],
  );

  const dirtyAccountCount = accounts.filter((account) => account.id in accountDrafts).length;

  function updateAccountDraft(accountId: string, balance: number) {
    setAccountDrafts((current) => ({ ...current, [accountId]: balance }));
  }

  function handleSaveAccountBalances() {
    if (dirtyAccountCount === 0) {
      return;
    }

    onSaveAccountBalances(accountDrafts);
    setAccountDrafts({});
  }

  function updateCardDraft(card: CreditCard, patch: Partial<CardSnapshotDraftValues>) {
    setCardDrafts((current) => {
      const base = current[card.id] ?? createCardSnapshotDraft(card);
      // 金額を打ち直したということは、いま手元のカード情報を見た結果のはず。
      // 時点日を今日へ進めておき、あえて別日にしたいときは日付欄で上書きできる。
      const touchesAmount = "nextBillingAmount" in patch || "availableAmount" in patch;

      return {
        ...current,
        [card.id]: {
          ...base,
          ...(touchesAmount ? { snapshotDate: today } : null),
          ...patch,
        },
      };
    });
  }

  function handleSaveCardSnapshot(card: CreditCard) {
    const view = cardViewById[card.id];

    if (!view || !view.isDirty || view.metrics.errors.length > 0) {
      return;
    }

    onSaveCardSnapshots({ [card.id]: view.draft });
    setCardDrafts((current) => removeKey(current, card.id));
  }

  function handleResetCardDraft(card: CreditCard) {
    setCardDrafts((current) => removeKey(current, card.id));
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

    const hasExpenseTarget =
      expenseForm.paymentType === "account" ? !!expenseForm.accountId : !!expenseForm.cardId;

    if (expenseForm.amount <= 0 || !hasExpenseTarget) {
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

    setExpenseForm((current) => ({
      ...current,
      name: "大きい単発支出",
      amount: 0,
      date: today,
    }));
  }

  function handleSubmitTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      transferForm.amount <= 0 ||
      !transferForm.fromAccountId ||
      !transferForm.toAccountId ||
      transferForm.fromAccountId === transferForm.toAccountId
    ) {
      return;
    }

    onAddAccountTransfer({
      name: transferForm.name.trim() || "口座振替",
      amount: transferForm.amount,
      date: transferForm.date,
      fromAccountId: transferForm.fromAccountId,
      toAccountId: transferForm.toAccountId,
    });

    setTransferForm((current) => ({
      ...current,
      name: "口座振替",
      amount: 0,
    }));
  }

  return (
    <SectionCard
      title="日々の更新"
      subtitle="残高や請求見込みの更新と、単発イベント・口座振替の追加をここでまとめて行います。"
    >
      <div className="stack-layout">
        <div className="form-block">
          <div className="subsection-heading">
            <h3>現在の口座残高更新</h3>
            <button
              type="button"
              className="button button--primary"
              onClick={handleSaveAccountBalances}
              disabled={dirtyAccountCount === 0}
            >
              {dirtyAccountCount > 0 ? `変更した ${dirtyAccountCount} 件を保存` : "残高を保存"}
            </button>
          </div>
          {accounts.length === 0 ? (
            <div className="empty-state">口座が未登録です。下の設定エリアから追加してください。</div>
          ) : (
            <div className="mini-grid">
              {accounts.map((account) => {
                const isDirty = account.id in accountDrafts;

                return (
                  <label key={account.id} className={`field${isDirty ? " field--dirty" : ""}`}>
                    <span>
                      {account.name}
                      {isDirty ? <em className="field__dirty-mark">未保存</em> : null}
                    </span>
                    <input
                      type="number"
                      step="1"
                      value={accountDrafts[account.id] ?? account.balance}
                      onChange={(event) =>
                        updateAccountDraft(account.id, toNumber(event.target.value))
                      }
                    />
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div className="form-block">
          <div className="subsection-heading subsection-heading--stack">
            <div>
              <h3>カード請求見込み更新</h3>
              <p className="form-note">
                直近の引落額と利用可能額を更新すると、時点日は自動で今日になります。保存はカードごとなので、
                見ていないカードの時点日は動きません。
              </p>
            </div>
          </div>
          {cards.length === 0 ? (
            <div className="empty-state">カードが未登録です。下の設定エリアから追加してください。</div>
          ) : (
            <div className="card-draft-list">
              {cards.map((card) => {
                const { draft, metrics, isDirty } = cardViewById[card.id];
                const snapshotDate = draft.snapshotDate || today;
                const nextBillingDate = resolveNextBillingDate(card, snapshotDate);
                const unsettledWithdrawalDate = resolveCardWithdrawalDate(card, snapshotDate);
                const nextBillingLabel = `${formatDate(nextBillingDate)}引落分`;
                const unsettledWithdrawalLabel = `${formatDate(unsettledWithdrawalDate)}引落想定`;
                const hasNextBillingTimingWarning =
                  metrics.nextBillingAmount > 0 &&
                  compareDateStrings(nextBillingDate, today) < 0;
                const hasUnsettledTimingWarning =
                  metrics.unsettledAmount > 0 &&
                  compareDateStrings(unsettledWithdrawalDate, today) < 0;
                const hasAnyTimingWarning =
                  hasNextBillingTimingWarning || hasUnsettledTimingWarning;

                return (
                  <div key={card.id} className={`card-draft${isDirty ? " card-draft--dirty" : ""}`}>
                    <div className="card-draft__header">
                      <div className="card-draft__meta">
                        <strong>{card.name}</strong>
                        <span>利用枠 {formatCurrency(card.limit)}</span>
                        <span>数字の時点日 {formatDate(snapshotDate)}</span>
                        <span>直近の引落日 {nextBillingLabel}</span>
                        <span>未確定分が回る引落日 {unsettledWithdrawalLabel}</span>
                      </div>
                      <div className="card-draft__badges">
                        <span className="pill">
                          {metrics.unsettledAmountMode === "manual" ? "手動上書き中" : "自動計算"}
                        </span>
                        {isDirty ? <span className="pill pill--dirty">未保存</span> : null}
                        {metrics.errors.length > 0 ? (
                          <span className="warning-chip">入力エラー</span>
                        ) : null}
                      </div>
                    </div>

                    <div className="card-draft__fields">
                      <label className="field">
                        <span>この数字の時点日</span>
                        <input
                          type="date"
                          max={today}
                          value={snapshotDate}
                          onChange={(event) =>
                            updateCardDraft(card, {
                              snapshotDate: event.target.value || today,
                            })
                          }
                        />
                      </label>
                      <label
                        className={`field${
                          hasMessage(metrics.errors, "次回支払い額") ? " field--error" : ""
                        }`}
                      >
                        <span>{nextBillingLabel}の支払い額</span>
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
                        <span>{formatYearMonth(nextBillingDate)}の直近引落額</span>
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

                    {metrics.errors.length > 0 || metrics.warnings.length > 0 || hasAnyTimingWarning ? (
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
                        {hasNextBillingTimingWarning ? (
                          <p className="card-draft__message card-draft__message--warning">
                            この時点日の直近請求は {nextBillingLabel} です。基準日より前なので、カード請求見込みを更新してください。
                          </p>
                        ) : null}
                        {hasUnsettledTimingWarning ? (
                          <p className="card-draft__message card-draft__message--warning">
                            未確定利用額の想定引落日が {unsettledWithdrawalLabel} になっています。基準日をまたいでいるので、カード請求見込みを更新してください。
                          </p>
                        ) : null}
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
                          自動計算式: 利用枠 - 利用可能額 - {nextBillingLabel}の支払い額
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

                    <div className="card-draft__actions">
                      {isDirty && metrics.errors.length > 0 ? (
                        <p className="form-note form-note--danger">
                          入力エラーを解消すると保存できます。
                        </p>
                      ) : null}
                      <button
                        type="button"
                        className="button button--ghost"
                        onClick={() => handleResetCardDraft(card)}
                        disabled={!isDirty}
                      >
                        変更を取り消す
                      </button>
                      <button
                        type="button"
                        className="button button--primary"
                        onClick={() => handleSaveCardSnapshot(card)}
                        disabled={!isDirty || metrics.errors.length > 0}
                      >
                        {card.name} を保存
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="form-block">
          <div className="subsection-heading">
            <div>
              <h3>単発支出を追加</h3>
              <p className="form-note">
                口座払いもカード払いもここから追加できます。カード更新の流れのまま、その場で予定支出を入れられます。
              </p>
            </div>
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

        <div className="form-block">
          <div className="subsection-heading">
            <div>
              <h3>口座間振替を追加</h3>
              <p className="form-note">
                引落前に予備口座から移す予定などを登録できます。同日の口座支出やカード引落より先に反映します。
              </p>
            </div>
          </div>
          {accountOptions.length < 2 ? (
            <div className="empty-state">口座振替を使うには、口座を 2 つ以上登録してください。</div>
          ) : (
            <form className="inline-form" onSubmit={handleSubmitTransfer}>
              <label className="field">
                <span>名称</span>
                <input
                  type="text"
                  value={transferForm.name}
                  onChange={(event) =>
                    setTransferForm((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </label>
              <label className="field">
                <span>金額</span>
                <input
                  type="number"
                  step="1"
                  value={transferForm.amount}
                  onChange={(event) =>
                    setTransferForm((current) => ({
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
                  value={transferForm.date}
                  onChange={(event) =>
                    setTransferForm((current) => ({ ...current, date: event.target.value }))
                  }
                />
              </label>
              <label className="field">
                <span>振替元口座</span>
                <select
                  value={transferForm.fromAccountId}
                  onChange={(event) =>
                    setTransferForm((current) => {
                      const nextFromAccountId = event.target.value;
                      const nextToAccountId = accountOptions
                        .filter((account) => account.id !== nextFromAccountId)
                        .some((account) => account.id === current.toAccountId)
                        ? current.toAccountId
                        : getAlternateAccountId(accountOptions, nextFromAccountId);

                      return {
                        ...current,
                        fromAccountId: nextFromAccountId,
                        toAccountId: nextToAccountId,
                      };
                    })
                  }
                >
                  {accountOptions.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>振替先口座</span>
                <select
                  value={transferForm.toAccountId}
                  onChange={(event) =>
                    setTransferForm((current) => ({ ...current, toAccountId: event.target.value }))
                  }
                >
                  {accountOptions
                    .filter((account) => account.id !== transferForm.fromAccountId)
                    .map((account) => (
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
      </div>
    </SectionCard>
  );
}
