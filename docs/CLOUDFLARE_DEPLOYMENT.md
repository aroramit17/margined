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

`wrangler.jsonc` records the account, Pages project and output directory. The Pages production branch is `codex/margined-audit`. Deployments use direct upload; pushing to GitHub preserves changes but does not deploy them automatically. Commit and push the reviewed source before deployment so Cloudflare's commit reference identifies the deployed code. No Cloudflare token or service credentials belong in Git.

Pages provides SPA fallback for React Router paths. `public/_headers` applies basic response headers and long-lived caching to hashed assets. The build contains no Pages Functions or backend secrets.

## Domain and DNSSEC

Spaceship remains the registrar for `usecapybara.com`. Cloudflare is the authoritative DNS provider, on the free plan:

- `andy.ns.cloudflare.com`
- `serena.ns.cloudflare.com`

The registrar originally used `launch1.spaceship.net` and `launch2.spaceship.net`, with no custom DNS records or mail records. Cloudflare scanned two default parking A records (`54.149.79.189`, `34.216.117.25`); these must be replaced by the Pages custom-domain record when attaching the website.

Cloudflare DNSSEC was enabled before changing nameservers. Its DS record was preconfigured through Spaceship's custom-nameserver DS preparation flow, then activated with the nameserver change. The `.com` registry returned the new nameservers and DS record after the save:

```text
usecapybara.com. IN DS 2371 13 2 B6D75D6BA5B74E1AFA514B1D496CCBB3D38C1CBB219F8AB1BAD5BEBFC4E75D25
```

DNSSEC public digests are configuration, not credentials. Resolver caches can temporarily retain the old delegation. Verify the final website, TLS and DNSSEC after attaching the custom domains.

## Next deployment stage

Real sign-in on the public domain requires a hosted backend, a Clerk production instance/domain, and matching backend issuer, origin and CORS configuration. Use a separate reviewed deployment for that stage. Do not point public traffic at the developer's loopback server.
