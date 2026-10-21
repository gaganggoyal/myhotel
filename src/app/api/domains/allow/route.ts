import { and, eq, ne } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { config } from "@/lib/config";
import { classifyHost } from "@/lib/hosts";

/**
 * "Ask" endpoint for a self-managed edge (e.g. Caddy on-demand TLS). A certificate may be
 * issued only for platform subdomains of real hotels and for custom hostnames an owner has
 * registered. Without this check, on-demand TLS would issue for any name presented.
 */
export async function GET(req: Request) {
  const domain = (new URL(req.url).searchParams.get("domain") ?? "").toLowerCase();
  const kind = classifyHost(domain, config.rootHostname);
  const db = await getDb();
  if (kind.kind === "platform" || kind.kind === "platform-www") return new Response("ok");
  if (kind.kind === "subdomain") {
    const [h] = await db.select({ id: schema.hotels.id }).from(schema.hotels).where(eq(schema.hotels.slug, kind.slug));
    return h ? new Response("ok") : new Response("no", { status: 404 });
  }
  if (kind.kind === "custom") {
    const [d] = await db
      .select({ id: schema.domains.id })
      .from(schema.domains)
      .where(and(eq(schema.domains.hostname, kind.hostname), ne(schema.domains.status, "blocked")));
    return d ? new Response("ok") : new Response("no", { status: 404 });
  }
  return new Response("no", { status: 404 });
}
