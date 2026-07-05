# Product Personas

> Consumed by branch QA (`ce-dogfood` walks every flow as each persona and records paper cuts).

## 1. Amazon seller doing competitor review research (primary)

A seller or brand operator extracting competitor listing reviews to mine complaints, feature requests,
and positioning angles. Time-boxed sessions; wants data out and into a spreadsheet fast.

Cares about:
- **Extraction completeness honesty.** Amazon caps ~100 reviews per facet behind the login wall — the tool
  must say what it got vs. what exists, never imply a complete pull when it's capped.
- **Export correctness.** CSV that opens clean in Excel/Sheets: no mangled quotes, star ratings and dates
  parse as data, one row per review.
- **Clear failure modes.** When Amazon's DOM shifts or a login wall blocks, the message says what happened
  and what to try (different facet, login, retry) — not a spinner or an empty table.
- Zero re-work: re-running the same ASIN shouldn't require re-entering everything.

Paper cuts for this persona: unlabeled progress states during long extractions; results that render but
export differently; facet controls whose effect on the 100-cap isn't explained.
