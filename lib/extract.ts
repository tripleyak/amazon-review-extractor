// Orchestrator: pick a strategy, run it, dedup, order oldest->newest, and
// produce an honest coverage report (collected vs. what Amazon claims exists).

import { domainFor } from "./marketplaces";
import { extractAnonymous } from "./providers/anonymous";
import { extractWithCookie } from "./providers/cookie";
import { extractRainforest } from "./providers/rainforest";
import { extractApify } from "./providers/apify";
import type {
  CoverageReport,
  ExtractionResult,
  ExtractOptions,
  ProgressEvent,
  Review,
  Strategy,
} from "./types";

function chooseStrategy(opts: ExtractOptions): Exclude<Strategy, "auto"> {
  if (opts.strategy && opts.strategy !== "auto") return opts.strategy;
  if (opts.apiKey && opts.apiKey.trim()) return "rainforest";
  if (opts.cookie && opts.cookie.trim()) return "cookie";
  return "anonymous";
}

function orderOldestFirst(reviews: Review[]): Review[] {
  return [...reviews].sort((a, b) => {
    if (a.date && b.date) return a.date.localeCompare(b.date);
    if (a.date) return -1;
    if (b.date) return 1;
    return 0;
  });
}

export async function extractReviews(opts: ExtractOptions): Promise<ExtractionResult> {
  const emit = (e: ProgressEvent) => opts.onProgress?.(e);
  const domain = domainFor(opts.marketplace);
  const strategy = chooseStrategy(opts);
  const notes: string[] = [];
  let reviews: Review[] = [];
  let totalRatings: number | null = null;
  let totalReviews: number | null = null;
  let blocked = false;
  let facetsQueried = 0;
  let pagesFetched = 0;

  emit({ type: "info", message: `ASIN ${opts.asin} · ${domain} · strategy=${strategy}` });

  try {
    if (strategy === "rainforest") {
      const r = await extractRainforest({
        asin: opts.asin,
        domain,
        apiKey: opts.apiKey!,
        maxPagesPerFacet: opts.maxPagesPerFacet,
        signal: opts.signal,
        onProgress: emit,
      });
      reviews = r.reviews;
      totalReviews = r.totalReviews;
      blocked = r.blocked;
      facetsQueried = r.facetsQueried;
      pagesFetched = r.pagesFetched;
      notes.push("Rainforest API (managed proxy). Coverage still bounded by Amazon's per-facet cap.");
    } else if (strategy === "apify") {
      const r = await extractApify({
        asin: opts.asin,
        domain,
        apiKey: opts.apiKey!,
        signal: opts.signal,
        onProgress: emit,
      });
      reviews = r.reviews;
      blocked = r.blocked;
      pagesFetched = r.pagesFetched;
      notes.push("Apify actor (managed proxy + scaling).");
    } else if (strategy === "cookie") {
      const r = await extractWithCookie({
        asin: opts.asin,
        domain,
        cookie: opts.cookie!,
        starFilters: opts.starFilters,
        sorts: opts.sorts,
        reviewerTypes: opts.reviewerTypes,
        maxPagesPerFacet: opts.maxPagesPerFacet,
        delayMs: opts.delayMs,
        signal: opts.signal,
        onProgress: emit,
      });
      reviews = r.reviews;
      totalRatings = r.totalRatings;
      totalReviews = r.totalReviews;
      facetsQueried = r.facetsQueried;
      pagesFetched = r.pagesFetched;
      // Treat a login wall as a blocked state so the UI flags it clearly.
      blocked = r.blocked || (r.loginWall && r.reviews.length === 0);
      if (r.loginWall) {
        notes.push(
          "Session cookie was missing or expired — Amazon redirected to sign-in. Log into amazon.com in your browser, copy the full Cookie request header, and paste it into Settings."
        );
      }
      notes.push("Faceted scrape across star × sort × reviewerType. Each facet caps at ~100 (10 pages).");
    } else {
      const r = await extractAnonymous({ asin: opts.asin, domain, signal: opts.signal, onProgress: emit });
      reviews = r.reviews;
      totalRatings = r.totalRatings;
      totalReviews = r.totalReviews;
      blocked = r.blocked;
      pagesFetched = 1;
      if (r.loginWall) {
        notes.push("Amazon's /product-reviews/ pages require login; only the public PDP medley is reachable anonymously.");
      }
      notes.push("Anonymous mode returns only the reviews shown on the product page (~8). Use cookie or API mode for deep extraction.");
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      notes.push("Cancelled by user.");
    } else {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        coverage: {
          asin: opts.asin, marketplace: domain, totalRatings, totalReviews,
          collected: reviews.length, complete: false, notes, strategy,
          facetsQueried, pagesFetched, blocked,
        },
        reviews: orderOldestFirst(reviews),
      };
    }
  }

  const ordered = orderOldestFirst(reviews);

  // Completeness: we only claim "complete" when we captured at least as many
  // reviews as Amazon says have text, and weren't blocked. For high-volume
  // listings this will (honestly) be false.
  const textTarget = totalReviews ?? null;
  const complete =
    !blocked &&
    textTarget != null &&
    ordered.length >= textTarget &&
    strategy !== "anonymous";

  if (textTarget != null && !complete && strategy !== "anonymous") {
    notes.push(
      `Captured ${ordered.length} of ~${textTarget} text reviews Amazon reports. The remainder are not retrievable — Amazon caps the reviews endpoint at 100 per filter combination.`
    );
  }

  const coverage: CoverageReport = {
    asin: opts.asin,
    marketplace: domain,
    totalRatings,
    totalReviews,
    collected: ordered.length,
    complete,
    notes,
    strategy,
    facetsQueried,
    pagesFetched,
    blocked,
  };

  emit({ type: "done", message: `Done: ${ordered.length} unique reviews.`, collected: ordered.length });
  return { ok: true, coverage, reviews: ordered };
}
