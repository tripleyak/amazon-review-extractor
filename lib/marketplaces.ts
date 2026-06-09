// Amazon marketplace domains. Reviews live on the same domain as the listing.

export const MARKETPLACES: Record<string, { domain: string; label: string }> = {
  com: { domain: "www.amazon.com", label: "United States (.com)" },
  "co.uk": { domain: "www.amazon.co.uk", label: "United Kingdom (.co.uk)" },
  ca: { domain: "www.amazon.ca", label: "Canada (.ca)" },
  de: { domain: "www.amazon.de", label: "Germany (.de)" },
  fr: { domain: "www.amazon.fr", label: "France (.fr)" },
  es: { domain: "www.amazon.es", label: "Spain (.es)" },
  it: { domain: "www.amazon.it", label: "Italy (.it)" },
  "co.jp": { domain: "www.amazon.co.jp", label: "Japan (.co.jp)" },
  "com.au": { domain: "www.amazon.com.au", label: "Australia (.com.au)" },
  "com.mx": { domain: "www.amazon.com.mx", label: "Mexico (.com.mx)" },
  in: { domain: "www.amazon.in", label: "India (.in)" },
  nl: { domain: "www.amazon.nl", label: "Netherlands (.nl)" },
  "com.br": { domain: "www.amazon.com.br", label: "Brazil (.com.br)" },
};

export function domainFor(marketplace?: string): string {
  const key = (marketplace || "com").replace(/^\./, "").toLowerCase();
  return (MARKETPLACES[key] || MARKETPLACES.com).domain;
}

export function marketplaceKeyFromHost(host: string): string {
  // host like www.amazon.co.uk -> "co.uk"
  const m = host.match(/amazon\.([a-z.]+)$/i);
  if (!m) return "com";
  const tld = m[1].toLowerCase();
  return MARKETPLACES[tld] ? tld : "com";
}
