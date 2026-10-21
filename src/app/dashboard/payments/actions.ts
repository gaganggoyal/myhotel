"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { bool, fail, ok, str, type ActionState } from "@/lib/action";
import { audit, userActor } from "@/lib/audit";
import { requireHotel } from "@/lib/auth";
import { appUrl } from "@/lib/config";
import { verifyPassword } from "@/lib/crypto";
import { sendPlatformEmail } from "@/lib/email/send";
import { formatDateTime } from "@/lib/format";
import { MediaError, saveQr } from "@/lib/media";
import { rateLimit } from "@/lib/ratelimit";
import { clientIp } from "@/lib/request";
import { isValidVpa, normalizeVpa, qrConsistencyWarning } from "@/lib/upi";

/**
 * Changing where guests send money is the most abuse-prone action in the product, so it
 * needs the owner role, the account password, an explicit attestation, an immutable audit
 * entry and an email alert to the owner.
 */
export async function savePaymentMethodAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireHotel("owner");
  const ip = await clientIp();
  if (!(await rateLimit(`paymethod:${ctx.hotel.id}`, 10, 3600))) return fail("Too many changes. Try again in an hour.");
  if (!(await verifyPassword(String(fd.get("password") ?? ""), ctx.user.passwordHash))) return fail("Your password is incorrect. We ask for it because this changes where guests send money.");
  if (!bool(fd, "attest")) return fail("Please confirm the UPI ID and QR belong to your business.");

  const payeeName = str(fd, "payeeName", 100);
  const vpa = normalizeVpa(str(fd, "vpa", 120));
  if (payeeName.length < 2) return fail("Enter the account holder name exactly as your bank shows it.");
  if (!isValidVpa(vpa)) return fail("Enter a valid UPI ID, like yourhotel@okaxis.");

  const db = await getDb();
  const [existing] = await db.select().from(schema.paymentMethods).where(and(eq(schema.paymentMethods.hotelId, ctx.hotel.id), eq(schema.paymentMethods.scheme, "upi")));

  let qrMediaId = bool(fd, "removeQr") ? null : (existing?.qrMediaId ?? null);
  let decoded = bool(fd, "removeQr") ? null : (existing?.qrDecoded ?? null);
  const file = fd.get("qr");
  if (file instanceof File && file.size > 0) {
    try {
      const saved = await saveQr({ hotelId: ctx.hotel.id, userId: ctx.user.id, file: Buffer.from(await file.arrayBuffer()) });
      qrMediaId = saved.row.id;
      decoded = saved.decoded;
    } catch (err) {
      if (err instanceof MediaError) return fail(err.message);
      throw err;
    }
  }
  const warning = qrMediaId ? qrConsistencyWarning(decoded, vpa) : null;
  const values = {
    payeeName,
    vpa,
    note: str(fd, "note", 200) || null,
    qrMediaId,
    qrDecoded: decoded,
    qrWarning: warning,
    attestedAt: new Date(),
    attestedBy: ctx.user.id,
    enabled: true,
    updatedAt: new Date(),
  };
  if (existing) await db.update(schema.paymentMethods).set(values).where(eq(schema.paymentMethods.id, existing.id));
  else await db.insert(schema.paymentMethods).values({ hotelId: ctx.hotel.id, scheme: "upi", ...values });

  await audit(
    ctx.hotel.id,
    userActor(ctx.user),
    "payment_method.updated",
    { before: existing ? { payeeName: existing.payeeName, vpa: existing.vpa, qrMediaId: existing.qrMediaId } : null, after: { payeeName, vpa, qrMediaId }, qrWarning: warning },
    { ip },
  );
  await sendPlatformEmail({
    to: ctx.user.email,
    key: "payment_details_changed",
    hotelId: ctx.hotel.id,
    vars: { owner_name: ctx.user.name, property_name: ctx.hotel.name, actor: ctx.user.email, when: formatDateTime(new Date()), payee_name: payeeName, upi_id: vpa, link: appUrl("/dashboard/payments") },
  });
  revalidatePath("/dashboard/payments");
  return warning ? fail(`Saved, but please check: ${warning}`) : ok("Saved. New payment requests will use these details. Requests already sent keep the details they were sent with.");
}
