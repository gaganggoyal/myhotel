import Link from "next/link";
import { LinkButton } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { config } from "@/lib/config";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
            <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-lg bg-amber-600 text-sm font-black text-white">
              {config.platformName.slice(0, 1)}
            </span>
            {config.platformName}
          </Link>
          <nav aria-label="Main" className="flex items-center gap-1 text-sm font-medium sm:gap-3">
            <Link href="/pricing" className="rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-100">
              Pricing
            </Link>
            {user ? (
              <LinkButton href="/dashboard">Dashboard</LinkButton>
            ) : (
              <>
                <Link href="/login" className="rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-100">
                  Log in
                </Link>
                <LinkButton href="/signup" variant="brand" className="hidden sm:inline-flex">
                  Start free trial
                </LinkButton>
              </>
            )}
          </nav>
        </div>
      </header>
      <main id="main" className="flex-1">
        {children}
      </main>
      <footer className="border-t border-slate-200 bg-slate-50">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-slate-600 sm:px-6">
          <p>
            © {new Date().getFullYear()} {config.platformName} · Websites for independent hotels, homestays and guest houses
          </p>
          <nav aria-label="Legal" className="flex gap-4">
            <Link href="/pricing">Pricing</Link>
            <Link href="/legal/terms">Terms</Link>
            <Link href="/legal/privacy">Privacy</Link>
            <a href={`mailto:${config.email.support}`}>Support</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
