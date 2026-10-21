import { BookingError, findPaymentRequestByToken, guestReportPayment } from "@/lib/bookings";
import { hashIp } from "@/lib/crypto";
import { MediaError, saveProof } from "@/lib/media";
import { json, sameOrigin, siteForRequest } from "@/lib/public-api";
import { rateLimit } from "@/lib/ratelimit";
import { ipFromHeaders } from "@/lib/request";
import { normalizeUtr } from "@/lib/upi";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!sameOrigin(req)) return json({ ok: false, error: "Forbidden" }, 403);
  const { token } = await params;
  const site = await siteForRequest(req);
  const found = await findPaymentRequestByToken(token);
  if (!site || !found || found.hotel.id !== site.hotel.id) return json({ ok: false, error: "Payment link not found." }, 404);

  const ip = ipFromHeaders(req.headers);
  if (!(await rateLimit(`payrep:${token}:${hashIp(ip)}`, 6, 3600))) return json({ ok: false, error: "Too many attempts. Please contact the hotel." }, 429);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ ok: false, error: "Invalid form." }, 400);
  }
  const utr = normalizeUtr(String(form.get("utr") ?? ""));
  if (!utr) return json({ ok: false, error: "Enter the UPI transaction ID (UTR) from your payment app." }, 400);
  const note = String(form.get("note") ?? "").trim().slice(0, 500);

  let proofMediaId: string | null = null;
  const file = form.get("proof");
  if (file instanceof File && file.size > 0) {
    try {
      const row = await saveProof({ hotelId: site.hotel.id, file: Buffer.from(await file.arrayBuffer()) });
      proofMediaId = row.id;
    } catch (err) {
      if (err instanceof MediaError) return json({ ok: false, error: err.message }, 400);
      throw err;
    }
  }

  try {
    await guestReportPayment(token, { utr, note, proofMediaId });
  } catch (err) {
    if (err instanceof BookingError) return json({ ok: false, error: err.message }, 400);
    throw err;
  }
  return json({ ok: true });
}
