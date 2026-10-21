import { verifyRazorpaySignature, type RazorpayWebhook } from "@/lib/billing/razorpay";
import { applyRazorpayEvent } from "@/lib/billing/subscription";
import { sha256 } from "@/lib/crypto";
import { invalidateHotel } from "@/lib/site-cache";
import { firstDelivery } from "@/lib/webhooks";

export async function POST(req: Request) {
  // Verify against the raw body before parsing anything.
  const raw = await req.text();
  if (!verifyRazorpaySignature(raw, req.headers.get("x-razorpay-signature"))) {
    return new Response("invalid signature", { status: 401 });
  }
  const evt = JSON.parse(raw) as RazorpayWebhook;
  const eventId = req.headers.get("x-razorpay-event-id") ?? sha256(raw);
  if (!(await firstDelivery("razorpay", eventId, evt.event, evt))) return Response.json({ ok: true, duplicate: true });
  const result = await applyRazorpayEvent(evt);
  const hotelId = (evt.payload.subscription?.entity.notes as Record<string, string> | undefined)?.hotel_id;
  if (hotelId) invalidateHotel(hotelId);
  return Response.json({ ok: true, result });
}
