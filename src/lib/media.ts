import { and, eq, inArray, isNull } from "drizzle-orm";
import jsQR from "jsqr";
import sharp, { type Metadata } from "sharp";
import { getDb, schema } from "@/db";
import { storage } from "./storage";

// Every upload is decoded and re-encoded by sharp. That validates the real file type from
// its bytes (never the browser's Content-Type), strips EXIF/GPS metadata from public
// derivatives, and neutralises polyglot files. SVG is rasterised and never served as SVG.

export const PHOTO_WIDTHS = [480, 960, 1600] as const;
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const MAX_PIXELS = 50_000_000;

export class MediaError extends Error {}

type MediaRow = typeof schema.media.$inferSelect;

function assertSize(buf: Buffer) {
  if (buf.byteLength === 0) throw new MediaError("The file is empty.");
  if (buf.byteLength > MAX_UPLOAD_BYTES) throw new MediaError("Files must be 12 MB or smaller.");
}

async function inspect(buf: Buffer, allowed: string[]) {
  let meta: Metadata;
  try {
    meta = await sharp(buf, { limitInputPixels: MAX_PIXELS }).metadata();
  } catch {
    throw new MediaError("This file is not a supported image.");
  }
  if (!meta.format || !allowed.includes(meta.format)) {
    throw new MediaError(`Unsupported image type. Use ${allowed.map((f) => f.toUpperCase()).join(", ")}.`);
  }
  if ((meta.pages ?? 1) > 1) throw new MediaError("Animated or multi-page images are not allowed.");
  return meta;
}

/** Hotel photo: three WebP widths (public, metadata stripped) plus the original kept private. */
export async function savePhoto(input: { hotelId: string; userId: string; file: Buffer; kind: "photo" | "logo"; alt?: string }): Promise<MediaRow> {
  assertSize(input.file);
  const meta = await inspect(input.file, ["jpeg", "png", "webp", "avif", "heif"]);
  const base = sharp(input.file, { limitInputPixels: MAX_PIXELS }).rotate();
  // EXIF orientations 5-8 are rotated 90°, so the displayed width is the stored height.
  const swap = (meta.orientation ?? 1) >= 5;
  const width = (swap ? meta.height : meta.width) ?? 0;
  const height = (swap ? meta.width : meta.height) ?? 0;
  const minWidth = input.kind === "logo" ? 64 : 400;
  if (width < minWidth) throw new MediaError(`Image is too small. Use at least ${minWidth}px wide.`);

  const db = await getDb();
  const id = crypto.randomUUID();
  const store = storage();
  const variants: string[] = [];
  for (const w of PHOTO_WIDTHS) {
    if (variants.length && w > width) break;
    const out = await base
      .clone()
      .resize({ width: w, withoutEnlargement: true })
      .webp({ quality: input.kind === "logo" ? 90 : 78 })
      .toBuffer();
    await store.put(`${input.hotelId}/${id}/${w}.webp`, out, "image/webp");
    variants.push(String(w));
  }
  await store.put(`${input.hotelId}/${id}/original`, input.file, "application/octet-stream");

  const [row] = await db
    .insert(schema.media)
    .values({
      id,
      hotelId: input.hotelId,
      kind: input.kind,
      mime: "image/webp",
      width,
      height,
      bytes: input.file.byteLength,
      alt: (input.alt ?? "").slice(0, 200),
      variants,
      isPublic: true,
      createdBy: input.userId,
    })
    .returning();
  return row;
}

/**
 * Payment QR: stored as a lossless PNG on white (transparent QRs fail on dark-mode screens),
 * private (only shown on tokenised payment pages), and decoded for a consistency check.
 */
export async function saveQr(input: { hotelId: string; userId: string; file: Buffer }): Promise<{ row: MediaRow; decoded: string | null }> {
  assertSize(input.file);
  await inspect(input.file, ["png", "jpeg", "webp", "svg"]);
  const img = sharp(input.file, { limitInputPixels: MAX_PIXELS, density: 300 }).rotate().flatten({ background: "#ffffff" });
  const png = await img.png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true });
  const { width, height } = png.info;
  if (Math.min(width, height) < 200) throw new MediaError("The QR image is too small. Download the full-size QR from your bank or UPI business app.");

  const decoded = await decodeQr(png.data);
  const db = await getDb();
  const id = crypto.randomUUID();
  await storage().put(`${input.hotelId}/${id}/qr.png`, png.data, "image/png");
  const [row] = await db
    .insert(schema.media)
    .values({
      id,
      hotelId: input.hotelId,
      kind: "qr",
      mime: "image/png",
      width,
      height,
      bytes: png.data.byteLength,
      alt: "",
      variants: ["qr.png"],
      isPublic: false,
      createdBy: input.userId,
    })
    .returning();
  return { row, decoded };
}

export async function decodeQr(image: Buffer): Promise<string | null> {
  try {
    const { data, info } = await sharp(image)
      .resize({ width: 1000, height: 1000, fit: "inside", withoutEnlargement: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const result = jsQR(new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength), info.width, info.height);
    return result?.data ?? null;
  } catch {
    return null;
  }
}

/** Guest's payment screenshot: private, shown only to hotel staff. */
export async function saveProof(input: { hotelId: string; file: Buffer }): Promise<MediaRow> {
  assertSize(input.file);
  await inspect(input.file, ["jpeg", "png", "webp", "heif"]);
  const out = await sharp(input.file, { limitInputPixels: MAX_PIXELS })
    .rotate()
    .resize({ width: 1400, height: 2400, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer({ resolveWithObject: true });
  const db = await getDb();
  const id = crypto.randomUUID();
  await storage().put(`${input.hotelId}/${id}/proof.webp`, out.data, "image/webp");
  const [row] = await db
    .insert(schema.media)
    .values({
      id,
      hotelId: input.hotelId,
      kind: "payment_proof",
      mime: "image/webp",
      width: out.info.width,
      height: out.info.height,
      bytes: out.data.byteLength,
      variants: ["proof.webp"],
      isPublic: false,
    })
    .returning();
  return row;
}

export type MediaInfo = { id: string; alt: string; width: number; height: number; variants: string[] };

export function mediaUrl(m: { id: string; hotelId?: string }, hotelId: string, width: number | string = 960): string {
  return `/media/${hotelId}/${m.id}/${width}.webp`;
}

export function srcSet(m: MediaInfo, hotelId: string): string {
  return m.variants.map((v) => `/media/${hotelId}/${m.id}/${v}.webp ${v}w`).join(", ");
}

export function bestVariant(m: MediaInfo, target: number): string {
  const nums = m.variants.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  return String(nums.find((n) => n >= target) ?? nums[nums.length - 1] ?? 960);
}

export async function listPhotos(hotelId: string): Promise<MediaRow[]> {
  const db = await getDb();
  return db
    .select()
    .from(schema.media)
    .where(and(eq(schema.media.hotelId, hotelId), inArray(schema.media.kind, ["photo", "logo"]), isNull(schema.media.deletedAt)))
    .orderBy(schema.media.createdAt);
}

/** Public media for rendering a site. Includes soft-deleted rows still referenced by a published version. */
export async function mediaMapFor(hotelId: string, ids: string[]): Promise<Map<string, MediaInfo>> {
  const map = new Map<string, MediaInfo>();
  if (!ids.length) return map;
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.media)
    .where(and(eq(schema.media.hotelId, hotelId), inArray(schema.media.id, Array.from(new Set(ids))), eq(schema.media.isPublic, true)));
  for (const r of rows) map.set(r.id, { id: r.id, alt: r.alt, width: r.width, height: r.height, variants: r.variants });
  return map;
}
