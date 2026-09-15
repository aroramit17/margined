# Public frontend deployment

The public Capybara frontend is hosted on Cloudflare Pages project `usecapybara`, in account `1ee35fe4829d5ae2d62ea7ac3bcd15fd`. It publishes the landing page and explicitly labeled sample-data demo from the Margined fork. The authenticated FastAPI backend remains local; this deployment does not publish the private beta API or enable paid checkout.

## Build and deploy

From `frontend`, with Node 20.19+ or 22.12+:

```sh
npm ci
npm test
npx wrangler whoami
npm run deploy:public
```

`build:public` explicitly clears the Clerk publishable key and API URL and enables the sample-data demo before invoking Vite. These environment overrides prevent `.env.local` from leaking the local beta configuration into a public build. The usual `npm run dev` and `npm run build` still use the configured local Clerk integration.

`wrangler.jsonc` records the Pages project and output directory. Confirm the account shown by `wrangler whoami` matches the account above; Pages does not support an `account_id` field in its config. The Pages production branch is `codex/margined-audit`. Deployments use direct upload; pushing to GitHub preserves changes but does not deploy them automatically. Commit and push the reviewed source before deployment so Cloudflare's commit reference identifies the deployed code. No Cloudflare token or service credentials belong in Git.

Pages provides SPA fallback for React Router paths. `public/_headers` applies basic response headers and long-lived caching to hashed assets. The build contains no Pages Functions or backend secrets.

## Domain and DNSSEC

Spaceship remains the registrar for `usecapybara.com`. Cloudflare is the authoritative DNS provider, on the free plan:

- `andy.ns.cloudflare.com`
- `serena.ns.cloudflare.com`

The registrar originally used `launch1.spaceship.net` and `launch2.spaceship.net`, with no custom DNS records or mail records. Cloudflare scanned two default parking A records (`54.149.79.189`, `34.216.117.25`); the Pages custom-domain setup replaced them with a proxied root CNAME to `usecapybara.pages.dev`. It also added a proxied `www` CNAME to the same target.

Cloudflare DNSSEC was enabled before changing nameservers. Its DS record was preconfigured through Spaceship's custom-nameserver DS preparation flow, then activated with the nameserver change. The `.com` registry returned the new nameservers and DS record after the save:

```text
usecapybara.com. IN DS 2371 13 2 B6D75D6BA5B74E1AFA514B1D496CCBB3D38C1CBB219F8AB1BAD5BEBFC4E75D25
```

DNSSEC public digests are configuration, not credentials. Both Cloudflare (1.1.1.1) and Google (8.8.8.8) returned the new delegation with the DNSSEC authenticated-data flag. Resolver caches elsewhere can temporarily retain the old delegation.

## Next deployment stage

Real sign-in on the public domain requires a hosted backend, a Clerk production instance/domain, and matching backend issuer, origin and CORS configuration. Use a separate reviewed deployment for that stage. Do not point public traffic at the developer's loopback server.

## Deployment verification

The usage-label update is deployed at https://c47e4e9a.usecapybara.pages.dev from commit `4ea8c47`. The live custom-domain pricing calculator was verified with visible percentile definitions and consistent API calls/month plus monthly cost for median, P90 and P99. The public build, 6 frontend tests and 39 backend calculator/API tests passed. The margin slider was checked at 60% and updated recommended prices correctly. The backend's additive `p99_calls` field is committed for the future hosted API; the public demo computes it from its sample customers.

The initial deployment is `2d1bcab3-f529-4cff-8f81-bcd1988ddd37`, built from frontend code preserved at commit `6442dfc`. Its immutable URL is https://2d1bcab3.usecapybara.pages.dev and the stable hosting URL is https://usecapybara.pages.dev.

The production build and all 6 frontend authentication tests passed. Browser checks confirmed the landing page, loaded demo dashboard, pricing calculator and direct `/login` route. The public bundle was checked against local configured credential values; none are present. HTTP checks confirmed the Pages deployment and response headers. Cloudflare zone `44c334a697d441a6f88c1f026cd96ab4` is active. Both custom domains are active in the Pages API, including active ownership verification and certificate validation. HTTPS requests to `https://usecapybara.com/`, `https://www.usecapybara.com/` and the direct `/dashboard/demo/pricing` route returned HTTP 200. Chrome loaded the landing page on the custom root domain successfully. A Python urllib probe received HTTP 403 while Chrome and curl succeeded; no security settings were weakened to accommodate that probe.
