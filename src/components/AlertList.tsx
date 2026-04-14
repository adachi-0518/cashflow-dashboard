import type { ForecastAlert } from "../types/forecast";
import { formatDate } from "../utils/format";

interface AlertListProps {
  alerts: ForecastAlert[];
}

const levelLabelMap = {
  danger: "危険",
  warning: "注意",
  info: "補足",
} as const;

export function AlertList({ alerts }: AlertListProps) {
  if (alerts.length === 0) {
    return (
      <div className="empty-state empty-state--success">
        <strong>不足アラートはありません。</strong>
        <p>いまの90日予測では、口座別不足も含めて危険なイベントは見つかっていません。</p>
      </div>
    );
  }

  return (
    <div className="alert-list">
      {alerts.map((alert) => (
        <article key={alert.id} className={`alert-list__item alert-list__item--${alert.level}`}>
          <div className="alert-list__meta">
            <span className="pill">{levelLabelMap[alert.level]}</span>
            {alert.date ? <span>{formatDate(alert.date)}</span> : null}
          </div>
          <strong className="alert-list__title">{alert.title}</strong>
          <p>{alert.message}</p>
        </article>
      ))}
    </div>
  );
}
