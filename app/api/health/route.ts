import { NextResponse } from "next/server";

export const runtime = "nodejs";

export function GET() {
  return NextResponse.json({ ok: true, service: "amazon-review-extractor", time: new Date().toISOString() });
}
