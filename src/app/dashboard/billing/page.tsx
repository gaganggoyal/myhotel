import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { ActionButton, ActionForm } from "@/components/forms";
import { Alert, Badge, Card, PageHeader, Table, Td } from "@/components/ui";
import { requireHotel } from "@/lib/auth";
import { COMMERCIAL_TERMS, getPlan, priceWithGst, yearlySavings } from "@/lib/billing/plans";
import { getSubscription, STATUS_LABELS } from "@/lib/billing/subscription";
import { config } from "@/lib/config";
import { formatDate, formatINR } from "@/lib/format";
import { cancelSubscriptionAction, subscribeAction } from "./actions";

export default async function BillingPage() {
  const { hotel, role } = await requireHotel("manager");
  const db = await getDb();
  const [sub, invoices] = await Promise.all([getSubscription(hotel.id), db.select().from(schema.billingInvoices).where(eq(schema.billingInvoices.hotelId, hotel.id)).orderBy(desc(schema.billingInvoices.createdAt)).limit(24)]);
  const plan = getPlan(sub?.planKey);
  const save = yearlySavings(plan);
  const paid = sub && ["active", "past_due", "grace_period"].includes(sub.status);

  return (
    <>
      <PageHeader title="Plan & billing" description="One printed price. No setup fee and no commission on your bookings." />
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <Card title={plan.name} actions={sub ? <Badge tone={sub.status === "active" ? "good" : sub.status === "trialing" ? "info" : "warn"}>{STATUS_LABELS[sub.status]}</Badge> : null}>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {sub?.status === "trialing" ? (
              <div>
                <dt className="text-slate-500">Trial ends</dt>
                <dd className="font-semibold">{formatDate(sub.trialEndsAt)}</dd>
              </div>
            ) : null}
            {sub?.currentPeriodEnd ? (
              <div>
                <dt className="text-slate-500">{sub.status === "cancelled" ? "Online until" : "Renews on"}</dt>
                <dd className="font-semibold">{formatDate(sub.currentPeriodEnd)}</dd>
              </div>
            ) : null}
            {paid ? (
              <div>
                <dt className="text-slate-500">Billing</dt>
                <dd className="font-semibold capitalize">
                  {sub.interval} · {formatINR(priceWithGst(plan.prices[sub.interval], plan.gstRate))} incl. GST
                </dd>
              </div>
            ) : null}
            {sub?.graceEndsAt && sub.status === "grace_period" ? (
              <div>
                <dt className="text-slate-500">Grace period ends</dt>
                <dd className="font-semibold text-red-700">{formatDate(sub.graceEndsAt)}</dd>
              </div>
            ) : null}
          </dl>

          {sub?.status === "past_due" || sub?.status === "grace_period" ? (
            <div className="mt-4">
              <Alert tone="warn">Your last renewal payment failed. Your site stays online during the grace period. {sub.checkoutUrl ? <a href={sub.checkoutUrl} className="font-semibold underline">Update payment method</a> : null}</Alert>
            </div>
          ) : null}

          {role === "owner" && !paid ? (
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {(["monthly", "yearly"] as const).map((interval) => (
                <div key={interval} className={`rounded-xl p-5 ring-1 ${interval === "yearly" ? "bg-amber-50 ring-amber-300" : "bg-slate-50 ring-slate-200"}`}>
                  <p className="text-sm font-semibold capitalize text-slate-700">
                    {interval}
                    {interval === "yearly" ? ` · save ${save.percent}%` : ""}
                  </p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">
                    {formatINR(plan.prices[interval])}
                    <span className="text-sm font-medium text-slate-500">/{interval === "yearly" ? "year" : "month"}</span>
                  </p>
                  <p className="text-xs text-slate-500">{formatINR(priceWithGst(plan.prices[interval], plan.gstRate))} including 18% GST</p>
                  <ActionForm action={subscribeAction} submitLabel={`Choose ${interval}`} submitVariant={interval === "yearly" ? "brand" : "primary"} className="mt-4" pendingLabel="Opening…">
                    <input type="hidden" name="interval" value={interval} />
                  </ActionForm>
                </div>
              ))}
              <p className="text-xs text-slate-500 sm:col-span-2">
                {config.billing.provider === "razorpay" ? "You’ll authorise UPI AutoPay or a card on Razorpay’s secure page." : "Development mode: billing is simulated and no money moves."}
              </p>
            </div>
          ) : null}

          {role === "owner" && paid ? (
            <div className="mt-6 border-t border-slate-100 pt-4">
              <ActionButton action={cancelSubscriptionAction} label="Cancel plan" variant="ghost" confirm="Cancel your plan? Your site stays online until the end of the paid period, then shows a maintenance page. Nothing is deleted." />
            </div>
          ) : null}
        </Card>
        <Card title="Our billing promises">
          <ul className="space-y-2 text-sm text-slate-700">
            {COMMERCIAL_TERMS.map((t) => (
              <li key={t}>• {t}</li>
            ))}
          </ul>
        </Card>
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold text-slate-900">Payments</h2>
      {invoices.length ? (
        <Table head={["Date", "Amount", "Period until", "Reference"]}>
          {invoices.map((i) => (
            <tr key={i.id}>
              <Td>{formatDate(i.createdAt)}</Td>
              <Td>{formatINR(i.amount)}</Td>
              <Td>{formatDate(i.periodEnd)}</Td>
              <Td className="font-mono text-xs">{i.providerPaymentId ?? i.provider}</Td>
            </tr>
          ))}
        </Table>
      ) : (
        <p className="text-sm text-slate-600">No payments yet.</p>
      )}
    </>
  );
}
