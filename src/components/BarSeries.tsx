import { formatDate } from "@/lib/format";

/**
 * Single-series daily bar chart. One hue (no legend: the title names the series), thin
 * bars with a 2px gap, rounded data-ends anchored to the baseline, native per-bar hover
 * tooltips, and a table view for screen readers and exact values.
 */
export function BarSeries({ title, data, unit, color = "#334155" }: { title: string; data: { day: string; value: number }[]; unit: string; color?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <figure className="rounded-xl border border-slate-200 bg-white p-5">
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold text-slate-900">{title}</span>
        <span className="text-xs text-slate-500">
          {total} {unit} · peak {max}
        </span>
      </figcaption>
      <div className="relative mt-4 h-36" aria-hidden="true">
        <div className="absolute inset-x-0 top-0 border-t border-dashed border-slate-200" />
        <span className="absolute -top-2 right-0 bg-white pl-1 text-[10px] text-slate-400">{max}</span>
        <div className="absolute inset-0 flex items-end gap-[2px] border-b border-slate-300">
          {data.map((d) => (
            <div key={d.day} className="group relative flex h-full flex-1 items-end" title={`${formatDate(d.day)}: ${d.value} ${unit}`}>
              <div className="w-full rounded-t-[4px] transition-opacity group-hover:opacity-80" style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value ? 2 : 0, background: color }} />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-slate-500" aria-hidden="true">
        <span>{formatDate(data[0]?.day, { year: undefined })}</span>
        <span>{formatDate(data[data.length - 1]?.day, { year: undefined })}</span>
      </div>
      <details className="mt-3 text-xs">
        <summary className="cursor-pointer text-slate-600">Show as table</summary>
        <table className="mt-2 w-full text-left">
          <thead>
            <tr className="text-slate-500">
              <th className="py-1 font-medium">Day</th>
              <th className="py-1 text-right font-medium">{unit}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.day} className="border-t border-slate-100">
                <td className="py-1">{formatDate(d.day)}</td>
                <td className="py-1 text-right tabular-nums">{d.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
