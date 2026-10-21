import { getDb, schema } from "@/db";
import { config } from "@/lib/config";
import { hashIp, sha256 } from "@/lib/crypto";
import { todayIST } from "@/lib/format";
import { deviceFromUa, isBot, siteForRequest } from "@/lib/public-api";
import { rateLimit } from "@/lib/ratelimit";
import { ipFromHeaders } from "@/lib/request";

const clip = (v: unknown, n: number) => (typeof v === "string" && v ? v.slice(0, n) : null);

export async function POST(req: Request) {
  const noContent = new Response(null, { status: 204 });
  const ua = req.headers.get("user-agent");
  if (isBot(ua)) return noContent;
  const site = await siteForRequest(req);
  if (!site) return noContent;

  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (raw.length > 4000) return noContent;
    body = JSON.parse(raw);
  } catch {
    return noContent;
  }
  const type = body.type === "cta_click" ? "cta_click" : body.type === "page_view" ? "page_view" : null;
  if (!type) return noContent;

  const ip = ipFromHeaders(req.headers);
  if (!(await rateLimit(`trk:${hashIp(ip)}`, 120, 60))) return noContent;

  const day = todayIST();
  let referrer: string | null = null;
  try {
    const r = typeof body.referrer === "string" && body.referrer ? new URL(body.referrer) : null;
    if (r && r.host !== req.headers.get("host")) referrer = r.host;
  } catch {
    referrer = null;
  }

  const db = await getDb();
  await db.insert(schema.analyticsEvents).values({
    hotelId: site.hotel.id,
    type,
    path: clip(body.path, 200) ?? "/",
    cta: type === "cta_click" ? clip(body.cta, 60) : null,
    referrer,
    utmSource: clip(body.utm_source, 100),
    utmMedium: clip(body.utm_medium, 100),
    utmCampaign: clip(body.utm_campaign, 100),
    device: deviceFromUa(ua),
    // Daily-rotating, per-hotel hash: counts unique visitors without cookies or stored IPs.
    visitorHash: sha256(`${config.appSecret}:${day}:${site.hotel.id}:${ip}:${ua}`).slice(0, 24),
    day,
  });
  return noContent;
}
