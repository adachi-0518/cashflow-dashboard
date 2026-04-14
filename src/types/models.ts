export type IsoDateString = string;
export type CardUnsettledAmountMode = "auto" | "manual";

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
  withdrawalAccountId: string;
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
  oneTimeExpenses: OneTimeExpense[];
}
