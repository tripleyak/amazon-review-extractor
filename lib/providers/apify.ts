// Apify provider: runs a hosted Amazon-reviews actor and reads its dataset.
// Default actor: junglee/amazon-reviews-scraper (override via APIFY_ACTOR).
// Apify manages proxies + scaling; good for large bulk jobs.
// Docs: https://docs.apify.com/api/v2#/reference/actors/run-actor-synchronously

import type { ProgressEvent, Review } from "../types";

function mapApifyReview(r: any, asin: string, domain: string): Review | null {
  const id: string =
    r.reviewId || r.id || r.review_id || r.reviewUrl?.match(/customer-reviews\/([A-Z0-9]{10,})/i)?.[1] || "";
  if (!id) return null;
  const dateStr: string | undefined = r.date || r.reviewedAt || r.reviewDate;
  let iso: string | null = null;
  if (dateStr) {
    const d = new Date(dateStr);
    iso = isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  return {
    id,
    asin: r.asin || asin,
    title: (r.reviewTitle || r.title || "").trim(),
    body: (r.reviewDescription || r.text || r.body || "").trim(),
    rating: r.ratingScore ? Number(r.ratingScore) : r.rating ? Number(r.rating) : null,
    author: (r.userName || r.author || r.reviewedBy || "").trim(),
    date: iso,
    rawDate: dateStr || null,
    country: r.country || null,
    verifiedPurchase: !!(r.isVerified ?? r.verified ?? r.verifiedPurchase),
    helpfulVotes: Number(r.reviewReaction?.match(/\d+/)?.[0] || r.helpfulCount || 0) || 0,
    variant: r.variant || r.variationAttributes || null,
    url: r.reviewUrl || (id ? `https://${domain}/gp/customer-reviews/${id}` : null),
    foundVia: "apify",
  };
}

export async function extractApify(args: {
  asin: string;
  domain: string;
  apiKey: string;
  actor?: string;
  maxReviews?: number;
  signal?: AbortSignal;
  onProgress?: (e: ProgressEvent) => void;
}): Promise<{ reviews: Review[]; blocked: boolean; pagesFetched: number }> {
  const { asin, domain, apiKey, signal, onProgress } = args;
  const actor = (args.actor || process.env.APIFY_ACTOR || "junglee~amazon-reviews-scraper").replace("/", "~");
  const amazonDomain = domain.replace(/^www\./, "");

  onProgress?.({ type: "info", message: `Starting Apify actor ${actor} for ${asin}…` });
  const input = {
    productUrls: [{ url: `https://${domain}/dp/${asin}` }],
    asins: [asin],
    domainCode: amazonDomain,
    maxReviews: args.maxReviews ?? 1000,
    sort: "recent",
    filterByRatings: ["allStars"],
    scrapeProductDetails: false,
  };

  const runUrl = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${encodeURIComponent(
    apiKey
  )}&clean=true`;
  const res = await fetch(runUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal,
  });
  if (!res.ok) {
    const txt = await res.text();
    onProgress?.({ type: "error", message: `Apify HTTP ${res.status}: ${txt.slice(0, 160)}` });
    return { reviews: [], blocked: res.status === 401 || res.status === 403, pagesFetched: 1 };
  }
  const items: any[] = await res.json();
  const collected = new Map<string, Review>();
  for (const raw of items) {
    const rev = mapApifyReview(raw, asin, domain);
    if (rev && !collected.has(rev.id)) collected.set(rev.id, rev);
  }
  onProgress?.({
    type: "info",
    message: `Apify returned ${items.length} items, ${collected.size} unique reviews.`,
    collected: collected.size,
  });
  return { reviews: [...collected.values()], blocked: false, pagesFetched: 1 };
}
