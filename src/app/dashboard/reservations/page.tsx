import { and, asc, desc, eq, gte, inArray, lt } from "drizzle-orm";
import Link from "next/link";
import { getDb, schema } from "@/db";
import { Badge, EmptyState, LinkButton, PageHeader, Table, Td, cx } from "@/components/ui";
import { requireHotel } from "@/lib/auth";
import { RESERVATION_STATUS_LABELS } from "@/lib/bookings";
import { formatDate, formatINR, todayIST } from "@/lib/format";

export default async function ReservationsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { hotel, role } = await requireHotel();
  const view = (await searchParams).view ?? "upcoming";
  const db = await getDb();
  const today = todayIST();
  const r = schema.reservations;
  const rows = await db
    .select()
    .from(r)
    .where(and(eq(r.hotelId, hotel.id), view === "upcoming" ? gte(r.checkOut, today) : view === "past" ? lt(r.checkOut, today) : undefined))
    .orderBy(view === "upcoming" ? asc(r.checkIn) : desc(r.checkIn))
    .limit(200);
  const payments = rows.length ? await db.select().from(schema.paymentRequests).where(inArray(schema.paymentRequests.reservationId, rows.map((x) => x.id))) : [];
  const paidBy = new Map<string, number>();
  const reported = new Set<string>();
  for (const p of payments) {
    if (p.status === "paid") paidBy.set(p.reservationId, (paidBy.get(p.reservationId) ?? 0) + p.amount);
    if (p.status === "guest_reported") reported.add(p.reservationId);
  }

  return (
    <>
      <PageHeader
        title="Reservations"
        description="Bookings you have agreed with guests, and the payments you have requested and received."
        actions={
          <>
            {role !== "front_desk" ? (
              <a href="/api/dashboard/export?type=reservations" className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
                Export CSV
              </a>
            ) : null}
            <LinkButton href="/dashboard/reservations/new">Add reservation</LinkButton>
          </>
        }
      />
      <nav aria-label="View" className="mb-4 flex gap-2">
        {["upcoming", "past", "all"].map((v) => (
          <Link key={v} href={`/dashboard/reservations?view=${v}`} className={cx("rounded-full px-3 py-1.5 text-sm font-medium capitalize", view === v ? "bg-slate-900 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200")}>
            {v}
          </Link>
        ))}
      </nav>
      {rows.length ? (
        <Table head={["Guest", "Stay", "Room", "Total", "Paid", "Status"]}>
          {rows.map((x) => {
            const paid = paidBy.get(x.id) ?? 0;
            return (
              <tr key={x.id} className="hover:bg-slate-50">
                <Td>
                  <Link href={`/dashboard/reservations/${x.id}`} className="font-semibold text-slate-900 hover:underline">
                    {x.guestName}
                  </Link>
                  <span className="block text-xs text-slate-500">{x.ref}</span>
                </Td>
                <Td className="whitespace-nowrap">
                  {formatDate(x.checkIn, { year: undefined })} → {formatDate(x.checkOut, { year: undefined })}
                </Td>
                <Td>{x.roomName}</Td>
                <Td>{formatINR(x.totalAmount)}</Td>
                <Td>
                  {formatINR(paid)}
                  {reported.has(x.id) ? <span className="block text-xs font-semibold text-amber-700">Guest reported a payment</span> : null}
                </Td>
                <Td>
                  <Badge tone={x.status === "confirmed" ? "good" : x.status === "cancelled" ? "bad" : x.status === "completed" ? "neutral" : "warn"}>{RESERVATION_STATUS_LABELS[x.status]}</Badge>
                </Td>
              </tr>
            );
          })}
        </Table>
      ) : (
        <EmptyState title="No reservations">Create one from an enquiry, or add a phone or walk-in booking.</EmptyState>
      )}
    </>
  );
}
