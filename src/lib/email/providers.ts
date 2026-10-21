import { config } from "../config";

export type OutgoingEmail = {
  id: string;
  hotelId: string | null;
  stream: string;
  from: string;
  to: string;
  replyTo: string | null;
  subject: string;
  html: string;
  text: string;
};

export type DeliveryResult = { ok: true; providerMessageId: string } | { ok: false; error: string; retryable: boolean };

async function sendConsole(m: OutgoingEmail): Promise<DeliveryResult> {
  // Development: the message is already stored in email_messages (see /admin/emails).
  // Print the text part so verification and reset links are clickable from the terminal.
  console.log(`\n[email:console] ${m.stream} → ${m.to}\n  From: ${m.from}\n  Subject: ${m.subject}\n${m.text.split("\n").map((l) => `  | ${l}`).join("\n")}\n`);
  return { ok: true, providerMessageId: `console-${m.id}` };
}

async function sendResend(m: OutgoingEmail): Promise<DeliveryResult> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.email.resendKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": m.id,
      },
      body: JSON.stringify({
        from: m.from,
        to: [m.to],
        subject: m.subject,
        html: m.html,
        text: m.text,
        reply_to: m.replyTo ?? undefined,
        tags: [
          { name: "stream", value: m.stream },
          { name: "hotel", value: m.hotelId ?? "platform" },
        ],
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (res.ok && body.id) return { ok: true, providerMessageId: body.id };
    return { ok: false, error: `Resend ${res.status}: ${body.message ?? "unknown error"}`, retryable: res.status >= 500 || res.status === 429 };
  } catch (err) {
    return { ok: false, error: `Resend network error: ${(err as Error).message}`, retryable: true };
  }
}

async function sendPostmark(m: OutgoingEmail): Promise<DeliveryResult> {
  try {
    const res = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Postmark-Server-Token": config.email.postmarkToken,
      },
      body: JSON.stringify({
        From: m.from,
        To: m.to,
        Subject: m.subject,
        HtmlBody: m.html,
        TextBody: m.text,
        ReplyTo: m.replyTo ?? undefined,
        MessageStream: config.email.postmarkStream,
        Tag: m.stream,
        Metadata: { hotel: m.hotelId ?? "platform", message: m.id },
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { MessageID?: string; Message?: string; ErrorCode?: number };
    if (res.ok && body.MessageID) return { ok: true, providerMessageId: body.MessageID };
    return { ok: false, error: `Postmark ${res.status}/${body.ErrorCode}: ${body.Message ?? "unknown"}`, retryable: res.status >= 500 || res.status === 429 };
  } catch (err) {
    return { ok: false, error: `Postmark network error: ${(err as Error).message}`, retryable: true };
  }
}

export function deliver(m: OutgoingEmail): Promise<DeliveryResult> {
  switch (config.email.provider) {
    case "resend":
      return sendResend(m);
    case "postmark":
      return sendPostmark(m);
    default:
      return sendConsole(m);
  }
}
