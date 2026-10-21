"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

export type NavGroup = { title: string; items: { href: string; label: string; badge?: number }[] };

export function DashboardNav({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/dashboard" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));
  return (
    <nav aria-label="Dashboard" className="space-y-6">
      {groups.map((g) => (
        <div key={g.title}>
          <p className="px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">{g.title}</p>
          <ul className="mt-2 space-y-0.5">
            {g.items.map((i) => (
              <li key={i.href}>
                <Link
                  href={i.href}
                  aria-current={isActive(i.href) ? "page" : undefined}
                  className={cx(
                    "flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium",
                    isActive(i.href) ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100",
                  )}
                >
                  {i.label}
                  {i.badge ? <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">{i.badge}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
