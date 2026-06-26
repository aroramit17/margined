import { cn } from "@/lib/utils";

type Status = "ok" | "watch" | "risk";

interface Props {
  margin: number | null;
  status: Status;
  showPercent?: boolean;
}

export function MarginBadge({ margin, status, showPercent = true }: Props) {
  const config = {
    ok:    { dot: "bg-green-500",  text: "text-green-700",  bg: "bg-green-50",  label: "" },
    watch: { dot: "bg-yellow-500", text: "text-yellow-700", bg: "bg-yellow-50", label: "Watch" },
    risk:  { dot: "bg-red-500",    text: "text-red-700",    bg: "bg-red-50",    label: "Risk" },
  }[status];

  const display = margin != null
    ? `${(margin * 100).toFixed(1)}%`
    : "—";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium",
        config.bg,
        config.text,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", config.dot)} />
      {showPercent ? display : null}
      {config.label ? ` ${config.label}` : ""}
    </span>
  );
}
