import { config } from "@/lib/config";
import { safeEqual, sha256 } from "@/lib/crypto";
import { recordDeliveryEvent } from "@/lib/email/send";
import { firstDelivery } from "@/lib/webhooks";

type PostmarkEvent = { RecordType: string; MessageID: string; Email?: string; Recipient?: string; Type?: string; Description?: string; ID?: number };

/** Postmark webhooks authenticate with basic-auth credentials embedded in the webhook URL. */
export async function POST(req: Request) {
  const expected = config.email.postmarkWebhookAuth;
  const given = (req.headers.get("authorization") ?? "").replace(/^Basic\s+/i, "");
  if (!expected || !safeEqual(Buffer.from(given, "base64").toString(), expected)) return new Response("unauthorized", { status: 401 });

  const raw = await req.text();
  const evt = JSON.parse(raw) as PostmarkEvent;
  if (!(await firstDelivery("postmark", String(evt.ID ?? sha256(raw)), evt.RecordType, evt))) return Response.json({ ok: true, duplicate: true });

  if (evt.RecordType === "Delivery") await recordDeliveryEvent({ providerMessageId: evt.MessageID, event: "delivered" });
  else if (evt.RecordType === "SpamComplaint") await recordDeliveryEvent({ providerMessageId: evt.MessageID, event: "complained", email: evt.Email });
  else if (evt.RecordType === "Bounce" && ["HardBounce", "BadEmailAddress", "ManuallyDeactivated"].includes(evt.Type ?? "")) {
    await recordDeliveryEvent({ providerMessageId: evt.MessageID, event: "bounced", email: evt.Email, detail: evt.Description });
  }
  return Response.json({ ok: true });
}
