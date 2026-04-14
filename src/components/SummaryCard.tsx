interface SummaryCardProps {
  title: string;
  value: string;
  tone?: "good" | "warning" | "danger" | "neutral";
  description?: string;
  eyebrow?: string;
  compact?: boolean;
}

export function SummaryCard({
  title,
  value,
  tone = "neutral",
  description,
  eyebrow,
  compact = false,
}: SummaryCardProps) {
  return (
    <article className={`summary-card summary-card--${tone} ${compact ? "summary-card--compact" : ""}`}>
      {eyebrow ? <span className="summary-card__eyebrow">{eyebrow}</span> : null}
      <p className="summary-card__title">{title}</p>
      <strong className="summary-card__value">{value}</strong>
      {description ? <p className="summary-card__description">{description}</p> : null}
    </article>
  );
}
