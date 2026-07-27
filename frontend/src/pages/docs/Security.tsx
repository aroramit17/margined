import DocPage, { DocSection } from "./DocPage";

export default function Security() {
  return (
    <DocPage docNo="MG-001" title="Security & data handling" revised="2026-07-27">
      <DocSection heading="What we receive">
        <p>
          The SDK sends usage metadata only: your customer ID, a feature name, the model
          name, token counts, computed cost, and a timestamp. It never sends prompts,
          completions, or message content — there is no field for them in the event schema,
          which is public in the SDK source.
        </p>
      </DocSection>
      <DocSection heading="Stripe access">
        <p>
          Margined reads subscriptions only. Connect with a restricted, read-only key (or
          Stripe Connect with the <code>read_only</code> scope). We store one number per
          customer — normalized monthly recurring revenue — plus the plan name. We cannot
          create charges, issue refunds, or see card details.
        </p>
      </DocSection>
      <DocSection heading="The SDK cannot break your app">
        <p>
          Tracking is fail-open by design: it never raises into your application, never
          blocks a request thread, bounds its memory at 10,000 queued events, and drops
          data before it degrades your service. If Margined is down, your app is unaffected.
          Every event carries an idempotency key, so a retried delivery can never
          double-count your costs.
        </p>
      </DocSection>
      <DocSection heading="Storage & isolation">
        <p>
          Data lives in Postgres (Supabase) with row-level security on every table: your
          projects, events, and mappings are readable only by your authenticated account.
          Ingest writes go through a service role that cannot be reached from the client.
          API keys are rotatable at any time from Settings.
        </p>
      </DocSection>
      <DocSection heading="Self-hosting">
        <p>
          The entire stack is MIT-licensed and runs on your own Supabase project and any
          Python host. If sending usage data to a third party is a blocker, run it yourself
          — the docs include a complete self-hosting guide.
        </p>
      </DocSection>
      <DocSection heading="Deletion & export">
        <p>
          Deleting a project deletes its events. Full account deletion and data export are
          available on request while self-serve tooling is built. Contact
          security@trymargined.com — also the address for vulnerability reports; we respond
          within 48 hours.
        </p>
      </DocSection>
    </DocPage>
  );
}
