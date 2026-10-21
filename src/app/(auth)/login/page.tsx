import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/forms";
import { Field, Input } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { loginAction } from "../actions";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getCurrentUser()) redirect("/dashboard");
  const { next } = await searchParams;
  return (
    <>
      <h1 className="text-2xl font-bold text-slate-900">Log in</h1>
      <ActionForm action={loginAction} submitLabel="Log in" pendingLabel="Signing in…" className="mt-6">
        <input type="hidden" name="next" value={next ?? ""} />
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </Field>
      </ActionForm>
      <div className="mt-6 flex justify-between text-sm">
        <Link href="/forgot-password" className="text-slate-600 underline">
          Forgot password?
        </Link>
        <Link href="/signup" className="font-semibold text-slate-900 underline">
          Start free trial
        </Link>
      </div>
    </>
  );
}
