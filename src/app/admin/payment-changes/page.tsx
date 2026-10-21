import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { getDb, schema } from "@/db";
import { PageHeader, Table, Td } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

type Change = { before: { payeeName: string; vpa: string } | null; after: { payeeName: string; vpa: string }; qrWarning: string | null };

/** Review feed for the most abuse-prone change: where guests send money. */
export default async function PaymentChanges() {
  const db = await getDb();
  const rows = await db
    .select({ log: schema.auditLogs, hotel: schema.hotels })
    .from(schema.auditLogs)
    .leftJoin(schema.hotels, eq(schema.hotels.id, schema.auditLogs.hotelId))
    .where(eq(schema.auditLogs.action, "payment_method.updated"))
    .orderBy(desc(schema.auditLogs.createdAt))
    .limit(200);
  return (
    <>
      <PageHeader title="Payment detail changes" description="Every change to a hotel’s UPI payee. Investigate changes shortly after a password reset, payee names unrelated to the business, and QR/UPI mismatches." />
      <Table head={["When", "Hotel", "By", "Before", "After", "QR check"]}>
        {rows.map(({ log, hotel }) => {
          const d = log.data as Change | null;
          return (
            <tr key={log.id}>
              <Td className="whitespace-nowrap">{formatDateTime(log.createdAt)}</Td>
              <Td>{hotel ? <Link href={`/admin/hotels/${hotel.id}`} className="font-semibold hover:underline">{hotel.name}</Link> : "—"}</Td>
              <Td>{log.actorLabel}</Td>
              <Td className="font-mono text-xs">{d?.before ? `${d.before.payeeName} · ${d.before.vpa}` : "(first setup)"}</Td>
              <Td className="font-mono text-xs">{d?.after ? `${d.after.payeeName} · ${d.after.vpa}` : ""}</Td>
              <Td className="text-xs text-amber-800">{d?.qrWarning ?? "OK"}</Td>
            </tr>
          );
        })}
      </Table>
    </>
  );
}
