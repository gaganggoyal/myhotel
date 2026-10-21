"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { fail, ok, str, type ActionState } from "@/lib/action";
import { userActor } from "@/lib/audit";
import { requireHotel } from "@/lib/auth";
import { getSubscription, subscriptionAllowsCustomDomain } from "@/lib/billing/subscription";
import { checkDomain, connectDomain, DOMAIN_STATUS_COPY, DomainError, removeDomain } from "@/lib/domains/service";
import { changeSlug, HotelError } from "@/lib/hotel";
import { rateLimit } from "@/lib/ratelimit";

export async function connectDomainAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireHotel("owner");
  if (!subscriptionAllowsCustomDomain(await getSubscription(ctx.hotel.id))) return fail("Custom domains are available once you choose a paid plan. Your subdomain works during the trial.");
  try {
    const d = await connectDomain(ctx.hotel.id, str(fd, "hostname", 253), userActor(ctx.user));
    revalidatePath("/dashboard", "layout");
    return ok(`Added ${d.hostname}. ${DOMAIN_STATUS_COPY[d.status].help}`);
  } catch (err) {
    if (err instanceof DomainError) return fail(err.message);
    throw err;
  }
}

export async function checkDomainAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireHotel("manager");
  if (!(await rateLimit(`domaincheck:${ctx.hotel.id}`, 30, 3600))) return fail("Checked many times recently; we keep checking automatically.");
  const db = await getDb();
  const [d] = await db.select().from(schema.domains).where(and(eq(schema.domains.id, str(fd, "id")), eq(schema.domains.hotelId, ctx.hotel.id)));
  if (!d) return fail("Domain not found.");
  const updated = await checkDomain(d.id);
  revalidatePath("/dashboard/domain");
  return ok(`${DOMAIN_STATUS_COPY[updated.status].label}.`);
}

export async function removeDomainAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireHotel("owner");
  await removeDomain(ctx.hotel.id, str(fd, "id"), userActor(ctx.user));
  revalidatePath("/dashboard", "layout");
  return ok("Domain removed. Your subdomain is your main address again.");
}

export async function changeSlugAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireHotel("owner");
  try {
    const slug = await changeSlug(ctx.hotel, str(fd, "slug", 63), userActor(ctx.user));
    revalidatePath("/dashboard", "layout");
    return ok(`Your subdomain is now ${slug}. The old address redirects here permanently.`);
  } catch (err) {
    if (err instanceof HotelError) return fail(err.message);
    throw err;
  }
}
