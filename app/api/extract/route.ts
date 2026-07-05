// Streaming extraction endpoint. POST a single ASIN/URL; receive Server-Sent
// Events with live progress, then a final `result` event carrying the reviews
// + coverage report.

import { NextRequest } from "next/server";
import { parseAsin } from "@/lib/asin";
import { extractReviews } from "@/lib/extract";
import type { ProgressEvent } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const input: string = (body.input || "").toString();
  const parsed = parseAsin(input);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      if (!parsed) {
        send("result", {
          ok: false,
          error: `Could not find an ASIN in "${input}". Provide a 10-character ASIN or an Amazon product URL.`,
        });
        controller.close();
        return;
      }

      const marketplace = body.marketplace || parsed.marketplace;
      try {
        const result = await extractReviews({
          asin: parsed.asin,
          marketplace,
          strategy: body.strategy || "auto",
          cookie: body.cookie,
          apiKey: body.apiKey,
          maxPagesPerFacet: body.maxPagesPerFacet,
          starFilters: body.starFilters,
          sorts: body.sorts,
          reviewerTypes: body.reviewerTypes,
          delayMs: body.delayMs,
          signal: req.signal,
          onProgress: (e: ProgressEvent) => send("progress", e),
        });
        send("result", result);
      } catch (err) {
        send("result", { ok: false, error: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
