"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { fail, ok, str, type ActionState } from "@/lib/action";
import { audit, userActor } from "@/lib/audit";
import { requireHotel } from "@/lib/auth";
import { appUrl, config } from "@/lib/config";
import { getTemplate, TEMPLATE_MAP } from "@/lib/email/catalog";
import { hotelBrand, sendEmail, sendPlatformEmail } from "@/lib/email/send";
import { renderEmail } from "@/lib/email/render";
import { getDraft } from "@/lib/hotel";
import { rateLimit } from "@/lib/ratelimit";
import { issueToken } from "@/lib/tokens";

export async function saveTemplateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireHotel("manager");
  const key = str(fd, "key");
  const def = TEMPLATE_MAP.get(key);
  if (!def?.editable) return fail("This template cannot be edited.");
  const subject = str(fd, "subject", 200);
  const body = str(fd, "body", 4000);
  if (!subject || !body) return fail("Subject and message are required.");
  const db = await getDb();
  await db
    .insert(schema.emailTemplates)
    .values({ hotelId: ctx.hotel.id, key, subject, body, updatedBy: ctx.user.id })
    .onConflictDoUpdate({ target: [schema.emailTemplates.hotelId, schema.emailTemplates.key], set: { subject, body, updatedBy: ctx.user.id, updatedAt: new Date() } });
  await audit(ctx.hotel.id, userActor(ctx.user), "email_template.updated", { key });
  revalidatePath(`/dashboard/emails/${key}`);
  return ok("Template saved. It is used for the next email of this type.");
}

export async function resetTemplateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireHotel("manager");
  const db = await getDb();
  await db.delete(schema.emailTemplates).where(and(eq(schema.emailTemplates.hotelId, ctx.hotel.id), eq(schema.emailTemplates.key, str(fd, "key"))));
  revalidatePath(`/dashboard/emails/${str(fd, "key")}`);
  return ok("Restored the default wording.");
}

/** Sends the template with sample data to the signed-in user, never to a real guest. */
export async function testSendAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireHotel("manager");
  if (!(await rateLimit(`testmail:${ctx.hotel.id}`, 10, 3600))) return fail("Test limit reached. Try again later.");
  const def = getTemplate(str(fd, "key"));
  const db = await getDb();
  const [override] = await db.select().from(schema.emailTemplates).where(and(eq(schema.emailTemplates.hotelId, ctx.hotel.id), eq(schema.emailTemplates.key, def.key)));
  const { content } = await getDraft(ctx.hotel.id);
  const vars = { ...def.sample, platform_name: config.platformName, property_name: content.property.name };
  const rendered = renderEmail(def, { subject: `[Test] ${override?.subject ?? def.subject}`, body: override?.body ?? def.body }, vars, hotelBrand(content));
  await sendEmail({ hotelId: ctx.hotel.id, stream: "hotel_owner", templateKey: `test:${def.key}`, to: ctx.user.email, fromName: `${content.property.name} via ${config.platformName}`, fromLocal: ctx.hotel.slug, replyTo: null, ...rendered });
  return ok(`Test sent to ${ctx.user.email} with sample guest details.`);
}

export async function changeReplyToAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireHotel("owner");
  const email = str(fd, "email").toLowerCase();
  if (!z.email().safeParse(email).success) return fail("Enter a valid email address.");
  if (!(await rateLimit(`replyto:${ctx.hotel.id}`, 5, 3600))) return fail("Too many attempts. Try again later.");
  const token = await issueToken("verify_reply_to", { userId: ctx.user.id, hotelId: ctx.hotel.id, data: { email }, ttlMinutes: 48 * 60 });
  await sendPlatformEmail({ to: email, key: "verify_reply_to", hotelId: ctx.hotel.id, vars: { email, property_name: ctx.hotel.name, link: appUrl(`/verify-reply-to?token=${token}`) } });
  await audit(ctx.hotel.id, userActor(ctx.user), "reply_to.requested", { email });
  return ok(`We sent a confirmation link to ${email}. Guest replies switch to it once you click the link.`);
}
