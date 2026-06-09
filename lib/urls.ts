// Build the canonical Amazon /product-reviews/ URL with faceting params.
// This is the reverse-engineered pattern. The 100-result cap is PER facet
// combination, so unioning across star filters + sort + reviewer type is how
// you maximise unique-review coverage.

import type { ReviewerType, SortBy, StarFilter } from "./types";

export interface ReviewPageParams {
  domain: string;
  asin: string;
  pageNumber: number;
  sortBy: SortBy;
  filterByStar: StarFilter;
  reviewerType: ReviewerType;
  /** "current_format" limits to this ASIN's variation; "all_formats" merges the family. */
  formatType?: "current_format" | "all_formats";
}

export function reviewPageUrl(p: ReviewPageParams): string {
  const params = new URLSearchParams({
    ie: "UTF8",
    reviewerType: p.reviewerType,
    sortBy: p.sortBy,
    pageNumber: String(p.pageNumber),
    formatType: p.formatType || "all_formats",
  });
  if (p.filterByStar && p.filterByStar !== "all_stars") {
    params.set("filterByStar", p.filterByStar);
  }
  return `https://${p.domain}/product-reviews/${p.asin}/ref=cm_cr_arp_d_paging_btm_next_${p.pageNumber}?${params.toString()}`;
}

export function pdpUrl(domain: string, asin: string): string {
  return `https://${domain}/dp/${asin}/?th=1&psc=1`;
}

export const ALL_STAR_FILTERS: StarFilter[] = [
  "five_star",
  "four_star",
  "three_star",
  "two_star",
  "one_star",
];
