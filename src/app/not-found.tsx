import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-center">
      <div>
        <p className="text-6xl font-bold text-slate-300">404</p>
        <h1 className="mt-4 text-xl font-semibold text-slate-900">Page not found</h1>
        <Link href="/" className="mt-6 inline-block rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white">
          Home
        </Link>
      </div>
    </main>
  );
}
