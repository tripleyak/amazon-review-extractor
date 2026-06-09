// Browser-safe helpers: SSE streaming client + CSV/JSON export. No node deps.

import type { ExtractionResult, ProgressEvent, Review } from "./types";

export interface ExtractRequest {
  input: string;
  marketplace?: string;
  strategy?: string;
  cookie?: string;
  apiKey?: string;
  maxPagesPerFacet?: number;
}

/** POST to /api/extract and stream SSE events. Resolves with the final result. */
export async function streamExtract(
  body: ExtractRequest,
  onProgress: (e: ProgressEvent) => void,
  signal?: AbortSignal
): Promise<ExtractionResult> {
  const res = await fetch("/api/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.body) throw new Error("No response stream");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult: ExtractionResult | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() || "";
    for (const chunk of chunks) {
      const lines = chunk.split("\n");
      let event = "message";
      let data = "";
      for (const line of lines) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (!data) continue;
      const parsed = JSON.parse(data);
      if (event === "progress") onProgress(parsed as ProgressEvent);
      else if (event === "result") finalResult = parsed as ExtractionResult;
    }
  }

  if (!finalResult) throw new Error("Stream ended without a result");
  return finalResult;
}

const CSV_COLS: (keyof Review)[] = [
  "asin", "id", "rating", "title", "body", "author", "date", "country",
  "verifiedPurchase", "helpfulVotes", "variant", "url", "foundVia",
];

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function reviewsToCsv(reviews: Review[]): string {
  const header = CSV_COLS.join(",");
  const rows = reviews.map((r) => CSV_COLS.map((c) => csvEscape(r[c])).join(","));
  return [header, ...rows].join("\r\n");
}

export function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function stars(rating: number | null): string {
  if (rating == null) return "—";
  const full = Math.round(rating);
  return "★".repeat(full) + "☆".repeat(Math.max(0, 5 - full));
}
