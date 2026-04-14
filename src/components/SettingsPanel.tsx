import { useEffect, useState } from "react";
import type {
  Account,
  CreditCard,
  IncomePlan,
  OneTimeExpense,
  Subscription,
} from "../types/models";
import { SectionCard } from "./SectionCard";

interface SettingsPanelProps {
  today: string;
  accounts: Account[];
  cards: CreditCard[];
  subscriptions: Subscription[];
  incomePlans: IncomePlan[];
  oneTimeExpenses: OneTimeExpense[];
  onAddAccount: (account: Omit<Account, "id">) => void;
  onUpdateAccount: (id: string, patch: Partial<Account>) => void;
  onDeleteAccount: (id: string) => void;
  onAddCard: (card: Omit<CreditCard, "id">) => void;
  onUpdateCard: (id: string, patch: Partial<CreditCard>) => void;
  onDeleteCard: (id: string) => void;
  onAddSubscription: (subscription: Omit<Subscription, "id">) => void;
  onUpdateSubscription: (id: string, patch: Partial<Subscription>) => void;
  onDeleteSubscription: (id: string) => void;
  onAddIncomePlan: (incomePlan: Omit<IncomePlan, "id">) => void;
  onUpdateIncomePlan: (id: string, patch: Partial<IncomePlan>) => void;
  onDeleteIncomePlan: (id: string) => void;
  onAddOneTimeExpense: (expense: Omit<OneTimeExpense, "id">) => void;
  onUpdateOneTimeExpense: (id: string, patch: Partial<OneTimeExpense>) => void;
  onDeleteOneTimeExpense: (id: string) => void;
}

function toNumber(value: string): number {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

function confirmDeletion(name: string, relatedItems: Array<[string, number]> = []): boolean {
  const relatedSummary = relatedItems
    .filter(([, count]) => count > 0)
    .map(([label, count]) => `${label} ${count} 件`)
    .join("、");

  return window.confirm(
    relatedSummary
      ? `「${name}」を削除しますか？\n関連する ${relatedSummary} も一緒に削除されます。`
      : `「${name}」を削除しますか？`,
  );
}

export function SettingsPanel({
  today,
  accounts,
  cards,
  subscriptions,
  incomePlans,
  oneTimeExpenses,
  onAddAccount,
  onUpdateAccount,
  onDeleteAccount,
  onAddCard,
  onUpdateCard,
  onDeleteCard,
  onAddSubscription,
  onUpdateSubscription,
  onDeleteSubscription,
  onAddIncomePlan,
  onUpdateIncomePlan,
  onDeleteIncomePlan,
  onAddOneTimeExpense,
  onUpdateOneTimeExpense,
  onDeleteOneTimeExpense,
}: SettingsPanelProps) {
  const defaultAccountId = accounts[0]?.id ?? "";
  const defaultCardId = cards[0]?.id ?? "";

  const [accountForm, setAccountForm] = useState({
    name: "",
    balance: 0,
  });
  const [cardForm, setCardForm] = useState({
    name: "",
    limit: 300000,
    closingDay: 20,
    withdrawalDay: 10,
    withdrawalAccountId: defaultAccountId,
  });
  const [subscriptionForm, setSubscriptionForm] = useState({
    name: "",
    monthlyAmount: 0,
    billingDay: 1,
    cardId: defaultCardId,
  });
  const [incomeForm, setIncomeForm] = useState({
    name: "",
    amount: 0,
    date: today,
    accountId: defaultAccountId,
    recurring: "monthly" as IncomePlan["recurring"],
  });
  const [expenseForm, setExpenseForm] = useState({
    name: "",
    amount: 0,
    date: today,
    paymentType: "account" as OneTimeExpense["paymentType"],
    accountId: defaultAccountId,
    cardId: defaultCardId,
  });

  useEffect(() => {
    setCardForm((current) => ({
      ...current,
      withdrawalAccountId: accounts.some(
        (account) => account.id === current.withdrawalAccountId,
      )
        ? current.withdrawalAccountId
        : defaultAccountId,
    }));
    setIncomeForm((current) => ({
      ...current,
      accountId: accounts.some((account) => account.id === current.accountId)
        ? current.accountId
        : defaultAccountId,
    }));
    setExpenseForm((current) => ({
      ...current,
      accountId: accounts.some((account) => account.id === current.accountId)
        ? current.accountId
        : defaultAccountId,
      cardId: cards.some((card) => card.id === current.cardId)
        ? current.cardId
        : defaultCardId,
    }));
    setSubscriptionForm((current) => ({
      ...current,
      cardId: cards.some((card) => card.id === current.cardId)
        ? current.cardId
        : defaultCardId,
    }));
  }, [accounts, cards, defaultAccountId, defaultCardId]);

  function handleDeleteAccount(account: Account) {
    const relatedCards = cards.filter((card) => card.withdrawalAccountId === account.id);
    const relatedCardIds = new Set(relatedCards.map((card) => card.id));

    if (
      confirmDeletion(account.name, [
        ["カード", relatedCards.length],
        [
          "サブスク",
          subscriptions.filter((subscription) => relatedCardIds.has(subscription.cardId)).length,
        ],
        [
          "収入予定",
          incomePlans.filter((incomePlan) => incomePlan.accountId === account.id).length,
        ],
        [
          "単発支出",
          oneTimeExpenses.filter((expense) => {
            if (expense.paymentType === "account") {
              return expense.accountId === account.id;
            }

            return expense.cardId ? relatedCardIds.has(expense.cardId) : false;
          }).length,
        ],
      ])
    ) {
      onDeleteAccount(account.id);
    }
  }

  function handleDeleteCard(card: CreditCard) {
    if (
      confirmDeletion(card.name, [
        [
          "サブスク",
          subscriptions.filter((subscription) => subscription.cardId === card.id).length,
        ],
        [
          "単発支出",
          oneTimeExpenses.filter(
            (expense) => expense.paymentType === "card" && expense.cardId === card.id,
          ).length,
        ],
      ])
    ) {
      onDeleteCard(card.id);
    }
  }

  return (
    <SectionCard
      title="設定エリア"
      subtitle="口座・カード・サブスク・収入予定・単発支出を同じ画面で編集できます。"
    >
      <div className="stack-layout">
        <details className="settings-section" open>
          <summary>口座 ({accounts.length})</summary>
          <div className="settings-section__body">
            <div className="table-scroll">
              <table className="settings-table">
                <thead>
                  <tr>
                    <th>名称</th>
                    <th>残高</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((account) => (
                    <tr key={account.id}>
                      <td>
                        <input
                          type="text"
                          value={account.name}
                          onChange={(event) =>
                            onUpdateAccount(account.id, { name: event.target.value })
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="1"
                          value={account.balance}
                          onChange={(event) =>
                            onUpdateAccount(account.id, { balance: toNumber(event.target.value) })
                          }
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="button button--danger"
                          onClick={() => handleDeleteAccount(account)}
                        >
                          削除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <form
              className="inline-form compact-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (!accountForm.name.trim()) {
                  return;
                }

                onAddAccount({
                  name: accountForm.name.trim(),
                  balance: accountForm.balance,
                });
                setAccountForm({ name: "", balance: 0 });
              }}
            >
              <label className="field">
                <span>新規口座名</span>
                <input
                  type="text"
                  value={accountForm.name}
                  onChange={(event) =>
                    setAccountForm((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </label>
              <label className="field">
                <span>初期残高</span>
                <input
                  type="number"
                  step="1"
                  value={accountForm.balance}
                  onChange={(event) =>
                    setAccountForm((current) => ({
                      ...current,
                      balance: toNumber(event.target.value),
                    }))
                  }
                />
              </label>
              <button type="submit" className="button button--secondary">
                口座を追加
              </button>
            </form>
          </div>
        </details>

        <details className="settings-section" open>
          <summary>クレジットカード ({cards.length})</summary>
          <div className="settings-section__body">
            <div className="table-scroll">
              <table className="settings-table">
                <thead>
                  <tr>
                    <th>名称</th>
                    <th>利用枠</th>
                    <th>締め日</th>
                    <th>引落日</th>
                    <th>引落口座</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {cards.map((card) => (
                    <tr key={card.id}>
                      <td>
                        <input
                          type="text"
                          value={card.name}
                          onChange={(event) =>
                            onUpdateCard(card.id, { name: event.target.value })
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={card.limit}
                          onChange={(event) =>
                            onUpdateCard(card.id, { limit: toNumber(event.target.value) })
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="1"
                          max="31"
                          value={card.closingDay}
                          onChange={(event) =>
                            onUpdateCard(card.id, {
                              closingDay: toNumber(event.target.value),
                            })
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="1"
                          max="31"
                          value={card.withdrawalDay}
                          onChange={(event) =>
                            onUpdateCard(card.id, {
                              withdrawalDay: toNumber(event.target.value),
                            })
                          }
                        />
                      </td>
                      <td>
                        <select
                          value={card.withdrawalAccountId}
                          onChange={(event) =>
                            onUpdateCard(card.id, {
                              withdrawalAccountId: event.target.value,
                            })
                          }
                        >
                          {accounts.map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="button button--danger"
                          onClick={() => handleDeleteCard(card)}
                        >
                          削除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="section-note">
              次回支払い額と利用可能額、未確定利用額の扱いは上の「日々の更新」で管理します。
            </p>
            <form
              className="inline-form compact-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (!cardForm.name.trim() || !cardForm.withdrawalAccountId || cardForm.limit <= 0) {
                  return;
                }

                onAddCard({
                  name: cardForm.name.trim(),
                  limit: cardForm.limit,
                  closingDay: cardForm.closingDay,
                  withdrawalDay: cardForm.withdrawalDay,
                  withdrawalAccountId: cardForm.withdrawalAccountId,
                  availableAmount: cardForm.limit,
                  nextBillingAmount: 0,
                  unsettledAmountMode: "auto",
                });
                setCardForm({
                  name: "",
                  limit: 300000,
                  closingDay: 20,
                  withdrawalDay: 10,
                  withdrawalAccountId: defaultAccountId,
                });
              }}
            >
              <label className="field">
                <span>新規カード名</span>
                <input
                  type="text"
                  value={cardForm.name}
                  onChange={(event) =>
                    setCardForm((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </label>
              <label className="field">
                <span>利用枠</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={cardForm.limit}
                  onChange={(event) =>
                    setCardForm((current) => ({
                      ...current,
                      limit: toNumber(event.target.value),
                    }))
                  }
                />
              </label>
              <label className="field">
                <span>締め日</span>
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={cardForm.closingDay}
                  onChange={(event) =>
                    setCardForm((current) => ({
                      ...current,
                      closingDay: toNumber(event.target.value),
                    }))
                  }
                />
              </label>
              <label className="field">
                <span>引落日</span>
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={cardForm.withdrawalDay}
                  onChange={(event) =>
                    setCardForm((current) => ({
                      ...current,
                      withdrawalDay: toNumber(event.target.value),
                    }))
                  }
                />
              </label>
              <label className="field">
                <span>引落口座</span>
                <select
                  value={cardForm.withdrawalAccountId}
                  onChange={(event) =>
                    setCardForm((current) => ({
                      ...current,
                      withdrawalAccountId: event.target.value,
                    }))
                  }
                >
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="button button--secondary">
                カードを追加
              </button>
            </form>
          </div>
        </details>

        <details className="settings-section">
          <summary>サブスク ({subscriptions.length})</summary>
          <div className="settings-section__body">
            <div className="table-scroll">
              <table className="settings-table">
                <thead>
                  <tr>
                    <th>名称</th>
                    <th>月額</th>
                    <th>請求日</th>
                    <th>カード</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {subscriptions.map((subscription) => (
                    <tr key={subscription.id}>
                      <td>
                        <input
                          type="text"
                          value={subscription.name}
                          onChange={(event) =>
                            onUpdateSubscription(subscription.id, {
                              name: event.target.value,
                            })
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="1"
                          value={subscription.monthlyAmount}
                          onChange={(event) =>
                            onUpdateSubscription(subscription.id, {
                              monthlyAmount: toNumber(event.target.value),
                            })
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="1"
                          max="31"
                          value={subscription.billingDay}
                          onChange={(event) =>
                            onUpdateSubscription(subscription.id, {
                              billingDay: toNumber(event.target.value),
                            })
                          }
                        />
                      </td>
                      <td>
                        <select
                          value={subscription.cardId}
                          onChange={(event) =>
                            onUpdateSubscription(subscription.id, { cardId: event.target.value })
                          }
                        >
                          {cards.map((card) => (
                            <option key={card.id} value={card.id}>
                              {card.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="button button--danger"
                          onClick={() => {
                            if (confirmDeletion(subscription.name)) {
                              onDeleteSubscription(subscription.id);
                            }
                          }}
                        >
                          削除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <form
              className="inline-form compact-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (!subscriptionForm.name.trim() || !subscriptionForm.cardId) {
                  return;
                }

                onAddSubscription({
                  name: subscriptionForm.name.trim(),
                  monthlyAmount: subscriptionForm.monthlyAmount,
                  billingDay: subscriptionForm.billingDay,
                  cardId: subscriptionForm.cardId,
                });
                setSubscriptionForm({
                  name: "",
                  monthlyAmount: 0,
                  billingDay: 1,
                  cardId: defaultCardId,
                });
              }}
            >
              <label className="field">
                <span>名称</span>
                <input
                  type="text"
                  value={subscriptionForm.name}
                  onChange={(event) =>
                    setSubscriptionForm((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </label>
              <label className="field">
                <span>月額</span>
                <input
                  type="number"
                  step="1"
                  value={subscriptionForm.monthlyAmount}
                  onChange={(event) =>
                    setSubscriptionForm((current) => ({
                      ...current,
                      monthlyAmount: toNumber(event.target.value),
                    }))
                  }
                />
              </label>
              <label className="field">
                <span>請求日</span>
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={subscriptionForm.billingDay}
                  onChange={(event) =>
                    setSubscriptionForm((current) => ({
                      ...current,
                      billingDay: toNumber(event.target.value),
                    }))
                  }
                />
              </label>
              <label className="field">
                <span>カード</span>
                <select
                  value={subscriptionForm.cardId}
                  onChange={(event) =>
                    setSubscriptionForm((current) => ({ ...current, cardId: event.target.value }))
                  }
                >
                  {cards.map((card) => (
                    <option key={card.id} value={card.id}>
                      {card.name}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="button button--secondary">
                サブスクを追加
              </button>
            </form>
          </div>
        </details>

        <details className="settings-section">
          <summary>収入予定 ({incomePlans.length})</summary>
          <div className="settings-section__body">
            <div className="table-scroll">
              <table className="settings-table">
                <thead>
                  <tr>
                    <th>名称</th>
                    <th>金額</th>
                    <th>日付</th>
                    <th>口座</th>
                    <th>繰り返し</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {incomePlans.map((income) => (
                    <tr key={income.id}>
                      <td>
                        <input
                          type="text"
                          value={income.name}
                          onChange={(event) =>
                            onUpdateIncomePlan(income.id, { name: event.target.value })
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="1"
                          value={income.amount}
                          onChange={(event) =>
                            onUpdateIncomePlan(income.id, { amount: toNumber(event.target.value) })
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="date"
                          value={income.date}
                          onChange={(event) =>
                            onUpdateIncomePlan(income.id, { date: event.target.value })
                          }
                        />
                      </td>
                      <td>
                        <select
                          value={income.accountId}
                          onChange={(event) =>
                            onUpdateIncomePlan(income.id, { accountId: event.target.value })
                          }
                        >
                          {accounts.map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          value={income.recurring}
                          onChange={(event) =>
                            onUpdateIncomePlan(income.id, {
                              recurring: event.target.value as IncomePlan["recurring"],
                            })
                          }
                        >
                          <option value="monthly">monthly</option>
                          <option value="once">once</option>
                        </select>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="button button--danger"
                          onClick={() => {
                            if (confirmDeletion(income.name)) {
                              onDeleteIncomePlan(income.id);
                            }
                          }}
                        >
                          削除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <form
              className="inline-form compact-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (!incomeForm.name.trim() || !incomeForm.accountId) {
                  return;
                }

                onAddIncomePlan({
                  name: incomeForm.name.trim(),
                  amount: incomeForm.amount,
                  date: incomeForm.date,
                  accountId: incomeForm.accountId,
                  recurring: incomeForm.recurring,
                });
                setIncomeForm({
                  name: "",
                  amount: 0,
                  date: today,
                  accountId: defaultAccountId,
                  recurring: "monthly",
                });
              }}
            >
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
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>繰り返し</span>
                <select
                  value={incomeForm.recurring}
                  onChange={(event) =>
                    setIncomeForm((current) => ({
                      ...current,
                      recurring: event.target.value as IncomePlan["recurring"],
                    }))
                  }
                >
                  <option value="monthly">monthly</option>
                  <option value="once">once</option>
                </select>
              </label>
              <button type="submit" className="button button--secondary">
                収入予定を追加
              </button>
            </form>
          </div>
        </details>

        <details className="settings-section">
          <summary>単発支出 ({oneTimeExpenses.length})</summary>
          <div className="settings-section__body">
            <div className="table-scroll">
              <table className="settings-table">
                <thead>
                  <tr>
                    <th>名称</th>
                    <th>金額</th>
                    <th>日付</th>
                    <th>支払い方法</th>
                    <th>対象</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {oneTimeExpenses.map((expense) => (
                    <tr key={expense.id}>
                      <td>
                        <input
                          type="text"
                          value={expense.name}
                          onChange={(event) =>
                            onUpdateOneTimeExpense(expense.id, { name: event.target.value })
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="1"
                          value={expense.amount}
                          onChange={(event) =>
                            onUpdateOneTimeExpense(expense.id, {
                              amount: toNumber(event.target.value),
                            })
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="date"
                          value={expense.date}
                          onChange={(event) =>
                            onUpdateOneTimeExpense(expense.id, { date: event.target.value })
                          }
                        />
                      </td>
                      <td>
                        <select
                          value={expense.paymentType}
                          onChange={(event) =>
                            onUpdateOneTimeExpense(expense.id, {
                              paymentType: event.target.value as OneTimeExpense["paymentType"],
                              accountId:
                                event.target.value === "account"
                                  ? expense.accountId ?? defaultAccountId
                                  : undefined,
                              cardId:
                                event.target.value === "card"
                                  ? expense.cardId ?? defaultCardId
                                  : undefined,
                            })
                          }
                        >
                          <option value="account">account</option>
                          <option value="card">card</option>
                        </select>
                      </td>
                      <td>
                        {expense.paymentType === "account" ? (
                          <select
                            value={expense.accountId ?? defaultAccountId}
                            onChange={(event) =>
                              onUpdateOneTimeExpense(expense.id, { accountId: event.target.value })
                            }
                          >
                            {accounts.map((account) => (
                              <option key={account.id} value={account.id}>
                                {account.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <select
                            value={expense.cardId ?? defaultCardId}
                            onChange={(event) =>
                              onUpdateOneTimeExpense(expense.id, { cardId: event.target.value })
                            }
                          >
                            {cards.map((card) => (
                              <option key={card.id} value={card.id}>
                                {card.name}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="button button--danger"
                          onClick={() => {
                            if (confirmDeletion(expense.name)) {
                              onDeleteOneTimeExpense(expense.id);
                            }
                          }}
                        >
                          削除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <form
              className="inline-form compact-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (!expenseForm.name.trim()) {
                  return;
                }

                onAddOneTimeExpense({
                  name: expenseForm.name.trim(),
                  amount: expenseForm.amount,
                  date: expenseForm.date,
                  paymentType: expenseForm.paymentType,
                  accountId:
                    expenseForm.paymentType === "account" ? expenseForm.accountId : undefined,
                  cardId: expenseForm.paymentType === "card" ? expenseForm.cardId : undefined,
                });
                setExpenseForm({
                  name: "",
                  amount: 0,
                  date: today,
                  paymentType: "account",
                  accountId: defaultAccountId,
                  cardId: defaultCardId,
                });
              }}
            >
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
                  <option value="account">account</option>
                  <option value="card">card</option>
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
                    {accounts.map((account) => (
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
                    {cards.map((card) => (
                      <option key={card.id} value={card.id}>
                        {card.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button type="submit" className="button button--secondary">
                単発支出を追加
              </button>
            </form>
          </div>
        </details>
      </div>
    </SectionCard>
  );
}
