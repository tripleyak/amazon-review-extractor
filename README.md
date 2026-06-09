# Amazon Review Extractor

Pull the **deepest recoverable set** of customer reviews for any Amazon ASIN — one at a
time or in bulk from a CSV/Excel upload — ordered oldest → newest, deduplicated, and
exportable to CSV/JSON. The tool is honest about coverage: it tells you how many reviews
it captured versus how many the listing claims to have, and why the gap exists.

## The reality of Amazon reviews (reverse-engineering notes)

This was validated against live Amazon in June 2026. Read it before expecting "every review
ever written" — that target is **not achievable for high-volume listings**, and no tool or
API achieves it. Here's why, and what we do about it.

### 1. The endpoints

| Endpoint | Behavior | Yields |
|---|---|---|
| `GET /dp/{ASIN}` (product page) | **200 OK, anonymous** | ~8–15 "medley" reviews embedded in the page |
| `GET /product-reviews/{ASIN}/?pageNumber=N&...` | **Redirects anonymous visitors to sign-in** (`/ap/signin` → `/ax/claim`) | Nothing without a logged-in cookie |
| `GET /product-reviews/...` **with a valid session cookie** | 200 OK | Paginated reviews, **but capped at 10 pages = ~100 reviews per filter** |

Amazon **deprecated public review pagination**. The dedicated reviews pages now require
login, and even logged in, pagination is hard-capped near page 10. So "page back to the
very first review" through the public interface is impossible for any listing with more
than ~100 reviews — Amazon truncates it server-side. The Product Advertising API removed
review content years ago; SP-API never exposed it. There is no official bulk-review API.

### 2. The faceting trick (how you maximize coverage)

The 100-result cap applies **per filter combination**, not per ASIN. So you multiply
coverage by unioning across facets and deduplicating by review id:

```
/product-reviews/{ASIN}/?reviewerType={all_reviews|avp_only_reviews}
                        &filterByStar={five_star|four_star|three_star|two_star|one_star}
                        &sortBy={recent|helpful}
                        &pageNumber={1..10}
```

- 5 star buckets × ~100 each ≈ up to **500** unique reviews
- × `sortBy=recent` vs `helpful` surfaces different reviews within each bucket
- × `all_reviews` vs `avp_only_reviews` (verified only) adds more

Realistic ceiling: **hundreds to ~1,000+ unique reviews** for a big listing — never the
full 60,000. For small/medium listings (under a few hundred reviews) you can often get
**everything**. The app does this union automatically and reports the result honestly.

## Three extraction methods (pick per your needs)

| Method | Setup | Depth | Best for |
|---|---|---|---|
| **Anonymous PDP** | none | ~8–15 reviews | zero-config demo, a quick taste of recent reviews |
| **Session cookie** | paste your Amazon `Cookie:` header | deep (faceted, free) | the workhorse — you already have an Amazon login |
| **Rainforest / Apify API** | paste an API key | deep + reliable at scale | bulk jobs, hands-off, avoids IP blocks |

All three feed the same dedup + ordering + coverage-report pipeline.

### Getting your session cookie (for the free deep method)

1. Log into `amazon.com` (or your marketplace) in Chrome.
2. DevTools → **Network** tab → reload → click any `www.amazon.com` document request.
3. Under **Request Headers**, copy the entire `Cookie:` value.
4. Paste it into the app's Settings → "Amazon session cookie", set Strategy = "Session cookie".

The cookie is held in server memory for the request only and never stored. If it expires,
the app tells you explicitly (it detects the sign-in redirect) instead of silently
returning zero.

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
# or
npm run build && npm run start
```

### Single ASIN
Paste an ASIN (`B07ZPKN6YR`) or any Amazon URL (`/dp/`, `/gp/product/`, `/product-reviews/`,
a long `…/Some-Name/dp/ASIN?…` link). Watch the live log, then review the table and export.

### Bulk (CSV / Excel)
Drop any `.csv`, `.xlsx`, or `.xls`. **Column names don't matter** — every cell is scanned
for ASINs and Amazon URLs, deduplicated. Click **Run all**; each ASIN runs through the same
pipeline with a small concurrency pool. Export a combined CSV (all reviews) or JSON
(per-ASIN with coverage reports). A sample file is at `public/sample-asins.csv`.

## Output fields

`asin, id, rating, title, body, author, date, country, verifiedPurchase, helpfulVotes,
variant, url, foundVia` — `foundVia` records which facet surfaced each review.

## Tests

```bash
npm run test:engine    # live end-to-end: ASIN parsing + anonymous extraction + ordering asserts
```

## Deploy

Deploys to Vercel as-is (`vercel deploy`). One caveat: **datacenter IPs (Vercel, AWS) are
blocked by Amazon more aggressively than residential IPs.** In production, prefer the
Rainforest/Apify methods (they use residential proxy pools) or run the cookie method from a
residential IP. The anonymous PDP method may intermittently hit CAPTCHA from cloud IPs — the
app detects and reports this rather than returning bad data.

## Architecture

```
lib/
  asin.ts            parse ASIN/marketplace from any input shape
  marketplaces.ts    domain map (.com, .co.uk, .de, …)
  urls.ts            the reverse-engineered /product-reviews/ URL builder + facets
  http.ts            browser-like fetch, cookies, login-wall detection
  parse.ts           cheerio parser (handles current + legacy review DOM)
  extract.ts         orchestrator: strategy select → facet union → dedup → order → coverage
  providers/
    anonymous.ts     PDP medley
    cookie.ts        faceted /product-reviews/ scrape with a session cookie
    rainforest.ts    Rainforest API (managed proxy)
    apify.ts         Apify actor (managed proxy + scale)
app/
  page.tsx           UI (single + bulk tabs, settings, live log, table, export)
  api/extract        SSE streaming extraction
  api/parse-list     CSV/XLSX → ASIN list
  api/health
```

## Legal

For research / voice-of-customer analysis. Scraping may conflict with Amazon's Conditions
of Use; you are responsible for compliance with Amazon's terms and applicable law in your
jurisdiction. The managed-API methods (Rainforest/Apify) shift collection to vendors with
their own compliance posture.
