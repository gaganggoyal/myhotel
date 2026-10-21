import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton, ActionForm, CopyButton } from "@/components/forms";
import { Alert, Badge, Card, Checkbox, Field, Input, LinkButton, PageHeader, Select, type Tone } from "@/components/ui";
import type { PaymentRequestStatus } from "@/db/schema";
import { requireHotel } from "@/lib/auth";
import { canTransition, getPaymentMethod, PAYMENT_STATUS_LABELS, RESERVATION_STATUS_LABELS, reservationWithPayments, siteBaseUrl } from "@/lib/bookings";
import { formatDate, formatDateTime, formatINR, nightsBetween, paiseToRupeeInput, whatsappLink } from "@/lib/format";
import { reservationStatusAction, requestPaymentAction, resolvePaymentAction } from "../actions";

const PAYMENT_TONE: Record<PaymentRequestStatus, Tone> = {
  unpaid: "warn",
  guest_reported: "info",
  paid: "good",
  needs_review: "bad",
  rejected: "bad",
  cancelled: "neutral",
};

export default async function ReservationDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { hotel } = await requireHotel();
  const data = await reservationWithPayments(hotel.id, id);
  if (!data) notFound();
  const { reservation: r, payments, events } = data;
  const [method, base] = await Promise.all([getPaymentMethod(hotel.id), siteBaseUrl(hotel.id, hotel.slug)]);
  const paid = payments.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount, 0);
  const outstanding = payments.filter((p) => ["unpaid", "guest_reported", "needs_review"].includes(p.status)).reduce((s, p) => s + p.amount, 0);
  const balance = Math.max(0, r.totalAmount - paid);
  const nights = nightsBetween(r.checkIn, r.checkOut);
  const open = r.status !== "cancelled";

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/dashboard/reservations" className="text-slate-600 hover:underline">
          ← All reservations
        </Link>
      </p>
      <PageHeader
        title={`${r.guestName} · ${r.ref}`}
        description={`${formatDate(r.checkIn)} → ${formatDate(r.checkOut)} · ${nights} night${nights === 1 ? "" : "s"} · ${r.roomName}`}
        actions={<Badge tone={r.status === "confirmed" ? "good" : r.status === "cancelled" ? "bad" : "warn"}>{RESERVATION_STATUS_LABELS[r.status]}</Badge>}
      />
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-4">
          <Card title="Money">
            <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-slate-500">Total</dt>
                <dd className="text-lg font-bold">{formatINR(r.totalAmount)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Received</dt>
                <dd className="text-lg font-bold text-emerald-700">{formatINR(paid)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Requested, not received</dt>
                <dd className="text-lg font-bold text-amber-700">{formatINR(outstanding)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Balance</dt>
                <dd className="text-lg font-bold">{formatINR(balance)}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-slate-500">Only payments you mark as received count. A guest’s report or screenshot is not proof of payment.</p>
          </Card>

          <Card title="Payment requests">
            {payments.length ? (
              <ul className="space-y-4">
                {payments.map((p) => {
                  const url = `${base}/pay/${p.token}`;
                  const wa = whatsappLink(r.guestPhone, `Hello ${r.guestName}, here are the payment details for your booking ${r.ref}: ${url}`);
                  return (
                    <li key={p.id} className="rounded-lg border border-slate-200 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-slate-900">
                            {formatINR(p.amount)} · {p.purpose}
                          </p>
                          <p className="text-xs text-slate-500">
                            Requested {formatDateTime(p.createdAt)} · pay by {formatDate(p.expiresAt)} · to {p.payee.payeeName} ({p.payee.vpa})
                          </p>
                        </div>
                        <Badge tone={PAYMENT_TONE[p.status]}>{PAYMENT_STATUS_LABELS[p.status]}</Badge>
                      </div>
                      {p.status === "guest_reported" || p.guestUtr ? (
                        <div className="mt-3 rounded-lg bg-sky-50 p-3 text-sm text-sky-950">
                          <p>
                            Guest reported paying {p.guestReportedAt ? `on ${formatDateTime(p.guestReportedAt)}` : ""} · UTR <strong className="font-mono">{p.guestUtr}</strong> <CopyButton value={p.guestUtr ?? ""} />
                          </p>
                          {p.guestNote ? <p className="mt-1">“{p.guestNote}”</p> : null}
                          {p.guestProofMediaId ? (
                            <a href={`/api/dashboard/private-media/${p.guestProofMediaId}`} target="_blank" rel="noopener" className="mt-1 inline-block font-semibold underline">
                              View screenshot
                            </a>
                          ) : null}
                          <p className="mt-2 text-xs">Search your bank or UPI app for {formatINR(p.amount)} around that time, matching this UTR.</p>
                        </div>
                      ) : null}
                      {p.resolutionNote ? <p className="mt-2 text-sm text-slate-600">Note: {p.resolutionNote}</p> : null}
                      {["unpaid", "guest_reported", "needs_review", "rejected"].includes(p.status) ? (
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                          <CopyButton value={url} label="Copy payment link" />
                          {wa ? (
                            <a href={wa} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-[#1f7a4d] px-2.5 py-1 text-xs font-semibold text-white">
                              Send on WhatsApp
                            </a>
                          ) : null}
                        </div>
                      ) : null}
                      {canTransition(p.status, "paid", "staff") || canTransition(p.status, "needs_review", "staff") ? (
                        <details className="mt-3">
                          <summary className="cursor-pointer text-sm font-semibold text-slate-800">Update this payment</summary>
                          <div className="mt-3 grid gap-4 md:grid-cols-2">
                            {canTransition(p.status, "paid", "staff") ? (
                              <ActionForm action={resolvePaymentAction} submitLabel="Mark as received" className="rounded-lg bg-emerald-50 p-3">
                                <input type="hidden" name="id" value={p.id} />
                                <input type="hidden" name="to" value="paid" />
                                <Checkbox name="confirmSeen" required label={`I have seen ${formatINR(p.amount)} credited in our bank or UPI app.`} />
                                <Checkbox name="notify" defaultChecked label="Email the guest a receipt" />
                              </ActionForm>
                            ) : null}
                            {canTransition(p.status, "needs_review", "staff") ? (
                              <ActionForm action={resolvePaymentAction} submitLabel="Can’t find it yet" submitVariant="secondary" className="rounded-lg bg-amber-50 p-3">
                                <input type="hidden" name="id" value={p.id} />
                                <input type="hidden" name="to" value="needs_review" />
                                <Field label="Note for the guest" htmlFor={`n-${p.id}`}>
                                  <Input id={`n-${p.id}`} name="note" placeholder="No matching credit found yet." />
                                </Field>
                                <Checkbox name="notify" defaultChecked label="Email the guest" />
                              </ActionForm>
                            ) : null}
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {canTransition(p.status, "rejected", "staff") ? <ActionButton action={resolvePaymentAction} label="Not received" variant="secondary" hidden={{ id: p.id, to: "rejected", note: "Payment not received in our account.", notify: "on" }} confirm="Tell the guest this payment was not received?" /> : null}
                            {canTransition(p.status, "cancelled", "staff") ? <ActionButton action={resolvePaymentAction} label="Cancel request" variant="ghost" hidden={{ id: p.id, to: "cancelled" }} confirm="Cancel this payment request? The link will stop accepting reports." /> : null}
                          </div>
                        </details>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-slate-600">No payments requested yet.</p>
            )}

            {open ? (
              method ? (
                <div className="mt-6 border-t border-slate-100 pt-5">
                  <p className="mb-3 font-semibold text-slate-900">Request a payment</p>
                  <ActionForm action={requestPaymentAction} submitLabel="Create payment request">
                    <input type="hidden" name="reservationId" value={r.id} />
                    <div className="grid gap-4 sm:grid-cols-3">
                      <Field label="Amount (₹)" htmlFor="amount">
                        <Input id="amount" name="amount" inputMode="decimal" defaultValue={paiseToRupeeInput(Math.max(0, balance - outstanding)) || ""} required />
                      </Field>
                      <Field label="For" htmlFor="purpose">
                        <Select id="purpose" name="purpose" defaultValue={paid ? "balance" : "deposit"}>
                          <option value="deposit">Deposit</option>
                          <option value="balance">Balance</option>
                          <option value="full">Full payment</option>
                        </Select>
                      </Field>
                      <Field label="Pay within (days)" htmlFor="dueDays">
                        <Input id="dueDays" name="dueDays" type="number" min={1} max={60} defaultValue={3} />
                      </Field>
                    </div>
                    <Checkbox name="notify" defaultChecked label={`Email payment instructions to ${r.guestEmail}`} />
                    <p className="text-xs text-slate-500">
                      The guest gets a secure page with {method.payeeName} · {method.vpa}
                      {method.qrMediaId ? " and your QR code" : ""}. Money goes straight to your account.
                    </p>
                  </ActionForm>
                </div>
              ) : (
                <div className="mt-6">
                  <Alert tone="warn">
                    Add your UPI details on the{" "}
                    <Link href="/dashboard/payments" className="font-semibold underline">
                      Payments page
                    </Link>{" "}
                    to send payment requests.
                  </Alert>
                </div>
              )
            ) : null}
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Guest">
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-slate-500">Email</dt>
                <dd>{r.guestEmail}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Phone</dt>
                <dd>{r.guestPhone}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Guests</dt>
                <dd>
                  {r.adults} adults{r.children ? `, ${r.children} children` : ""}
                </dd>
              </div>
              {r.notes ? (
                <div>
                  <dt className="text-slate-500">Notes</dt>
                  <dd>{r.notes}</dd>
                </div>
              ) : null}
            </dl>
            {r.enquiryId ? (
              <LinkButton href={`/dashboard/enquiries/${r.enquiryId}`} variant="ghost" className="mt-3 px-0">
                View original enquiry →
              </LinkButton>
            ) : null}
          </Card>
          {open ? (
            <Card title="Booking status">
              <div className="flex flex-wrap gap-2">
                {r.status !== "confirmed" ? <ActionButton action={reservationStatusAction} label="Confirm & email guest" variant="primary" hidden={{ id: r.id, status: "confirmed", notify: "on" }} /> : null}
                {r.status === "confirmed" ? <ActionButton action={reservationStatusAction} label="Mark completed" hidden={{ id: r.id, status: "completed" }} /> : null}
                <ActionButton action={reservationStatusAction} label="Cancel booking" variant="danger" hidden={{ id: r.id, status: "cancelled", notify: "on" }} confirm="Cancel this booking and email the guest? Open payment requests will be cancelled. Refunds of direct payments must be sent by you." />
              </div>
            </Card>
          ) : null}
          <Card title="Timeline">
            <ol className="space-y-3 text-sm">
              {events.map((e) => (
                <li key={e.id}>
                  <p className="font-medium text-slate-800">{e.type.replace(/[._]/g, " ")}</p>
                  <p className="text-xs text-slate-500">
                    {formatDateTime(e.createdAt)} · {e.actorLabel}
                  </p>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}
