# Capybara brand identity

Product name: **Capybara**. Wordmark: **capybara.** Domain: **usecapybara.com**.

## Direction

A calm companion for founders who need to understand AI costs and customer profitability. The seated capybara makes the tool approachable; clear figures and direct language keep it useful.

- Primary headline: **Keep your AI margins calm.**
- Supporting line: **Less guesswork. More breathing room.**
- Description: See customer costs, feature spend, and where pricing needs attention.
- Voice: warm, specific, and measured. No guaranteed-profit promises or invented performance claims.

## Visual system

| Color | Hex | Role |
| --- | --- | --- |
| Oat | #F8F4EB | Main canvas |
| Cocoa | #37291F | Text and wordmark |
| Clay | #A66B43 | Supporting earthy accent; animal artwork has its own brown tones |
| Pond | #335B4D | Primary actions and headline accent |
| Sage | #E2EADD | Animal backdrop |

Manrope for the wordmark and display headings; IBM Plex Sans for interface copy; IBM Plex Mono and tabular figures for data. System font fallbacks preserve readability. Dark mode uses warm dark surfaces and lighter green actions. Profit, watch, and loss colors retain explicit numeric/text context.

## Assets and usage

- Transparent master: [capybara-mark.png](../frontend/public/brand/capybara-mark.png), 1254 × 1254 PNG.
- Reviewable brand sheet: [index.html](../frontend/public/brand/index.html), served at `/brand/index.html` by the frontend.
- Shared app wordmark: [Brand.tsx](../frontend/src/components/Brand.tsx).
- Animal alone for favicon; animal plus live-text wordmark for navigation and sign-in.
- Preserve proportions and original colors. Keep one ear-height of clear space around the visible silhouette. Use oat or sage behind the animal when more contrast is needed. Do not stretch, rotate, or add accessories.
- The PNG is raster artwork, not a vector master. Use the original file for digital work; large-format print would need a separately prepared vector asset.

## Implemented scope

Applied identity to the landing page, login, dashboard navigation, documentation frame, product-name references, browser title/favicon, and metadata. Retained React/Vite application, data wiring, and SDK imports. The landing page uses clearly labeled sample data with reconciled totals and the existing MVP's planned one-time launch pricing.

Domain registration, DNS, deployment, production mailboxes, OAuth redirects, SDK/package publishing, and backend notification templates are separate launch work. No mailbox at the new domain is represented as operational. Old upstream contact addresses were removed from frontend legal/security pages; their inherited policy contents still require product-specific launch review under MVP_BUILD_SPEC.md. MIT attribution and upstream history remain intact.

## Artwork provenance

Created with the built-in image generation tool, not the CLI fallback. Final prompt:

```text
Use case: logo-brand
Asset type: production logo symbol for capybara, an AI cost and customer profitability web tool at usecapybara.com.
Primary request: Create one exceptionally clean, memorable capybara animal logo on a genuinely transparent background. A relaxed seated capybara in profile facing right: unmistakable long blunt rectangular muzzle, small rounded ears high on head, gently domed broad body, tiny calm dark eye, short sturdy feet and no visible tail. Friendly and quietly confident, sophisticated software brand rather than children's cartoon. One unified compact silhouette, warm medium chestnut brown body, very dark cocoa minimal facial details, with at most one muted tan shape for the muzzle. Simple smooth vector-like contours, flat solid fills, excellent recognition at small sizes. Center animal large within square canvas with balanced 12% clear margins.
Constraints: single animal symbol only; no text, no letters, no wordmark, no badge, no border, no shadows, no gradients, no texture, no accessories, no extra objects, no mockup. Transparent alpha background, not a checkerboard illustration. Anatomically recognizable capybara, not beaver, bear, guinea pig or dog.
```


## Validation

- Frontend TypeScript and production build passed; existing bundle-size and mixed demo import warnings remain.
- Browser reviewed: desktop landing page, loaded demo dashboard in light/dark mode, mobile landing page and login at 390px, and the brand sheet.
- Mobile header overlap fixed; DOM check confirmed no page-width overflow and all landing logo images loaded.
- This branding check does not validate production authentication, billing, DNS, or email delivery.
