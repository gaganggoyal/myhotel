# Decisions: where the two research reports differed

The Perplexity plan and the Grok report and notes agree on most of the product: enquiry and
request-to-book before instant booking, a hotel-owned UPI QR confirmed by hand, transactional
mail from one authenticated subdomain with Reply-To set to the hotel, managed TLS for custom
domains, and a multi-tenant Next.js + Postgres stack.

The table below records where they differed and what this build does. Each choice can be
changed in one place.

| Topic | Perplexity | Grok | Built | Change it in |
| --- | --- | --- | --- | --- |
| Pricing | Three tiers: ₹499 / ₹999 / ₹1,999 | One printed plan in the ₹630–1,100 band | **One plan, ₹999/mo or ₹9,990/yr + GST**. The Pro tier's features (instant booking, coupons, integrations) are not built yet, and both reports warn against selling unbuilt features. | `src/lib/billing/plans.ts` |
| Custom domain | Direct tier only | Included in the plan | **Included once paid**: trials stay on the subdomain, paid plans can connect a domain. This satisfies both. | `subscriptionAllowsCustomDomain()` |
| Setup fee | ₹1,999–4,999 assisted setup | None | **None**. A paid managed service can be sold separately. | `COMMERCIAL_TERMS` |
| Trial | 14 days | 14 days, no card | **14 days, no card** | `plans.ts` `trialDays` |
| Edge for custom domains | Vercel first | Cloudflare for SaaS first | **Adapter for both**, plus `manual` (DNS check + HTTPS probe, for Caddy). | `DOMAIN_PROVIDER` |
| Email provider | Resend or SES | Postmark, SES or Resend | **Resend or Postmark adapters**, with a console provider for development. | `EMAIL_PROVIDER` |
| Booking modes in MVP | Enquiry + request-to-book | Enquiry first; request-to-book later | **Both, chosen per hotel**. Request-to-book is labelled as a request everywhere. | Dashboard → Booking mode |
| QR display | Only on tokenised payment pages | On the booking/invoice page | **Only on tokenised payment pages**, served through a token-scoped, no-store endpoint on the hotel's host. | `api/site/pay/[token]/qr` |
| Payment states | `submitted` → `paid` (hotel) | `unpaid`, `guest_reported`, `paid`, `rejected`/`needs_review` | **Grok's states**, plus `cancelled`. Only staff can set `paid`. | `bookings.ts` `TRANSITIONS` |
| Website languages | English + Hindi, Punjabi later | One plus an owner-edited second | **English or Hindi template chrome per site**. Owners write their own copy. | `src/site/i18n.ts` |
| Team roles | Owner / manager / front desk in MVP | Not specified | **Roles enforced in code**. The invitation UI is deferred. | `requireHotel(minRole)` |
| Cookie banner | Only where non-essential tracking requires it | Reject-capable banner | **No cookies on hotel sites at all**: cookieless analytics and a click-to-load map, so no banner is needed. | `src/site/client.tsx` |

Additions neither report specified, made for safety:

- A payment request **freezes the payee details**. A later (possibly malicious) change to
  the UPI ID never alters a link that has already been sent.
- **Optimistic concurrency** on the draft, so two editors cannot silently overwrite each other.
- Owner notifications use the **guest as Reply-To**. When the owner replies, the guest gets
  it from the owner's own address.
