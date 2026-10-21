import type { Metadata } from "next";
import Link from "next/link";
import { logoutAction } from "@/app/(auth)/actions";
import { requireAdmin } from "@/lib/auth";
import { config } from "@/lib/config";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };

const NAV = [
  { href: "/admin", label: "Hotels" },
  { href: "/admin/payment-changes", label: "Payment detail changes" },
  { href: "/admin/domains", label: "Domains" },
  { href: "/admin/emails", label: "Email log" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-slate-900 text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <p className="font-semibold">
            {config.platformName} admin <span className="ml-2 text-xs font-normal text-slate-400">{admin.email}</span>
          </p>
          <nav className="flex flex-wrap items-center gap-1 text-sm">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="rounded-lg px-3 py-1.5 text-slate-200 hover:bg-white/10">
                {n.label}
              </Link>
            ))}
            <Link href="/dashboard" className="rounded-lg px-3 py-1.5 text-slate-200 hover:bg-white/10">
              My dashboard
            </Link>
            <form action={logoutAction}>
              <button className="rounded-lg px-3 py-1.5 text-slate-300 hover:bg-white/10">Log out</button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
