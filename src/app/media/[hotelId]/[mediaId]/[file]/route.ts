import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { storage } from "@/lib/storage";

const ID_RE = /^[0-9a-f-]{36}$/;

/** Public hotel photos. Derivatives are immutable (a new upload gets a new id). */
export async function GET(_req: Request, { params }: { params: Promise<{ hotelId: string; mediaId: string; file: string }> }) {
  const { hotelId, mediaId, file } = await params;
  const m = /^(\d{2,4})\.webp$/.exec(file);
  if (!ID_RE.test(hotelId) || !ID_RE.test(mediaId) || !m) return new Response("Not found", { status: 404 });
  const db = await getDb();
  const [row] = await db
    .select({ variants: schema.media.variants, isPublic: schema.media.isPublic })
    .from(schema.media)
    .where(and(eq(schema.media.id, mediaId), eq(schema.media.hotelId, hotelId)));
  if (!row || !row.isPublic || !row.variants.includes(m[1])) return new Response("Not found", { status: 404 });
  const data = await storage().get(`${hotelId}/${mediaId}/${file}`);
  if (!data) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: { "Content-Type": "image/webp", "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
  });
}
