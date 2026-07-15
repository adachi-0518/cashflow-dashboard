import type { ForecastEvent } from "../types/forecast";
import { formatCurrency, formatShortDate, getEventKindLabel } from "../utils/format";

interface ForecastTableProps {
  events: ForecastEvent[];
}

export function ForecastTable({ events }: ForecastTableProps) {
  if (events.length === 0) {
    return (
      <div className="empty-state">
        今後 90 日に口座残高が動くイベントはありません。
      </div>
    );
  }

  return (
    <div className="table-scroll">
      <table className="forecast-table">
        <thead>
          <tr>
            <th>日付</th>
            <th>種別</th>
            <th>名称</th>
            <th>金額</th>
            <th>対象</th>
            <th>反映後残高</th>
            <th>合算残高</th>
            <th>根拠</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => {
            const amountSign =
              event.direction === "in" ? "+" : event.direction === "out" ? "-" : "";
            const amountClass =
              event.direction === "in"
                ? "amount-positive"
                : event.direction === "out"
                  ? "amount-negative"
                  : "amount-neutral";
            const balanceLabel = event.targetType === "account" ? "口座" : "カード債務";
            const reflectedBalance =
              event.targetType === "account" ? event.accountBalanceAfter : event.cardOutstandingAfter;
            const targetLabel =
              event.kind === "account-transfer" && event.counterpartyTargetName
                ? `${event.targetName} → ${event.counterpartyTargetName}`
                : event.targetName;

            return (
              <tr key={event.id}>
                <td>{formatShortDate(event.date)}</td>
                <td>
                  <span className={`event-kind event-kind--${event.kind}`}>
                    {getEventKindLabel(event.kind)}
                  </span>
                </td>
                <td>
                  <div className="event-title">
                    <strong>{event.title}</strong>
                    {event.note ? <span>{event.note}</span> : null}
                    {event.shortageAccountsAfter.length > 0 ? (
                      <span className="warning-chip">不足発生</span>
                    ) : null}
                  </div>
                </td>
                <td className={amountClass}>
                  {amountSign}
                  {formatCurrency(event.amount)}
                </td>
                <td>{targetLabel}</td>
                <td>
                  {event.kind === "account-transfer" &&
                  typeof reflectedBalance === "number" &&
                  event.counterpartyTargetName &&
                  typeof event.counterpartyAccountBalanceAfter === "number" ? (
                    <div className="balance-cell">
                      <span>{event.targetName}</span>
                      <strong>{formatCurrency(reflectedBalance)}</strong>
                      <span>{event.counterpartyTargetName}</span>
                      <strong>{formatCurrency(event.counterpartyAccountBalanceAfter)}</strong>
                    </div>
                  ) : typeof reflectedBalance === "number" ? (
                    <div className="balance-cell">
                      <span>{balanceLabel}</span>
                      <strong>{formatCurrency(reflectedBalance)}</strong>
                    </div>
                  ) : (
                    <span className="muted-text">-</span>
                  )}
                </td>
                <td>{formatCurrency(event.totalCashAfter)}</td>
                <td>
                  <details className="reason-details">
                    <summary>内訳を見る</summary>
                    <ul>
                      {event.reasonItems.map((item, index) => (
                        <li key={`${event.id}-${index}`}>
                          <span>{item.label}</span>
                          <strong>{formatCurrency(item.amount)}</strong>
                          {item.note ? <span>{item.note}</span> : null}
                        </li>
                      ))}
                    </ul>
                  </details>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
