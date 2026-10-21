import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { getDb, schema } from "@/db";
import { buttonClass } from "@/components/ui";
import { audit } from "@/lib/audit";
import { consumeToken } from "@/lib/tokens";

export const metadata: Metadata = { title: "Confirm reply-to address" };

export default async function VerifyReplyToPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const row = await consumeToken("verify_reply_to", token);
  const email = row?.data?.email;
  if (row?.hotelId && email) {
    const db = await getDb();
    await db.update(schema.hotels).set({ replyToEmail: email, replyToVerifiedAt: new Date() }).where(eq(schema.hotels.id, row.hotelId));
    await audit(row.hotelId, { userId: row.userId, label: email }, "reply_to.verified", { email });
  }
  return (
    <div className="text-center">
      <h1 className="text-2xl font-bold text-slate-900">{email ? "Address confirmed" : "Link expired"}</h1>
      <p className="mt-2 text-slate-600">{email ? `Guest replies and enquiry alerts now go to ${email}.` : "This link is invalid or was already used. Request a new one from the Guest emails page."}</p>
      <Link href="/dashboard/emails" className={buttonClass("primary", "mt-6")}>
        Back to dashboard
      </Link>
    </div>
  );
}
