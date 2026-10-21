import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { getDb, schema } from "@/db";
import { Badge, PageHeader, Table, Td } from "@/components/ui";
import { config } from "@/lib/config";
import { DOMAIN_STATUS_COPY } from "@/lib/domains/service";
import { formatDateTime } from "@/lib/format";

export default async function AdminDomains() {
  const db = await getDb();
  const rows = await db
    .select({ d: schema.domains, hotel: schema.hotels })
    .from(schema.domains)
    .innerJoin(schema.hotels, eq(schema.hotels.id, schema.domains.hotelId))
    .orderBy(desc(schema.domains.createdAt));
  return (
    <>
      <PageHeader title="Custom domains" description={`Provider: ${config.domains.provider} · CNAME target: ${config.domains.cnameTarget}`} />
      <Table head={["Hostname", "Hotel", "Status", "Issues", "Last checked"]}>
        {rows.map(({ d, hotel }) => (
          <tr key={d.id}>
            <Td className="font-mono">{d.hostname}</Td>
            <Td>
              <Link href={`/admin/hotels/${hotel.id}`} className="hover:underline">
                {hotel.name}
              </Link>
            </Td>
            <Td>
              <Badge tone={DOMAIN_STATUS_COPY[d.status].tone === "good" ? "good" : DOMAIN_STATUS_COPY[d.status].tone === "bad" ? "bad" : "warn"}>{DOMAIN_STATUS_COPY[d.status].label}</Badge>
            </Td>
            <Td className="text-xs">{d.issues.join(" ")}</Td>
            <Td className="whitespace-nowrap">{formatDateTime(d.lastCheckedAt)}</Td>
          </tr>
        ))}
      </Table>
    </>
  );
}
