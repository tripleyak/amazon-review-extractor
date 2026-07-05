# amazon-review-extractor

Next.js app that extracts and structures Amazon product reviews. **Public repo**; live at amazon-review-extractor.vercel.app — every push to `main` auto-deploys to production, so CI (lint + test:engine + build) must be green before merging.

## Commands
- `npm run dev` — local dev server
- `npm run lint` — ESLint (zero explicit `any` policy; enforced since 2026-07-05)
- `npm run test:engine` — extraction-engine tests via tsx
- `npm run build` — production build (the deploy gate)

## Constraints
- Extraction logic lives in `lib/` and `scripts/test-engine.ts` exercises it — change both together.
- Amazon DOM facts (login wall, 100-per-facet cap, faceting trick, current selectors) are documented in the private kb, not here — do not commit scraped data, cookies, or session material to this public repo.
- No secrets in code: config via `.env.example` pattern only.
