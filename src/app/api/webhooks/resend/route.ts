import { config } from "@/lib/config";
import { recordDeliveryEvent } from "@/lib/email/send";
import { firstDelivery, verifySvix } from "@/lib/webhooks";

type ResendEvent = { type: string; data: { email_id: string; to?: string[]; bounce?: { type?: string; message?: string } } };

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifySvix(raw, req.headers, config.email.resendWebhookSecret)) return new Response("invalid signature", { status: 401 });
  const evt = JSON.parse(raw) as ResendEvent;
  if (!(await firstDelivery("resend", req.headers.get("svix-id")!, evt.type, evt))) return Response.json({ ok: true, duplicate: true });

  const map: Record<string, "delivered" | "bounced" | "complained"> = {
    "email.delivered": "delivered",
    "email.bounced": "bounced",
    "email.complained": "complained",
  };
  const event = map[evt.type];
  // Only permanent bounces suppress the address; transient ones are left to retry.
  if (event === "bounced" && evt.data.bounce?.type && !/permanent|hard/i.test(evt.data.bounce.type)) return Response.json({ ok: true, ignored: "transient bounce" });
  if (event) await recordDeliveryEvent({ providerMessageId: evt.data.email_id, event, email: evt.data.to?.[0], detail: evt.data.bounce?.message });
  return Response.json({ ok: true });
}
