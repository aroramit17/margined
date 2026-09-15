import { cn } from "@/lib/utils";

/** Decorative animal + readable wordmark share one accessible name. */
export default function Brand({ className, large = false }: { className?: string; large?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 shrink-0", className)}>
      <img src="/brand/capybara-mark.png" alt="" width={large ? 64 : 36} height={large ? 64 : 36} className="object-contain" />
      <span className={cn("font-brand font-bold tracking-[-0.045em] leading-none", large ? "text-4xl" : "text-[23px]")}>capybara<span className="text-primary">.</span></span>
    </span>
  );
}
