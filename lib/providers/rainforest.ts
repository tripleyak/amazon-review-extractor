// Rainforest API provider: managed scraping with rotating proxies + CAPTCHA
// solving. Most reliable path for hands-off, at-scale extraction. Still subject
// to Amazon's per-facet cap, so we union across star filters too.
// Docs: https://docs.trajectdata.com/rainforestapi/product-data-api/parameters/reviews

import type { ProgressEvent, Review } from "../types";

const STAR_PARAMS = ["all_stars", "five_star", "four_star", "three_star", "two_star", "one_star"];

// Shape of one review object in Rainforest's response. Everything is optional:
// the payload is external and versioned by Traject, so the mapper stays defensive.
interface RainforestRawReview {
  id?: string;
  review_id?: string;
  title?: string;
  body?: string;
  body_html?: string;
  rating?: number | string;
  profile?: { name?: string };
  author?: string;
  date?: { utc?: string; raw?: string };
  country?: string;
  verified_purchase?: boolean;
  helpful_votes?: number | string;
  attributes?: { name?: string; value?: string }[];
  link?: string;
}

interface RainforestResponse {
  summary?: { total_reviews?: number };
  reviews?: RainforestRawReview[];
  pagination?: { total_pages?: number };
}

function mapRainforestReview(
  r: RainforestRawReview,
  asin: string,
  domain: string,
  foundVia: string
): Review | null {
  const id: string = r.id || r.review_id || "";
  if (!id) return null;
  const dateUtc: string | undefined = r.date?.utc;
  return {
    id,
    asin,
    title: (r.title || "").trim(),
    body: (r.body || r.body_html || "").replace(/<[^>]+>/g, "").trim(),
    rating: typeof r.rating === "number" ? r.rating : r.rating ? Number(r.rating) : null,
    author: (r.profile?.name || r.author || "").trim(),
    date: dateUtc ? dateUtc.slice(0, 10) : null,
    rawDate: r.date?.raw || null,
    country: r.country || null,
    verifiedPurchase: !!r.verified_purchase,
    helpfulVotes: Number(r.helpful_votes || 0) || 0,
    variant: r.attributes ? r.attributes.map((a) => `${a.name}: ${a.value}`).join(", ") : null,
    url: r.link || (id ? `https://${domain}/gp/customer-reviews/${id}` : null),
    foundVia,
  };
}

export async function extractRainforest(args: {
  asin: string;
  domain: string;
  apiKey: string;
  maxPagesPerFacet?: number;
  signal?: AbortSignal;
  onProgress?: (e: ProgressEvent) => void;
}): Promise<{
  reviews: Review[];
  totalReviews: number | null;
  blocked: boolean;
  facetsQueried: number;
  pagesFetched: number;
}> {
  const { asin, domain, apiKey, signal, onProgress, maxPagesPerFacet = 10 } = args;
  const amazonDomain = domain.replace(/^www\./, "");
  const collected = new Map<string, Review>();
  let totalReviews: number | null = null;
  let facetsQueried = 0;
  let pagesFetched = 0;

  for (const stars of STAR_PARAMS) {
    facetsQueried++;
    for (let page = 1; page <= maxPagesPerFacet; page++) {
      if (signal?.aborted) break;
      const params = new URLSearchParams({
        api_key: apiKey,
        type: "reviews",
        amazon_domain: amazonDomain,
        asin,
        review_stars: stars,
        sort_by: "most_recent",
        page: String(page),
      });
      const res = await fetch(`https://api.rainforestapi.com/request?${params}`, { signal });
      pagesFetched++;
      if (!res.ok) {
        const txt = await res.text();
        onProgress?.({ type: "warn", message: `Rainforest ${stars} p${page}: HTTP ${res.status} ${txt.slice(0, 120)}` });
        if (res.status === 401 || res.status === 403) {
          return { reviews: [...collected.values()], totalReviews, blocked: true, facetsQueried, pagesFetched };
        }
        break;
      }
      const json = (await res.json()) as RainforestResponse;
      if (totalReviews == null && json.summary?.total_reviews) totalReviews = json.summary.total_reviews;
      const arr = json.reviews || [];
      let newOnPage = 0;
      for (const raw of arr) {
        const rev = mapRainforestReview(raw, asin, domain, `${stars}/most_recent`);
        if (rev && !collected.has(rev.id)) {
          collected.set(rev.id, rev);
          newOnPage++;
        }
      }
      onProgress?.({
        type: "page",
        message: `Rainforest ${stars} p${page}: +${newOnPage} new`,
        collected: collected.size,
      });
      const totalPages = json.pagination?.total_pages;
      if (arr.length === 0 || (totalPages && page >= totalPages)) break;
    }
  }

  return { reviews: [...collected.values()], totalReviews, blocked: false, facetsQueried, pagesFetched };
}
