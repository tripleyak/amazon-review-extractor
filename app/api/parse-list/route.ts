// Accept a CSV/XLSX upload and return the de-duplicated ASIN list found in it.
// Scans every cell so it works regardless of column names or layout.

import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { parseAsinList } from "@/lib/asin";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ ok: false, error: "No file uploaded." }, { status: 400 });
  }

  const name = (file as File).name.toLowerCase();
  const buf = Buffer.from(await (file as File).arrayBuffer());
  const cells: string[] = [];

  try {
    if (name.endsWith(".csv") || name.endsWith(".txt")) {
      const text = buf.toString("utf-8");
      const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
      for (const row of parsed.data) {
        if (Array.isArray(row)) for (const c of row) cells.push(String(c ?? ""));
        else cells.push(String(row ?? ""));
      }
    } else {
      const wb = XLSX.read(buf, { type: "buffer" });
      for (const sheetName of wb.SheetNames) {
        const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[sheetName], { header: 1, blankrows: false });
        for (const row of rows) {
          if (Array.isArray(row)) for (const c of row) cells.push(String(c ?? ""));
        }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: `Could not parse file: ${msg}` }, { status: 400 });
  }

  const asins = parseAsinList(cells);
  return NextResponse.json({ ok: true, count: asins.length, asins, scannedCells: cells.length });
}
