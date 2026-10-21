import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import { verifyRazorpaySignature } from "./billing/razorpay";
import { subscriptionServesSite } from "./billing/subscription";
import { canTransition } from "./bookings";
import { defaultContent, parseContent, publishChecklist } from "./content";
import { hmacHex, makeRef, signTimestamp, verifyTimestamp } from "./crypto";
import { evaluateDns, isCloudflareIp } from "./domains/dns";
import { getTemplate } from "./email/catalog";
import { renderEmail } from "./email/render";
import { formatINR, nightsBetween, parseRupeesToPaise, whatsappDigits } from "./format";
import { classifyHost, decodeHostSegment, encodeHostSegment, isApexDomain, normalizeSlug, validateSlug } from "./hosts";
import { buildUpiIntent, isValidVpa, normalizeUtr, parseUpiUri, qrConsistencyWarning } from "./upi";
import { verifySvix } from "./webhooks";

describe("host routing", () => {
  const root = "myhotel.in";
  it("classifies platform, subdomain, custom and invalid hosts", () => {
    assert.deepEqual(classifyHost("myhotel.in", root), { kind: "platform" });
    assert.deepEqual(classifyHost("www.myhotel.in", root), { kind: "platform-www" });
    assert.deepEqual(classifyHost("river-view.myhotel.in", root), { kind: "subdomain", slug: "river-view" });
    assert.deepEqual(classifyHost("www.riverview.in", root), { kind: "custom", hostname: "www.riverview.in" });
    // A wildcard certificate covers one label only: deeper names are never served.
    assert.equal(classifyHost("a.b.myhotel.in", root).kind, "invalid");
    assert.equal(classifyHost("", root).kind, "invalid");
    assert.equal(classifyHost("bad_host!.com", root).kind, "invalid");
  });
  it("handles dev hosts with ports", () => {
    assert.deepEqual(classifyHost("river.localhost:3000", "localhost:3000"), { kind: "subdomain", slug: "river" });
    assert.equal(decodeHostSegment(encodeHostSegment("river.localhost:3000")), "river.localhost:3000");
  });
  it("detects apex domains including Indian second-level suffixes", () => {
    assert.equal(isApexDomain("riverview.in"), true);
    assert.equal(isApexDomain("riverview.co.in"), true);
    assert.equal(isApexDomain("www.riverview.co.in"), false);
    assert.equal(isApexDomain("stay.riverview.com"), false);
  });
});

describe("slugs", () => {
  it("normalises names", () => {
    assert.equal(normalizeSlug("  Hotel Gangā & Spa! "), "hotel-ganga-and-spa");
  });
  it("rejects reserved, brand and malformed slugs", () => {
    assert.equal(validateSlug("river-view"), null);
    assert.match(validateSlug("admin") ?? "", /reserved/);
    assert.match(validateSlug("mail") ?? "", /reserved/);
    assert.match(validateSlug("paytm-rishikesh") ?? "", /brand/);
    assert.ok(validateSlug("ab"));
    assert.ok(validateSlug("-abc"));
    assert.ok(validateSlug("a--b"));
  });
});

describe("payment state machine", () => {
  it("never lets a guest mark a payment paid", () => {
    for (const from of ["unpaid", "guest_reported", "needs_review", "rejected"] as const) {
      assert.equal(canTransition(from, "paid", "guest"), false, from);
    }
  });
  it("lets the guest report and staff settle", () => {
    assert.equal(canTransition("unpaid", "guest_reported", "guest"), true);
    assert.equal(canTransition("guest_reported", "paid", "staff"), true);
    assert.equal(canTransition("guest_reported", "needs_review", "staff"), true);
    assert.equal(canTransition("cancelled", "guest_reported", "guest"), false);
    assert.equal(canTransition("paid", "guest_reported", "guest"), false);
  });
});

describe("UPI", () => {
  it("validates VPAs and UTRs", () => {
    assert.equal(isValidVpa("riverview@okaxis"), true);
    assert.equal(isValidVpa("river view@okaxis"), false);
    assert.equal(isValidVpa("nobank"), false);
    assert.equal(normalizeUtr(" 4321 9876 5012 "), "432198765012");
    assert.equal(normalizeUtr("12"), null);
  });
  it("builds an intent link from text fields with amount and note", () => {
    const link = buildUpiIntent({ vpa: "riverview@okaxis", payeeName: "RIVER VIEW", amountPaise: 300000, note: "RVR-ABC123" });
    const p = parseUpiUri(link)!;
    assert.equal(p.pa, "riverview@okaxis");
    assert.equal(p.am, "3000.00");
    assert.equal(p.cu, "INR");
    assert.equal(p.tn, "RVR-ABC123");
  });
  it("warns, without blocking, when the QR pays someone else", () => {
    assert.equal(qrConsistencyWarning("upi://pay?pa=riverview@okaxis&pn=X", "riverview@okaxis"), null);
    assert.match(qrConsistencyWarning("upi://pay?pa=someone@ybl", "riverview@okaxis") ?? "", /pays someone@ybl/);
    assert.match(qrConsistencyWarning(null, "riverview@okaxis") ?? "", /could not read/);
    assert.match(qrConsistencyWarning("000201010211...", "riverview@okaxis") ?? "", /not a standard UPI/);
  });
});

describe("DNS evaluation", () => {
  const target = "sites.myhotel.in";
  const targetSeen = { cname: [], a: ["104.21.1.1"], aaaa: [] };
  it("accepts the CNAME and flattened records", () => {
    assert.equal(evaluateDns("www.h.in", target, { cname: ["sites.myhotel.in"], a: [], aaaa: [] }, targetSeen).kind, "ok");
    assert.equal(evaluateDns("www.h.in", target, { cname: [], a: ["104.21.1.1"], aaaa: [] }, targetSeen).kind, "ok");
  });
  it("distinguishes missing from wrong records and explains why", () => {
    assert.equal(evaluateDns("www.h.in", target, { cname: [], a: [], aaaa: [] }, targetSeen).kind, "none");
    const wrongCname = evaluateDns("www.h.in", target, { cname: ["old.wix.com"], a: [], aaaa: [] }, targetSeen);
    assert.equal(wrongCname.kind, "wrong");
    assert.match(wrongCname.issues[0], /points to old\.wix\.com/);
    const extraA = evaluateDns("www.h.in", target, { cname: [], a: ["203.0.113.5"], aaaa: ["2001:db8::1"] }, { cname: [], a: ["198.51.100.7"], aaaa: [] });
    assert.equal(extraA.kind, "wrong");
    assert.ok(extraA.issues.some((i) => /AAAA/.test(i)));
  });
  it("recognises Cloudflare proxy addresses", () => {
    assert.equal(isCloudflareIp("104.16.5.5"), true);
    assert.equal(isCloudflareIp("8.8.8.8"), false);
  });
});

describe("signatures and tokens", () => {
  it("verifies Razorpay webhook HMAC over the raw body", () => {
    const body = '{"event":"subscription.charged"}';
    const sig = hmacHex("whsec", body);
    assert.equal(verifyRazorpaySignature(body, sig, "whsec"), true);
    assert.equal(verifyRazorpaySignature(body + " ", sig, "whsec"), false);
    assert.equal(verifyRazorpaySignature(body, null, "whsec"), false);
  });
  it("verifies Svix (Resend) signatures and rejects replays", () => {
    const secret = `whsec_${Buffer.from("test-secret-key").toString("base64")}`;
    const ts = String(Math.floor(Date.now() / 1000));
    const body = '{"type":"email.bounced"}';
    const sig = createHmac("sha256", Buffer.from("test-secret-key")).update(`msg_1.${ts}.${body}`).digest("base64");
    const headers = new Headers({ "svix-id": "msg_1", "svix-timestamp": ts, "svix-signature": `v1,bad v1,${sig}` });
    assert.equal(verifySvix(body, headers, secret), true);
    assert.equal(verifySvix(body, headers, secret, Date.now() + 10 * 60_000), false);
  });
  it("rejects form submissions that are too fast or forged", () => {
    const t = signTimestamp(Date.now() - 5000);
    assert.equal(verifyTimestamp(t), true);
    assert.equal(verifyTimestamp(signTimestamp(Date.now())), false);
    assert.equal(verifyTimestamp(t.replace(/\.[^.]+$/, ".forged000000000000000000")), false);
  });
  it("makes unambiguous references", () => {
    assert.match(makeRef("RVR"), /^RVR-[2-9A-HJ-NP-Z]{6}$/);
  });
});

describe("billing serving rules", () => {
  const now = new Date("2026-10-21T00:00:00Z");
  const later = new Date("2026-11-01T00:00:00Z");
  const earlier = new Date("2026-10-01T00:00:00Z");
  it("keeps the site online through trial, retries and grace, and until a cancelled period ends", () => {
    assert.equal(subscriptionServesSite({ status: "trialing", trialEndsAt: later, currentPeriodEnd: null, graceEndsAt: null }, now), true);
    assert.equal(subscriptionServesSite({ status: "trialing", trialEndsAt: earlier, currentPeriodEnd: null, graceEndsAt: null }, now), false);
    assert.equal(subscriptionServesSite({ status: "past_due", trialEndsAt: null, currentPeriodEnd: earlier, graceEndsAt: null }, now), true);
    assert.equal(subscriptionServesSite({ status: "grace_period", trialEndsAt: null, currentPeriodEnd: earlier, graceEndsAt: later }, now), true);
    assert.equal(subscriptionServesSite({ status: "cancelled", trialEndsAt: null, currentPeriodEnd: later, graceEndsAt: null }, now), true);
    assert.equal(subscriptionServesSite({ status: "suspended", trialEndsAt: null, currentPeriodEnd: later, graceEndsAt: null }, now), false);
  });
});

describe("content and email", () => {
  it("fills defaults and blocks publishing without essentials", () => {
    const c = defaultContent({ name: "Test Stay", type: "homestay", city: "Manali", state: "Himachal Pradesh", phone: "9800000000", email: "a@b.in" });
    const check = publishChecklist(c, false);
    assert.ok(check.blocking.some((b) => /room/.test(b)));
    assert.ok(check.warnings.some((w) => /photos/.test(w)));
    assert.equal(parseContent(JSON.parse(JSON.stringify(c))).property.name, "Test Stay");
  });
  it("escapes guest-controlled values in HTML email but keeps them readable in text", () => {
    const def = getTemplate("enquiry_owner");
    const out = renderEmail(def, { subject: def.subject, body: def.body }, { guest_name: '<img src=x onerror="alert(1)">', kind_label: "enquiry", ref: "R-1", message: "<script>x</script>" }, { name: "Hotel", color: "#123456", footer: ["f"] });
    assert.ok(!out.html.includes("<img src=x"));
    assert.ok(!out.html.includes("<script>"));
    assert.ok(out.text.includes("<script>x</script>"));
  });
});

describe("formatting", () => {
  it("handles rupees, nights and WhatsApp numbers", () => {
    assert.equal(parseRupeesToPaise("₹2,499.50"), 249950);
    assert.equal(parseRupeesToPaise("abc"), null);
    assert.equal(formatINR(480000), "₹4,800");
    assert.equal(nightsBetween("2026-12-12", "2026-12-15"), 3);
    assert.equal(whatsappDigits("98100 00000"), "919810000000");
    assert.equal(whatsappDigits("+91 98100 00000"), "919810000000");
  });
});
