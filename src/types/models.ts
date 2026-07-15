export type IsoDateString = string;
export type CardUnsettledAmountMode = "auto" | "manual";
export type CardWithdrawalTiming = "after-closing" | "next-month";

export interface Account {
  id: string;
  name: string;
  balance: number;
  enabled?: boolean;
}

export interface CreditCard {
  id: string;
  name: string;
  limit: number;
  closingDay: number;
  withdrawalDay: number;
  withdrawalTiming: CardWithdrawalTiming;
  withdrawalAccountId: string;
  snapshotDate: IsoDateString;
  availableAmount: number;
  nextBillingAmount: number;
  unsettledAmountMode: CardUnsettledAmountMode;
  manualUnsettledAmount?: number;
  enabled?: boolean;
}

export interface Subscription {
  id: string;
  name: string;
  monthlyAmount: number;
  billingDay: number;
  cardId: string;
  enabled?: boolean;
}

export interface IncomePlan {
  id: string;
  name: string;
  amount: number;
  date: IsoDateString;
  accountId: string;
  recurring: "monthly" | "once";
  enabled?: boolean;
}

export interface AccountTransfer {
  id: string;
  name: string;
  amount: number;
  date: IsoDateString;
  fromAccountId: string;
  toAccountId: string;
  enabled?: boolean;
}

export interface OneTimeExpense {
  id: string;
  name: string;
  amount: number;
  date: IsoDateString;
  paymentType: "account" | "card";
  accountId?: string;
  cardId?: string;
  enabled?: boolean;
}

export interface AppData {
  accounts: Account[];
  cards: CreditCard[];
  subscriptions: Subscription[];
  incomePlans: IncomePlan[];
  accountTransfers: AccountTransfer[];
  oneTimeExpenses: OneTimeExpense[];
}
