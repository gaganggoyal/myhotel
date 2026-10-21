import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getCurrentUser, getHotelContext } from "@/lib/auth";
import { storage } from "@/lib/storage";

/** QR images and guest payment screenshots: visible only to that hotel's staff (and platform admins). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const ctx = await getHotelContext();
  const db = await getDb();
  const [m] = await db.select().from(schema.media).where(and(eq(schema.media.id, id), eq(schema.media.isPublic, false)));
  if (!m || (!user.isPlatformAdmin && m.hotelId !== ctx?.hotel.id)) return new Response("Not found", { status: 404 });
  const data = await storage().get(`${m.hotelId}/${m.id}/${m.variants[0]}`);
  if (!data) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(data), { headers: { "Content-Type": m.mime, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
