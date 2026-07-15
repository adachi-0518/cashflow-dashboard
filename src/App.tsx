import { useMemo } from "react";
import { AlertList } from "./components/AlertList";
import { BalanceTrendChart } from "./components/BalanceTrendChart";
import { ForecastTable } from "./components/ForecastTable";
import { QuickUpdatePanel } from "./components/QuickUpdatePanel";
import { SectionCard } from "./components/SectionCard";
import { SettingsPanel } from "./components/SettingsPanel";
import { SummaryCard } from "./components/SummaryCard";
import { APP_TITLE } from "./data/constants";
import { useCashflowStore } from "./hooks/useCashflowStore";
import { useTodayDateString } from "./hooks/useTodayDateString";
import { buildForecast } from "./lib/forecast";
import { getNextMonthStart } from "./utils/date";
import { formatCurrency, formatDate, formatYearMonth } from "./utils/format";

function getToneFromAmount(value: number): "good" | "warning" | "danger" | "neutral" {
  if (value > 0) {
    return "good";
  }

  if (value === 0) {
    return "warning";
  }

  return "danger";
}

export default function App() {
  const today = useTodayDateString();
  const currentMonthLabel = formatYearMonth(today);
  const nextMonthLabel = formatYearMonth(getNextMonthStart(today));
  const { data, actions, hasLoaded } = useCashflowStore();
  const forecast = useMemo(() => buildForecast(data, today), [data, today]);
  const visibleEvents = useMemo(
    () => forecast.events.filter((event) => event.affectsCash),
    [forecast.events],
  );

  if (!hasLoaded) {
    return (
      <div className="loading-screen">
        <div className="loading-screen__panel">
          <strong>LocalStorage を読み込んでいます</strong>
          <p>前回の入力内容を反映中です。</p>
        </div>
      </div>
    );
  }

  const resilienceTone =
    forecast.summary.withdrawalResilience.status === "safe"
      ? "good"
      : forecast.summary.withdrawalResilience.status === "risk"
        ? "danger"
        : "neutral";
  const dangerAlertCount = forecast.alerts.filter((alert) => alert.level === "danger").length;
  const warningAlertCount = forecast.alerts.filter((alert) => alert.level === "warning").length;
  const primaryStatusTone =
    dangerAlertCount > 0
      ? "danger"
      : warningAlertCount > 0
        ? "warning"
      : forecast.summary.safeToSpendNow > 0
        ? "good"
        : "warning";
  const primaryStatusLabel =
    dangerAlertCount > 0
      ? "不足リスクあり"
      : warningAlertCount > 0
        ? "要更新の情報あり"
      : forecast.summary.safeToSpendNow > 0
        ? "いまは概ね安全"
        : "余力は小さめ";
  const primaryStatusMessage =
    dangerAlertCount > 0
      ? "先に不足アラートの内容を確認してください。安全額は保守的に表示しています。"
      : warningAlertCount > 0
        ? "カード請求や入力時点の更新が必要な可能性があります。予測を信用する前にアラートを確認してください。"
      : forecast.summary.safeToSpendNow > 0
        ? `今日の安全額を起点に、次イベント後と${currentMonthLabel}末の自由額を見れば判断しやすい状態です。`
        : "不足は出ていませんが、追加支出の余地はかなり限られています。";
  const topAlerts = forecast.alerts.slice(0, 2);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__main">
          <p className="eyebrow">LocalStorage / ローカル専用 / 90日予測</p>
          <h1>{APP_TITLE}</h1>
          <p className="app-header__description">
            今日の安全額、{currentMonthLabel}末の余力、{nextMonthLabel}の引き落とし耐性を 1 画面で確認できます。
          </p>
        </div>
        <div className="header-metadata">
          <div className="header-metadata__item">
            <span>基準日</span>
            <strong>{formatDate(today)}</strong>
          </div>
          <div className="header-metadata__item">
            <span>予測期間</span>
            <strong>{formatDate(today)} - {formatDate(forecast.summary.forecastHorizonEnd)}</strong>
          </div>
          <div className="header-metadata__item">
            <span>現在の合算残高</span>
            <strong>{formatCurrency(forecast.summary.baselineTotalCash)}</strong>
          </div>
        </div>
      </header>

      <section className={`priority-board priority-board--${primaryStatusTone}`}>
        <div className="priority-board__hero">
          <div className="priority-board__status">
            <span className={`status-dot status-dot--${primaryStatusTone}`}></span>
            <strong>{primaryStatusLabel}</strong>
          </div>
          <p className="priority-board__label">今日の安全に使える額</p>
          <div className="priority-board__value">{formatCurrency(forecast.summary.safeToSpendNow)}</div>
          <p className="priority-board__message">{primaryStatusMessage}</p>
          <div className="priority-board__meta">
            <div>
              <span>次イベント後</span>
              <strong>{formatCurrency(forecast.summary.nextEventSpendable.value)}</strong>
            </div>
            <div>
              <span>{currentMonthLabel}末</span>
              <strong>{formatCurrency(forecast.summary.monthEndFreeCash)}</strong>
            </div>
            <div>
              <span>{nextMonthLabel}引き落とし</span>
              <strong>{forecast.summary.withdrawalResilience.label}</strong>
            </div>
          </div>
        </div>

        <aside className="priority-board__alerts">
          <div className="priority-board__alerts-header">
            <div>
              <span className="eyebrow eyebrow--tight">最優先チェック</span>
              <h2>不足アラート</h2>
            </div>
            <strong className={`alert-counter alert-counter--${forecast.summary.alertCount > 0 ? "danger" : "safe"}`}>
              {forecast.summary.alertCount} 件
            </strong>
          </div>

          {topAlerts.length > 0 ? (
            <div className="priority-alert-preview">
              {topAlerts.map((alert) => (
                <article key={alert.id} className={`priority-alert-preview__item priority-alert-preview__item--${alert.level}`}>
                  <div className="priority-alert-preview__meta">
                    <span className="pill">{alert.level === "danger" ? "危険" : alert.level === "warning" ? "注意" : "補足"}</span>
                    {alert.date ? <span>{formatDate(alert.date)}</span> : null}
                  </div>
                  <strong>{alert.title}</strong>
                  <p>{alert.message}</p>
                </article>
              ))}
            </div>
          ) : (
            <div className="priority-alert-preview__empty">
              先に確認すべき不足アラートはありません。イベント一覧で根拠を追えます。
            </div>
          )}
        </aside>
      </section>

      <section className="summary-grid summary-grid--secondary">
        <SummaryCard
          title="次イベント後の使える額"
          value={formatCurrency(forecast.summary.nextEventSpendable.value)}
          tone={getToneFromAmount(forecast.summary.nextEventSpendable.value)}
          eyebrow="次に見る数字"
          description={
            forecast.summary.nextEventSpendable.date
              ? `${formatDate(forecast.summary.nextEventSpendable.date)} の「${forecast.summary.nextEventSpendable.label}」通過後`
              : forecast.summary.nextEventSpendable.label
          }
          compact
        />
        <SummaryCard
          title="月末自由額"
          value={formatCurrency(forecast.summary.monthEndFreeCash)}
          tone={getToneFromAmount(forecast.summary.monthEndFreeCash)}
          eyebrow={`${currentMonthLabel}の見込み`}
          description={`${currentMonthLabel}末時点での合算現金残高の見込みです。`}
          compact
        />
        <SummaryCard
          title={`${nextMonthLabel}引き落とし耐性`}
          value={forecast.summary.withdrawalResilience.label}
          tone={resilienceTone}
          eyebrow={nextMonthLabel}
          description={forecast.summary.withdrawalResilience.note}
          compact
        />
        <SummaryCard
          title="緊急時の拡張余力"
          value={formatCurrency(forecast.summary.emergencyCreditHeadroom)}
          tone="neutral"
          eyebrow="参考値"
          description="カード利用枠ベースの参考値です。安全額とは分けて見ます。"
          compact
        />
      </section>

      <div className="content-grid">
        <div className="main-column">
          <SectionCard
            title="不足アラート"
            subtitle="合算残高では足りていても、引き落とし口座単体で不足する場合はここで検知します。"
          >
            <AlertList alerts={forecast.alerts} />
          </SectionCard>

          <SectionCard
            title="残高の推移"
            subtitle="口座ごとの残高が今後90日でどう動くかです。いちばんへこむ点と、0円ラインまでの余裕を確認できます。"
          >
            <BalanceTrendChart
              timeline={forecast.balanceTimeline}
              accounts={data.accounts.filter((account) => account.enabled !== false)}
              today={today}
              horizonEnd={forecast.summary.forecastHorizonEnd}
            />
          </SectionCard>

          <SectionCard
            title="今後90日のイベント一覧"
            subtitle="口座残高が動く予定だけを表示します。カード利用の積み上がりは一覧から省いています。"
          >
            <ForecastTable events={visibleEvents} />
          </SectionCard>

          <SectionCard title="計算の前提" subtitle="数字の読み方と、保守的に見積もるためのルールです。">
            <ul className="assumption-list">
              {forecast.assumptions.map((assumption) => (
                <li key={assumption}>{assumption}</li>
              ))}
            </ul>
          </SectionCard>
        </div>

        <div className="side-column">
          <QuickUpdatePanel
            today={today}
            accounts={data.accounts}
            cards={data.cards}
            onSaveAccountBalances={actions.updateAccountBalances}
            onSaveCardSnapshots={actions.updateCardSnapshots}
            onAddIncomePlan={actions.addIncomePlan}
            onAddAccountTransfer={actions.addAccountTransfer}
            onAddOneTimeExpense={actions.addOneTimeExpense}
          />

          <SettingsPanel
            today={today}
            appData={data}
            accounts={data.accounts}
            cards={data.cards}
            subscriptions={data.subscriptions}
            incomePlans={data.incomePlans}
            accountTransfers={data.accountTransfers}
            oneTimeExpenses={data.oneTimeExpenses}
            onAddAccount={actions.addAccount}
            onUpdateAccount={actions.updateAccount}
            onDeleteAccount={actions.removeAccount}
            onAddCard={actions.addCard}
            onUpdateCard={actions.updateCard}
            onDeleteCard={actions.removeCard}
            onAddSubscription={actions.addSubscription}
            onUpdateSubscription={actions.updateSubscription}
            onDeleteSubscription={actions.removeSubscription}
            onAddIncomePlan={actions.addIncomePlan}
            onUpdateIncomePlan={actions.updateIncomePlan}
            onDeleteIncomePlan={actions.removeIncomePlan}
            onAddAccountTransfer={actions.addAccountTransfer}
            onUpdateAccountTransfer={actions.updateAccountTransfer}
            onDeleteAccountTransfer={actions.removeAccountTransfer}
            onAddOneTimeExpense={actions.addOneTimeExpense}
            onUpdateOneTimeExpense={actions.updateOneTimeExpense}
            onDeleteOneTimeExpense={actions.removeOneTimeExpense}
            onImportData={actions.replaceData}
          />
        </div>
      </div>
    </div>
  );
}
