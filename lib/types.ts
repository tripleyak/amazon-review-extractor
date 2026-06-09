// Shared types for the Amazon review extraction engine.

export type StarFilter =
  | "all_stars"
  | "five_star"
  | "four_star"
  | "three_star"
  | "two_star"
  | "one_star";

export type SortBy = "recent" | "helpful";
export type ReviewerType = "all_reviews" | "avp_only_reviews";

export interface Review {
  /** Amazon review id, e.g. R1ABP8E7Y4BE2C — the dedup key. */
  id: string;
  asin: string;
  title: string;
  body: string;
  rating: number | null;
  author: string;
  /** ISO date (yyyy-mm-dd) when parseable, else the raw date string. */
  date: string | null;
  rawDate: string | null;
  country: string | null;
  verifiedPurchase: boolean;
  helpfulVotes: number;
  variant: string | null;
  url: string | null;
  /** Which facet combination surfaced this review (for diagnostics). */
  foundVia: string;
}

export interface CoverageReport {
  asin: string;
  marketplace: string;
  /** Total ratings shown on the listing (ratings >= text reviews). */
  totalRatings: number | null;
  /** Total text reviews Amazon claims exist, when available. */
  totalReviews: number | null;
  /** Unique reviews actually captured. */
  collected: number;
  /** True when we believe we captured every review Amazon would surface. */
  complete: boolean;
  /** Why extraction stopped / what the ceiling was. */
  notes: string[];
  strategy: string;
  facetsQueried: number;
  pagesFetched: number;
  blocked: boolean;
}

export interface ExtractionResult {
  ok: boolean;
  coverage: CoverageReport;
  reviews: Review[];
  error?: string;
}

export type Strategy = "auto" | "anonymous" | "cookie" | "rainforest" | "apify";

export interface ExtractOptions {
  asin: string;
  marketplace?: string; // domain key, e.g. "com", "co.uk"
  strategy?: Strategy;
  /** Cookie header string from a logged-in Amazon session (cookie strategy). */
  cookie?: string;
  /** Third-party API key (rainforest / apify strategy). */
  apiKey?: string;
  /** Max pages to fetch per facet (Amazon hard-caps near 10). */
  maxPagesPerFacet?: number;
  /** Star facets to union over. Empty/omitted => ["all_stars"]. */
  starFilters?: StarFilter[];
  sorts?: SortBy[];
  reviewerTypes?: ReviewerType[];
  /** ms between requests, to stay polite / avoid throttling. */
  delayMs?: number;
  /** Streaming progress callback. */
  onProgress?: (msg: ProgressEvent) => void;
  /** Abort signal. */
  signal?: AbortSignal;
}

export interface ProgressEvent {
  type: "info" | "page" | "facet" | "warn" | "error" | "done";
  message: string;
  collected?: number;
  data?: unknown;
}
