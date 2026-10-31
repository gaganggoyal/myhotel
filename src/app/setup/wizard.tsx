"use client";

import Link from "next/link";
import { useRef, useState, useTransition, type ReactNode } from "react";
import { resendVerificationAction } from "@/app/(auth)/actions";
import { CopyButton } from "@/components/forms";
import { buttonClass, cx, Field, Input, Select, Textarea } from "@/components/ui";
import { jpegName, shrinkImage, uploadPhoto } from "@/components/upload";
import { AMENITIES, AMENITY_GROUP_LABELS, BED_TYPES, HIGHLIGHTS, ROOM_FEATURES, ROOM_VIEWS, type AmenityDef, type Highlight } from "@/lib/amenities";
import { PROPERTY_TYPE_LABELS, PROPERTY_TYPES } from "@/lib/content";
import { INDIAN_STATES } from "@/lib/india";
import { CANCELLATION_LABELS, CANCELLATION_PRESETS, type CancellationPreset } from "@/lib/policies";
import type { SetupState, WizardPhoto, WizardRoom } from "@/lib/setup";
import { TEMPLATE_STYLES } from "@/site/theme";
import {
  deleteSetupPhoto,
  finishSetup,
  saveContactStep,
  saveFacilitiesStep,
  saveLookStep,
  savePlaceStep,
  saveRoomsStep,
  setCoverPhoto,
  type FinishResult,
} from "./actions";

// Quick setup: six short steps after sign-up. Each step saves to the draft as the owner
// moves on, so closing the tab loses nothing; the last step writes the text and publishes.

const STEPS = [
  { key: "place", title: "What makes your place special?", hint: "Tap everything that fits. We use it to write your website for you." },
  { key: "photos", title: "Add your photos", hint: "Real photos win far more enquiries than stock images. Add as many as you like." },
  { key: "rooms", title: "Your rooms and prices", hint: "Add each kind of room once, with its usual starting price." },
  { key: "facilities", title: "Facilities and rules", hint: "Tap what you offer. Guests filter on these when choosing where to stay." },
  { key: "contact", title: "Contact and location", hint: "How guests call you and find you." },
  { key: "look", title: "Choose a look", hint: "Pick a design and a language. You can change both any time." },
] as const;
/** Sign-up and property creation count as step 1. */
const STEP_OFFSET = 2;
const TOTAL = STEPS.length + 1;

type PhotoItem = { key: string; id?: string; src: string; status: "queued" | "uploading" | "done" | "error"; progress: number; error?: string };

const ROOM_PRESETS = [
  { name: "Standard room", adults: 2, bed: "double" },
  { name: "Deluxe room", adults: 2, bed: "king" },
  { name: "Super deluxe room", adults: 3, bed: "king" },
  { name: "Suite", adults: 3, bed: "king" },
  { name: "Family room", adults: 4, bed: "double_single" },
  { name: "Cottage", adults: 2, bed: "double" },
  { name: "Dormitory bed", adults: 1, bed: "bunk" },
];

const HIGHLIGHT_GROUPS: { kind: Highlight["kind"]; label: string }[] = [
  { kind: "setting", label: "Where you are" },
  { kind: "character", label: "What it’s like" },
  { kind: "audience", label: "Who it suits" },
  { kind: "feature", label: "Extras guests love" },
];

const TIMES = Array.from({ length: 38 }, (_, i) => {
  const h = 5 + Math.floor(i / 2);
  const m = i % 2 ? "30" : "00";
  const value = `${String(h).padStart(2, "0")}:${m}`;
  const label = `${h % 12 || 12}:${m} ${h < 12 ? "am" : "pm"}`;
  return { value, label };
});

function blankRoom(preset?: (typeof ROOM_PRESETS)[number]): WizardRoom {
  return { id: "", name: preset?.name ?? "", price: "", adults: preset?.adults ?? 2, bed: preset?.bed ?? "double", view: "", features: ["attached_bathroom", "hot_water"], mediaIds: [] };
}

export function SetupWizard({
  initial,
  photos: initialPhotos,
  startAtFinish,
  siteUrl,
  published,
}: {
  initial: SetupState;
  photos: WizardPhoto[];
  startAtFinish: boolean;
  siteUrl: string;
  published: boolean;
}) {
  const [step, setStep] = useState(startAtFinish ? STEPS.length - 1 : 0);
  const [place, setPlace] = useState(initial.place);
  const [photos, setPhotos] = useState<PhotoItem[]>(initialPhotos.map((p) => ({ key: p.id, id: p.id, src: p.thumb, status: "done", progress: 1 })));
  const [coverId, setCoverId] = useState(initial.coverId);
  const [rooms, setRooms] = useState<WizardRoom[]>(initial.rooms.length ? initial.rooms : [blankRoom(ROOM_PRESETS[0])]);
  const [facilities, setFacilities] = useState(initial.facilities);
  const [contact, setContact] = useState(initial.contact);
  const [sameWhatsapp, setSameWhatsapp] = useState(!initial.contact.whatsapp);
  const [look, setLook] = useState(initial.look);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<FinishResult | null>(null);

  // Upload queue: one photo at a time, so a weak mobile connection is not split many ways.
  const files = useRef(new Map<string, File>());
  const queue = useRef<string[]>([]);
  const running = useRef(false);
  const coverRef = useRef(initial.coverId);

  const patch = (key: string, p: Partial<PhotoItem>) => setPhotos((list) => list.map((x) => (x.key === key ? { ...x, ...p } : x)));
  const ready = photos.filter((p) => p.status === "done" && p.id) as (PhotoItem & { id: string })[];
  const busyUploading = photos.some((p) => p.status === "queued" || p.status === "uploading");

  function chooseCover(id: string) {
    coverRef.current = id;
    setCoverId(id);
    void setCoverPhoto(id).then((r) => {
      if (!r.ok) setError(r.error);
    });
  }

  async function pump() {
    if (running.current) return;
    running.current = true;
    while (queue.current.length) {
      const key = queue.current.shift()!;
      const file = files.current.get(key);
      if (!file) continue;
      patch(key, { status: "uploading", progress: 0, error: undefined });
      try {
        const blob = await shrinkImage(file);
        const { id } = await uploadPhoto(blob, jpegName(file.name), (f) => patch(key, { progress: f }));
        files.current.delete(key);
        patch(key, { status: "done", id, progress: 1 });
        if (!coverRef.current) chooseCover(id);
      } catch (e) {
        patch(key, { status: "error", error: e instanceof Error ? e.message : "Upload failed." });
      }
    }
    running.current = false;
  }

  function addFiles(list: FileList | File[]) {
    const chosen = Array.from(list).filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name));
    const items: PhotoItem[] = chosen.map((f) => {
      const key = crypto.randomUUID();
      files.current.set(key, f);
      queue.current.push(key);
      return { key, src: URL.createObjectURL(f), status: "queued", progress: 0 };
    });
    setPhotos((p) => [...p, ...items]);
    void pump();
  }

  function retry(item: PhotoItem) {
    queue.current.push(item.key);
    patch(item.key, { status: "queued", error: undefined });
    void pump();
  }

  async function removePhoto(item: PhotoItem) {
    if (item.id) {
      const r = await deleteSetupPhoto(item.id);
      if (!r.ok) return setError(r.error);
      setRooms((rs) => rs.map((room) => ({ ...room, mediaIds: room.mediaIds.filter((x) => x !== item.id) })));
    }
    files.current.delete(item.key);
    queue.current = queue.current.filter((k) => k !== item.key);
    if (item.src.startsWith("blob:")) URL.revokeObjectURL(item.src);
    setPhotos((p) => p.filter((x) => x.key !== item.key));
    if (item.id && item.id === coverRef.current) {
      coverRef.current = null;
      setCoverId(null);
      const next = ready.find((x) => x.id !== item.id);
      if (next) chooseCover(next.id);
    }
  }

  async function saveStep(): Promise<string | null> {
    switch (STEPS[step].key) {
      case "place": {
        const r = await savePlaceStep(place);
        return r.ok ? null : r.error;
      }
      case "photos":
        return busyUploading ? "Please wait until your photos finish uploading." : null;
      case "rooms": {
        if (rooms.some((r) => r.name.trim().length < 2)) return "Give every room a name.";
        const r = await saveRoomsStep({ rooms });
        if (!r.ok) return r.error;
        setRooms(r.rooms);
        return null;
      }
      case "facilities": {
        const r = await saveFacilitiesStep(facilities);
        return r.ok ? null : r.error;
      }
      case "contact": {
        const r = await saveContactStep({ ...contact, whatsapp: sameWhatsapp ? "" : contact.whatsapp });
        return r.ok ? null : r.error;
      }
      case "look": {
        const r = await saveLookStep(look);
        return r.ok ? null : r.error;
      }
    }
  }

  function goTo(n: number) {
    setError("");
    setStep(n);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function next() {
    start(async () => {
      setError("");
      const problem = await saveStep();
      if (problem) return setError(problem);
      if (step < STEPS.length - 1) return goTo(step + 1);
      const r = await finishSetup();
      if (!r.ok) return setError(r.error);
      setResult(r);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  if (result?.ok) {
    return (
      <Finished
        result={result}
        siteUrl={siteUrl}
        name={place.name}
        photoCount={ready.length}
        roomCount={rooms.length}
        locale={look.locale}
        onPublish={() =>
          start(async () => {
            const r = await finishSetup();
            if (r.ok) setResult(r);
            else setError(r.error);
          })
        }
        pending={pending}
        error={error}
      />
    );
  }

  const current = STEPS[step];
  const last = step === STEPS.length - 1;
  return (
    <div>
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">
          Step {step + STEP_OFFSET} of {TOTAL}
        </p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuemin={1} aria-valuemax={TOTAL} aria-valuenow={step + STEP_OFFSET}>
          <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${((step + STEP_OFFSET) / TOTAL) * 100}%` }} />
        </div>
        <h1 className="mt-5 text-2xl font-bold text-slate-900 sm:text-3xl">{current.title}</h1>
        <p className="mt-1 text-slate-600">{current.hint}</p>
      </div>

      {current.key === "place" ? <PlaceStep place={place} setPlace={setPlace} /> : null}
      {current.key === "photos" ? <PhotosStep photos={photos} coverId={coverId} onFiles={addFiles} onCover={chooseCover} onRemove={removePhoto} onRetry={retry} /> : null}
      {current.key === "rooms" ? <RoomsStep rooms={rooms} setRooms={setRooms} photos={ready} /> : null}
      {current.key === "facilities" ? <FacilitiesStep facilities={facilities} setFacilities={setFacilities} customCancellation={initial.facilities.cancellation === "custom"} customPets={initial.facilities.pets === "custom"} /> : null}
      {current.key === "contact" ? <ContactStep contact={contact} setContact={setContact} sameWhatsapp={sameWhatsapp} setSameWhatsapp={setSameWhatsapp} /> : null}
      {current.key === "look" ? <LookStep look={look} setLook={setLook} name={place.name} cover={ready.find((p) => p.id === coverId)?.src ?? ready[0]?.src} photoCount={ready.length} siteUrl={siteUrl} /> : null}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-3">
          {error ? (
            <p role="alert" className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : null}
          <div className="flex items-center gap-3">
            {step > 0 ? (
              <button type="button" onClick={() => goTo(step - 1)} disabled={pending} className={buttonClass("secondary", "px-5 py-3")}>
                Back
              </button>
            ) : null}
            <button type="button" onClick={next} disabled={pending || (current.key === "photos" && busyUploading)} aria-busy={pending} className={buttonClass("brand", "flex-1 py-3 text-base")}>
              {pending ? (last ? "Building your website…" : "Saving…") : current.key === "photos" && busyUploading ? "Uploading photos…" : last ? (published ? "Update my website" : "Create my website") : "Continue"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cx(
        "rounded-full border px-3.5 py-2 text-sm font-medium transition",
        on ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-slate-500",
      )}
    >
      {on ? "✓ " : ""}
      {children}
    </button>
  );
}

function Panel({ title, hint, children }: { title?: string; hint?: string; children: ReactNode }) {
  return (
    <section className="mb-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-6">
      {title ? <h2 className="font-semibold text-slate-900">{title}</h2> : null}
      {hint ? <p className="mt-0.5 text-sm text-slate-500">{hint}</p> : null}
      <div className={title || hint ? "mt-4" : ""}>{children}</div>
    </section>
  );
}

function toggle(list: string[], key: string, max = 100): string[] {
  return list.includes(key) ? list.filter((k) => k !== key) : list.length >= max ? list : [...list, key];
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

function PlaceStep({ place, setPlace }: { place: SetupState["place"]; setPlace: (p: SetupState["place"]) => void }) {
  return (
    <>
      <Panel>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Property name" htmlFor="name">
            <Input id="name" value={place.name} maxLength={80} onChange={(e) => setPlace({ ...place, name: e.target.value })} />
          </Field>
          <Field label="Type of property" htmlFor="type">
            <Select id="type" value={place.type} onChange={(e) => setPlace({ ...place, type: e.target.value as SetupState["place"]["type"] })}>
              {PROPERTY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {PROPERTY_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Panel>
      {HIGHLIGHT_GROUPS.map((g) => (
        <Panel key={g.kind} title={g.label}>
          <div className="flex flex-wrap gap-2">
            {HIGHLIGHTS.filter((h) => h.kind === g.kind).map((h) => (
              <Chip key={h.key} on={place.highlights.includes(h.key)} onClick={() => setPlace({ ...place, highlights: toggle(place.highlights, h.key, 12) })}>
                {h.en}
              </Chip>
            ))}
          </div>
        </Panel>
      ))}
      <Panel title="In your own words (optional)" hint="A line or two about your place. We add it to your description exactly as you write it.">
        <Textarea
          aria-label="In your own words"
          rows={3}
          maxLength={600}
          value={place.ownWords}
          onChange={(e) => setPlace({ ...place, ownWords: e.target.value })}
          placeholder="Run by our family since 1998, five minutes’ walk from the ghats. Ask us about sunrise walks and local food."
        />
      </Panel>
    </>
  );
}

function PhotosStep({
  photos,
  coverId,
  onFiles,
  onCover,
  onRemove,
  onRetry,
}: {
  photos: PhotoItem[];
  coverId: string | null;
  onFiles: (files: FileList | File[]) => void;
  onCover: (id: string) => void;
  onRemove: (p: PhotoItem) => void;
  onRetry: (p: PhotoItem) => void;
}) {
  const [over, setOver] = useState(false);
  const done = photos.filter((p) => p.status === "done").length;
  return (
    <>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          onFiles(e.dataTransfer.files);
        }}
        className={cx(
          "mb-4 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-10 text-center transition",
          over ? "border-amber-500 bg-amber-50" : "border-slate-300 bg-white hover:border-slate-400",
        )}
      >
        <span aria-hidden="true" className="grid h-14 w-14 place-items-center rounded-full bg-amber-100 text-2xl">
          📷
        </span>
        <span className={buttonClass("primary", "mt-4 px-6 py-3 text-base")}>Add photos</span>
        <span className="mt-3 text-sm text-slate-600">Choose from your phone or computer. You can select many at once.</span>
        <input
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={(e) => {
            if (e.target.files?.length) onFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </label>

      <Panel>
        <p className="text-sm text-slate-600">
          <strong className="text-slate-900">Good photos to add:</strong> the outside of your building, every type of room, a bathroom, the view, and food or common
          areas. Aim for 8 or more.
        </p>
        {photos.length ? (
          <>
            <p className="mt-4 text-sm font-medium text-slate-800">
              {done} photo{done === 1 ? "" : "s"} uploaded{coverId ? ". The starred photo is your cover." : ""}
            </p>
            <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {photos.map((p, i) => {
                const isCover = Boolean(p.id) && p.id === coverId;
                return (
                  <li key={p.key} className={cx("overflow-hidden rounded-xl bg-slate-100 ring-2", isCover ? "ring-amber-500" : "ring-transparent")}>
                    <div className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.src} alt={`Photo ${i + 1}`} className={cx("aspect-[4/3] w-full object-cover", p.status !== "done" && "opacity-60")} />
                      {isCover ? <span className="absolute left-2 top-2 rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">★ Cover</span> : null}
                      {p.status === "queued" ? <span className="absolute inset-x-2 bottom-2 rounded bg-black/60 px-2 py-0.5 text-center text-xs text-white">Waiting…</span> : null}
                      {p.status === "uploading" ? (
                        <div className="absolute inset-x-2 bottom-2 h-2 overflow-hidden rounded-full bg-white/70" role="progressbar" aria-label="Uploading" aria-valuenow={Math.round(p.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                          <div className="h-full bg-amber-500 transition-all" style={{ width: `${Math.max(5, p.progress * 100)}%` }} />
                        </div>
                      ) : null}
                      {p.status === "error" ? <span className="absolute inset-0 grid place-items-center bg-red-900/70 p-2 text-center text-xs font-medium text-white">{p.error}</span> : null}
                    </div>
                    <div className="flex items-center justify-between gap-1 bg-white px-1.5 py-1.5 text-xs font-semibold">
                      {p.status === "done" && p.id && !isCover ? (
                        <button type="button" onClick={() => onCover(p.id!)} aria-label={`Make photo ${i + 1} the cover`} className="rounded px-2 py-1 text-slate-700 hover:bg-slate-100">
                          ☆ Cover
                        </button>
                      ) : p.status === "error" ? (
                        <button type="button" onClick={() => onRetry(p)} className="rounded px-2 py-1 text-slate-700 hover:bg-slate-100">
                          Try again
                        </button>
                      ) : (
                        <span />
                      )}
                      {p.status !== "uploading" ? (
                        <button type="button" onClick={() => onRemove(p)} className="rounded px-2 py-1 text-red-700 hover:bg-red-50" aria-label={`Remove photo ${i + 1}`}>
                          Remove
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <p className="mt-3 text-sm text-slate-500">No photos yet. You can also skip this and add photos later.</p>
        )}
      </Panel>
    </>
  );
}

function RoomsStep({ rooms, setRooms, photos }: { rooms: WizardRoom[]; setRooms: (r: WizardRoom[]) => void; photos: { id: string; src: string }[] }) {
  const update = (i: number, r: WizardRoom) => setRooms(rooms.map((x, j) => (j === i ? r : x)));
  const unused = ROOM_PRESETS.filter((p) => !rooms.some((r) => r.name.trim().toLowerCase() === p.name.toLowerCase()));
  return (
    <>
      {rooms.map((room, i) => (
        <RoomEditor key={i} index={i} room={room} photos={photos} onChange={(r) => update(i, r)} onRemove={rooms.length > 1 ? () => setRooms(rooms.filter((_, j) => j !== i)) : undefined} />
      ))}
      {rooms.length < 20 ? (
        <Panel title="Add another kind of room">
          <div className="flex flex-wrap gap-2">
            {unused.map((p) => (
              <button key={p.name} type="button" onClick={() => setRooms([...rooms, blankRoom(p)])} className="rounded-full border border-dashed border-slate-400 px-3.5 py-2 text-sm font-medium text-slate-700 hover:border-slate-700">
                + {p.name}
              </button>
            ))}
            <button type="button" onClick={() => setRooms([...rooms, blankRoom()])} className="rounded-full border border-dashed border-slate-400 px-3.5 py-2 text-sm font-medium text-slate-700 hover:border-slate-700">
              + Other
            </button>
          </div>
        </Panel>
      ) : null}
    </>
  );
}

function RoomEditor({ index, room, photos, onChange, onRemove }: { index: number; room: WizardRoom; photos: { id: string; src: string }[]; onChange: (r: WizardRoom) => void; onRemove?: () => void }) {
  const id = (f: string) => `room-${index}-${f}`;
  const customBed = room.bed && !BED_TYPES.some((b) => b.key === room.bed) ? room.bed : null;
  const customView = room.view && !ROOM_VIEWS.some((v) => v.key === room.view) ? room.view : null;
  return (
    <Panel>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-semibold text-slate-900">Room {index + 1}</h2>
        {onRemove ? (
          <button type="button" onClick={onRemove} className="text-sm font-semibold text-red-700 hover:underline">
            Remove
          </button>
        ) : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Room name" htmlFor={id("name")}>
          <Input id={id("name")} value={room.name} maxLength={80} placeholder="Deluxe room" onChange={(e) => onChange({ ...room, name: e.target.value })} />
        </Field>
        <Field label="Price per night (₹)" htmlFor={id("price")} hint="Your usual lowest price. Leave empty to hide it.">
          <Input id={id("price")} value={room.price} inputMode="numeric" placeholder="2500" maxLength={10} onChange={(e) => onChange({ ...room, price: e.target.value.replace(/[^\d.,]/g, "") })} />
        </Field>
        <div>
          <p className="mb-1.5 text-sm font-medium text-slate-800" id={id("guests")}>
            Guests
          </p>
          <div className="inline-flex items-center rounded-lg border border-slate-300 bg-white" role="group" aria-labelledby={id("guests")}>
            <button type="button" aria-label="Fewer guests" onClick={() => onChange({ ...room, adults: Math.max(1, room.adults - 1) })} className="px-4 py-2 text-lg font-bold text-slate-700 hover:bg-slate-50">
              −
            </button>
            <span className="min-w-10 text-center font-semibold text-slate-900" aria-live="polite">
              {room.adults}
            </span>
            <button type="button" aria-label="More guests" onClick={() => onChange({ ...room, adults: Math.min(20, room.adults + 1) })} className="px-4 py-2 text-lg font-bold text-slate-700 hover:bg-slate-50">
              +
            </button>
          </div>
        </div>
        <Field label="Beds" htmlFor={id("bed")}>
          <Select id={id("bed")} value={room.bed} onChange={(e) => onChange({ ...room, bed: e.target.value })}>
            <option value="">Not specified</option>
            {BED_TYPES.map((b) => (
              <option key={b.key} value={b.key}>
                {b.en}
              </option>
            ))}
            {customBed ? <option value={customBed}>{customBed}</option> : null}
          </Select>
        </Field>
        <Field label="View" htmlFor={id("view")}>
          <Select id={id("view")} value={room.view} onChange={(e) => onChange({ ...room, view: e.target.value })}>
            <option value="">No special view</option>
            {ROOM_VIEWS.map((v) => (
              <option key={v.key} value={v.key}>
                {v.en}
              </option>
            ))}
            {customView ? <option value={customView}>{customView}</option> : null}
          </Select>
        </Field>
      </div>
      <p className="mb-2 mt-5 text-sm font-medium text-slate-800">In the room</p>
      <div className="flex flex-wrap gap-2">
        {ROOM_FEATURES.map((f) => (
          <Chip key={f.key} on={room.features.includes(f.key)} onClick={() => onChange({ ...room, features: toggle(room.features, f.key) })}>
            {f.en}
          </Chip>
        ))}
      </div>
      <p className="mb-2 mt-5 text-sm font-medium text-slate-800">Photos of this room</p>
      {photos.length ? (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
          {photos.map((p) => {
            const n = room.mediaIds.indexOf(p.id);
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={n >= 0}
                aria-label={n >= 0 ? `Photo selected as number ${n + 1}` : "Select photo"}
                onClick={() => onChange({ ...room, mediaIds: toggle(room.mediaIds, p.id, 20) })}
                className={cx("relative shrink-0 overflow-hidden rounded-lg ring-2", n >= 0 ? "ring-slate-900" : "ring-transparent")}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.src} alt="" className={cx("h-20 w-28 object-cover", n < 0 && "opacity-70")} />
                {n >= 0 ? <span className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-slate-900 text-xs font-bold text-white">{n + 1}</span> : null}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-slate-500">Add photos in the previous step to pick them here.</p>
      )}
    </Panel>
  );
}

function FacilitiesStep({
  facilities,
  setFacilities,
  customCancellation,
  customPets,
}: {
  facilities: SetupState["facilities"];
  setFacilities: (f: SetupState["facilities"]) => void;
  customCancellation: boolean;
  customPets: boolean;
}) {
  const groups = Object.keys(AMENITY_GROUP_LABELS) as AmenityDef["group"][];
  const cancellations = Object.keys(CANCELLATION_PRESETS) as CancellationPreset[];
  return (
    <>
      {groups.map((g) => (
        <Panel key={g} title={AMENITY_GROUP_LABELS[g]}>
          <div className="flex flex-wrap gap-2">
            {AMENITIES.filter((a) => a.group === g).map((a) => (
              <Chip key={a.key} on={facilities.amenities.includes(a.key)} onClick={() => setFacilities({ ...facilities, amenities: toggle(facilities.amenities, a.key) })}>
                {a.en}
              </Chip>
            ))}
          </div>
        </Panel>
      ))}
      <Panel title="Check-in and check-out">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Check-in from" htmlFor="checkIn">
            <Select id="checkIn" value={facilities.checkIn} onChange={(e) => setFacilities({ ...facilities, checkIn: e.target.value })}>
              {TIMES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Check-out by" htmlFor="checkOut">
            <Select id="checkOut" value={facilities.checkOut} onChange={(e) => setFacilities({ ...facilities, checkOut: e.target.value })}>
              {TIMES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Panel>
      <Panel title="Cancellation policy">
        <div className="grid gap-2" role="radiogroup" aria-label="Cancellation policy">
          {[...cancellations, ...(customCancellation ? (["custom"] as const) : [])].map((k) => {
            const on = facilities.cancellation === k;
            return (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setFacilities({ ...facilities, cancellation: k })}
                className={cx("rounded-xl border p-3 text-left transition", on ? "border-slate-900 bg-slate-50 ring-1 ring-slate-900" : "border-slate-200 hover:border-slate-400")}
              >
                <span className="font-semibold text-slate-900">
                  {k === "custom" ? "Keep my own policy" : CANCELLATION_LABELS[k]}
                  {k === "moderate" ? <span className="ml-2 text-xs font-medium text-emerald-700">Most common</span> : null}
                </span>
                {k !== "custom" ? <span className="mt-0.5 block text-sm text-slate-600">{CANCELLATION_PRESETS[k].en}</span> : null}
              </button>
            );
          })}
        </div>
      </Panel>
      <Panel title="Pets">
        <div className="flex flex-wrap gap-2">
          <Chip on={facilities.pets === "allowed"} onClick={() => setFacilities({ ...facilities, pets: "allowed" })}>
            Pets welcome
          </Chip>
          <Chip on={facilities.pets === "not_allowed"} onClick={() => setFacilities({ ...facilities, pets: "not_allowed" })}>
            No pets
          </Chip>
          {customPets ? (
            <Chip on={facilities.pets === "custom"} onClick={() => setFacilities({ ...facilities, pets: "custom" })}>
              Keep my own wording
            </Chip>
          ) : null}
        </div>
      </Panel>
    </>
  );
}

function ContactStep({
  contact,
  setContact,
  sameWhatsapp,
  setSameWhatsapp,
}: {
  contact: SetupState["contact"];
  setContact: (c: SetupState["contact"]) => void;
  sameWhatsapp: boolean;
  setSameWhatsapp: (v: boolean) => void;
}) {
  const set = (k: keyof SetupState["contact"], v: string) => setContact({ ...contact, [k]: v });
  return (
    <>
      <Panel title="How guests reach you">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone number" htmlFor="phone">
            <Input id="phone" type="tel" inputMode="tel" autoComplete="tel" value={contact.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+91 98xxx xxxxx" />
          </Field>
          <Field label="Email for guests" htmlFor="email" hint="Shown on your website.">
            <Input id="email" type="email" value={contact.email} onChange={(e) => set("email", e.target.value)} />
          </Field>
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" className="h-4 w-4" checked={sameWhatsapp} onChange={(e) => setSameWhatsapp(e.target.checked)} />
          My WhatsApp number is the same
        </label>
        {!sameWhatsapp ? (
          <Field label="WhatsApp number" htmlFor="whatsapp" className="mt-3">
            <Input id="whatsapp" type="tel" inputMode="tel" value={contact.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} />
          </Field>
        ) : null}
      </Panel>
      <Panel title="Address" hint="Helps guests and Google Maps find you.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Building and street" htmlFor="line1" className="sm:col-span-2">
            <Input id="line1" value={contact.line1} maxLength={120} onChange={(e) => set("line1", e.target.value)} placeholder="12 Badrinath Road" />
          </Field>
          <Field label="Area / locality" htmlFor="locality">
            <Input id="locality" value={contact.locality} maxLength={80} onChange={(e) => set("locality", e.target.value)} placeholder="Tapovan" />
          </Field>
          <Field label="City / town" htmlFor="city">
            <Input id="city" value={contact.city} maxLength={60} onChange={(e) => set("city", e.target.value)} />
          </Field>
          <Field label="State" htmlFor="state">
            <Select id="state" value={contact.state} onChange={(e) => set("state", e.target.value)}>
              <option value="">Select…</option>
              {INDIAN_STATES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </Field>
          <Field label="PIN code" htmlFor="postalCode">
            <Input id="postalCode" inputMode="numeric" maxLength={6} value={contact.postalCode} onChange={(e) => set("postalCode", e.target.value.replace(/\D/g, ""))} />
          </Field>
        </div>
      </Panel>
      <Panel title="Places nearby (optional)" hint="Temples, beaches, stations or sights guests ask about.">
        <div className="space-y-3">
          {contact.nearby.map((n, i) => (
            <div key={i} className="flex gap-2">
              <div className="min-w-0 flex-1">
                <Input aria-label="Place name" value={n.name} maxLength={80} placeholder="Laxman Jhula" onChange={(e) => setContact({ ...contact, nearby: contact.nearby.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
              </div>
              <div className="w-24 shrink-0">
                <Input aria-label="Distance" value={n.distance} maxLength={40} placeholder="1.5 km" onChange={(e) => setContact({ ...contact, nearby: contact.nearby.map((x, j) => (j === i ? { ...x, distance: e.target.value } : x)) })} />
              </div>
              <button type="button" aria-label="Remove place" onClick={() => setContact({ ...contact, nearby: contact.nearby.filter((_, j) => j !== i) })} className="shrink-0 rounded-lg px-2 text-red-700 hover:bg-red-50">
                ✕
              </button>
            </div>
          ))}
        </div>
        {contact.nearby.length < 6 ? (
          <button type="button" onClick={() => setContact({ ...contact, nearby: [...contact.nearby, { name: "", distance: "" }] })} className="mt-3 text-sm font-semibold text-slate-800 hover:underline">
            + Add a place
          </button>
        ) : null}
      </Panel>
    </>
  );
}

function LookStep({
  look,
  setLook,
  name,
  cover,
  photoCount,
  siteUrl,
}: {
  look: SetupState["look"];
  setLook: (l: SetupState["look"]) => void;
  name: string;
  cover?: string;
  photoCount: number;
  siteUrl: string;
}) {
  const templates = Object.entries(TEMPLATE_STYLES) as [SetupState["look"]["template"], (typeof TEMPLATE_STYLES)[keyof typeof TEMPLATE_STYLES]][];
  return (
    <>
      <Panel title="Design">
        <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Design">
          {templates.map(([key, t]) => {
            const on = look.template === key;
            const bg = cover ? { backgroundImage: `url(${cover})` } : undefined;
            return (
              <button key={key} type="button" role="radio" aria-checked={on} onClick={() => setLook({ ...look, template: key })} className={cx("overflow-hidden rounded-xl border text-left transition", on ? "border-slate-900 ring-2 ring-slate-900" : "border-slate-200 hover:border-slate-400")}>
                {t.hero === "split" ? (
                  <div className="grid aspect-[4/3] grid-cols-2 items-center gap-2 bg-white p-2">
                    <div className="space-y-1.5">
                      <p className="line-clamp-2 text-sm font-semibold leading-tight text-slate-900">{name}</p>
                      <span className="inline-block rounded px-2 py-0.5 text-[10px] font-semibold text-white" style={{ background: t.defaults.primary }}>
                        Enquire
                      </span>
                    </div>
                    <div className="h-full rounded-lg bg-slate-300 bg-cover bg-center" style={bg} />
                  </div>
                ) : (
                  <div className="relative flex aspect-[4/3] items-end bg-slate-500 bg-cover bg-center" style={bg}>
                    {t.header === "solid" ? <div className="absolute inset-x-0 top-0 h-4" style={{ background: t.defaults.primary }} /> : null}
                    <div className={cx("w-full bg-gradient-to-t from-black/70 to-transparent p-2 text-white", t.hero === "overlay" && "text-center")}>
                      <p className={cx("line-clamp-2 text-sm leading-tight", key === "heritage" ? "font-serif font-semibold" : "font-extrabold uppercase tracking-wide")}>{name}</p>
                      <span className="mt-1 inline-block rounded px-2 py-0.5 text-[10px] font-semibold text-white" style={{ background: t.defaults.primary }}>
                        Enquire
                      </span>
                    </div>
                  </div>
                )}
                <span className="block p-3">
                  <span className="font-semibold text-slate-900">{t.label}</span>
                  <span className="mt-0.5 block text-xs text-slate-600">{t.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </Panel>
      <Panel title="Website language" hint="Menus, buttons and the text we write for you will be in this language.">
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              ["en", "English"],
              ["hi", "हिन्दी"],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" aria-pressed={look.locale === k} onClick={() => setLook({ ...look, locale: k })} className={cx("rounded-xl border px-4 py-3 text-lg font-semibold transition", look.locale === k ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-800 hover:border-slate-500")}>
              {label}
            </button>
          ))}
        </div>
      </Panel>
      <Panel title="What happens next">
        <ul className="space-y-2 text-sm text-slate-700">
          <li>✓ We write your home page, room descriptions, FAQ and Google listing text in {look.locale === "hi" ? "Hindi" : "English"}.</li>
          <li>✓ We arrange your {photoCount ? `${photoCount} photos` : "photos"} into a cover, room pictures and a gallery.</li>
          <li>
            ✓ Your website goes live at <strong className="break-all">{siteUrl.replace(/^https?:\/\//, "")}</strong>. You can change anything later.
          </li>
        </ul>
      </Panel>
    </>
  );
}

function Finished({
  result,
  siteUrl,
  name,
  photoCount,
  roomCount,
  locale,
  onPublish,
  pending,
  error,
}: {
  result: Extract<FinishResult, { ok: true }>;
  siteUrl: string;
  name: string;
  photoCount: number;
  roomCount: number;
  locale: "en" | "hi";
  onPublish: () => void;
  pending: boolean;
  error: string;
}) {
  const [resent, setResent] = useState("");
  const share = `https://wa.me/?text=${encodeURIComponent(`Book your stay at ${name} directly: ${siteUrl}`)}`;
  const did = [
    `Wrote your home page, ${roomCount} room description${roomCount === 1 ? "" : "s"}, FAQ and Google listing in ${locale === "hi" ? "Hindi" : "English"}`,
    photoCount ? `Arranged ${photoCount} photo${photoCount === 1 ? "" : "s"} with a cover and gallery` : "Set up your pages (add photos any time from the dashboard)",
    "Added your policies, contact details and map",
  ];
  if (!result.published) {
    return (
      <div className="rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200 sm:p-10">
        <span aria-hidden="true" className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-amber-100 text-2xl">
          ✉️
        </span>
        <h1 className="mt-4 text-2xl font-bold text-slate-900">Your website is ready. One last step.</h1>
        <p className="mx-auto mt-2 max-w-md text-slate-600">
          To put it live, open the email we sent to <strong>{result.email}</strong> and tap the verification link. Then come back here and tap <strong>Publish</strong>.
        </p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <button type="button" onClick={onPublish} disabled={pending} className={buttonClass("brand", "px-6 py-3 text-base")}>
            {pending ? "Checking…" : "I’ve verified. Publish"}
          </button>
          <a href="/preview" target="_blank" rel="noopener" className={buttonClass("secondary", "px-6 py-3 text-base")}>
            Preview my website
          </a>
        </div>
        <button
          type="button"
          className="mt-4 text-sm font-semibold text-slate-600 underline"
          onClick={async () => {
            const r = await resendVerificationAction();
            setResent(r.message);
          }}
        >
          Send the email again
        </button>
        {resent ? <p className="mt-2 text-sm text-slate-600">{resent}</p> : null}
        {error ? (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}
        <ul className="mx-auto mt-8 max-w-md space-y-2 text-left text-sm text-slate-700">
          {did.map((d) => (
            <li key={d}>✓ {d}</li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div className="rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200 sm:p-10">
      <span aria-hidden="true" className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-2xl text-emerald-700">
        ✓
      </span>
      <h1 className="mt-4 text-2xl font-bold text-slate-900 sm:text-3xl">Your website is live!</h1>
      <p className="mt-2 text-slate-600">Guests can now find {name}, see your rooms and send enquiries.</p>
      <div className="mx-auto mt-6 flex max-w-lg items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 pl-4">
        <a href={result.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-left font-semibold text-slate-900 underline">
          {result.url.replace(/^https?:\/\//, "")}
        </a>
        <CopyButton value={result.url} label="Copy link" />
      </div>
      <div className="mt-4 flex flex-col justify-center gap-3 sm:flex-row">
        <a href={result.url} target="_blank" rel="noopener noreferrer" className={buttonClass("primary", "px-6 py-3 text-base")}>
          Open my website
        </a>
        <a href={share} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary", "px-6 py-3 text-base")}>
          Share on WhatsApp
        </a>
      </div>
      <ul className="mx-auto mt-8 max-w-md space-y-2 text-left text-sm text-slate-700">
        {did.map((d) => (
          <li key={d}>✓ {d}</li>
        ))}
      </ul>
      <div className="mt-8 grid gap-3 text-left sm:grid-cols-3">
        {[
          { href: "/dashboard/payments", t: "Get paid by UPI", d: "Add your UPI ID so guests can pay you directly." },
          { href: "/dashboard/website/property", t: "Change any text", d: "Everything we wrote can be edited." },
          { href: "/dashboard", t: "Go to dashboard", d: "See enquiries, bookings and visitors." },
        ].map((x) => (
          <Link key={x.href} href={x.href} className="rounded-xl border border-slate-200 p-4 hover:border-slate-400">
            <span className="font-semibold text-slate-900">{x.t} →</span>
            <span className="mt-1 block text-sm text-slate-600">{x.d}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
