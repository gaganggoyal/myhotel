"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { fail, ok, str, type ActionState } from "@/lib/action";
import { audit, userActor } from "@/lib/audit";
import { requireHotel } from "@/lib/auth";
import { cancelRazorpaySubscription, createRazorpaySubscription, razorpayConfigured } from "@/lib/billing/razorpay";
import { activateManually, getSubscription } from "@/lib/billing/subscription";
import { config } from "@/lib/config";
import { formatDate } from "@/lib/format";
import { invalidateHotel } from "@/lib/site-cache";

export async function subscribeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireHotel("owner");
  const interval = str(fd, "interval") === "yearly" ? "yearly" : "monthly";
  const sub = await getSubscription(ctx.hotel.id);
  if (!sub) return fail("No subscription record. Contact support.");
  if (sub.status === "active" && sub.provider === "razorpay") return fail("You already have an active plan.");

  if (config.billing.provider === "razorpay") {
    if (!razorpayConfigured()) return fail("Online billing is not configured yet. Contact support.");
    const rz = await createRazorpaySubscription({ interval, hotelId: ctx.hotel.id, email: ctx.user.email });
    const db = await getDb();
    await db.update(schema.subscriptions).set({ provider: "razorpay", providerSubscriptionId: rz.id, providerStatus: rz.status, checkoutUrl: rz.short_url, interval, updatedAt: new Date() }).where(eq(schema.subscriptions.id, sub.id));
    await audit(ctx.hotel.id, userActor(ctx.user), "billing.checkout_started", { interval, providerSubscriptionId: rz.id });
    // Razorpay's hosted page authorises UPI AutoPay or a card mandate. Activation arrives by webhook.
    if (rz.short_url) redirect(rz.short_url);
    return fail("Could not open the payment page. Try again.");
  }

  // Development / simulated billing: no money moves.
  await activateManually(ctx.hotel.id, interval, "simulated");
  invalidateHotel(ctx.hotel.id);
  revalidatePath("/dashboard", "layout");
  return ok(`Simulated ${interval} subscription activated (no payment taken; set BILLING_PROVIDER=razorpay in production).`);
}

export async function cancelSubscriptionAction(): Promise<ActionState> {
  const ctx = await requireHotel("owner");
  const sub = await getSubscription(ctx.hotel.id);
  if (!sub || !["active", "past_due", "grace_period"].includes(sub.status)) return fail("There is no active plan to cancel.");
  if (sub.provider === "razorpay" && sub.providerSubscriptionId) {
    await cancelRazorpaySubscription(sub.providerSubscriptionId, true);
  }
  const db = await getDb();
  await db.update(schema.subscriptions).set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() }).where(eq(schema.subscriptions.id, sub.id));
  await audit(ctx.hotel.id, userActor(ctx.user), "billing.cancelled");
  revalidatePath("/dashboard", "layout");
  return ok(`Cancelled. Your website stays online until ${formatDate(sub.currentPeriodEnd)}, and nothing is deleted.`);
}
