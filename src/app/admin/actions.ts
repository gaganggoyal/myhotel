"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { fail, int, ok, str, type ActionState } from "@/lib/action";
import { audit, userActor } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { activateManually } from "@/lib/billing/subscription";
import { forceActivate } from "@/lib/domains/service";
import { runJobs } from "@/lib/jobs";
import { invalidateHotel } from "@/lib/site-cache";

export async function adminHotelAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const hotelId = str(fd, "hotelId");
  const op = str(fd, "op");
  const db = await getDb();
  const actor = userActor(admin);
  switch (op) {
    case "suspend": {
      const reason = str(fd, "reason", 300);
      if (!reason) return fail("Give a reason; the owner sees it.");
      await db.update(schema.hotels).set({ adminSuspendedAt: new Date(), adminSuspendReason: reason }).where(eq(schema.hotels.id, hotelId));
      await audit(hotelId, actor, "admin.suspended", { reason });
      break;
    }
    case "unsuspend":
      await db.update(schema.hotels).set({ adminSuspendedAt: null, adminSuspendReason: null }).where(eq(schema.hotels.id, hotelId));
      await audit(hotelId, actor, "admin.unsuspended");
      break;
    case "pause_mail":
      await db.update(schema.hotels).set({ mailPausedAt: new Date(), mailPauseReason: str(fd, "reason", 300) || "Paused by support" }).where(eq(schema.hotels.id, hotelId));
      await audit(hotelId, actor, "admin.mail_paused");
      break;
    case "resume_mail":
      await db.update(schema.hotels).set({ mailPausedAt: null, mailPauseReason: null }).where(eq(schema.hotels.id, hotelId));
      await audit(hotelId, actor, "admin.mail_resumed");
      break;
    case "extend_trial": {
      const days = Math.min(60, Math.max(1, int(fd, "days", 7)));
      const [sub] = await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.hotelId, hotelId));
      if (!sub) return fail("No subscription.");
      const base = sub.trialEndsAt && sub.trialEndsAt > new Date() ? sub.trialEndsAt : new Date();
      await db
        .update(schema.subscriptions)
        .set({ status: "trialing", trialEndsAt: new Date(base.getTime() + days * 86_400_000), suspendedReason: null, trialReminderSentAt: null })
        .where(eq(schema.subscriptions.id, sub.id));
      await audit(hotelId, actor, "admin.trial_extended", { days });
      break;
    }
    case "activate_manual":
      await activateManually(hotelId, str(fd, "interval") === "yearly" ? "yearly" : "monthly", "manual");
      await audit(hotelId, actor, "admin.subscription_manual");
      break;
    case "force_domain":
      await forceActivate(str(fd, "domainId"), actor);
      break;
    default:
      return fail("Unknown action.");
  }
  invalidateHotel(hotelId);
  revalidatePath("/admin", "layout");
  return ok("Done.");
}

export async function runJobsAction(): Promise<ActionState> {
  await requireAdmin();
  const result = await runJobs("all");
  revalidatePath("/admin", "layout");
  return ok(`Jobs ran: ${JSON.stringify(result)}`);
}
