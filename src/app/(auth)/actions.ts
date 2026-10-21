"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { fail, ok, str, type ActionState } from "@/lib/action";
import { audit, userActor } from "@/lib/audit";
import { createSession, destroyOtherSessions, destroySession, getCurrentUser, isAdminEmail } from "@/lib/auth";
import { appUrl } from "@/lib/config";
import { hashIp, hashPassword, verifyPassword } from "@/lib/crypto";
import { sendPlatformEmail } from "@/lib/email/send";
import { rateLimit } from "@/lib/ratelimit";
import { clientIp } from "@/lib/request";
import { consumeToken, issueToken } from "@/lib/tokens";

const { users } = schema;

const signupSchema = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(80),
  email: z.email("Enter a valid email address.").max(120),
  phone: z.string().trim().min(8, "Enter a mobile number.").max(20).regex(/^[+()\d\s-]+$/, "Enter a valid mobile number."),
  password: z.string().min(10, "Use at least 10 characters for your password.").max(200),
});

export async function sendVerification(user: { id: string; email: string; name: string }) {
  const token = await issueToken("verify_email", { userId: user.id, ttlMinutes: 48 * 60 });
  await sendPlatformEmail({ to: user.email, key: "verify_email", vars: { owner_name: user.name, link: appUrl(`/verify-email?token=${token}`) } });
}

export async function signupAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = signupSchema.safeParse({ name: str(fd, "name"), email: str(fd, "email").toLowerCase(), phone: str(fd, "phone"), password: String(fd.get("password") ?? "") });
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  if (!fd.get("terms")) return fail("Please accept the terms to continue.");
  const ip = await clientIp();
  if (!(await rateLimit(`signup:${hashIp(ip)}`, 10, 3600))) return fail("Too many sign-ups from this network. Try again later.");

  const db = await getDb();
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, parsed.data.email));
  if (existing) return fail("An account with this email already exists. Log in instead.");
  const [user] = await db
    .insert(users)
    .values({
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone,
      passwordHash: await hashPassword(parsed.data.password),
      isPlatformAdmin: isAdminEmail(parsed.data.email),
    })
    .returning();
  await sendVerification(user);
  await audit(null, userActor(user), "user.signup", {}, { ip });
  await createSession(user.id);
  redirect(user.isPlatformAdmin ? "/admin" : "/onboarding");
}

export async function loginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const email = str(fd, "email").toLowerCase();
  const password = String(fd.get("password") ?? "");
  const ip = await clientIp();
  if (!(await rateLimit(`login:${hashIp(ip)}:${email}`, 8, 900))) return fail("Too many attempts. Wait 15 minutes or reset your password.");
  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email));
  // Same message and similar timing whether or not the account exists.
  const valid = user ? await verifyPassword(password, user.passwordHash) : await verifyPassword(password, "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA");
  if (!user || !valid) return fail("Email or password is incorrect.");
  if (isAdminEmail(user.email) && !user.isPlatformAdmin) await db.update(users).set({ isPlatformAdmin: true }).where(eq(users.id, user.id));
  await createSession(user.id);
  await audit(null, userActor(user), "user.login", {}, { ip });
  const next = str(fd, "next");
  redirect(next.startsWith("/dashboard") || next.startsWith("/admin") ? next : "/dashboard");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

export async function forgotPasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const email = str(fd, "email").toLowerCase();
  const ip = await clientIp();
  if (!(await rateLimit(`forgot:${hashIp(ip)}`, 5, 3600))) return fail("Too many requests. Try again later.");
  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email));
  if (user) {
    const token = await issueToken("reset_password", { userId: user.id, ttlMinutes: 60 });
    await sendPlatformEmail({ to: user.email, key: "password_reset", vars: { owner_name: user.name, link: appUrl(`/reset-password?token=${token}`) } });
  }
  return ok("If an account exists for that email, we have sent a reset link. It expires in 1 hour.");
}

export async function resetPasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const password = String(fd.get("password") ?? "");
  if (password.length < 10) return fail("Use at least 10 characters.");
  if (password !== String(fd.get("confirm") ?? "")) return fail("The passwords do not match.");
  const row = await consumeToken("reset_password", str(fd, "token"));
  if (!row?.userId) return fail("This reset link is invalid or has expired. Request a new one.");
  const db = await getDb();
  const [user] = await db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, row.userId)).returning();
  await destroyOtherSessions(user.id);
  await audit(null, userActor(user), "user.password_reset");
  await createSession(user.id);
  redirect("/dashboard?reset=1");
}

export async function resendVerificationAction(): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return fail("Sign in first.");
  if (user.emailVerifiedAt) return ok("Your email is already verified.");
  if (!(await rateLimit(`verify:${user.id}`, 3, 3600))) return fail("We already sent a few emails. Check your spam folder or try later.");
  await sendVerification(user);
  return ok(`Verification email sent to ${user.email}.`);
}

export async function changePasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return fail("Sign in first.");
  if (!(await verifyPassword(String(fd.get("current") ?? ""), user.passwordHash))) return fail("Your current password is incorrect.");
  const next = String(fd.get("password") ?? "");
  if (next.length < 10) return fail("Use at least 10 characters.");
  const db = await getDb();
  await db.update(users).set({ passwordHash: await hashPassword(next) }).where(eq(users.id, user.id));
  await destroyOtherSessions(user.id);
  await createSession(user.id);
  await audit(null, userActor(user), "user.password_changed");
  return ok("Password changed. Other devices have been signed out.");
}
