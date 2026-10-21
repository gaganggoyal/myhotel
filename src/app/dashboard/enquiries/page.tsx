import { and, desc, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { getDb, schema } from "@/db";
import type { EnquiryStatus } from "@/db/schema";
import { Badge, EmptyState, PageHeader, Table, Td, cx } from "@/components/ui";
import { requireHotel } from "@/lib/auth";
import { ENQUIRY_STATUS_LABELS } from "@/lib/bookings";
import { formatDate, formatDateTime } from "@/lib/format";

const FILTERS: (EnquiryStatus | "all")[] = ["all", "new", "contacted", "quoted", "won", "lost", "spam"];

export default async function EnquiriesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { hotel, role } = await requireHotel();
  const status = (await searchParams).status as EnquiryStatus | undefined;
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.enquiries)
    .where(and(eq(schema.enquiries.hotelId, hotel.id), isNull(schema.enquiries.anonymizedAt), status && status in ENQUIRY_STATUS_LABELS ? eq(schema.enquiries.status, status) : undefined))
    .orderBy(desc(schema.enquiries.createdAt))
    .limit(200);

  return (
    <>
      <PageHeader
        title="Enquiries"
        description="Every enquiry and booking request from your website. Reply quickly: guests often ask several hotels at once."
        actions={
          role !== "front_desk" ? (
            <a href="/api/dashboard/export?type=enquiries" className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
              Export CSV
            </a>
          ) : null
        }
      />
      <nav aria-label="Filter" className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = (f === "all" && !status) || f === status;
          return (
            <Link key={f} href={f === "all" ? "/dashboard/enquiries" : `/dashboard/enquiries?status=${f}`} className={cx("rounded-full px-3 py-1.5 text-sm font-medium", active ? "bg-slate-900 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50")}>
              {f === "all" ? "All" : ENQUIRY_STATUS_LABELS[f]}
            </Link>
          );
        })}
      </nav>
      {rows.length ? (
        <Table head={["Guest", "Type", "Dates", "Room", "Status", "Received"]}>
          {rows.map((e) => (
            <tr key={e.id} className="hover:bg-slate-50">
              <Td>
                <Link href={`/dashboard/enquiries/${e.id}`} className="font-semibold text-slate-900 hover:underline">
                  {e.guestName}
                </Link>
                <span className="block text-xs text-slate-500">{e.ref}</span>
              </Td>
              <Td>{e.kind === "booking_request" ? <Badge tone="info">Booking request</Badge> : <Badge>Enquiry</Badge>}</Td>
              <Td>{e.checkIn ? `${formatDate(e.checkIn, { year: undefined })} → ${formatDate(e.checkOut, { year: undefined })}` : "—"}</Td>
              <Td>{e.roomName ?? "Any"}</Td>
              <Td>
                <Badge tone={e.status === "new" ? "warn" : e.status === "won" ? "good" : e.status === "spam" || e.status === "lost" ? "neutral" : "info"}>{ENQUIRY_STATUS_LABELS[e.status]}</Badge>
              </Td>
              <Td className="whitespace-nowrap">{formatDateTime(e.createdAt)}</Td>
            </tr>
          ))}
        </Table>
      ) : (
        <EmptyState title="No enquiries here yet">When guests use the form on your website, they appear here and in your email.</EmptyState>
      )}
    </>
  );
}
