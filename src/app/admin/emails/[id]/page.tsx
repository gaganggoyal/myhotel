import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { Card, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

export default async function AdminEmail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const [m] = await db.select().from(schema.emailMessages).where(eq(schema.emailMessages.id, id));
  if (!m) notFound();
  return (
    <>
      <PageHeader title={m.subject} description={`${formatDateTime(m.createdAt)} · ${m.status}`} />
      <Card>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">From</dt>
            <dd className="font-mono text-xs">{m.fromEmail}</dd>
          </div>
          <div>
            <dt className="text-slate-500">To</dt>
            <dd className="font-mono text-xs">{m.toEmail}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Reply-To</dt>
            <dd className="font-mono text-xs">{m.replyTo ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Provider id</dt>
            <dd className="font-mono text-xs">{m.providerMessageId ?? "—"}</dd>
          </div>
        </dl>
      </Card>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card title="HTML">
          <iframe title="Email HTML" srcDoc={m.html} sandbox="" className="h-[720px] w-full rounded border border-slate-200 bg-white" />
        </Card>
        <Card title="Plain text">
          <pre className="whitespace-pre-wrap text-sm">{m.text}</pre>
        </Card>
      </div>
    </>
  );
}
