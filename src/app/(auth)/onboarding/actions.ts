"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { fail, str, type ActionState } from "@/lib/action";
import { getHotelContext, requireUser } from "@/lib/auth";
import { appUrl, subdomainHost } from "@/lib/config";
import { PROPERTY_TYPES } from "@/lib/content";
import { sendPlatformEmail } from "@/lib/email/send";
import { formatDate } from "@/lib/format";
import { createHotel, HotelError, suggestSlug } from "@/lib/hotel";
import { getSubscription } from "@/lib/billing/subscription";

const schema = z.object({
  name: z.string().trim().min(2, "Enter your property name.").max(80),
  type: z.enum(PROPERTY_TYPES),
  city: z.string().trim().min(2, "Enter your city or town.").max(60),
  state: z.string().trim().max(60),
  phone: z.string().trim().min(8, "Enter a phone number guests can reach.").max(20),
  slug: z.string().trim().max(63),
});

export async function createPropertyAction(_: { ok: boolean; message: string }, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (await getHotelContext()) redirect("/dashboard");
  const parsed = schema.safeParse({ name: str(fd, "name"), type: str(fd, "type"), city: str(fd, "city"), state: str(fd, "state"), phone: str(fd, "phone"), slug: str(fd, "slug") });
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const d = parsed.data;
  let hotel;
  try {
    hotel = await createHotel({ userId: user.id, name: d.name, type: d.type, city: d.city, state: d.state, phone: d.phone, email: user.email, slug: d.slug || (await suggestSlug(d.name)) });
  } catch (err) {
    if (err instanceof HotelError) return fail(err.message);
    throw err;
  }
  const sub = await getSubscription(hotel.id);
  await sendPlatformEmail({
    to: user.email,
    key: "welcome",
    hotelId: hotel.id,
    vars: { owner_name: user.name, property_name: hotel.name, site_url: subdomainHost(hotel.slug), trial_end: formatDate(sub?.trialEndsAt), dashboard_link: appUrl("/dashboard") },
  });
  redirect("/dashboard/website/rooms?onboarding=1");
}
