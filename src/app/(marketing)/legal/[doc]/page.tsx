import { notFound } from "next/navigation";
import { config } from "@/lib/config";

// Plain-language drafts. Have Indian counsel review before launch (DPDP Act, consumer
// protection, GST invoicing and CERT-In log retention), as both research reports advise.

const docs: Record<string, { title: string; sections: [string, string][] }> = {
  terms: {
    title: "Terms of service",
    sections: [
      ["The service", `${config.platformName} provides hosted websites, enquiry handling, payment-instruction pages and transactional email for accommodation businesses (“you”). You are responsible for the accuracy of your content, prices and policies, and for honouring bookings you confirm.`],
      ["Your guests and their money", `Guests contract with you, not with ${config.platformName}. Payments shown on your payment pages go directly to the UPI account you provide. ${config.platformName} does not receive, hold or refund guest money and does not confirm payments on your behalf.`],
      ["Acceptable use", "You may only publish photos and text you have the right to use, and only payment details that belong to your business. You may not use the service to send marketing email, to impersonate another business, or for unlawful accommodation. We may suspend a site or pause its email to protect guests or the shared sending domain."],
      ["Fees", "Plan fees are shown on the pricing page and exclude GST. Trials need no card. Yearly plans are reminded 7 days before renewal. Cancel at any time; your site remains online until the end of the paid period. Yearly plans cancelled within 14 days of a charge are refunded in full."],
      ["Your data", "You own your content and guest data. You can export it at any time. After cancellation we keep your data for 90 days so you can return, then delete it, except where law requires us to keep records."],
      ["Domains", "A domain you connect remains yours and stays registered with your registrar. Platform subdomains remain reserved to your account and are not reissued to another business."],
      ["Liability", "The service is provided with reasonable care and skill. We are not liable for lost bookings, overbookings or disputes between you and your guests."],
      ["Law", "These terms are governed by the laws of India."],
    ],
  },
  privacy: {
    title: "Privacy policy",
    sections: [
      ["Who we are", `${config.platformName} provides websites to accommodation businesses. For guest data submitted through a hotel’s website, the hotel is the data fiduciary and ${config.platformName} processes the data on its behalf. For hotel owners’ account data, ${config.platformName} is the data fiduciary.`],
      ["What we collect from owners", "Name, email, mobile number, property details, payment details you choose to display, billing records, and security logs (sign-ins and sensitive changes)."],
      ["What hotel websites collect from guests", "Name, email, phone, stay dates, guest count, room preference and messages, and for payments the transaction reference and any screenshot the guest uploads. We never collect card numbers or UPI PINs."],
      ["Cookies", "Hotel websites set no cookies. The owner dashboard uses one essential session cookie to keep you signed in."],
      ["Sharing", "We use sub-processors for hosting, storage, email delivery and owner billing (for example our cloud provider, email provider and Razorpay). We do not sell personal data."],
      ["Retention", "Enquiries that do not become bookings are anonymised after 24 months. Security logs are retained as required by applicable Indian law."],
      ["Your rights", `Under the Digital Personal Data Protection Act, 2023 you may request access, correction or erasure and withdraw consent. Write to ${config.email.support}.`],
    ],
  },
};

export async function generateMetadata({ params }: { params: Promise<{ doc: string }> }) {
  const d = docs[(await params).doc];
  return { title: d?.title ?? "Legal" };
}

export default async function LegalDoc({ params }: { params: Promise<{ doc: string }> }) {
  const d = docs[(await params).doc];
  if (!d) notFound();
  return (
    <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-bold text-slate-900">{d.title}</h1>
      <div className="mt-8 space-y-6">
        {d.sections.map(([h, p]) => (
          <section key={h}>
            <h2 className="font-semibold text-slate-900">{h}</h2>
            <p className="mt-2 leading-relaxed text-slate-700">{p}</p>
          </section>
        ))}
      </div>
    </article>
  );
}
