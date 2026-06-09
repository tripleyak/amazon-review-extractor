// Anonymous provider: scrape the reviews "medley" embedded in the public PDP.
// Zero config, always available, but limited to the handful of reviews Amazon
// renders on the product page (typically ~8). Good for a no-setup demo and as a
// last-resort fallback. The /product-reviews/ pages now require a login cookie.

import { fetchHtml } from "../http";
import { parseListingMeta, parseReviews } from "../parse";
import { pdpUrl } from "../urls";
import type { ProgressEvent, Review } from "../types";

export interface AnonymousResult {
  reviews: Review[];
  totalRatings: number | null;
  totalReviews: number | null;
  blocked: boolean;
  loginWall: boolean;
}

export async function extractAnonymous(args: {
  asin: string;
  domain: string;
  signal?: AbortSignal;
  onProgress?: (e: ProgressEvent) => void;
}): Promise<AnonymousResult> {
  const { asin, domain, signal, onProgress } = args;
  const url = pdpUrl(domain, asin);
  onProgress?.({ type: "info", message: `Fetching product page for ${asin}…` });

  const res = await fetchHtml(url, { signal });
  const meta = parseListingMeta(res.html);

  if (meta.blocked) {
    onProgress?.({ type: "warn", message: "Amazon returned a bot/CAPTCHA challenge." });
    return { reviews: [], ...meta };
  }

  const reviews = parseReviews(res.html, {
    asin,
    domain,
    foundVia: "pdp-medley",
  });
  onProgress?.({
    type: "info",
    message: `Captured ${reviews.length} reviews from the product page medley.`,
    collected: reviews.length,
  });

  return {
    reviews,
    totalRatings: meta.totalRatings,
    totalReviews: meta.totalReviews,
    blocked: meta.blocked,
    loginWall: meta.loginWall,
  };
}
