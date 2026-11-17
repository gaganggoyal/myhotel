"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonClass, cx } from "./ui";
import { jpegName, shrinkImage } from "./upload";

export type PickerMedia = { id: string; alt: string; thumb: string };

/** Multi-file photo upload to /api/dashboard/media, then refreshes the page's server data. */
export function PhotoUploader({ kind = "photo", label = "Upload photos" }: { kind?: "photo" | "logo"; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="space-y-2">
      <label className={cx(buttonClass("primary"), "cursor-pointer", busy && "pointer-events-none opacity-60")}>
        {busy ? "Uploading…" : label}
        <input
          type="file"
          accept="image/*"
          multiple={kind === "photo"}
          className="sr-only"
          disabled={busy}
          onChange={async (e) => {
            const files = Array.from(e.target.files ?? []);
            if (!files.length) return;
            setBusy(true);
            setMessage(null);
            const fd = new FormData();
            fd.set("kind", kind);
            for (const f of files) fd.append("files", kind === "photo" ? await shrinkImage(f) : f, kind === "photo" ? jpegName(f.name) : f.name);
            try {
              const res = await fetch("/api/dashboard/media", { method: "POST", body: fd });
              const json = (await res.json()) as { ok: boolean; saved?: unknown[]; error?: string };
              const count = json.saved?.length ?? 0;
              setMessage({ ok: json.ok, text: json.error ? `${count ? `${count} uploaded. ` : ""}${json.error}` : `${count} photo${count === 1 ? "" : "s"} uploaded.` });
              router.refresh();
            } catch {
              setMessage({ ok: false, text: "Upload failed. Check your connection and try again." });
            } finally {
              setBusy(false);
              e.target.value = "";
            }
          }}
        />
      </label>
      <p className="text-xs text-slate-500">JPEG, PNG, WebP or HEIC up to 12 MB. Use real photos of your property; we resize and compress them for fast mobile pages.</p>
      {message ? (
        <p role="status" className={cx("text-sm", message.ok ? "text-emerald-700" : "text-red-700")}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}

/** Choose and order photos from the library. Writes a comma-separated id list to a hidden input. */
export function MediaPicker({ name, media, selected, max = 20, label }: { name: string; media: PickerMedia[]; selected: string[]; max?: number; label?: string }) {
  const [ids, setIds] = useState(selected.filter((id) => media.some((m) => m.id === id)));
  const byId = new Map(media.map((m) => [m.id, m]));
  const toggle = (id: string) => setIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= max ? cur : [...cur, id]));
  const move = (i: number, d: -1 | 1) =>
    setIds((cur) => {
      const next = [...cur];
      const j = i + d;
      if (j < 0 || j >= next.length) return cur;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  return (
    <div className="space-y-3">
      <input type="hidden" name={name} value={ids.join(",")} />
      {label ? <p className="text-sm font-medium text-slate-800">{label}</p> : null}
      {ids.length ? (
        <ol className="flex flex-wrap gap-3">
          {ids.map((id, i) => {
            const m = byId.get(id);
            if (!m) return null;
            return (
              <li key={id} className="relative w-28">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.thumb} alt={m.alt} className="h-20 w-28 rounded-lg object-cover ring-2 ring-slate-900" />
                <span className="absolute left-1 top-1 rounded bg-slate-900 px-1.5 text-xs font-bold text-white">{i + 1}</span>
                <div className="mt-1 flex justify-between text-xs">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="rounded px-1.5 hover:bg-slate-100 disabled:opacity-30" aria-label="Move earlier">
                    ←
                  </button>
                  <button type="button" onClick={() => toggle(id)} className="rounded px-1.5 text-red-700 hover:bg-red-50">
                    Remove
                  </button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === ids.length - 1} className="rounded px-1.5 hover:bg-slate-100 disabled:opacity-30" aria-label="Move later">
                    →
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="text-sm text-slate-500">No photos selected.</p>
      )}
      {media.length ? (
        <details className="rounded-lg border border-slate-200 p-3">
          <summary className="cursor-pointer text-sm font-semibold text-slate-700">
            Choose from your photo library ({ids.length}/{max})
          </summary>
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6">
            {media.map((m) => {
              const on = ids.includes(m.id);
              return (
                <button key={m.id} type="button" onClick={() => toggle(m.id)} aria-pressed={on} className={cx("relative overflow-hidden rounded-lg ring-2", on ? "ring-slate-900" : "ring-transparent hover:ring-slate-300")}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.thumb} alt={m.alt} className="h-20 w-full object-cover" />
                  {on ? <span className="absolute right-1 top-1 rounded-full bg-slate-900 px-1.5 text-xs font-bold text-white">✓</span> : null}
                </button>
              );
            })}
          </div>
        </details>
      ) : (
        <p className="text-sm text-slate-500">Upload photos on the Photos page first.</p>
      )}
    </div>
  );
}
