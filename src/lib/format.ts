// Display helpers shared by the dashboard, hotel sites and emails.

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2, minimumFractionDigits: 0 });

/** Formats integer paise as rupees, e.g. 249900 -> "₹2,499". */
export function formatINR(paise: number): string {
  return inr.format(paise / 100);
}

/** Parses "2,499.50" / "₹2499" into integer paise. Returns null for invalid input. */
export function parseRupeesToPaise(input: string | null | undefined): number | null {
  if (input == null) return null;
  const cleaned = String(input).replace(/[₹,\s]/g, "");
  if (!cleaned) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

export function paiseToRupeeInput(paise: number | null | undefined): string {
  if (paise == null) return "";
  const r = paise / 100;
  return Number.isInteger(r) ? String(r) : r.toFixed(2);
}

const TZ = "Asia/Kolkata";

export function formatDate(value: string | Date | null | undefined, opts: Intl.DateTimeFormatOptions = {}): string {
  if (!value) return "—";
  const d = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00+05:30`) : new Date(value);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: TZ, ...opts });
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: TZ,
  });
}

/** Today's date in India as YYYY-MM-DD. */
export function todayIST(now = new Date()): string {
  return new Date(now.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

export function nightsBetween(checkIn: string | null | undefined, checkOut: string | null | undefined): number {
  if (!checkIn || !checkOut) return 0;
  const ms = Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`);
  return Math.max(0, Math.round(ms / 86_400_000));
}

/** Indian mobile numbers without a country code get +91; returns digits only for wa.me. */
export function whatsappDigits(phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
  return digits;
}

export function whatsappLink(phone: string | null | undefined, text?: string): string | null {
  const digits = whatsappDigits(phone);
  if (digits.length < 10) return null;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

export function telLink(phone: string | null | undefined): string | null {
  const cleaned = (phone ?? "").replace(/[^\d+]/g, "");
  return cleaned.length >= 8 ? `tel:${cleaned}` : null;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/** Whole days from now until `date` (never negative). */
export function daysUntil(date: Date, now = new Date()): number {
  return Math.max(0, Math.ceil((date.getTime() - now.getTime()) / 86_400_000));
}

/** The moment `days` days before now. */
export function daysBefore(days: number, now = new Date()): Date {
  return new Date(now.getTime() - days * 86_400_000);
}
