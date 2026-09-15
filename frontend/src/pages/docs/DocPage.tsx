import Brand from "@/components/Brand";
import { Link } from "react-router-dom";

/**
 * Controlled-document frame for legal/trust pages: folio line, document
 * number, revision date — a spec sheet, not a marketing page.
 */
export default function DocPage({
  docNo,
  title,
  revised,
  children,
}: {
  docNo: string;
  title: string;
  revised: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link to="/" aria-label="Capybara home"><Brand /></Link>
          <Link
            to="/"
            className="text-[13px] text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-14">
        <div className="flex flex-wrap justify-between gap-2 border-b pb-3 mb-10">
          <span className="eyebrow">Capybara · {docNo}</span>
          <span className="eyebrow">Revised {revised}</span>
        </div>
        <h1 className="font-display text-4xl tracking-[-0.01em] font-medium mb-10">{title}</h1>
        <div className="doc-prose space-y-8">{children}</div>
      </main>

      <footer className="border-t mt-10">
        <div className="max-w-3xl mx-auto px-6 py-8 flex flex-wrap gap-6 text-[13px] text-muted-foreground">
          <Link to="/security" className="hover:text-foreground transition-colors">Security</Link>
          <Link to="/terms" className="hover:text-foreground transition-colors">Terms</Link>
          <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
          <Link to="/changelog" className="hover:text-foreground transition-colors">Changelog</Link>
        </div>
      </footer>
    </div>
  );
}

export function DocSection({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="eyebrow mb-3">{heading}</h2>
      <div className="space-y-3 text-[15px] leading-relaxed text-foreground/90 max-w-[65ch]">
        {children}
      </div>
    </section>
  );
}
