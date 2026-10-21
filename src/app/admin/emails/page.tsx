import { desc, inArray } from "drizzle-orm";
import Link from "next/link";
import { getDb, schema } from "@/db";
import { Badge, PageHeader, Table, Td, cx } from "@/components/ui";
import { config } from "@/lib/config";
import { formatDateTime } from "@/lib/format";

export default async function AdminEmails({ searchParams }: { searchParams: Promise<{ problems?: string }> }) {
  const problems = (await searchParams).problems === "1";
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.emailMessages)
    .where(problems ? inArray(schema.emailMessages.status, ["failed", "bounced", "complained", "paused", "suppressed"]) : undefined)
    .orderBy(desc(schema.emailMessages.createdAt))
    .limit(200);
  return (
    <>
      <PageHeader
        title="Email log"
        description={config.email.provider === "console" ? "Development mailbox: emails are stored here instead of being sent. Open one to see exactly what the recipient would get." : `Provider: ${config.email.provider}`}
      />
      <nav className="mb-4 flex gap-2 text-sm">
        <Link href="/admin/emails" className={cx("rounded-full px-3 py-1.5", !problems ? "bg-slate-900 text-white" : "bg-white ring-1 ring-slate-200")}>
          All
        </Link>
        <Link href="/admin/emails?problems=1" className={cx("rounded-full px-3 py-1.5", problems ? "bg-slate-900 text-white" : "bg-white ring-1 ring-slate-200")}>
          Problems only
        </Link>
      </nav>
      <Table head={["When", "Stream", "To", "Subject", "Status"]}>
        {rows.map((m) => (
          <tr key={m.id}>
            <Td className="whitespace-nowrap">{formatDateTime(m.createdAt)}</Td>
            <Td className="text-xs">{m.stream}</Td>
            <Td>{m.toEmail}</Td>
            <Td>
              <Link href={`/admin/emails/${m.id}`} className="font-medium hover:underline">
                {m.subject}
              </Link>
            </Td>
            <Td>
              <Badge tone={["failed", "bounced", "complained"].includes(m.status) ? "bad" : ["paused", "suppressed"].includes(m.status) ? "warn" : "good"}>{m.status}</Badge>
              {m.error ? <span className="block text-xs text-slate-500">{m.error}</span> : null}
            </Td>
          </tr>
        ))}
      </Table>
    </>
  );
}
