import { cn } from "@/lib/utils";

type Status = "ok" | "watch" | "risk";

interface Props {
  margin: number | null;
  status: Status;
  showPercent?: boolean;
}

/**
 * Margin figures follow the ledger's color rule: the tone encodes the
 * decision boundary (healthy / watch / underwater), never decoration.
 * Dot + tabular figure — no filled pills.
 */
export function MarginBadge({ margin, status, showPercent = true }: Props) {
  const config = {
    ok: { dot: "bg-profit", text: "text-profit", label: "" },
    watch: { dot: "bg-watch", text: "text-watch", label: "watch" },
    risk: { dot: "bg-loss", text: "text-loss", label: "risk" },
  }[status];

  // Accounting convention: negatives in parentheses.
  const display =
    margin == null
      ? "—"
      : margin < 0
        ? `(${Math.abs(margin * 100).toFixed(1)})%`
        : `${(margin * 100).toFixed(1)}%`;

  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium figure", config.text)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", config.dot)} />
      {showPercent ? display : null}
      {config.label && <span className="text-[11px] font-normal opacity-80">{config.label}</span>}
    </span>
  );
}
