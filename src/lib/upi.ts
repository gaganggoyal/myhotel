// UPI helpers. The platform never decodes-and-redraws an owner's QR: the guest sees the
// uploaded image as-is, and the "Pay in UPI app" link is built from the typed text fields.

const VPA_RE = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,63}$/;

export function isValidVpa(vpa: string): boolean {
  return VPA_RE.test(vpa.trim());
}

export function normalizeVpa(vpa: string): string {
  return vpa.trim().toLowerCase();
}

export type UpiPayload = { pa?: string; pn?: string; am?: string; cu?: string; tn?: string; tr?: string; mc?: string };

/** Parses a upi://pay?... payload. Returns null for anything that is not a UPI pay URI. */
export function parseUpiUri(payload: string): UpiPayload | null {
  const trimmed = payload.trim();
  if (!/^upi:\/\/pay\?/i.test(trimmed)) return null;
  const query = trimmed.slice(trimmed.indexOf("?") + 1);
  const params = new URLSearchParams(query);
  const out: UpiPayload = {};
  for (const key of ["pa", "pn", "am", "cu", "tn", "tr", "mc"] as const) {
    const v = params.get(key);
    if (v) out[key] = v;
  }
  return out;
}

/**
 * Builds a UPI intent link that opens the guest's UPI app with fields prefilled.
 * It is a convenience only: it does not notify this website when the guest pays.
 */
export function buildUpiIntent(input: { vpa: string; payeeName: string; amountPaise?: number | null; note?: string | null }): string {
  const params = new URLSearchParams();
  params.set("pa", input.vpa);
  params.set("pn", input.payeeName.slice(0, 50));
  if (input.amountPaise && input.amountPaise > 0) params.set("am", (input.amountPaise / 100).toFixed(2));
  params.set("cu", "INR");
  if (input.note) params.set("tn", input.note.slice(0, 50));
  return `upi://pay?${params.toString().replace(/\+/g, "%20")}`;
}

/** Compares a decoded QR payload with the VPA the owner typed. Warns, never blocks. */
export function qrConsistencyWarning(decoded: string | null, typedVpa: string): string | null {
  if (decoded == null) {
    return "We could not read this QR image. Check that it scans with your own UPI app before guests rely on it.";
  }
  const upi = parseUpiUri(decoded);
  if (!upi) {
    return "This QR is not a standard UPI payment code (it may be Bharat QR or another scheme). Make sure it pays the UPI ID you entered.";
  }
  if (!upi.pa) return "This UPI QR does not contain a UPI ID.";
  if (normalizeVpa(upi.pa) !== normalizeVpa(typedVpa)) {
    return `This QR pays ${upi.pa}, but you entered ${typedVpa}. Guests would pay the QR's account. Upload the QR for ${typedVpa} or correct the UPI ID.`;
  }
  return null;
}

/** UPI transaction references (UTR/RRN) are 12 digits; other rails use up to ~35 characters. */
export function normalizeUtr(input: string): string | null {
  const cleaned = input.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z0-9]{6,35}$/.test(cleaned)) return null;
  return cleaned;
}
