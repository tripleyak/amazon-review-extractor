// Polite HTTP fetch with browser-like headers, optional cookies, retry/backoff.

const USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
];

export interface FetchResult {
  status: number;
  finalUrl: string;
  html: string;
  redirectedToLogin: boolean;
}

export async function fetchHtml(
  url: string,
  opts: { cookie?: string; signal?: AbortSignal; referer?: string; attempt?: number } = {}
): Promise<FetchResult> {
  const attempt = opts.attempt ?? 0;
  const ua = USER_AGENTS[attempt % USER_AGENTS.length];

  const headers: Record<string, string> = {
    "User-Agent": ua,
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": opts.referer ? "same-origin" : "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
    "sec-ch-ua": '"Chromium";v="124", "Not:A-Brand";v="99"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
  };
  if (opts.referer) headers["Referer"] = opts.referer;
  if (opts.cookie) headers["Cookie"] = opts.cookie;

  const res = await fetch(url, {
    headers,
    redirect: "follow",
    signal: opts.signal,
  });
  const html = await res.text();
  const finalUrl = res.url || url;
  // Amazon gates the reviews pages behind login; an anonymous or stale-cookie
  // request lands on /ap/signin or /ax/claim ("Amazon Sign-In").
  const redirectedToLogin = /\/(ap\/signin|ax\/claim)/i.test(finalUrl);

  return { status: res.status, finalUrl, html, redirectedToLogin };
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ms <= 0) return resolve();
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });
}

export function randomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}
