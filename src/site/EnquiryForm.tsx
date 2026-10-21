"use client";

import { useState } from "react";
import { t, type Locale } from "./i18n";

type RoomOption = { id: string; name: string; maxAdults: number; maxChildren: number };

export type EnquiryFormProps = {
  locale: Locale;
  hotelName: string;
  mode: "enquiry" | "request";
  rooms: RoomOption[];
  defaults: { roomId?: string; checkIn?: string; checkOut?: string };
  policySummary: string[];
  privacyHref: string;
  formToken: string;
  minDate: string;
  whatsapp: string | null;
  disabled?: boolean;
  turnstileSiteKey?: string;
};

type Result = { ok: true; ref: string; whatsappUrl: string | null } | { ok: false; error: string };

const input = "mt-1 block w-full rounded-lg border border-black/15 bg-white px-3 py-2.5 text-base text-neutral-900 focus:border-[var(--p)] focus:outline-none focus:ring-2 focus:ring-[var(--p)]/25";
const label = "block text-sm font-medium text-neutral-800";

export function EnquiryForm(props: EnquiryFormProps) {
  const tr = (k: Parameters<typeof t>[1], v?: Record<string, string | number>) => t(props.locale, k, v);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [checkIn, setCheckIn] = useState(props.defaults.checkIn ?? "");
  const isRequest = props.mode === "request";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (props.disabled) return;
    setPending(true);
    setResult(null);
    const fd = new FormData(e.currentTarget);
    const params = new URLSearchParams(window.location.search);
    const body = {
      ...Object.fromEntries(fd.entries()),
      marketingConsent: fd.get("marketingConsent") === "on",
      path: window.location.pathname,
      referrer: document.referrer || "",
      utm: Object.fromEntries(["utm_source", "utm_medium", "utm_campaign"].flatMap((k) => (params.get(k) ? [[k, params.get(k)!]] : []))),
    };
    try {
      const res = await fetch("/api/site/enquiry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = (await res.json()) as Result;
      setResult(json.ok ? json : { ok: false, error: json.error || tr("errorGeneric") });
    } catch {
      setResult({ ok: false, error: tr("errorGeneric") });
    } finally {
      setPending(false);
    }
  }

  if (result?.ok) {
    return (
      <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-950">
        <p className="text-lg font-semibold">{isRequest ? tr("thanksRequest") : tr("thanksEnquiry")}</p>
        <p className="mt-2 text-sm">{tr("thanksNext")}</p>
        <p className="mt-4 text-sm">
          {tr("reference")}: <strong className="font-mono text-base">{result.ref}</strong>
        </p>
        {result.whatsappUrl ? (
          <a href={result.whatsappUrl} target="_blank" rel="noopener noreferrer" data-cta="whatsapp_after_enquiry" className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#1f7a4d] px-4 py-2.5 text-sm font-semibold text-white">
            {tr("continueWhatsapp")}
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate={false}>
      {/* Honeypot: hidden from people and assistive tech, attractive to bots. */}
      <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <input type="hidden" name="t" value={props.formToken} />
      <input type="hidden" name="kind" value={isRequest ? "booking_request" : "enquiry"} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="eq-in" className={label}>
            {tr("checkIn")}
          </label>
          <input id="eq-in" name="checkIn" type="date" min={props.minDate} required={isRequest} defaultValue={props.defaults.checkIn} onChange={(e) => setCheckIn(e.target.value)} className={input} />
        </div>
        <div>
          <label htmlFor="eq-out" className={label}>
            {tr("checkOut")}
          </label>
          <input id="eq-out" name="checkOut" type="date" min={checkIn || props.minDate} required={isRequest} defaultValue={props.defaults.checkOut} className={input} />
        </div>
        <div>
          <label htmlFor="eq-adults" className={label}>
            {tr("adults")}
          </label>
          <input id="eq-adults" name="adults" type="number" inputMode="numeric" min={1} max={20} defaultValue={2} required className={input} />
        </div>
        <div>
          <label htmlFor="eq-children" className={label}>
            {tr("children")}
          </label>
          <input id="eq-children" name="children" type="number" inputMode="numeric" min={0} max={10} defaultValue={0} className={input} />
        </div>
      </div>

      {props.rooms.length ? (
        <div>
          <label htmlFor="eq-room" className={label}>
            {tr("room")}
          </label>
          <select id="eq-room" name="roomId" defaultValue={props.defaults.roomId ?? ""} required={isRequest && props.rooms.length > 1 ? false : undefined} className={input}>
            <option value="">{tr("anyRoom")}</option>
            {props.rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="eq-name" className={label}>
            {tr("yourName")}
          </label>
          <input id="eq-name" name="guestName" autoComplete="name" required minLength={2} maxLength={80} className={input} />
        </div>
        <div>
          <label htmlFor="eq-phone" className={label}>
            {tr("phone")}
          </label>
          <input id="eq-phone" name="guestPhone" type="tel" autoComplete="tel" inputMode="tel" required minLength={8} maxLength={20} className={input} />
        </div>
        <div>
          <label htmlFor="eq-email" className={label}>
            {tr("email")}
          </label>
          <input id="eq-email" name="guestEmail" type="email" autoComplete="email" required maxLength={120} className={input} />
        </div>
      </div>
      <div>
        <label htmlFor="eq-msg" className={label}>
          {tr("message")}
        </label>
        <textarea id="eq-msg" name="message" rows={3} maxLength={2000} className={input} />
      </div>

      {props.policySummary.length ? (
        <ul className="space-y-1 rounded-lg bg-black/[0.03] p-3 text-xs leading-relaxed text-neutral-700">
          {props.policySummary.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      ) : null}

      <label className="flex items-start gap-2 text-sm text-neutral-700">
        <input type="checkbox" name="marketingConsent" className="mt-1 h-4 w-4" />
        <span>{tr("marketingConsent", { hotel: props.hotelName })}</span>
      </label>
      <p className="text-xs text-neutral-600">
        {tr("privacyAgree", { hotel: props.hotelName })}{" "}
        <a href={props.privacyHref} className="underline">
          {tr("privacy")}
        </a>
      </p>

      {result && !result.ok ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {result.error}
        </p>
      ) : null}
      {props.disabled ? <p className="text-sm text-amber-800">{tr("previewDisabled")}</p> : null}

      <button
        type="submit"
        disabled={pending || props.disabled}
        data-cta={isRequest ? "submit_request" : "submit_enquiry"}
        className="w-full rounded-lg bg-[var(--p)] px-5 py-3 text-base font-semibold text-[var(--on-p)] shadow-sm transition hover:opacity-90 disabled:opacity-60 sm:w-auto"
      >
        {pending ? tr("sending") : isRequest ? tr("sendRequest") : tr("sendEnquiry")}
      </button>
      <p className="text-xs text-neutral-600">{isRequest ? tr("requestNote") : tr("enquiryNote")}</p>
    </form>
  );
}
