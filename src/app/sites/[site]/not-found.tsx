import Link from "next/link";

export default function SiteNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-6 text-center">
      <div>
        <p className="text-6xl font-bold text-neutral-300">404</p>
        <h1 className="mt-4 text-xl font-semibold text-neutral-900">We couldn’t find that page.</h1>
        <Link href="/" className="mt-6 inline-block rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white">
          Back to home
        </Link>
      </div>
    </main>
  );
}
