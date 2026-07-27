import DocPage from "./DocPage";

const ENTRIES: Array<{ date: string; title: string; notes: string[] }> = [
  {
    date: "2026-07-27",
    title: "Node SDK, billing, and the ledger redesign",
    notes: [
      "TypeScript/Node SDK (npm: margined) with the same fail-open guarantees as Python: bounded queue, retries, idempotent delivery, AsyncLocalStorage context, client wrap().",
      "Plans and metering: Free / Starter / Growth with monthly event limits enforced at ingest; Stripe Checkout and customer portal.",
      "Break-even price now reports median COGS (the price at zero margin); recommended price unchanged.",
      "Full visual redesign: warm-paper ledger identity, financial-statement typography, no-auth live demo.",
    ],
  },
  {
    date: "2026-07-26",
    title: "Cache-aware pricing and idempotent ingestion",
    notes: [
      "All four token classes tracked per call: uncached input, output, cache reads, cache writes — priced at each provider's actual rates.",
      "Every event carries a client-generated ID; the ingest API dedupes, so retried flushes can never double-count cost.",
      "Server-side cost recompute from raw token counts; client cost is a hint, not a trusted value.",
      "Streaming support in the Python SDK (Anthropic and OpenAI streams).",
    ],
  },
  {
    date: "2026-06-25",
    title: "First release",
    notes: [
      "Python SDK with one-argument tracking, Stripe margin column, feature cost ranking, pricing calculator, margin-at-risk alerts.",
    ],
  },
];

export default function Changelog() {
  return (
    <DocPage docNo="MG-004" title="Changelog" revised={ENTRIES[0].date}>
      <div className="space-y-12">
        {ENTRIES.map((entry) => (
          <section key={entry.date} className="grid sm:grid-cols-[140px_1fr] gap-3 sm:gap-8">
            <p className="eyebrow pt-1 figure">{entry.date}</p>
            <div>
              <h2 className="text-lg font-semibold tracking-tight mb-3">{entry.title}</h2>
              <ul className="space-y-2 text-[15px] leading-relaxed text-foreground/90 max-w-[65ch] list-none">
                {entry.notes.map((note) => (
                  <li key={note} className="pl-5 relative">
                    <span className="absolute left-0 text-muted-foreground">—</span>
                    {note}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ))}
      </div>
    </DocPage>
  );
}
