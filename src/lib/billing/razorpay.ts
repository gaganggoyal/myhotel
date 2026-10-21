import { config } from "../config";
import { hmacHex, safeEqual } from "../crypto";

// Razorpay Subscriptions (owner billing). Only the fields we use are typed.
// Webhook events: subscription.authenticated | activated | charged | pending | halted |
// cancelled | completed | paused | resumed | updated. Entity at payload.subscription.entity.

export type RazorpaySubscription = {
  id: string;
  plan_id: string;
  status: string;
  current_start: number | null;
  current_end: number | null;
  charge_at: number | null;
  short_url: string | null;
  notes: Record<string, string> | [];
};

export type RazorpayWebhook = {
  event: string;
  created_at: number;
  payload: {
    subscription?: { entity: RazorpaySubscription };
    payment?: { entity: { id: string; amount: number; currency: string; status: string } };
  };
};

export function razorpayConfigured(): boolean {
  const b = config.billing;
  return Boolean(b.razorpayKeyId && b.razorpayKeySecret && b.razorpayPlanMonthly && b.razorpayPlanYearly);
}

function authHeader(): string {
  return `Basic ${Buffer.from(`${config.billing.razorpayKeyId}:${config.billing.razorpayKeySecret}`).toString("base64")}`;
}

export async function createRazorpaySubscription(input: { interval: "monthly" | "yearly"; hotelId: string; email: string }): Promise<RazorpaySubscription> {
  const planId = input.interval === "yearly" ? config.billing.razorpayPlanYearly : config.billing.razorpayPlanMonthly;
  const res = await fetch("https://api.razorpay.com/v1/subscriptions", {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({
      plan_id: planId,
      // Razorpay requires a bounded count; 10 years of monthly / yearly cycles.
      total_count: input.interval === "yearly" ? 10 : 120,
      customer_notify: true,
      notes: { hotel_id: input.hotelId, owner_email: input.email },
    }),
  });
  const body = (await res.json()) as RazorpaySubscription & { error?: { description?: string } };
  if (!res.ok) throw new Error(body.error?.description ?? `Razorpay error ${res.status}`);
  return body;
}

export async function cancelRazorpaySubscription(id: string, atCycleEnd = true): Promise<void> {
  const res = await fetch(`https://api.razorpay.com/v1/subscriptions/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ cancel_at_cycle_end: atCycleEnd ? 1 : 0 }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { description?: string } };
    throw new Error(body.error?.description ?? `Razorpay error ${res.status}`);
  }
}

/** HMAC-SHA256 (hex) of the raw request body with the webhook secret. Verify before parsing. */
export function verifyRazorpaySignature(rawBody: string, signature: string | null, secret = config.billing.razorpayWebhookSecret): boolean {
  if (!signature || !secret) return false;
  return safeEqual(hmacHex(secret, rawBody), signature);
}

export function hotelIdFromNotes(notes: RazorpaySubscription["notes"]): string | null {
  if (Array.isArray(notes)) return null;
  return notes?.hotel_id ?? null;
}
