import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { BalanceTimelinePoint } from "../types/forecast";
import type { Account } from "../types/models";
import { addDays, differenceInDays } from "../utils/date";
import { formatCompactCurrency, formatCurrency, formatShortDate } from "../utils/format";

// dataviz スキルの検証済みカテゴリカル配色（固定順・循環させない）。
// アプリの danger 色と紛らわしくなるため red スロットは外してある。
// validate_palette.js: 最悪の隣接CVD ΔE 24.2（目標12以上）／白サーフェスで全チェック PASS。
const SERIES_COLORS = [
  "#2a78d6", // blue
  "#1baf7a", // aqua
  "#eda100", // yellow
  "#008300", // green
  "#4a3aa7", // violet
  "#e87ba4", // magenta
  "#eb6834", // orange
] as const;

const MAX_SERIES = SERIES_COLORS.length;

/** 終端に系列名を置くのをやめて凡例だけに任せる幅のしきい値 */
const END_LABEL_MIN_WIDTH = 560;

interface BalanceTrendChartProps {
  timeline: BalanceTimelinePoint[];
  accounts: Account[];
  today: string;
  horizonEnd: string;
}

interface Series {
  id: string;
  name: string;
  color: string;
}

/**
 * viewBox を実寸に合わせるためにコンテナ幅を測る。固定 viewBox を引き伸ばすと、
 * 狭い画面で文字まで一緒に縮んで読めなくなる。
 */
function useContainerWidth(initialWidth: number): [(node: HTMLDivElement | null) => void, number] {
  const [width, setWidth] = useState(initialWidth);
  const observerRef = useRef<ResizeObserver | null>(null);

  useEffect(() => () => observerRef.current?.disconnect(), []);

  // ref コールバックは毎レンダー作り直さない。作り直すと React が null → node で
  // 呼び直すので、レンダーのたびに ResizeObserver を張り替えることになる。
  const measureRef = useCallback(
    (node: HTMLDivElement | null) => {
      observerRef.current?.disconnect();

      if (!node) {
        return;
      }

      setWidth(node.clientWidth || initialWidth);
      observerRef.current = new ResizeObserver((entries) => {
        const next = entries[0]?.contentRect.width;

        if (next) {
          setWidth(next);
        }
      });
      observerRef.current.observe(node);
    },
    [initialWidth],
  );

  return [measureRef, width];
}

function buildYTicks(min: number, max: number): number[] {
  const span = max - min;

  if (span <= 0) {
    return [min];
  }

  const rawStep = span / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 2.5, 5, 10].map((n) => n * magnitude).find((n) => n >= rawStep) ?? magnitude * 10;
  const first = Math.ceil(min / step) * step;
  const ticks: number[] = [];

  for (let value = first; value <= max + step * 0.001; value += step) {
    ticks.push(Math.round(value));
  }

  return ticks.includes(0) || min > 0 || max < 0 ? ticks : [...ticks, 0].sort((a, b) => a - b);
}

/**
 * 終端の系列ラベルが重ならないよう、上から順に最小間隔まで押し下げる。
 * 残高が近い口座どうしでラベルが潰れるのを防ぐ。
 */
function spreadLabels(entries: Array<{ id: string; y: number }>, gap: number): Map<string, number> {
  const sorted = [...entries].sort((left, right) => left.y - right.y);
  const result = new Map<string, number>();
  let previous = Number.NEGATIVE_INFINITY;

  for (const entry of sorted) {
    const y = Math.max(entry.y, previous + gap);
    result.set(entry.id, y);
    previous = y;
  }

  return result;
}

export function BalanceTrendChart({ timeline, accounts, today, horizonEnd }: BalanceTrendChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [measureRef, containerWidth] = useContainerWidth(860);

  // viewBox はコンテナと同じ px 数にする（1:1 なので文字が縮まない）
  const VIEW_WIDTH = Math.max(300, Math.round(containerWidth));
  const showEndLabels = VIEW_WIDTH >= END_LABEL_MIN_WIDTH;
  const VIEW_HEIGHT = VIEW_WIDTH < 520 ? 250 : 340;
  const PADDING = {
    top: 20,
    right: showEndLabels ? 132 : 14,
    bottom: 40,
    left: VIEW_WIDTH < 520 ? 46 : 60,
  };
  const PLOT_WIDTH = VIEW_WIDTH - PADDING.left - PADDING.right;
  const PLOT_HEIGHT = VIEW_HEIGHT - PADDING.top - PADDING.bottom;

  const series: Series[] = useMemo(
    () =>
      accounts.slice(0, MAX_SERIES).map((account, index) => ({
        id: account.id,
        name: account.name,
        color: SERIES_COLORS[index],
      })),
    [accounts],
  );

  const totalDays = Math.max(1, differenceInDays(today, horizonEnd));

  const geometry = useMemo(() => {
    const values = timeline.flatMap((point) => series.map((s) => point.balances[s.id] ?? 0));
    // 0 を必ず含めることで「ゼロ割れまでどれだけ余裕があるか」が常に読める
    const rawMin = Math.min(0, ...values);
    const rawMax = Math.max(0, ...values);
    const pad = (rawMax - rawMin) * 0.08 || 10000;
    // 谷がマイナスのときは最小額ラベルを谷の下に置きたいので、下だけ余白を広く取る。
    // 詰めると、谷へ落ちていく線の上にラベルが重なってしまう。
    const bottomPad = rawMin < 0 ? pad * 2.5 : 0;

    return { min: rawMin - bottomPad, max: rawMax + pad };
  }, [timeline, series]);

  const toX = (date: string) =>
    PADDING.left + (differenceInDays(today, date) / totalDays) * PLOT_WIDTH;
  const toY = (value: number) =>
    PADDING.top +
    PLOT_HEIGHT -
    ((value - geometry.min) / (geometry.max - geometry.min || 1)) * PLOT_HEIGHT;

  const yTicks = buildYTicks(geometry.min, geometry.max);
  const zeroY = toY(0);
  const hasShortage = geometry.min < 0;
  // x は時間軸なので、目盛りもデータ点ではなく日数で等間隔に置く
  const xTicks = (VIEW_WIDTH < 520 ? [0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1]).map((ratio) =>
    addDays(today, Math.round(totalDays * ratio)),
  );
  const endLabelY = spreadLabels(
    series.map((s) => ({
      id: s.id,
      y: toY(timeline[timeline.length - 1]?.balances[s.id] ?? 0) + 4,
    })),
    14,
  );

  // 直接ラベル用に、いちばん危ない点（全口座を通じた最小残高）だけを拾う
  const lowest = useMemo(() => {
    let best: { date: string; value: number; seriesId: string } | null = null;

    for (const point of timeline) {
      for (const s of series) {
        const value = point.balances[s.id] ?? 0;

        if (!best || value < best.value) {
          best = { date: point.date, value, seriesId: s.id };
        }
      }
    }

    return best;
  }, [timeline, series]);

  if (series.length === 0 || timeline.length === 0) {
    return <div className="empty-state">口座を登録すると、残高の推移を表示します。</div>;
  }

  function handleMove(event: ReactMouseEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    // viewBox 座標に直してから、いちばん近い日付の点を選ぶ
    const x = ((event.clientX - rect.left) / rect.width) * VIEW_WIDTH;
    let nearest = 0;

    for (let index = 1; index < timeline.length; index += 1) {
      if (Math.abs(toX(timeline[index].date) - x) < Math.abs(toX(timeline[nearest].date) - x)) {
        nearest = index;
      }
    }

    setHoverIndex(nearest);
  }

  const hovered = hoverIndex === null ? null : timeline[hoverIndex];

  return (
    <div className="balance-chart" ref={measureRef}>
      <svg
        className="balance-chart__svg"
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        role="img"
        aria-label={`今後90日の口座別残高推移。${series.map((s) => s.name).join("、")}。詳しい数字は下のイベント一覧で確認できます。`}
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIndex(null)}
      >
        {hasShortage ? (
          <rect
            x={PADDING.left}
            y={zeroY}
            width={PLOT_WIDTH}
            height={Math.max(0, PADDING.top + PLOT_HEIGHT - zeroY)}
            className="balance-chart__danger-zone"
          />
        ) : null}

        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={PADDING.left}
              x2={PADDING.left + PLOT_WIDTH}
              y1={toY(tick)}
              y2={toY(tick)}
              className={tick === 0 ? "balance-chart__zero-line" : "balance-chart__grid-line"}
            />
            <text
              x={PADDING.left - 10}
              y={toY(tick) + 4}
              textAnchor="end"
              className={tick === 0 ? "balance-chart__zero-label" : "balance-chart__axis-label"}
            >
              {formatCompactCurrency(tick)}
            </text>
          </g>
        ))}

        {xTicks.map((date, index) => (
          <text
            key={date}
            x={toX(date)}
            y={PADDING.top + PLOT_HEIGHT + 22}
            textAnchor={index === 0 ? "start" : index === xTicks.length - 1 ? "end" : "middle"}
            className="balance-chart__axis-label"
          >
            {formatShortDate(date).replace(/\(.\)$/, "")}
          </text>
        ))}

        {series.map((s) => (
          <path
            key={s.id}
            d={timeline
              .map(
                (point, index) =>
                  `${index === 0 ? "M" : "L"} ${toX(point.date)} ${toY(point.balances[s.id] ?? 0)}`,
              )
              .join(" ")}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        {/* 系列の終端に名前を直接置く（凡例と往復させないため）。
            狭い画面では置き場所がないので凡例だけに任せる。 */}
        {showEndLabels
          ? series.map((s) => (
              <text
                key={s.id}
                x={PADDING.left + PLOT_WIDTH + 8}
                y={endLabelY.get(s.id)}
                className="balance-chart__series-label"
                fill={s.color}
              >
                {s.name}
              </text>
            ))
          : null}

        {lowest ? (
          (() => {
            const cx = toX(lowest.date);
            const cy = toY(lowest.value);
            // 谷の下は普通あいているが、0円ライン付近まで沈んでいると軸ラベルと
            // ぶつかるので、そのときだけ上に逃がす
            const below = cy + 22 < PADDING.top + PLOT_HEIGHT - 6;
            // 左右端でははみ出すので、寄せ方を変える
            const anchor = cx < PADDING.left + 40 ? "start" : cx > PADDING.left + PLOT_WIDTH - 40 ? "end" : "middle";

            return (
              <g>
                <circle
                  cx={cx}
                  cy={cy}
                  r={5}
                  fill={lowest.value < 0 ? "var(--danger)" : "var(--text-strong)"}
                  stroke="#ffffff"
                  strokeWidth={2}
                />
                <text
                  x={cx}
                  y={cy + (below ? 22 : -14)}
                  textAnchor={anchor}
                  className={`balance-chart__lowest-label${lowest.value < 0 ? " balance-chart__lowest-label--danger" : ""}`}
                >
                  最小 {formatCompactCurrency(lowest.value)}
                </text>
              </g>
            );
          })()
        ) : null}

        {hovered ? (
          <g>
            <line
              x1={toX(hovered.date)}
              x2={toX(hovered.date)}
              y1={PADDING.top}
              y2={PADDING.top + PLOT_HEIGHT}
              className="balance-chart__crosshair"
            />
            {series.map((s) => (
              <circle
                key={s.id}
                cx={toX(hovered.date)}
                cy={toY(hovered.balances[s.id] ?? 0)}
                r={4}
                fill={s.color}
                stroke="#ffffff"
                strokeWidth={2}
              />
            ))}
          </g>
        ) : null}
      </svg>

      {hovered ? (
        <div
          className="balance-chart__tooltip"
          style={{
            // 端に寄せすぎるとカードからはみ出すので内側に留める
            left: `${Math.min(82, Math.max(18, (toX(hovered.date) / VIEW_WIDTH) * 100))}%`,
          }}
        >
          <strong>{formatShortDate(hovered.date)}</strong>
          {series.map((s) => (
            <div key={s.id} className="balance-chart__tooltip-row">
              <span className="balance-chart__swatch" style={{ background: s.color }} />
              <span>{s.name}</span>
              <strong>{formatCurrency(hovered.balances[s.id] ?? 0)}</strong>
            </div>
          ))}
          <div className="balance-chart__tooltip-row balance-chart__tooltip-row--total">
            <span>合算</span>
            <strong>{formatCurrency(hovered.totalCash)}</strong>
          </div>
        </div>
      ) : null}

      <div className="balance-chart__legend">
        {series.map((s) => (
          <span key={s.id} className="balance-chart__legend-item">
            <span className="balance-chart__swatch" style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
        {accounts.length > MAX_SERIES ? (
          <span className="balance-chart__legend-note">
            ほか {accounts.length - MAX_SERIES} 口座はイベント一覧で確認してください
          </span>
        ) : null}
      </div>
    </div>
  );
}
