import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { ActionForm } from "@/components/forms";
import { Field, Input, Select } from "@/components/ui";
import { getHotelContext, requireUser } from "@/lib/auth";
import { config } from "@/lib/config";
import { PROPERTY_TYPE_LABELS, PROPERTY_TYPES } from "@/lib/content";
import { INDIAN_STATES } from "@/lib/india";
import { createPropertyAction } from "./actions";

export const metadata: Metadata = { title: "Set up your property" };

export default async function OnboardingPage() {
  const user = await requireUser();
  if (await getHotelContext()) redirect("/dashboard");
  return (
    <>
      <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">Step 1 of 7</p>
      <h1 className="mt-1 text-2xl font-bold text-slate-900">Let’s build your website</h1>
      <p className="mt-1 text-sm text-slate-600">Start with the basics. Next you’ll add photos and rooms, and we’ll write the rest for you.</p>
      <ActionForm action={createPropertyAction} submitLabel="Continue" pendingLabel="Creating…" className="mt-6">
        <Field label="Property name" htmlFor="name">
          <Input id="name" name="name" required minLength={2} maxLength={80} placeholder="River View Retreat" />
        </Field>
        <Field label="Type" htmlFor="type">
          <Select id="type" name="type" defaultValue="hotel">
            {PROPERTY_TYPES.map((t) => (
              <option key={t} value={t}>
                {PROPERTY_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="City / town" htmlFor="city">
            <Input id="city" name="city" required placeholder="Rishikesh" />
          </Field>
          <Field label="State" htmlFor="state">
            <Select id="state" name="state" defaultValue="">
              <option value="">Select…</option>
              {INDIAN_STATES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Phone / WhatsApp for guests" htmlFor="phone">
          <Input id="phone" name="phone" type="tel" defaultValue={user.phone ?? ""} required />
        </Field>
        <details className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
          <summary className="cursor-pointer font-medium text-slate-700">Choose your web address (optional)</summary>
          <Field label="Web address" htmlFor="slug" className="mt-3" hint={`Leave blank and we’ll use your property name. You can connect your own domain later.`}>
            <div className="flex items-center gap-2">
              <Input id="slug" name="slug" placeholder="river-view-retreat" pattern="[a-zA-Z0-9- ]*" />
              <span className="whitespace-nowrap text-sm text-slate-500">.{config.rootHostname}</span>
            </div>
          </Field>
        </details>
      </ActionForm>
    </>
  );
}
