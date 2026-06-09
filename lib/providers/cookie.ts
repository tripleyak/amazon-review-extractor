// Cookie provider: the real workhorse for free, deep extraction.
// Amazon's /product-reviews/ pages now require a logged-in session. The user
// pastes their browser's amazon.<tld> Cookie header; we then walk every facet
// combination (star x sort x reviewerType), paging until the per-facet cap,
// and union the results. Dedup happens in the orchestrator.

import { fetchHtml, sleep } from "../http";
import { parseListingMeta, parseReviews } from "../parse";
import { reviewPageUrl, ALL_STAR_FILTERS } from "../urls";
import type {
  ProgressEvent,
  ReviewerType,
  Review,
  SortBy,
  StarFilter,
} from "../types";

export interface CookieResult {
  reviews: Review[];
  totalRatings: number | null;
  totalReviews: number | null;
  blocked: boolean;
  loginWall: boolean;
  facetsQueried: number;
  pagesFetched: number;
}

export async function extractWithCookie(args: {
  asin: string;
  domain: string;
  cookie: string;
  starFilters?: StarFilter[];
  sorts?: SortBy[];
  reviewerTypes?: ReviewerType[];
  maxPagesPerFacet?: number;
  delayMs?: number;
  signal?: AbortSignal;
  onProgress?: (e: ProgressEvent) => void;
}): Promise<CookieResult> {
  const {
    asin,
    domain,
    cookie,
    signal,
    onProgress,
    delayMs = 900,
    maxPagesPerFacet = 10, // Amazon hard cap
  } = args;

  const starFilters = args.starFilters?.length ? args.starFilters : ALL_STAR_FILTERS;
  const sorts = args.sorts?.length ? args.sorts : ["recent" as SortBy];
  const reviewerTypes = args.reviewerTypes?.length
    ? args.reviewerTypes
    : ["all_reviews" as ReviewerType];

  const collected = new Map<string, Review>();
  let totalRatings: number | null = null;
  let totalReviews: number | null = null;
  let blocked = false;
  let loginWall = false;
  let facetsQueried = 0;
  let pagesFetched = 0;

  outer: for (const reviewerType of reviewerTypes) {
    for (const filterByStar of starFilters) {
      for (const sortBy of sorts) {
        facetsQueried++;
        const facetLabel = `${filterByStar}/${sortBy}/${reviewerType}`;
        onProgress?.({ type: "facet", message: `Facet ${facetLabel}…` });
        let prevSize = collected.size;
        let referer: string | undefined;

        for (let page = 1; page <= maxPagesPerFacet; page++) {
          if (signal?.aborted) break outer;
          const url = reviewPageUrl({
            domain,
            asin,
            pageNumber: page,
            sortBy,
            filterByStar,
            reviewerType,
          });

          const res = await fetchHtml(url, { cookie, referer, signal, attempt: page });
          referer = url;
          pagesFetched++;

          const meta = parseListingMeta(res.html);
          if (res.redirectedToLogin || meta.loginWall) {
            loginWall = true;
            onProgress?.({
              type: "error",
              message:
                "Amazon redirected to its sign-in page — the session cookie is missing or expired. Log into amazon.com in your browser, re-copy the full Cookie header, and try again.",
            });
            break outer;
          }

          if (meta.blocked) {
            blocked = true;
            onProgress?.({ type: "warn", message: `CAPTCHA on ${facetLabel} p${page}; backing off.` });
            await sleep(delayMs * 3, signal);
            break; // move to next facet
          }
          if (totalRatings == null && meta.totalRatings != null) totalRatings = meta.totalRatings;
          if (totalReviews == null && meta.totalReviews != null) totalReviews = meta.totalReviews;

          const pageReviews = parseReviews(res.html, {
            asin,
            domain,
            foundVia: facetLabel,
          });

          let newOnPage = 0;
          for (const r of pageReviews) {
            if (!collected.has(r.id)) {
              collected.set(r.id, r);
              newOnPage++;
            }
          }

          onProgress?.({
            type: "page",
            message: `${facetLabel} p${page}: +${newOnPage} new (${pageReviews.length} on page)`,
            collected: collected.size,
          });

          // Stop this facet when the page is empty (ran out) — the cap or the
          // real end. A short page also means the end of this facet.
          if (pageReviews.length === 0) break;
          await sleep(delayMs, signal);
        }

        // If an entire facet added nothing new and we already have data,
        // it's likely fully covered by another facet — keep going regardless,
        // facets are cheap relative to completeness.
        void prevSize;
      }
    }
  }

  return {
    reviews: [...collected.values()],
    totalRatings,
    totalReviews,
    blocked,
    loginWall,
    facetsQueried,
    pagesFetched,
  };
}
