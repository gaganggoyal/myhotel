"use client";

import { useEffect, useState } from "react";

/**
 * Cookieless first-party analytics: one beacon per page view plus clicks on [data-cta].
 * No cookies or local storage, so hotel sites need no consent banner for analytics.
 */
export function Tracker({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    const send = (payload: Record<string, unknown>) => {
      const body = JSON.stringify(payload);
      if (navigator.sendBeacon) navigator.sendBeacon("/api/site/track", new Blob([body], { type: "application/json" }));
      else fetch("/api/site/track", { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } }).catch(() => undefined);
    };
    const params = new URLSearchParams(window.location.search);
    send({
      type: "page_view",
      path: window.location.pathname,
      referrer: document.referrer,
      utm_source: params.get("utm_source"),
      utm_medium: params.get("utm_medium"),
      utm_campaign: params.get("utm_campaign"),
    });
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-cta]");
      if (el) send({ type: "cta_click", path: window.location.pathname, cta: el.dataset.cta });
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, [enabled]);
  return null;
}

/** Google Maps loads only when the guest asks for it (no third-party cookies by default). */
export function MapEmbed({ query, label, note }: { query: string; label: string; note: string }) {
  const [show, setShow] = useState(false);
  if (!query) return null;
  if (show) {
    return (
      <iframe
        title={`Map: ${query}`}
        src={`https://maps.google.com/maps?q=${encodeURIComponent(query)}&output=embed`}
        className="h-80 w-full rounded-lg border-0"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
    );
  }
  return (
    <div className="flex h-56 flex-col items-center justify-center gap-2 rounded-lg bg-black/[0.04] p-6 text-center">
      <button type="button" onClick={() => setShow(true)} className="rounded-lg bg-[var(--p)] px-4 py-2 text-sm font-semibold text-[var(--on-p)]">
        {label}
      </button>
      <p className="text-xs text-neutral-600">{note}</p>
    </div>
  );
}

export function PayReportForm({
  token,
  labels,
  disabled,
}: {
  token: string;
  labels: { utr: string; utrHint: string; screenshot: string; note: string; report: string; sending: string; sent: string; error: string };
  disabled?: boolean;
}) {
  const [state, setState] = useState<"idle" | "pending" | "done" | "error">("idle");
  const [error, setError] = useState("");
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("pending");
    try {
      const res = await fetch(`/api/site/pay/${token}/report`, { method: "POST", body: new FormData(e.currentTarget) });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (json.ok) {
        setState("done");
        setTimeout(() => window.location.reload(), 1200);
      } else {
        setError(json.error ?? labels.error);
        setState("error");
      }
    } catch {
      setError(labels.error);
      setState("error");
    }
  }
  if (state === "done") return <p role="status" className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-900">{labels.sent}</p>;
  const field = "mt-1 block w-full rounded-lg border border-black/15 bg-white px-3 py-2.5 text-base";
  return (
    <form onSubmit={onSubmit} className="space-y-4" encType="multipart/form-data">
      <div>
        <label htmlFor="utr" className="block text-sm font-medium">
          {labels.utr}
        </label>
        <input id="utr" name="utr" required minLength={6} maxLength={35} inputMode="text" autoComplete="off" className={`${field} font-mono`} />
        <p className="mt-1 text-xs text-neutral-600">{labels.utrHint}</p>
      </div>
      <div>
        <label htmlFor="proof" className="block text-sm font-medium">
          {labels.screenshot}
        </label>
        <input id="proof" name="proof" type="file" accept="image/png,image/jpeg,image/webp" className="mt-1 block w-full text-sm" />
      </div>
      <div>
        <label htmlFor="pnote" className="block text-sm font-medium">
          {labels.note}
        </label>
        <textarea id="pnote" name="note" rows={2} maxLength={500} className={field} />
      </div>
      {state === "error" ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={state === "pending" || disabled} className="rounded-lg bg-[var(--p)] px-5 py-3 font-semibold text-[var(--on-p)] disabled:opacity-60">
        {state === "pending" ? labels.sending : labels.report}
      </button>
    </form>
  );
}
