// Parse an ASIN + marketplace out of arbitrary user input: a bare ASIN,
// a /dp/ URL, a /product-reviews/ URL, a /gp/product/ URL, shortened a.co links, etc.

import { marketplaceKeyFromHost } from "./marketplaces";

const ASIN_RE = /\b(B0[A-Z0-9]{8}|[0-9]{9}[0-9X])\b/; // B0... (10) or ISBN-10

export interface ParsedAsin {
  asin: string;
  marketplace: string;
}

export function parseAsin(input: string): ParsedAsin | null {
  if (!input) return null;
  const raw = input.trim();

  // Bare ASIN.
  if (/^[A-Z0-9]{10}$/i.test(raw)) {
    return { asin: raw.toUpperCase(), marketplace: "com" };
  }

  let marketplace = "com";
  let working = raw;

  // If it looks like a URL, pull host (for marketplace) and decode it.
  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    if (/amazon\./i.test(url.host)) {
      marketplace = marketplaceKeyFromHost(url.host);
    }
    working = decodeURIComponent(url.pathname + url.search);
  } catch {
    working = raw;
  }

  // Common path patterns first (most reliable).
  const patterns = [
    /\/dp\/([A-Z0-9]{10})/i,
    /\/gp\/product\/([A-Z0-9]{10})/i,
    /\/product-reviews\/([A-Z0-9]{10})/i,
    /\/gp\/aw\/d\/([A-Z0-9]{10})/i,
    /\/product\/([A-Z0-9]{10})/i,
    /[?&]asin=([A-Z0-9]{10})/i,
  ];
  for (const re of patterns) {
    const m = working.match(re);
    if (m) return { asin: m[1].toUpperCase(), marketplace };
  }

  // Fallback: any ASIN-shaped token anywhere in the string.
  const generic = raw.match(ASIN_RE);
  if (generic) return { asin: generic[1].toUpperCase(), marketplace };

  return null;
}

/** Extract a de-duplicated, ordered list of ASINs from a column of cells. */
export function parseAsinList(values: string[]): ParsedAsin[] {
  const seen = new Set<string>();
  const out: ParsedAsin[] = [];
  for (const v of values) {
    const parsed = parseAsin(String(v ?? ""));
    if (parsed && !seen.has(parsed.asin)) {
      seen.add(parsed.asin);
      out.push(parsed);
    }
  }
  return out;
}
