import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { PageHeader, Table, Td } from "@/components/ui";
import { requireHotel } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";

function describe(action: string, data: Record<string, unknown> | null): string {
  if (!data) return "";
  if (action === "payment_method.updated") {
    const after = data.after as { vpa?: string; payeeName?: string } | undefined;
    return after ? `Now ${after.payeeName} · ${after.vpa}` : "";
  }
  return Object.entries(data)
    .filter(([, v]) => v != null && typeof v !== "object")
    .map(([k, v]) => `${k}: ${v}`)
    .join(" · ");
}

export default async function ActivityPage() {
  const { hotel } = await requireHotel("manager");
  const db = await getDb();
  const rows = await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.hotelId, hotel.id)).orderBy(desc(schema.auditLogs.createdAt)).limit(200);
  return (
    <>
      <PageHeader title="Activity log" description="A permanent record of important changes: publishing, payment details, domains, payments marked received and exports. Entries cannot be edited or deleted." />
      <Table head={["When", "Who", "What", "Details"]}>
        {rows.map((r) => (
          <tr key={r.id}>
            <Td className="whitespace-nowrap">{formatDateTime(r.createdAt)}</Td>
            <Td>{r.actorLabel}</Td>
            <Td className="font-mono text-xs">{r.action}</Td>
            <Td className="text-xs">{describe(r.action, r.data)}</Td>
          </tr>
        ))}
      </Table>
    </>
  );
}
