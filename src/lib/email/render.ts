import { escapeHtml } from "../format";
import type { TemplateDef, Vars } from "./catalog";

export type Brand = {
  /** Shown in the header. Hotel name for hotel streams, platform name for platform mail. */
  name: string;
  color: string;
  /** Locked footer lines: who sent this and why. */
  footer: string[];
};

const VAR_RE = /\{\{\s*([a-z_]+)\s*\}\}/g;

export function interpolate(template: string, vars: Vars): string {
  return template.replace(VAR_RE, (_, key: string) => vars[key] ?? "");
}

/** Variables in owner copy are escaped in HTML; owner copy itself can never inject markup. */
function paragraphsHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 16px;line-height:1.6">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function renderEmail(
  def: TemplateDef,
  copy: { subject: string; body: string },
  vars: Vars,
  brand: Brand,
): { subject: string; html: string; text: string } {
  const subject = interpolate(copy.subject, vars).replace(/\s+/g, " ").trim().slice(0, 200);
  const body = interpolate(copy.body, vars);
  const facts = (def.facts?.(vars) ?? []).filter(([, v]) => v && v.trim());
  const cta = def.cta?.(vars) ?? null;
  const notice = def.notice ? interpolate(def.notice(vars) ?? "", vars) : "";
  const color = /^#[0-9a-fA-F]{6}$/.test(brand.color) ? brand.color : "#1f2937";

  const factsHtml = facts.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin:8px 0 20px;background:#f9fafb;border-radius:8px">${facts
        .map(
          ([label, value]) =>
            `<tr><td style="padding:8px 14px;color:#6b7280;font-size:13px;width:40%;vertical-align:top">${escapeHtml(label)}</td><td style="padding:8px 14px;color:#111827;font-size:14px;font-weight:600">${escapeHtml(value ?? "").replace(/\n/g, "<br>")}</td></tr>`,
        )
        .join("")}</table>`
    : "";

  const ctaHtml = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px"><tr><td style="background:${color};border-radius:8px"><a href="${escapeHtml(cta.url)}" style="display:inline-block;padding:12px 22px;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px">${escapeHtml(cta.label)}</a></td></tr></table>`
    : "";

  const noticeHtml = notice
    ? `<p style="margin:0 0 16px;padding:12px 14px;border-left:3px solid ${color};background:#fffbeb;color:#374151;font-size:13px;line-height:1.5">${escapeHtml(notice)}</p>`
    : "";

  const footerHtml = brand.footer.map((l) => `<p style="margin:0 0 6px">${escapeHtml(l)}</p>`).join("");

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:${color};padding:20px 28px;color:#ffffff;font-size:20px;font-weight:700">${escapeHtml(brand.name)}</td></tr>
<tr><td style="padding:28px;font-size:15px">${paragraphsHtml(body)}${factsHtml}${ctaHtml}${noticeHtml}</td></tr>
<tr><td style="padding:18px 28px;background:#f9fafb;color:#6b7280;font-size:12px;line-height:1.5">${footerHtml}</td></tr>
</table></td></tr></table></body></html>`;

  const textParts = [
    body.trim(),
    facts.length ? facts.map(([l, v]) => `${l}: ${v}`).join("\n") : "",
    cta ? `${cta.label}: ${cta.url}` : "",
    notice,
    "--",
    brand.footer.join("\n"),
  ].filter(Boolean);

  return { subject, html, text: textParts.join("\n\n") };
}
