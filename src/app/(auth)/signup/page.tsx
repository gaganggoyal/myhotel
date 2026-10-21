import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/forms";
import { Field, Input } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { signupAction } from "../actions";

export const metadata: Metadata = { title: "Start your free trial" };

export default async function SignupPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  return (
    <>
      <h1 className="text-2xl font-bold text-slate-900">Create your hotel website</h1>
      <p className="mt-1 text-sm text-slate-600">14 days free. No card needed.</p>
      <ActionForm action={signupAction} submitLabel="Create account" pendingLabel="Creating…" className="mt-6">
        <Field label="Your name" htmlFor="name">
          <Input id="name" name="name" autoComplete="name" required />
        </Field>
        <Field label="Email" htmlFor="email" hint="Guest enquiries will be sent here until you choose another address.">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Mobile number" htmlFor="phone">
          <Input id="phone" name="phone" type="tel" autoComplete="tel" inputMode="tel" required placeholder="+91 98xxx xxxxx" />
        </Field>
        <Field label="Password" htmlFor="password" hint="At least 10 characters.">
          <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
        </Field>
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" name="terms" required className="mt-0.5 h-4 w-4" />
          <span>
            I agree to the{" "}
            <Link href="/legal/terms" className="underline">
              terms
            </Link>{" "}
            and{" "}
            <Link href="/legal/privacy" className="underline">
              privacy policy
            </Link>
            .
          </span>
        </label>
      </ActionForm>
      <p className="mt-6 text-center text-sm text-slate-600">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-slate-900 underline">
          Log in
        </Link>
      </p>
    </>
  );
}
