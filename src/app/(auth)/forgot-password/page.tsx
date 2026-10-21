import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/forms";
import { Field, Input } from "@/components/ui";
import { forgotPasswordAction } from "../actions";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-2xl font-bold text-slate-900">Reset your password</h1>
      <p className="mt-1 text-sm text-slate-600">We’ll email you a link to choose a new one.</p>
      <ActionForm action={forgotPasswordAction} submitLabel="Send reset link" pendingLabel="Sending…" className="mt-6">
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
      </ActionForm>
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="underline">
          Back to log in
        </Link>
      </p>
    </>
  );
}
