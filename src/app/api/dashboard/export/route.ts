import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { audit, userActor } from "@/lib/audit";
import { getHotelContext } from "@/lib/auth";
import { getDraft } from "@/lib/hotel";

function csvCell(v: unknown): string {
  let s = v == null ? "" : String(v);
  // Neutralise spreadsheet formula injection from guest-supplied text.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  return [cols.join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\r\n");
}

/** CSV of leads or reservations, or a full JSON export of the property's data. */
export async function GET(req: Request) {
  const ctx = await getHotelContext();
  if (!ctx) return new Response("Unauthorized", { status: 401 });
  if (ctx.role === "front_desk") return new Response("Forbidden", { status: 403 });
  const type = new URL(req.url).searchParams.get("type") ?? "enquiries";
  const db = await getDb();
  const hotelId = ctx.hotel.id;
  const stamp = new Date().toISOString().slice(0, 10);

  if (type === "enquiries") {
    const rows = await db.select().from(schema.enquiries).where(eq(schema.enquiries.hotelId, hotelId)).orderBy(desc(schema.enquiries.createdAt));
    await audit(hotelId, userActor(ctx.user), "export.enquiries", { rows: rows.length });
    const csv = toCsv(
      rows.map((e) => ({
        ref: e.ref,
        received: e.createdAt.toISOString(),
        type: e.kind,
        status: e.status,
        name: e.guestName,
        email: e.guestEmail,
        phone: e.guestPhone,
        check_in: e.checkIn,
        check_out: e.checkOut,
        adults: e.adults,
        children: e.children,
        room: e.roomName,
        message: e.message,
        marketing_consent: e.marketingConsent ? "yes" : "no",
        source_path: e.source?.path,
        utm_source: e.source?.utm?.utm_source,
      })),
    );
    return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="enquiries-${stamp}.csv"` } });
  }

  if (type === "reservations") {
    const rows = await db.select().from(schema.reservations).where(eq(schema.reservations.hotelId, hotelId)).orderBy(desc(schema.reservations.checkIn));
    await audit(hotelId, userActor(ctx.user), "export.reservations", { rows: rows.length });
    const csv = toCsv(
      rows.map((r) => ({
        ref: r.ref,
        status: r.status,
        guest: r.guestName,
        email: r.guestEmail,
        phone: r.guestPhone,
        check_in: r.checkIn,
        check_out: r.checkOut,
        room: r.roomName,
        adults: r.adults,
        children: r.children,
        total_inr: (r.totalAmount / 100).toFixed(2),
        created: r.createdAt.toISOString(),
      })),
    );
    return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="reservations-${stamp}.csv"` } });
  }

  if (type === "all" && ctx.role === "owner") {
    const [enquiries, reservations, payments, versions] = await Promise.all([
      db.select().from(schema.enquiries).where(eq(schema.enquiries.hotelId, hotelId)),
      db.select().from(schema.reservations).where(eq(schema.reservations.hotelId, hotelId)),
      db.select().from(schema.paymentRequests).where(eq(schema.paymentRequests.hotelId, hotelId)),
      db.select({ version: schema.siteVersions.version, publishedAt: schema.siteVersions.publishedAt }).from(schema.siteVersions).where(eq(schema.siteVersions.hotelId, hotelId)),
    ]);
    await audit(hotelId, userActor(ctx.user), "export.all");
    const body = JSON.stringify({ exportedAt: new Date().toISOString(), hotel: { id: hotelId, slug: ctx.hotel.slug, name: ctx.hotel.name }, content: (await getDraft(hotelId)).content, enquiries, reservations, payments, versions }, null, 2);
    return new Response(body, { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${ctx.hotel.slug}-export-${stamp}.json"` } });
  }
  return new Response("Unknown export", { status: 400 });
}
