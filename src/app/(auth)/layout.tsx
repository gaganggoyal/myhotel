import Link from "next/link";
import { config } from "@/lib/config";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center bg-gradient-to-b from-amber-50 to-slate-50 px-4 py-10">
      <Link href="/" className="mb-8 flex items-center gap-2 text-lg font-bold text-slate-900">
        <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-lg bg-amber-600 text-sm font-black text-white">
          {config.platformName.slice(0, 1)}
        </span>
        {config.platformName}
      </Link>
      <main className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-200 sm:p-8">{children}</main>
    </div>
  );
}
