import type { Metadata } from "next";
import Link from "next/link";
import { config } from "@/lib/config";

export const metadata: Metadata = { title: "Build your website", robots: { index: false } };

export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-setup className="min-h-screen bg-gradient-to-b from-amber-50 to-slate-50">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-bold text-slate-900">
            <span aria-hidden="true" className="grid h-7 w-7 place-items-center rounded-lg bg-amber-600 text-sm font-black text-white">
              {config.platformName.slice(0, 1)}
            </span>
            {config.platformName}
          </Link>
          <Link href="/dashboard" className="text-sm font-semibold text-slate-600 hover:text-slate-900">
            Save and exit
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-36 pt-6">{children}</main>
    </div>
  );
}
