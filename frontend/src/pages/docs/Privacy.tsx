import DocPage, { DocSection } from "./DocPage";

export default function Privacy() {
  return (
    <DocPage docNo="MG-003" title="Privacy policy" revised="2026-07-27">
      <DocSection heading="What we collect">
        <p>
          Account data: your email and authentication records. Service data: the usage
          events your SDK sends (customer IDs as you supply them, feature names, model
          names, token counts, costs, timestamps) and the subscription amounts you connect
          from Stripe. We do not collect prompts or completions, and we do not use
          third-party advertising or analytics trackers on the dashboard.
        </p>
      </DocSection>
      <DocSection heading="How we use it">
        <p>
          Solely to provide the service: computing analytics, rendering dashboards,
          sending the alerts you configure, and transactional email (Resend). We do not
          sell data or use your data to train models.
        </p>
      </DocSection>
      <DocSection heading="Processors">
        <p>
          Supabase (database and authentication), Vercel (dashboard hosting), Railway
          (API hosting), Stripe (payments and, if you connect it, subscription reads),
          Resend (email). Each processes data only as needed to run Margined.
        </p>
      </DocSection>
      <DocSection heading="Your customers' data">
        <p>
          For customer identifiers inside usage events, you are the controller and
          Margined is a processor acting on your instructions. Send pseudonymous IDs where
          possible. A data processing agreement (DPA) is available on request for
          customers subject to GDPR or similar regimes: privacy@trymargined.com.
        </p>
      </DocSection>
      <DocSection heading="Retention & deletion">
        <p>
          Event data is retained while your account is active. Deleting a project deletes
          its events; deleting your account deletes everything within 30 days. You can
          request export or deletion at privacy@trymargined.com and we will comply within
          30 days.
        </p>
      </DocSection>
      <DocSection heading="Where data lives">
        <p>
          Data is stored in the region of the Supabase project backing your deployment
          (US for the hosted service). Self-hosting keeps everything in your own
          infrastructure.
        </p>
      </DocSection>
    </DocPage>
  );
}
