"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { MARKETPLACES } from "@/lib/marketplaces";
import {
  download,
  reviewsToCsv,
  stars,
  streamExtract,
} from "@/lib/clientUtils";
import type { ExtractionResult, ProgressEvent, Review } from "@/lib/types";

type Strategy = "auto" | "anonymous" | "cookie" | "rainforest" | "apify";

interface Settings {
  marketplace: string;
  strategy: Strategy;
  cookie: string;
  apiKey: string;
  maxPagesPerFacet: number;
}

const DEFAULT_SETTINGS: Settings = {
  marketplace: "com",
  // Default to cookie (deep) mode: the hosted site runs on Vercel datacenter
  // IPs that Amazon blocks for anonymous scraping, so lead with the method that
  // actually works in production. Users paste their Amazon session cookie.
  strategy: "cookie",
  cookie: "",
  apiKey: "",
  maxPagesPerFacet: 10,
};

export default function Page() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [tab, setTab] = useState<"single" | "bulk">("single");
  const [showSettings, setShowSettings] = useState(true);

  return (
    <div className="wrap">
      <div className="header">
        <h1>
          <span className="accent">Amazon</span> Review Extractor
        </h1>
        <p>
          Pull the deepest recoverable set of customer reviews for any ASIN, ordered oldest → newest.
          Amazon caps its reviews endpoint at ~100 results <em>per filter</em>, so this tool unions across
          every star × sort × verified facet to maximize coverage, dedupes, and reports exactly how much of
          the listing it could reach.
        </p>
      </div>

      <SettingsPanel
        settings={settings}
        onChange={setSettings}
        open={showSettings}
        toggle={() => setShowSettings((s) => !s)}
      />

      <div className="tabs">
        <div className={`tab ${tab === "single" ? "active" : ""}`} onClick={() => setTab("single")}>
          Single ASIN
        </div>
        <div className={`tab ${tab === "bulk" ? "active" : ""}`} onClick={() => setTab("bulk")}>
          Bulk (CSV / Excel)
        </div>
      </div>

      {tab === "single" ? <SingleTab settings={settings} /> : <BulkTab settings={settings} />}

      <p className="hint" style={{ marginTop: 28 }}>
        For research / voice-of-customer use. Respect Amazon&apos;s Conditions of Use and applicable law.
        Deep extraction requires either your own logged-in session cookie or a managed scraping API key.
      </p>
    </div>
  );
}

function SettingsPanel({
  settings,
  onChange,
  open,
  toggle,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
  open: boolean;
  toggle: () => void;
}) {
  const set = (patch: Partial<Settings>) => onChange({ ...settings, ...patch });
  return (
    <div className="panel">
      <h2 style={{ display: "flex", justifyContent: "space-between", cursor: "pointer" }} onClick={toggle}>
        <span>Extraction method &amp; settings</span>
        <span className="muted">{open ? "▾" : "▸"}</span>
      </h2>
      {open && (
        <>
          <div className="row">
            <div className="field">
              <label>Marketplace</label>
              <select value={settings.marketplace} onChange={(e) => set({ marketplace: e.target.value })}>
                {Object.entries(MARKETPLACES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Strategy</label>
              <select value={settings.strategy} onChange={(e) => set({ strategy: e.target.value as Strategy })}>
                <option value="auto">Auto (use what you provide)</option>
                <option value="anonymous">Anonymous PDP (no setup, ~8 reviews)</option>
                <option value="cookie">Session cookie (free, deep)</option>
                <option value="rainforest">Rainforest API (managed)</option>
                <option value="apify">Apify actor (managed)</option>
              </select>
            </div>
            <div className="field">
              <label>Max pages / facet</label>
              <select
                value={settings.maxPagesPerFacet}
                onChange={(e) => set({ maxPagesPerFacet: Number(e.target.value) })}
              >
                {[1, 2, 5, 10].map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 10 ? "(Amazon max)" : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {(settings.strategy === "cookie" || settings.strategy === "auto") && (
            <div className="field" style={{ marginTop: 12 }}>
              <label>
                Amazon session cookie{" "}
                <span className="muted">
                  — DevTools → Network → any amazon.com request → copy the entire <code>Cookie:</code> request header
                </span>
              </label>
              <textarea
                placeholder="session-id=...; ubid-main=...; at-main=...; sess-at-main=...; x-main=..."
                value={settings.cookie}
                onChange={(e) => set({ cookie: e.target.value })}
              />
              <span className="hint">
                Required because Amazon&apos;s /product-reviews/ pages now redirect anonymous visitors to login.
                Stays in your browser → server memory only; never stored.
              </span>
            </div>
          )}

          {(settings.strategy === "rainforest" || settings.strategy === "apify" || settings.strategy === "auto") && (
            <div className="field" style={{ marginTop: 12 }}>
              <label>
                {settings.strategy === "apify" ? "Apify API token" : "Rainforest API key"}{" "}
                <span className="muted">(managed proxy + CAPTCHA solving; pick the matching strategy above)</span>
              </label>
              <input
                type="password"
                placeholder="API key…"
                value={settings.apiKey}
                onChange={(e) => set({ apiKey: e.target.value })}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function useExtractor(settings: Settings) {
  return useCallback(
    (input: string, onProgress: (e: ProgressEvent) => void, signal?: AbortSignal) =>
      streamExtract(
        {
          input,
          marketplace: settings.marketplace,
          strategy: settings.strategy,
          cookie: settings.cookie || undefined,
          apiKey: settings.apiKey || undefined,
          maxPagesPerFacet: settings.maxPagesPerFacet,
        },
        onProgress,
        signal
      ),
    [settings]
  );
}

function SingleTab({ settings }: { settings: Settings }) {
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<ProgressEvent[]>([]);
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const extract = useExtractor(settings);

  const run = async () => {
    if (!input.trim() || running) return;
    setRunning(true);
    setLogs([]);
    setResult(null);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await extract(input.trim(), (e) => setLogs((l) => [...l, e]), ac.signal);
      setResult(res);
    } catch (err: any) {
      setResult({ ok: false, error: err?.message || String(err) } as ExtractionResult);
    } finally {
      setRunning(false);
    }
  };

  const cancel = () => abortRef.current?.abort();

  return (
    <div className="panel">
      <div className="row">
        <div className="field grow">
          <label>ASIN or Amazon product URL</label>
          <input
            type="text"
            placeholder="B07ZPKN6YR  or  https://www.amazon.com/dp/B07ZPKN6YR"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run()}
          />
        </div>
        <button onClick={run} disabled={running || !input.trim()}>
          {running ? "Extracting…" : "Extract reviews"}
        </button>
        {running && (
          <button className="secondary" onClick={cancel}>
            Cancel
          </button>
        )}
      </div>

      {logs.length > 0 && <LogView logs={logs} />}
      {result && <ResultView result={result} />}
    </div>
  );
}

function LogView({ logs }: { logs: ProgressEvent[] }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div className="log" ref={ref} style={{ marginTop: 14 }}>
      {logs.map((l, i) => (
        <div key={i} className={`l-${l.type}`}>
          {l.type === "facet" ? "▸ " : l.type === "page" ? "  " : ""}
          {l.message}
          {typeof l.collected === "number" ? `  [${l.collected}]` : ""}
        </div>
      ))}
    </div>
  );
}

function ResultView({ result }: { result: ExtractionResult }) {
  if (!result.ok) {
    return (
      <div className="notes" style={{ borderLeftColor: "var(--bad)", marginTop: 16 }}>
        <strong style={{ color: "var(--bad)" }}>Extraction failed.</strong> {result.error}
      </div>
    );
  }
  const { coverage, reviews } = result;
  const badge = coverage.blocked
    ? { cls: "blocked", label: "Blocked" }
    : coverage.complete
    ? { cls: "complete", label: "Complete capture" }
    : { cls: "partial", label: "Partial (Amazon cap)" };

  const exportName = `${coverage.asin}_reviews`;

  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span className={`badge ${badge.cls}`}>{badge.label}</span>
        <span className="muted small">
          {coverage.asin} · {coverage.marketplace} · {coverage.strategy} · {coverage.facetsQueried} facets ·{" "}
          {coverage.pagesFetched} requests
        </span>
      </div>

      <div className="stats">
        <div className="stat">
          <span className="v">{reviews.length.toLocaleString()}</span>
          <span className="k">reviews captured</span>
        </div>
        <div className="stat">
          <span className="v">{coverage.totalReviews?.toLocaleString() ?? "—"}</span>
          <span className="k">text reviews on listing</span>
        </div>
        <div className="stat">
          <span className="v">{coverage.totalRatings?.toLocaleString() ?? "—"}</span>
          <span className="k">total ratings</span>
        </div>
        <div className="stat">
          <span className="v">{reviews[0]?.date ?? "—"}</span>
          <span className="k">oldest captured</span>
        </div>
      </div>

      {coverage.notes.length > 0 && (
        <div className="notes">
          <strong>How to read this:</strong>
          <ul>
            {coverage.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}

      {reviews.length > 0 && (
        <>
          <div className="row" style={{ marginTop: 14 }}>
            <button className="ghost" onClick={() => download(`${exportName}.csv`, reviewsToCsv(reviews), "text/csv")}>
              ↓ CSV
            </button>
            <button
              className="ghost"
              onClick={() => download(`${exportName}.json`, JSON.stringify(result, null, 2), "application/json")}
            >
              ↓ JSON
            </button>
          </div>
          <ReviewsTable reviews={reviews} />
        </>
      )}
    </div>
  );
}

function ReviewsTable({ reviews }: { reviews: Review[] }) {
  const [limit, setLimit] = useState(50);
  const shown = reviews.slice(0, limit);
  return (
    <>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Rating</th>
              <th>Title</th>
              <th>Review</th>
              <th>Author</th>
              <th>✓</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <td className="muted small" style={{ whiteSpace: "nowrap" }}>{r.date ?? r.rawDate ?? "—"}</td>
                <td className="stars">{stars(r.rating)}</td>
                <td style={{ maxWidth: 180 }}>
                  {r.url ? (
                    <a href={r.url} target="_blank" rel="noreferrer">
                      {r.title || "(no title)"}
                    </a>
                  ) : (
                    r.title || "(no title)"
                  )}
                </td>
                <td style={{ maxWidth: 380 }} className="small">
                  {r.body.length > 280 ? r.body.slice(0, 280) + "…" : r.body}
                </td>
                <td className="muted small" style={{ whiteSpace: "nowrap" }}>{r.author || "—"}</td>
                <td>{r.verifiedPurchase ? "✓" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {limit < reviews.length && (
        <button className="secondary" style={{ marginTop: 10 }} onClick={() => setLimit((l) => l + 100)}>
          Show more ({reviews.length - limit} hidden)
        </button>
      )}
    </>
  );
}

// ----------------------------- BULK ------------------------------------

interface BulkItem {
  asin: string;
  marketplace: string;
  status: "queued" | "running" | "done" | "error";
  collected: number;
  total: number | null;
  result?: ExtractionResult;
  error?: string;
}

function BulkTab({ settings }: { settings: Settings }) {
  const [items, setItems] = useState<BulkItem[]>([]);
  const [drag, setDrag] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [running, setRunning] = useState(false);
  const [parseError, setParseError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const extract = useExtractor(settings);
  const abortRef = useRef<AbortController | null>(null);

  const handleFile = async (file: File) => {
    setParsing(true);
    setParseError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/parse-list", { method: "POST", body: fd });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Parse failed");
      setItems(
        json.asins.map((a: { asin: string; marketplace: string }) => ({
          asin: a.asin,
          marketplace: a.marketplace,
          status: "queued" as const,
          collected: 0,
          total: null,
        }))
      );
      if (json.asins.length === 0) setParseError("No ASINs or Amazon URLs found in that file.");
    } catch (err: any) {
      setParseError(err?.message || String(err));
    } finally {
      setParsing(false);
    }
  };

  const runAll = async () => {
    if (running || items.length === 0) return;
    setRunning(true);
    const ac = new AbortController();
    abortRef.current = ac;
    const CONCURRENCY = 2;
    const queue = items.map((_, i) => i);
    setItems((prev) => prev.map((it) => ({ ...it, status: "queued", collected: 0 })));

    const worker = async () => {
      while (queue.length) {
        const idx = queue.shift();
        if (idx == null) break;
        const it = items[idx];
        setItems((prev) => prev.map((p, i) => (i === idx ? { ...p, status: "running" } : p)));
        try {
          const res = await extract(
            it.asin,
            (e) => {
              if (typeof e.collected === "number") {
                setItems((prev) => prev.map((p, i) => (i === idx ? { ...p, collected: e.collected! } : p)));
              }
            },
            ac.signal
          );
          setItems((prev) =>
            prev.map((p, i) =>
              i === idx
                ? {
                    ...p,
                    status: res.ok ? "done" : "error",
                    result: res,
                    collected: res.reviews?.length ?? p.collected,
                    total: res.coverage?.totalReviews ?? null,
                    error: res.ok ? undefined : res.error,
                  }
                : p
            )
          );
        } catch (err: any) {
          setItems((prev) =>
            prev.map((p, i) => (i === idx ? { ...p, status: "error", error: err?.message || String(err) } : p))
          );
        }
      }
    };

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    setRunning(false);
  };

  const cancel = () => abortRef.current?.abort();

  const allReviews = useMemo(
    () => items.flatMap((it) => it.result?.reviews ?? []),
    [items]
  );
  const doneCount = items.filter((i) => i.status === "done").length;

  const exportAll = (fmt: "csv" | "json") => {
    if (fmt === "csv") {
      download("bulk_reviews.csv", reviewsToCsv(allReviews), "text/csv");
    } else {
      const payload = items.map((it) => ({
        asin: it.asin,
        coverage: it.result?.coverage,
        reviews: it.result?.reviews ?? [],
        error: it.error,
      }));
      download("bulk_reviews.json", JSON.stringify(payload, null, 2), "application/json");
    }
  };

  return (
    <div className="panel">
      <div
        className={`dropzone ${drag ? "drag" : ""}`}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files?.[0];
          if (f) handleFile(f);
        }}
      >
        {parsing ? (
          <span>
            <span className="spinner" /> Parsing…
          </span>
        ) : (
          <>
            <div style={{ fontSize: 15, color: "var(--text)" }}>Drop a CSV or Excel file, or click to browse</div>
            <div className="hint">
              Any layout works — every cell is scanned for ASINs and Amazon URLs. Column names don&apos;t matter.
            </div>
          </>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.txt,.xlsx,.xls"
          hidden
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
      </div>

      {parseError && (
        <div className="notes" style={{ borderLeftColor: "var(--bad)" }}>
          {parseError}
        </div>
      )}

      {items.length > 0 && (
        <>
          <div className="row" style={{ marginTop: 16, justifyContent: "space-between" }}>
            <div className="muted small">
              {items.length} unique ASIN{items.length === 1 ? "" : "s"} · {doneCount} done ·{" "}
              {allReviews.length.toLocaleString()} reviews captured
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={runAll} disabled={running}>
                {running ? "Running…" : "Run all"}
              </button>
              {running && (
                <button className="secondary" onClick={cancel}>
                  Cancel
                </button>
              )}
              <button className="ghost" disabled={allReviews.length === 0} onClick={() => exportAll("csv")}>
                ↓ CSV
              </button>
              <button className="ghost" disabled={allReviews.length === 0} onClick={() => exportAll("json")}>
                ↓ JSON
              </button>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div className="bulk-row" style={{ color: "var(--muted)", fontSize: 11, textTransform: "uppercase" }}>
              <div>ASIN</div>
              <div>Status</div>
              <div>Reviews</div>
              <div>Of total</div>
            </div>
            {items.map((it) => (
              <div className="bulk-row" key={it.asin}>
                <div className="asin">{it.asin}</div>
                <div>
                  {it.status === "running" && <span className="spinner" />}{" "}
                  <span
                    className={
                      it.status === "done" ? "l-done" : it.status === "error" ? "l-error" : "muted"
                    }
                    style={{ fontFamily: "var(--mono)", fontSize: 12 }}
                  >
                    {it.status}
                    {it.error ? `: ${it.error.slice(0, 60)}` : ""}
                  </span>
                </div>
                <div>{it.collected.toLocaleString()}</div>
                <div className="muted">{it.total != null ? it.total.toLocaleString() : "—"}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
