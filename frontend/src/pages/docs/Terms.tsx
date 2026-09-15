import DocPage, { DocSection } from "./DocPage";

export default function Terms() {
  return (
    <DocPage docNo="CP-002" title="Terms of service" revised="2026-07-27">
      <DocSection heading="Agreement">
        <p>
          By creating an account or sending events to Capybara you agree to these terms.
          If you are using Capybara on behalf of a company, you represent that you can
          bind that company.
        </p>
      </DocSection>
      <DocSection heading="The service">
        <p>
          Capybara ingests LLM usage events you send, joins them with billing data you
          connect, and presents cost and margin analytics. Paid plans are billed monthly
          through Stripe; you can cancel any time from the customer portal and keep access
          through the end of the billing period. Plan limits (events per month) are
          enforced at ingestion; events beyond the limit are dropped, not billed.
        </p>
      </DocSection>
      <DocSection heading="Your data">
        <p>
          You retain all rights to data you send. You grant us the limited right to
          process it to provide the service. You are responsible for ensuring you may
          lawfully share the identifiers you send (use pseudonymous customer IDs — never
          raw emails if your policies forbid it).
        </p>
      </DocSection>
      <DocSection heading="Accuracy disclaimer">
        <p>
          Cost figures are computed from published provider prices and your reported token
          counts. They are estimates for decision-making, not invoices. Your provider's
          bill is authoritative; reconcile before making commitments that depend on exact
          amounts.
        </p>
      </DocSection>
      <DocSection heading="Acceptable use">
        <p>
          No attempts to breach isolation between accounts, no reselling of the service
          without an agreement, no sending content you lack rights to. We may suspend
          accounts that threaten the integrity of the platform.
        </p>
      </DocSection>
      <DocSection heading="Liability">
        <p>
          The service is provided "as is." To the maximum extent permitted by law, our
          aggregate liability is limited to the fees you paid in the twelve months before
          the claim. We are not liable for decisions made on the basis of analytics.
        </p>
      </DocSection>
      <DocSection heading="Changes">
        <p>
          We may update these terms; material changes will be announced by email at least
          14 days in advance. Continued use after the effective date constitutes
          acceptance. Capybara legal contact details will be published before launch.
        </p>
      </DocSection>
    </DocPage>
  );
}
