import { findPaymentRequestByToken } from "@/lib/bookings";
import { siteForRequest } from "@/lib/public-api";
import { storage } from "@/lib/storage";

/** The hotel's QR, only through a valid payment link on the hotel's own host. Never cached publicly. */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const site = await siteForRequest(req);
  const found = await findPaymentRequestByToken(token);
  if (!site || !found || found.hotel.id !== site.hotel.id || !found.request.payee.qrMediaId) return new Response("Not found", { status: 404 });
  if (["paid", "cancelled"].includes(found.request.status)) return new Response("Gone", { status: 410 });
  const data = await storage().get(`${found.hotel.id}/${found.request.payee.qrMediaId}/qr.png`);
  if (!data) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex", "X-Content-Type-Options": "nosniff" },
  });
}
