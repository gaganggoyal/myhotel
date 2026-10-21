import type { EmailStream } from "@/db/schema";

// Two catalogues on separate streams:
//  - platform: account and billing mail from the company (never editable, never marketing)
//  - hotel_guest / hotel_owner: transactional mail about a guest's enquiry or stay.
// Owners may edit the subject and the opening message of guest templates. The layout, the
// facts block (dates, amounts, references) and the "who sent this" footer stay locked.

export type Vars = Record<string, string | undefined>;
export type Fact = [label: string, value: string | undefined];

export type TemplateDef = {
  key: string;
  stream: EmailStream;
  editable: boolean;
  label: string;
  description: string;
  subject: string;
  body: string;
  facts?: (v: Vars) => Fact[];
  cta?: (v: Vars) => { label: string; url: string } | null;
  /** Locked paragraph after the facts (legal/operational wording owners cannot remove). */
  notice?: (v: Vars) => string | null;
  sample: Vars;
};

const stayFacts = (v: Vars): Fact[] => [
  ["Reference", v.ref],
  ["Check-in", v.check_in],
  ["Check-out", v.check_out],
  ["Nights", v.nights],
  ["Guests", v.guests],
  ["Room", v.room_name],
];

const SAMPLE_STAY: Vars = {
  property_name: "River View Retreat",
  guest_name: "Ananya Sharma",
  guest_email: "ananya@example.com",
  guest_phone: "+91 98765 43210",
  ref: "RVR-7K3Q9M",
  check_in: "12 Dec 2026",
  check_out: "15 Dec 2026",
  nights: "3",
  guests: "2 adults, 1 child",
  room_name: "Deluxe River View Room",
  message: "We are arriving by the evening train. Is early check-in possible?",
  check_in_time: "12:00 pm",
  check_out_time: "11:00 am",
  property_address: "Tapovan, Rishikesh, Uttarakhand 249192",
  property_phone: "+91 98100 00000",
  cancellation_policy: "Free cancellation up to 7 days before arrival.",
  total: "₹14,400",
  paid: "₹4,000",
  balance: "₹10,400",
  amount: "₹4,000",
  purpose: "Deposit",
  payee_name: "RIVER VIEW HOSPITALITY",
  upi_id: "riverview@okaxis",
  due_date: "5 Dec 2026",
  payment_link: "https://riverview.myhotel.example/pay/sample",
  utr: "432198765012",
  dashboard_link: "https://myhotel.example/dashboard",
  reason: "We could not find a matching credit in our account.",
};

export const TEMPLATES: TemplateDef[] = [
  // ---------------------------------------------------------------- hotel → guest
  {
    key: "enquiry_guest",
    stream: "hotel_guest",
    editable: true,
    label: "Enquiry received (to guest)",
    description: "Sent immediately when a guest submits the enquiry form.",
    subject: "We received your enquiry – {{property_name}}",
    body: "Dear {{guest_name}},\n\nThank you for contacting {{property_name}}. We have received your enquiry and will reply personally, usually within a few hours.\n\nIf you need us sooner, call or WhatsApp us on {{property_phone}}.",
    facts: stayFacts,
    notice: () => "This is not a booking confirmation. Your room is reserved only after we confirm it in writing.",
    sample: SAMPLE_STAY,
  },
  {
    key: "booking_request_guest",
    stream: "hotel_guest",
    editable: true,
    label: "Booking request received (to guest)",
    description: "Sent when a guest requests specific dates and a room.",
    subject: "Booking request received – {{property_name}}",
    body: "Dear {{guest_name}},\n\nThank you for choosing {{property_name}}. We are checking availability for your dates and will confirm shortly with the total and any deposit required.",
    facts: stayFacts,
    notice: () => "Your room is not reserved yet. We will confirm availability and send payment details if a deposit is needed.",
    sample: SAMPLE_STAY,
  },
  {
    key: "booking_confirmed",
    stream: "hotel_guest",
    editable: true,
    label: "Booking confirmed",
    description: "Sent when you confirm a reservation.",
    subject: "Your booking is confirmed – {{property_name}} ({{ref}})",
    body: "Dear {{guest_name}},\n\nWe are delighted to confirm your stay at {{property_name}}. We look forward to welcoming you.",
    facts: (v) => [
      ...stayFacts(v),
      ["Total", v.total],
      ["Paid", v.paid],
      ["Balance", v.balance],
      ["Check-in time", v.check_in_time],
      ["Check-out time", v.check_out_time],
      ["Address", v.property_address],
    ],
    notice: (v) => (v.cancellation_policy ? `Cancellation policy: ${v.cancellation_policy}` : null),
    sample: SAMPLE_STAY,
  },
  {
    key: "payment_instructions",
    stream: "hotel_guest",
    editable: true,
    label: "Payment instructions",
    description: "Sent when you request a deposit or balance. Links to a secure page with your UPI details.",
    subject: "Payment details for your stay – {{property_name}} ({{ref}})",
    body: "Dear {{guest_name}},\n\nTo secure your booking, please pay the amount below directly to {{property_name}} using any UPI app. Add your booking reference {{ref}} in the payment note.",
    facts: (v) => [
      ["Reference", v.ref],
      ["Amount requested", v.amount],
      ["For", v.purpose],
      ["Pay to", v.payee_name],
      ["UPI ID", v.upi_id],
      ["Please pay by", v.due_date],
    ],
    cta: (v) => (v.payment_link ? { label: "View payment details", url: v.payment_link } : null),
    notice: (v) =>
      `You pay ${v.payee_name ?? "the hotel"} directly; ${"{{platform_name}}"} never receives your money. Check that your UPI app shows this name before you confirm. Your payment is confirmed when the hotel marks it received, not when you scan.`,
    sample: SAMPLE_STAY,
  },
  {
    key: "payment_received",
    stream: "hotel_guest",
    editable: true,
    label: "Payment received",
    description: "Sent when you mark a payment as received in your account.",
    subject: "Payment received – {{property_name}} ({{ref}})",
    body: "Dear {{guest_name}},\n\nThank you. We have received your payment and updated your booking.",
    facts: (v) => [
      ["Reference", v.ref],
      ["Amount received", v.amount],
      ["Total", v.total],
      ["Balance", v.balance],
    ],
    sample: SAMPLE_STAY,
  },
  {
    key: "payment_issue",
    stream: "hotel_guest",
    editable: true,
    label: "Payment not matched",
    description: "Sent when you cannot find a payment the guest reported.",
    subject: "About your payment – {{property_name}} ({{ref}})",
    body: "Dear {{guest_name}},\n\nWe could not yet match the payment you reported to a credit in our account. Please reply to this email with a screenshot showing the transaction reference, or call us.",
    facts: (v) => [
      ["Reference", v.ref],
      ["Amount requested", v.amount],
      ["Reference you entered", v.utr],
      ["Note from the hotel", v.reason],
    ],
    sample: SAMPLE_STAY,
  },
  {
    key: "booking_cancelled",
    stream: "hotel_guest",
    editable: true,
    label: "Booking cancelled",
    description: "Sent when a reservation is cancelled.",
    subject: "Booking cancelled – {{property_name}} ({{ref}})",
    body: "Dear {{guest_name}},\n\nYour booking at {{property_name}} has been cancelled. If you paid a deposit, any refund is made by the hotel according to its cancellation policy.",
    facts: stayFacts,
    notice: (v) => (v.cancellation_policy ? `Cancellation policy: ${v.cancellation_policy}` : null),
    sample: SAMPLE_STAY,
  },

  // ---------------------------------------------------------------- hotel → owner
  {
    key: "enquiry_owner",
    stream: "hotel_owner",
    editable: false,
    label: "New enquiry (to you)",
    description: "Notifies you of every new enquiry or booking request. Reply to answer the guest directly.",
    subject: "New {{kind_label}} from {{guest_name}} – {{ref}}",
    body: "{{guest_name}} sent a {{kind_label}} through your website. Reply to this email to answer them directly, or open it in your dashboard.",
    facts: (v) => [
      ...stayFacts(v),
      ["Guest email", v.guest_email],
      ["Guest phone", v.guest_phone],
      ["Message", v.message],
    ],
    cta: (v) => (v.dashboard_link ? { label: "Open in dashboard", url: v.dashboard_link } : null),
    sample: { ...SAMPLE_STAY, kind_label: "booking request" },
  },
  {
    key: "payment_reported_owner",
    stream: "hotel_owner",
    editable: false,
    label: "Guest reported a payment (to you)",
    description: "Sent when a guest taps “I have paid”. Check your bank or UPI app before marking it received.",
    subject: "Check your account: {{guest_name}} reported paying {{amount}} ({{ref}})",
    body: "{{guest_name}} says they paid {{amount}} for booking {{ref}}. Check your bank or UPI app for a matching credit, then mark it received or not found in your dashboard.",
    facts: (v) => [
      ["Reference", v.ref],
      ["Amount requested", v.amount],
      ["Transaction reference (UTR)", v.utr],
      ["Guest note", v.message],
    ],
    cta: (v) => (v.dashboard_link ? { label: "Review payment", url: v.dashboard_link } : null),
    notice: () => "A guest's report or screenshot is not proof of payment. Only mark it received after you see the credit.",
    sample: SAMPLE_STAY,
  },

  // ---------------------------------------------------------------- platform → owner
  {
    key: "verify_email",
    stream: "platform",
    editable: false,
    label: "Verify your email",
    description: "",
    subject: "Verify your email for {{platform_name}}",
    body: "Hi {{owner_name}},\n\nConfirm this email address to publish your website and receive guest enquiries. The link expires in 48 hours.",
    cta: (v) => ({ label: "Verify email", url: v.link ?? "#" }),
    sample: { owner_name: "Ravi", link: "https://myhotel.example/verify-email?token=sample" },
  },
  {
    key: "password_reset",
    stream: "platform",
    editable: false,
    label: "Reset your password",
    description: "",
    subject: "Reset your {{platform_name}} password",
    body: "Hi {{owner_name}},\n\nSomeone asked to reset the password for this account. If that was you, use the button below within 1 hour. If not, you can ignore this email.",
    cta: (v) => ({ label: "Choose a new password", url: v.link ?? "#" }),
    sample: { owner_name: "Ravi", link: "https://myhotel.example/reset-password?token=sample" },
  },
  {
    key: "verify_reply_to",
    stream: "platform",
    editable: false,
    label: "Confirm your reply-to address",
    description: "",
    subject: "Confirm {{email}} for guest replies – {{property_name}}",
    body: "Confirm that guest replies and enquiry notifications for {{property_name}} should go to this address.",
    cta: (v) => ({ label: "Confirm address", url: v.link ?? "#" }),
    sample: { email: "frontdesk@riverview.in", property_name: "River View Retreat", link: "#" },
  },
  {
    key: "welcome",
    stream: "platform",
    editable: false,
    label: "Welcome",
    description: "",
    subject: "Welcome to {{platform_name}} – your 14-day trial has started",
    body: "Hi {{owner_name}},\n\nYour website for {{property_name}} is ready to set up. Add your rooms, photos and policies, then publish to {{site_url}}. Your free trial runs until {{trial_end}} and no card is needed to try it.",
    cta: (v) => ({ label: "Continue setup", url: v.dashboard_link ?? "#" }),
    sample: { owner_name: "Ravi", property_name: "River View Retreat", site_url: "riverview.myhotel.example", trial_end: "4 Nov 2026" },
  },
  {
    key: "trial_ending",
    stream: "platform",
    editable: false,
    label: "Trial ending",
    description: "",
    subject: "Your {{platform_name}} trial ends on {{trial_end}}",
    body: "Hi {{owner_name}},\n\nYour free trial for {{property_name}} ends on {{trial_end}}. Choose monthly or yearly billing to keep your website online. Nothing is charged automatically.",
    cta: (v) => ({ label: "Choose a plan", url: v.billing_link ?? "#" }),
    sample: { owner_name: "Ravi", property_name: "River View Retreat", trial_end: "4 Nov 2026" },
  },
  {
    key: "site_offline",
    stream: "platform",
    editable: false,
    label: "Website offline",
    description: "",
    subject: "{{property_name}}'s website is offline",
    body: "Hi {{owner_name}},\n\n{{reason}} Your content, rooms and enquiries are kept safe. Subscribe or update your payment method to bring the website back online immediately.",
    cta: (v) => ({ label: "Open billing", url: v.billing_link ?? "#" }),
    sample: { owner_name: "Ravi", property_name: "River View Retreat", reason: "Your free trial has ended." },
  },
  {
    key: "subscription_active",
    stream: "platform",
    editable: false,
    label: "Subscription active",
    description: "",
    subject: "Thank you – {{property_name}} is on the {{plan_name}} plan",
    body: "Hi {{owner_name}},\n\nYour {{interval}} subscription is active until {{period_end}}. Your website stays online and you can now connect your own domain.",
    sample: { owner_name: "Ravi", property_name: "River View Retreat", plan_name: "Hotel Website", interval: "yearly", period_end: "21 Oct 2027" },
  },
  {
    key: "payment_failed",
    stream: "platform",
    editable: false,
    label: "Renewal payment failed",
    description: "",
    subject: "Action needed: renewal payment failed for {{property_name}}",
    body: "Hi {{owner_name}},\n\nWe could not collect your renewal payment. Your website stays online for a 7-day grace period. Update your payment method to avoid interruption.",
    cta: (v) => ({ label: "Update payment", url: v.billing_link ?? "#" }),
    sample: { owner_name: "Ravi", property_name: "River View Retreat" },
  },
  {
    key: "renewal_reminder",
    stream: "platform",
    editable: false,
    label: "Upcoming annual renewal",
    description: "",
    subject: "Your yearly plan renews on {{period_end}}",
    body: "Hi {{owner_name}},\n\nThis is your advance notice that the yearly plan for {{property_name}} renews on {{period_end}} for {{amount}}. If you do not want to renew, cancel before that date from your billing page.",
    cta: (v) => ({ label: "Manage billing", url: v.billing_link ?? "#" }),
    sample: { owner_name: "Ravi", property_name: "River View Retreat", period_end: "21 Oct 2027", amount: "₹11,788 incl. GST" },
  },
  {
    key: "payment_details_changed",
    stream: "platform",
    editable: false,
    label: "Payment details changed (security alert)",
    description: "",
    subject: "Security alert: UPI payment details changed for {{property_name}}",
    body: "Hi {{owner_name}},\n\nThe UPI details guests see for {{property_name}} were changed by {{actor}} on {{when}}.\n\nNew payee: {{payee_name}} ({{upi_id}}).\n\nIf you did not make this change, sign in now, change your password, and contact {{support_email}} immediately.",
    cta: (v) => ({ label: "Review payment settings", url: v.link ?? "#" }),
    sample: { owner_name: "Ravi", property_name: "River View Retreat", actor: "ravi@example.com", when: "21 Oct 2026, 4:12 pm", payee_name: "RIVER VIEW HOSPITALITY", upi_id: "riverview@okaxis" },
  },
  {
    key: "domain_status",
    stream: "platform",
    editable: false,
    label: "Domain status changed",
    description: "",
    subject: "{{domain}}: {{status_label}}",
    body: "Hi {{owner_name}},\n\n{{detail}}",
    cta: (v) => ({ label: "Open domain settings", url: v.link ?? "#" }),
    sample: { owner_name: "Ravi", domain: "www.riverview.in", status_label: "connected", detail: "Your website is now live at https://www.riverview.in." },
  },
];

export const TEMPLATE_MAP = new Map(TEMPLATES.map((t) => [t.key, t]));

export function getTemplate(key: string): TemplateDef {
  const t = TEMPLATE_MAP.get(key);
  if (!t) throw new Error(`Unknown email template ${key}`);
  return t;
}

export const EDITABLE_TEMPLATES = TEMPLATES.filter((t) => t.editable);
