// End-to-end engine test, runnable without the web server:
//   npx tsx scripts/test-engine.ts [ASIN ...]
// Exercises ASIN parsing -> HTTP -> HTML parsing -> orchestration in anonymous
// mode (the only mode that works without credentials). Asserts the pipeline
// returns structured reviews and a coherent coverage report.

import { parseAsin } from "../lib/asin";
import { extractReviews } from "../lib/extract";
import type { ProgressEvent } from "../lib/types";

const ASINS = process.argv.slice(2);
if (ASINS.length === 0) ASINS.push("B07ZPKN6YR"); // Echo Dot — high review count

function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error("  ✗ FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("  ✓", msg);
  }
}

// ---- Unit: ASIN parsing across input shapes ----
console.log("\n# ASIN parsing");
const cases: [string, string | null][] = [
  ["B07ZPKN6YR", "B07ZPKN6YR"],
  ["https://www.amazon.com/dp/B07ZPKN6YR", "B07ZPKN6YR"],
  ["https://www.amazon.co.uk/gp/product/B08N5WRWNW/ref=foo", "B08N5WRWNW"],
  ["https://www.amazon.com/product-reviews/B0ABCDE123/?pageNumber=3", "B0ABCDE123"],
  ["https://amazon.com/Some-Product-Name/dp/B0CXYZ4567?th=1", "B0CXYZ4567"],
  ["not an asin at all", null],
];
for (const [input, expected] of cases) {
  const got = parseAsin(input)?.asin ?? null;
  assert(got === expected, `parseAsin(${JSON.stringify(input)}) => ${got}`);
}

// ---- E2E: live anonymous extraction ----
async function main() {
  for (const raw of ASINS) {
    const parsed = parseAsin(raw);
    console.log(`\n# Live anonymous extraction: ${raw} -> ${parsed?.asin}`);
    if (!parsed) {
      assert(false, "could not parse ASIN");
      continue;
    }
    const logs: ProgressEvent[] = [];
    const result = await extractReviews({
      asin: parsed.asin,
      marketplace: parsed.marketplace,
      strategy: "anonymous",
      onProgress: (e) => logs.push(e),
    });

    assert(result.ok, "extraction returned ok");
    assert(result.coverage.asin === parsed.asin, "coverage carries the asin");
    assert(Array.isArray(result.reviews), "reviews is an array");
    console.log(
      `  → captured ${result.reviews.length} reviews; listing reports ${result.coverage.totalRatings ?? "?"} ratings; blocked=${result.coverage.blocked}`
    );

    if (result.reviews.length > 0) {
      assert(result.reviews.every((r) => r.id && r.id.length >= 5), "every review has an id");
      // Ordering: oldest first (non-null dates ascending).
      const dated = result.reviews.filter((r) => r.date);
      const ordered = dated.every((r, i) => i === 0 || dated[i - 1].date! <= r.date!);
      assert(ordered, "reviews ordered oldest -> newest");
      const sample = result.reviews[0];
      console.log("  sample:", {
        date: sample.date,
        rating: sample.rating,
        verified: sample.verifiedPurchase,
        title: sample.title.slice(0, 60),
        author: sample.author,
        bodyLen: sample.body.length,
      });
    } else {
      console.log("  (no reviews parsed — likely a bot/CAPTCHA block from this IP; coverage.blocked should reflect it)");
    }
  }
  console.log(process.exitCode ? "\nRESULT: FAILURES ABOVE\n" : "\nRESULT: all assertions passed\n");
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
