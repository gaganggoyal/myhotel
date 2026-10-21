import { COMMERCIAL_TERMS, DEFAULT_PLAN, yearlySavings } from "@/lib/billing/plans";
import { formatINR } from "@/lib/format";
import { LinkButton } from "./ui";

export function PricingCard({ cta = true }: { cta?: boolean }) {
  const plan = DEFAULT_PLAN;
  const save = yearlySavings(plan);
  return (
    <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
      <div className="rounded-2xl border-2 border-amber-500 bg-white p-6 shadow-lg sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-wider text-amber-700">{plan.name}</p>
        <p className="mt-2 text-slate-600">{plan.tagline}</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-sm text-slate-600">Monthly</p>
            <p className="mt-1 text-3xl font-bold text-slate-900">
              {formatINR(plan.prices.monthly)}
              <span className="text-base font-medium text-slate-500">/month</span>
            </p>
            <p className="text-xs text-slate-500">+ 18% GST</p>
          </div>
          <div className="rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
            <p className="text-sm text-amber-900">Yearly · save {save.percent}%</p>
            <p className="mt-1 text-3xl font-bold text-slate-900">
              {formatINR(plan.prices.yearly)}
              <span className="text-base font-medium text-slate-500">/year</span>
            </p>
            <p className="text-xs text-slate-600">+ 18% GST · {formatINR(save.paise)} less than monthly</p>
          </div>
        </div>
        <ul className="mt-6 space-y-2 text-sm text-slate-700">
          {plan.features.map((f) => (
            <li key={f} className="flex gap-2">
              <span aria-hidden="true" className="text-emerald-600">
                ✓
              </span>
              {f}
            </li>
          ))}
        </ul>
        {cta ? (
          <LinkButton href="/signup" variant="brand" className="mt-8 w-full py-3 text-base">
            Start your 14-day free trial
          </LinkButton>
        ) : null}
      </div>
      <div className="rounded-2xl bg-slate-900 p-6 text-slate-200 sm:p-8">
        <p className="text-lg font-semibold text-white">The fine print, printed large</p>
        <ul className="mt-4 space-y-3 text-sm leading-relaxed">
          {COMMERCIAL_TERMS.map((t) => (
            <li key={t} className="flex gap-2">
              <span aria-hidden="true" className="text-amber-400">
                •
              </span>
              {t}
            </li>
          ))}
        </ul>
        <p className="mt-6 text-xs text-slate-400">
          UPI payments from guests go straight to your account. Card or UPI gateway fees, if you add a gateway later, are the payment company’s fee, not ours.
        </p>
      </div>
    </div>
  );
}
