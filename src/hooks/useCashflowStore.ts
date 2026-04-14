import { useCallback, useMemo } from "react";
import { LOCAL_STORAGE_KEY } from "../data/constants";
import { normalizeAppData } from "../data/normalizeAppData";
import { createEmptyData, createSampleData } from "../data/sampleData";
import { useLocalStorageState } from "./useLocalStorageState";
import { createCardSnapshotPatch } from "../lib/cardMetrics";
import type {
  Account,
  AppData,
  CreditCard,
  IncomePlan,
  OneTimeExpense,
  Subscription,
} from "../types/models";
import { createId } from "../utils/id";

function createInitialData(): AppData {
  if (typeof window === "undefined") {
    return createEmptyData();
  }

  const existing = window.localStorage.getItem(LOCAL_STORAGE_KEY);

  return existing ? createEmptyData() : createSampleData();
}

function addWithId<T extends { id: string }>(
  items: T[],
  prefix: string,
  item: Omit<T, "id">,
): T[] {
  return [...items, { ...item, id: createId(prefix) } as T];
}

function patchById<T extends { id: string }>(
  items: T[],
  id: string,
  patch: Partial<T>,
): T[] {
  return items.map((item) => (item.id === id ? { ...item, ...patch } : item));
}

function removeById<T extends { id: string }>(items: T[], id: string): T[] {
  return items.filter((item) => item.id !== id);
}

function removeCardCascade(data: AppData, id: string): AppData {
  return {
    ...data,
    cards: removeById(data.cards, id),
    subscriptions: data.subscriptions.filter((subscription) => subscription.cardId !== id),
    oneTimeExpenses: data.oneTimeExpenses.filter(
      (expense) => expense.paymentType !== "card" || expense.cardId !== id,
    ),
  };
}

function removeAccountCascade(data: AppData, id: string): AppData {
  const removedCardIds = new Set(
    data.cards
      .filter((card) => card.withdrawalAccountId === id)
      .map((card) => card.id),
  );

  return {
    ...data,
    accounts: removeById(data.accounts, id),
    cards: data.cards.filter((card) => card.withdrawalAccountId !== id),
    subscriptions: data.subscriptions.filter(
      (subscription) => !removedCardIds.has(subscription.cardId),
    ),
    incomePlans: data.incomePlans.filter((incomePlan) => incomePlan.accountId !== id),
    oneTimeExpenses: data.oneTimeExpenses.filter((expense) => {
      if (expense.paymentType === "account") {
        return expense.accountId !== id;
      }

      return expense.cardId ? !removedCardIds.has(expense.cardId) : true;
    }),
  };
}

export function useCashflowStore() {
  const [data, setData, hasLoaded] = useLocalStorageState<AppData>(
    LOCAL_STORAGE_KEY,
    createInitialData,
    normalizeAppData,
  );

  const commit = useCallback(
    (updater: (current: AppData) => AppData) => {
      setData((current) => normalizeAppData(updater(current)));
    },
    [setData],
  );

  const actions = useMemo(
    () => ({
      replaceWithSampleData() {
        setData(normalizeAppData(createSampleData()));
      },
      addAccount(account: Omit<Account, "id">) {
        commit((current) => ({
          ...current,
          accounts: addWithId(current.accounts, "account", account),
        }));
      },
      updateAccount(id: string, patch: Partial<Account>) {
        commit((current) => ({
          ...current,
          accounts: patchById(current.accounts, id, patch),
        }));
      },
      removeAccount(id: string) {
        commit((current) => removeAccountCascade(current, id));
      },
      addCard(card: Omit<CreditCard, "id">) {
        commit((current) => ({
          ...current,
          cards: addWithId(current.cards, "card", card),
        }));
      },
      updateCard(id: string, patch: Partial<CreditCard>) {
        commit((current) => ({
          ...current,
          cards: patchById(current.cards, id, patch),
        }));
      },
      removeCard(id: string) {
        commit((current) => removeCardCascade(current, id));
      },
      addSubscription(subscription: Omit<Subscription, "id">) {
        commit((current) => ({
          ...current,
          subscriptions: addWithId(current.subscriptions, "subscription", subscription),
        }));
      },
      updateSubscription(id: string, patch: Partial<Subscription>) {
        commit((current) => ({
          ...current,
          subscriptions: patchById(current.subscriptions, id, patch),
        }));
      },
      removeSubscription(id: string) {
        commit((current) => ({
          ...current,
          subscriptions: removeById(current.subscriptions, id),
        }));
      },
      addIncomePlan(incomePlan: Omit<IncomePlan, "id">) {
        commit((current) => ({
          ...current,
          incomePlans: addWithId(current.incomePlans, "income", incomePlan),
        }));
      },
      updateIncomePlan(id: string, patch: Partial<IncomePlan>) {
        commit((current) => ({
          ...current,
          incomePlans: patchById(current.incomePlans, id, patch),
        }));
      },
      removeIncomePlan(id: string) {
        commit((current) => ({
          ...current,
          incomePlans: removeById(current.incomePlans, id),
        }));
      },
      addOneTimeExpense(expense: Omit<OneTimeExpense, "id">) {
        commit((current) => ({
          ...current,
          oneTimeExpenses: addWithId(current.oneTimeExpenses, "expense", expense),
        }));
      },
      updateOneTimeExpense(id: string, patch: Partial<OneTimeExpense>) {
        commit((current) => ({
          ...current,
          oneTimeExpenses: patchById(current.oneTimeExpenses, id, patch),
        }));
      },
      removeOneTimeExpense(id: string) {
        commit((current) => ({
          ...current,
          oneTimeExpenses: removeById(current.oneTimeExpenses, id),
        }));
      },
      updateAccountBalances(updates: Record<string, number>) {
        commit((current) => ({
          ...current,
          accounts: current.accounts.map((account) =>
            account.id in updates ? { ...account, balance: updates[account.id] } : account,
          ),
        }));
      },
      updateCardSnapshots(
        updates: Record<
          string,
          {
            nextBillingAmount: number;
            availableAmount: number;
            unsettledAmountMode: CreditCard["unsettledAmountMode"];
            manualUnsettledAmount?: number;
          }
        >,
      ) {
        commit((current) => ({
          ...current,
          cards: current.cards.map((card) =>
            card.id in updates
              ? {
                  ...card,
                  ...createCardSnapshotPatch({
                    limit: card.limit,
                    ...updates[card.id],
                  }),
                }
              : card,
          ),
        }));
      },
    }),
    [commit, setData],
  );

  return {
    data,
    actions,
    hasLoaded,
  };
}
