// Parse Amazon review HTML (both the /dp/ "reviews medley" and the
// /product-reviews/ list use the same data-hook DOM) into structured Review[].

import * as cheerio from "cheerio";
import type { Review } from "./types";

const MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  januar: 0, februar: 1, märz: 2, mai: 4, juni: 5, juli: 6,
  oktober: 9, dezember: 11,
};

function toIsoDate(raw: string | null): string | null {
  if (!raw) return null;
  // Try native parse first (handles "January 5, 2020" and "5 January 2020").
  const native = new Date(raw);
  if (!isNaN(native.getTime())) {
    return native.toISOString().slice(0, 10);
  }
  // Manual: find a year, a month word, a day number.
  const lower = raw.toLowerCase();
  const yearM = lower.match(/\b(19|20)\d{2}\b/);
  const dayM = lower.match(/\b(\d{1,2})\b/);
  let month = -1;
  for (const [name, idx] of Object.entries(MONTHS)) {
    if (lower.includes(name)) { month = idx; break; }
  }
  if (yearM && dayM && month >= 0) {
    const d = new Date(Date.UTC(Number(yearM[0]), month, Number(dayM[1])));
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return null;
}

/** "Reviewed in the United States on January 5, 2020" -> {country, datePart} */
function splitReviewDate(text: string): { country: string | null; datePart: string } {
  const t = text.trim();
  // Locale-agnostic-ish: take everything after the last " on " / " le " / " am ".
  const m = t.match(/\bon\s+(.+)$/i) || t.match(/\ble\s+(.+)$/i) || t.match(/\bam\s+(.+)$/i);
  const datePart = m ? m[1].trim() : t;
  const cm = t.match(/in\s+(.+?)\s+on\s+/i) || t.match(/in\s+(.+?)\s+le\s+/i);
  const country = cm ? cm[1].trim() : null;
  return { country, datePart };
}

function ratingFromText(text: string): number | null {
  // "5.0 out of 5 stars" / "5,0 von 5 Sternen"
  const m = text.match(/(\d+[.,]?\d*)\s*(?:out of|von|sur|su|de)\s*5/i);
  if (m) return parseFloat(m[1].replace(",", "."));
  const m2 = text.match(/^\s*(\d+[.,]?\d*)/);
  return m2 ? parseFloat(m2[1].replace(",", ".")) : null;
}

function intFrom(text: string): number {
  const m = text.replace(/[.,](?=\d{3}\b)/g, "").match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
}

export function parseReviews(
  html: string,
  ctx: { asin: string; domain: string; foundVia: string }
): Review[] {
  const $ = cheerio.load(html);
  const out: Review[] = [];

  $('[data-hook="review"]').each((_, el) => {
    const $el = $(el);
    const id = ($el.attr("id") || "").trim();
    if (!id) return;

    // Title: new layout uses data-hook="reviewTitle" (h5); legacy uses
    // "review-title" (anchor with a nested rating span). Strip any rating text.
    const $title = $el
      .find('[data-hook="reviewTitle"], [data-hook="review-title"], [data-hook="review-title-content"]')
      .first();
    let title = "";
    if ($title.length) {
      const clone = $title.clone();
      clone.find(".a-icon-alt").remove();
      title = clone.text().replace(/\s+/g, " ").trim();
    }

    const ratingText =
      $el.find('[data-hook="review-star-rating"] .a-icon-alt').first().text() ||
      $el.find('[data-hook="cmps-review-star-rating"] .a-icon-alt').first().text() ||
      $title.find(".a-icon-alt").first().text();
    const rating = ratingFromText(ratingText || "");

    const author = $el.find(".a-profile-name").first().text().trim();

    const dateText = $el.find('[data-hook="review-date"]').first().text().trim();
    const { country, datePart } = splitReviewDate(dateText);

    // Body: new layout puts text in reviewRichContentContainer; legacy uses
    // review-body. Fall back to reviewText (strip its "brief/full content" teaser).
    let body =
      $el.find('[data-hook="reviewRichContentContainer"]').first().text().trim() ||
      $el.find('[data-hook="review-body"] span').first().text().trim() ||
      $el.find('[data-hook="review-body"]').first().text().trim();
    if (!body) {
      body = $el.find('[data-hook="reviewText"]').first().text().trim();
    }
    body = body
      .replace(/Brief content visible, double tap to read full content\.?/g, "")
      .replace(/Full content visible, double tap to read brief content\.?/g, "")
      .replace(/\s+/g, " ")
      .trim();

    const verifiedPurchase =
      $el.find('[data-hook="avp-badge"]').length > 0 ||
      /verified purchase/i.test($el.find('[data-hook="avp-badge-linkless"]').text());

    const helpfulText = $el.find('[data-hook="helpful-vote-statement"]').first().text();
    const helpfulVotes = /one|a person/i.test(helpfulText) ? 1 : intFrom(helpfulText || "");

    const variant = $el.find('[data-hook="format-strip"]').first().text().trim() || null;

    const href =
      $title.closest("a").attr("href") ||
      $title.attr("href") ||
      $el.find('a[href*="/review/"]').attr("href") ||
      "";
    const idFromHref = href.match(/(?:customer-reviews|review)\/([A-Z0-9]{10,})/i)?.[1];
    const reviewId = id.startsWith("R") ? id : idFromHref || id;
    const url = reviewId
      ? `https://${ctx.domain}/gp/customer-reviews/${reviewId}`
      : null;

    out.push({
      id: reviewId,
      asin: ctx.asin,
      title,
      body,
      rating,
      author,
      date: toIsoDate(datePart),
      rawDate: dateText || null,
      country,
      verifiedPurchase,
      helpfulVotes,
      variant,
      url,
      foundVia: ctx.foundVia,
    });
  });

  return out;
}

/** Pull total ratings / total reviews counts + block signals from any Amazon page. */
export function parseListingMeta(html: string): {
  totalRatings: number | null;
  totalReviews: number | null;
  blocked: boolean;
  loginWall: boolean;
} {
  const $ = cheerio.load(html);
  const blocked =
    /enter the characters you see below|type the characters you see in this image|api-services-support@amazon|to discuss automated access/i.test(
      html
    );
  const loginWall =
    /ap\/signin/i.test($('form[name="signIn"]').attr("action") || "") ||
    $("#ap_email").length > 0 ||
    /amazon sign-?in/i.test($("title").first().text());

  const totalText =
    $('[data-hook="total-review-count"]').first().text() ||
    $('[data-hook="cr-filter-info-review-rating-count"]').first().text() ||
    $("#acrCustomerReviewText").first().text();
  const totalRatings = totalText ? intFrom(totalText) : null;

  // "X total ratings, Y with reviews"
  const withReviewsM = $('[data-hook="cr-filter-info-review-rating-count"]')
    .text()
    .match(/([\d.,]+)\s+with reviews/i);
  const totalReviews = withReviewsM ? intFrom(withReviewsM[1]) : null;

  return { totalRatings, totalReviews, blocked, loginWall };
}
