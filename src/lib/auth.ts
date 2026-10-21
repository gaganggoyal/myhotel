import { and, eq, gt } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb, schema } from "@/db";
import { config } from "./config";
import { randomToken, sha256 } from "./crypto";

const { users, sessions, memberships, hotels } = schema;

/**
 * Host-only session cookie. `__Host-` forces Secure, Path=/ and no Domain attribute, so the
 * cookie is never sent to hotel subdomains that share the platform's parent domain.
 */
export const SESSION_COOKIE = config.protocol === "https" ? "__Host-mh_session" : "mh_session";
const SESSION_DAYS = 30;

export type SessionUser = typeof users.$inferSelect;

export async function createSession(userId: string): Promise<void> {
  const db = await getDb();
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  const h = await headers();
  await db.insert(sessions).values({
    id: sha256(token),
    userId,
    expiresAt,
    userAgent: h.get("user-agent")?.slice(0, 200) ?? null,
  });
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: config.protocol === "https",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.delete(sessions).where(eq(sessions.id, sha256(token)));
  }
  jar.delete(SESSION_COOKIE);
}

export async function destroyOtherSessions(userId: string): Promise<void> {
  const db = await getDb();
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

/** The signed-in user for this request, or null. Memoised per request. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const rows = await db
    .select({ user: users, session: sessions })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, sha256(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return rows[0]?.user ?? null;
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.isPlatformAdmin) redirect("/dashboard");
  return user;
}

export type HotelContext = {
  user: SessionUser;
  hotel: typeof hotels.$inferSelect;
  role: schema.Role;
};

const ROLE_RANK: Record<schema.Role, number> = { front_desk: 1, manager: 2, owner: 3 };

/** The signed-in user's property. An account owns one property in this release. */
export const getHotelContext = cache(async (): Promise<HotelContext | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  const db = await getDb();
  const rows = await db
    .select({ hotel: hotels, role: memberships.role })
    .from(memberships)
    .innerJoin(hotels, eq(hotels.id, memberships.hotelId))
    .where(eq(memberships.userId, user.id))
    .orderBy(memberships.createdAt)
    .limit(1);
  if (!rows[0]) return null;
  return { user, hotel: rows[0].hotel, role: rows[0].role };
});

/**
 * Use at the top of every dashboard page and server action. Proxy is not an auth boundary.
 * `minRole` gates sensitive areas (payment details, billing, domain) to owners/managers.
 */
export async function requireHotel(minRole: schema.Role = "front_desk"): Promise<HotelContext> {
  const user = await requireUser();
  const ctx = await getHotelContext();
  if (!ctx) {
    if (user.isPlatformAdmin) redirect("/admin");
    redirect("/onboarding");
  }
  if (ROLE_RANK[ctx.role] < ROLE_RANK[minRole]) redirect("/dashboard?denied=1");
  return ctx;
}

export function isAdminEmail(email: string): boolean {
  return config.adminEmails.includes(email.toLowerCase());
}
