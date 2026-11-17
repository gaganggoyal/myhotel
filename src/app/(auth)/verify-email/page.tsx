import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { getDb, schema } from "@/db";
import { buttonClass } from "@/components/ui";
import { getCurrentUser, getHotelContext } from "@/lib/auth";
import { consumeToken } from "@/lib/tokens";

export const metadata: Metadata = { title: "Verify email" };

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const row = await consumeToken("verify_email", token);
  if (row?.userId) {
    const db = await getDb();
    await db.update(schema.users).set({ emailVerifiedAt: new Date() }).where(eq(schema.users.id, row.userId));
  }
  // Mail scanners sometimes open the link first; a signed-in owner who is verified is told so.
  const verified = Boolean(row) || Boolean((await getCurrentUser())?.emailVerifiedAt);
  // Owners who finished quick setup before verifying go straight back to publish.
  const ctx = verified ? await getHotelContext() : null;
  const finishSetup = Boolean(ctx) && (!row || ctx?.user.id === row.userId) && !ctx?.hotel.publishedVersionId;
  return (
    <div className="text-center">
      <h1 className="text-2xl font-bold text-slate-900">{row ? "Email verified" : verified ? "Email already verified" : "Link expired"}</h1>
      <p className="mt-2 text-slate-600">{verified ? "Thanks. You can now publish your website." : "This verification link is invalid or was already used. Request a new one from your dashboard."}</p>
      <Link href={finishSetup ? "/setup?step=finish" : "/dashboard"} className={buttonClass(finishSetup ? "brand" : "primary", "mt-6")}>
        {finishSetup ? "Put my website live" : "Go to dashboard"}
      </Link>
    </div>
  );
}
