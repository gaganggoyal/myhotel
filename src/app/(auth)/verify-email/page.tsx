import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { getDb, schema } from "@/db";
import { buttonClass } from "@/components/ui";
import { getHotelContext } from "@/lib/auth";
import { consumeToken } from "@/lib/tokens";

export const metadata: Metadata = { title: "Verify email" };

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const row = await consumeToken("verify_email", token);
  if (row?.userId) {
    const db = await getDb();
    await db.update(schema.users).set({ emailVerifiedAt: new Date() }).where(eq(schema.users.id, row.userId));
  }
  // Owners who finished quick setup before verifying go straight back to publish.
  const ctx = row ? await getHotelContext() : null;
  const finishSetup = ctx?.user.id === row?.userId && !ctx?.hotel.publishedVersionId;
  return (
    <div className="text-center">
      <h1 className="text-2xl font-bold text-slate-900">{row ? "Email verified" : "Link expired"}</h1>
      <p className="mt-2 text-slate-600">{row ? "Thanks. You can now publish your website." : "This verification link is invalid or was already used. Request a new one from your dashboard."}</p>
      <Link href={finishSetup ? "/setup?step=finish" : "/dashboard"} className={buttonClass(finishSetup ? "brand" : "primary", "mt-6")}>
        {finishSetup ? "Put my website live" : "Go to dashboard"}
      </Link>
    </div>
  );
}
