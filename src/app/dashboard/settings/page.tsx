import { changePasswordAction } from "@/app/(auth)/actions";
import { ActionForm } from "@/components/forms";
import { Card, Field, Input, PageHeader } from "@/components/ui";
import { requireHotel } from "@/lib/auth";
import { getDraft } from "@/lib/hotel";
import { ENQUIRY_RETENTION_MONTHS } from "@/lib/jobs";
import { saveLegalAction } from "../website/actions";
import { Revision } from "../website/shared";

export default async function SettingsPage() {
  const { hotel, user, role } = await requireHotel("manager");
  const { content, revision } = await getDraft(hotel.id);
  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Legal details" description="Used in your website’s privacy notice and footer. You (the business) are responsible for your guests’ data; we process it on your behalf.">
          <ActionForm action={saveLegalAction}>
            <Revision value={revision} />
            <Field label="Business name responsible for guest data" htmlFor="businessName" hint="Your registered business or proprietor name.">
              <Input id="businessName" name="businessName" defaultValue={content.legal.businessName} required />
            </Field>
            <Field label="GSTIN (optional)" htmlFor="gstin" hint="Shown in the footer if provided.">
              <Input id="gstin" name="gstin" defaultValue={content.legal.gstin} maxLength={15} />
            </Field>
            <Field label="Email for privacy requests" htmlFor="grievanceEmail" hint="Guests use this to ask for access, correction or deletion of their data.">
              <Input id="grievanceEmail" name="grievanceEmail" type="email" defaultValue={content.legal.grievanceEmail} />
            </Field>
          </ActionForm>
        </Card>
        <Card title="Your data">
          <p className="text-sm text-slate-700">
            Export everything at any time. Enquiries that never became bookings are anonymised automatically after {ENQUIRY_RETENTION_MONTHS} months.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a href="/api/dashboard/export?type=enquiries" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50">
              Enquiries (CSV)
            </a>
            <a href="/api/dashboard/export?type=reservations" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50">
              Reservations (CSV)
            </a>
            {role === "owner" ? (
              <a href="/api/dashboard/export?type=all" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50">
                Everything (JSON)
              </a>
            ) : null}
          </div>
        </Card>
        <Card title="Password" description={`Signed in as ${user.email}`}>
          <ActionForm action={changePasswordAction} submitLabel="Change password">
            <Field label="Current password" htmlFor="current">
              <Input id="current" name="current" type="password" autoComplete="current-password" required />
            </Field>
            <Field label="New password" htmlFor="password" hint="At least 10 characters. Other devices will be signed out.">
              <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
            </Field>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
