import { getDb, schema } from "@/db";
import { hashIp } from "./crypto";

export type AuditActor = { userId: string | null; label: string };

export async function audit(
  hotelId: string | null,
  actor: AuditActor,
  action: string,
  data?: Record<string, unknown>,
  opts: { target?: string; ip?: string } = {},
): Promise<void> {
  const db = await getDb();
  await db.insert(schema.auditLogs).values({
    hotelId,
    actorUserId: actor.userId,
    actorLabel: actor.label,
    action,
    target: opts.target ?? null,
    data: data ?? null,
    ipHash: opts.ip ? hashIp(opts.ip, "audit") : null,
  });
}

export function userActor(user: { id: string; email: string }): AuditActor & { userId: string } {
  return { userId: user.id, label: user.email };
}

export const SYSTEM_ACTOR: AuditActor = { userId: null, label: "system" };
export const GUEST_ACTOR: AuditActor = { userId: null, label: "guest" };
