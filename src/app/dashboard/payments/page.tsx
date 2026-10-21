import { ActionForm } from "@/components/forms";
import { Alert, Card, Checkbox, Field, Input, PageHeader } from "@/components/ui";
import { requireHotel } from "@/lib/auth";
import { getPaymentMethod } from "@/lib/bookings";
import { formatDateTime } from "@/lib/format";
import { savePaymentMethodAction } from "./actions";

export default async function PaymentsPage() {
  const { hotel, role } = await requireHotel("manager");
  const pm = await getPaymentMethod(hotel.id);
  return (
    <>
      <PageHeader
        title="UPI payments"
        description="Guests pay your own UPI ID or QR directly from a secure payment page that you send for each booking. The money never passes through us, so we can’t see it arrive: you mark each payment received after checking your bank or UPI app."
      />
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <Card title={pm ? "Your payment details" : "Add your UPI details"}>
          {pm?.qrWarning ? (
            <div className="mb-4">
              <Alert tone="warn" title="Check your QR">
                {pm.qrWarning}
              </Alert>
            </div>
          ) : null}
          {role !== "owner" ? (
            <Alert tone="info">Only the account owner can change payment details.</Alert>
          ) : (
            <ActionForm action={savePaymentMethodAction} submitLabel="Save payment details" encType="multipart/form-data">
              <Field label="Account holder name (as your bank shows it)" htmlFor="payeeName" hint="Guests’ UPI apps show the bank-registered name, which may differ from your hotel name. We tell guests which name to expect.">
                <Input id="payeeName" name="payeeName" defaultValue={pm?.payeeName} required maxLength={100} placeholder="RIVER VIEW HOSPITALITY" />
              </Field>
              <Field label="UPI ID" htmlFor="vpa">
                <Input id="vpa" name="vpa" defaultValue={pm?.vpa} required placeholder="riverview@okaxis" autoComplete="off" />
              </Field>
              <Field label="QR code image (optional)" htmlFor="qr" hint="Download the full-size QR from your bank or UPI business app (PhonePe, Paytm, Google Pay for Business). PNG is best. We never crop or redraw it, and it is only shown on payment pages.">
                <input id="qr" name="qr" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="block w-full text-sm" />
              </Field>
              {pm?.qrMediaId ? <Checkbox name="removeQr" label="Remove the current QR image (guests will see the UPI ID only)" /> : null}
              <Field label="Note for guests (optional)" htmlFor="note">
                <Input id="note" name="note" defaultValue={pm?.note ?? ""} maxLength={200} placeholder="Please add your booking reference in the payment note." />
              </Field>
              <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
                <Checkbox name="attest" required label="I confirm this UPI ID and QR belong to my business, and I will check my account before marking any payment as received." />
                <Field label="Your password" htmlFor="password" hint="Required for every change. We also email you whenever payment details change.">
                  <Input id="password" name="password" type="password" autoComplete="current-password" required />
                </Field>
              </div>
            </ActionForm>
          )}
        </Card>
        <div className="space-y-4">
          {pm ? (
            <Card title="What guests see">
              <div className="flex flex-col items-center gap-3 text-center">
                {pm.qrMediaId ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/dashboard/private-media/${pm.qrMediaId}`} alt={`UPI QR for ${pm.payeeName}`} className="h-56 w-56 rounded bg-white object-contain p-2 ring-1 ring-slate-200" />
                ) : (
                  <p className="text-sm text-slate-500">No QR image. Guests see your UPI ID and a “Pay in UPI app” button.</p>
                )}
                <p className="text-sm">
                  Pay to <strong>{pm.payeeName}</strong>
                  <br />
                  UPI ID <strong className="font-mono">{pm.vpa}</strong>
                </p>
                <p className="text-xs text-slate-500">Last confirmed {formatDateTime(pm.attestedAt)}</p>
              </div>
            </Card>
          ) : null}
          <Card title="How payment confirmation works">
            <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
              <li>Open a reservation and request a deposit or balance.</li>
              <li>The guest gets an email and a link with the amount, your UPI ID and QR.</li>
              <li>They pay in their UPI app and tap “I have paid” with the UTR number.</li>
              <li>You check your bank or UPI app and mark it received. Only then does it count.</li>
            </ol>
            <p className="mt-3 text-xs text-slate-500">Online gateway links (Razorpay and others) that confirm automatically are on the roadmap.</p>
          </Card>
        </div>
      </div>
    </>
  );
}
