import type { Metadata } from "next";
import { ActionForm } from "@/components/forms";
import { Field, Input } from "@/components/ui";
import { resetPasswordAction } from "../actions";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return (
    <>
      <h1 className="text-2xl font-bold text-slate-900">Choose a new password</h1>
      <ActionForm action={resetPasswordAction} submitLabel="Save password" className="mt-6">
        <input type="hidden" name="token" value={token} />
        <Field label="New password" htmlFor="password" hint="At least 10 characters.">
          <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
        </Field>
        <Field label="Confirm password" htmlFor="confirm">
          <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} required />
        </Field>
      </ActionForm>
    </>
  );
}
