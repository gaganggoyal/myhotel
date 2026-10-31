# MyHotel: direct-booking websites for independent hotels

A multi-tenant SaaS that lets an independent hotel, homestay or guest house publish a
mobile-first website in an afternoon. It covers:

- an instant subdomain, plus the owner's own domain once they subscribe
- enquiries and request-to-book with WhatsApp handoff
- the hotel's own UPI QR on secure payment pages
- guest emails sent under the hotel's name
- monthly or yearly billing for the owner

It implements the MVP defined in two research reports (Grok's report and notes, and a
Perplexity plan), which are kept outside this repository. Where the two disagreed, see
[DECISIONS.md](DECISIONS.md).

## Run it locally

```bash
npm install
npm run setup   # migrate + seed (embedded Postgres in .data/, nothing to install)
npm run dev
```

| What | URL / login |
| --- | --- |
| Marketing site | http://localhost:3000 |
| Demo hotel site | http://river-view-retreat.localhost:3000 |
| Owner dashboard | owner@example.com / owner-password-123 |
| Platform admin | admin@example.com / admin-password-123 |

`*.localhost` resolves to your machine in Chrome, Firefox and curl. In development:

- **Emails** are not sent. They are stored and viewable in **Admin → Email log**, and the
  text version is printed in the terminal, so verification links are clickable.
- **Billing** is simulated. "Choose yearly" activates the plan without moving money.
- **Custom domains** use the `manual` provider, which does real DNS checks. Admins can
  force-activate a domain to test canonical redirects. To exercise this from curl, send a
  `Host:` header.

Stop `npm run dev` before running `npm run setup` or any other script that opens the database:
only one process can open embedded Postgres at a time.

```bash
npm test          # 33 tests: unit (routing, slugs, UPI, DNS, signatures, billing, copywriting) + full service flows
npm run typecheck
npm run lint
npm run build
```

## How it works

```
request ── proxy.ts ── platform host? ──> marketing, /dashboard, /admin, /preview
                    └─ any other host ──> rewrite to /sites/<host>/...
                                           └─ resolveHost(): host → hotel from OUR tables
                                              • unknown slug → 404 (wildcards never show a default hotel)
                                              • custom domain served only when "active"
                                              • non-canonical host → 308 to canonical, path kept
                                              • unpaid/suspended/unpublished → neutral maintenance page
```

- **Quick setup** (`/setup`, `src/lib/setup.ts`, `src/lib/autowrite.ts`). After sign-up, owners
  answer six short, phone-friendly steps: highlights, photos, rooms and prices, facilities and
  rules, contact, and design and language. The site is then written and published for them.
  - Photos are shrunk in the browser before upload (a 12 MP phone photo goes up as about 1 MB),
    and the server still re-checks and re-encodes every file.
  - The copywriter writes the tagline, description, room text, FAQ, dining page, policies, Google
    title and description, and photo alt text in English or Hindi, from the owner's answers only.
    It never invents facts.
  - It fills only empty fields or text it wrote itself (tracked by fingerprint in
    `content.autofill`). Anything the owner edits is never overwritten, so quick setup can be
    re-run at any time, for example to switch the site to Hindi.
  - Each step saves to the draft, so owners can leave and resume. Publishing still requires a
    verified email; the verification link brings the owner back to publish.
- **Content model.** Each hotel's site is one typed document (`src/lib/content.ts`, zod).
  Owners edit a **draft**. Publishing freezes an immutable **version**; rollback republishes
  an old one. All three templates (Heritage, Coastal, Modern) and both languages (en/hi)
  render the same document.
- **Booking modes.** Enquiry, or request-to-book. There is no instant confirmation: rooms
  are also sold on OTAs, and confirming without a synced inventory would cause overbooking.
- **Payments** (`src/lib/bookings.ts`, `src/lib/upi.ts`). The owner saves the payee name,
  UPI ID and an optional QR image. That requires the owner role, the account password and
  an attestation, and every change is audited and emailed to the owner.
  - Each payment request freezes those payee details and is sent as an unguessable link.
  - The guest pays outside the site and reports the UTR. Only staff can set `paid`, after
    checking their bank.
  - The QR is decoded on upload only to warn if it pays a different UPI ID.
- **Email** (`src/lib/email/*`). Mail is sent from one authenticated subdomain
  (`MAIL_FROM_DOMAIN`) as "Hotel via MyHotel" with Reply-To set to the hotel's verified inbox.
  - Two streams: platform mail (account, billing) and hotel mail (guest, owner).
  - Owners edit the subject and opening message. Facts and the sender footer stay locked.
  - Suppressions are per hotel. A hotel's guest mail pauses automatically after
    complaints or bounces.
  - There are no mailboxes and no marketing sends.
- **Domains** (`src/lib/domains/*`). The 8-state machine from the research:
  - The states are `pending_dns`, `wrong_record`, `ownership_required`,
    `provisioning_certificate`, `active`, `disconnected` and `blocked`. A draft site
    counts as the eighth.
  - Our own DNS checks (via public resolvers) are combined with the provider's view
    (Cloudflare for SaaS, Vercel, or manual + Caddy).
  - Owners connect `www`. Apex domains get a "use www" message.
  - Disconnected domains are released after 7 days.
- **Billing** (`src/lib/billing/*`). There is one printed plan in `plans.ts`.
  - The trial is 14 days and needs no card.
  - Razorpay Subscriptions webhooks drive the status: `trialing`, `active`, `past_due`,
    `grace_period` (7 days), `suspended` or `cancelled`.
  - Suspension shows a maintenance page and never deletes anything.
  - A daily job warns 7 days before each annual renewal.
- **Privacy.** Hotel sites set no cookies:
  - Analytics are first-party and cookieless, using a daily-rotating hash.
  - The map loads only on click.
  - Each site gets a generated privacy notice that names the hotel as data fiduciary.
  - Owners can export data, and enquiries are anonymised after 24 months.
  - Sessions use host-only `__Host-` cookies, so no hotel subdomain ever receives them.

```
src/
  proxy.ts                  host routing (no DB access)
  db/schema.ts              24 tables; migrations in drizzle/
  lib/                      domain logic: auth, content, hotel, site, bookings, media, upi,
                            email/, domains/, billing/, analytics, jobs, webhooks
  site/                     hotel website templates, i18n, enquiry form, tracker
  app/(marketing)           landing, pricing, legal
  app/(auth)                signup, login, onboarding, verification
  app/dashboard             owner dashboard
  app/admin                 platform staff console
  app/sites/[site]          tenant websites (reached only through proxy rewrites)
  app/api/                  public site APIs, webhooks, cron, uploads, exports
scripts/                    migrate, seed, cron
```

## Deploying to production

1. **Database.** Set `DATABASE_URL` (Supabase, Neon or RDS Postgres), then run `npm run db:migrate`.
2. **Storage.** Set `STORAGE_DRIVER=s3` and the `S3_*` variables (R2 and Supabase Storage both work).
3. **Platform DNS.** On your domain (e.g. `myhotel.in`):
   - The apex and a wildcard `*.myhotel.in` both point to the app. Use proxied records on
     Cloudflare, or add the domain plus the wildcard on Vercel.
   - `sites.myhotel.in` is the CNAME target owners point at. Set `CNAME_TARGET`.
   - Set `ROOT_DOMAIN=myhotel.in` and `APP_PROTOCOL=https`.
4. **Custom domains.** Pick one provider:
   - **Cloudflare for SaaS:** set `DOMAIN_PROVIDER=cloudflare`,
     `CLOUDFLARE_API_TOKEN` (SSL and Certificates: Write) and `CLOUDFLARE_ZONE_ID`. Set the
     fallback origin to the app.
   - **Vercel:** set `DOMAIN_PROVIDER=vercel` with `VERCEL_*`.
   - **Your own Caddy edge:** keep `manual` and point on-demand TLS `ask` at
     `/api/domains/allow`.
5. **Email.** Pick Resend or Postmark (`EMAIL_PROVIDER`).
   - Verify **only** `mail.myhotel.in` with the provider's DKIM and SPF/return-path records.
   - Add `_dmarc.mail.myhotel.in` with `v=DMARC1; p=none; rua=mailto:<an inbox you read>`.
   - Leave the apex MX and SPF alone.
   - Point the provider's bounce and complaint webhook at `/api/webhooks/resend` or
     `/api/webhooks/postmark`.
   - Make sure a human reads `abuse@`.
6. **Billing.**
   - Create monthly and yearly plans in Razorpay (₹999 and ₹9,990 + GST), then set
     `BILLING_PROVIDER=razorpay`, `RAZORPAY_*` and both plan IDs.
   - Add the webhook `/api/webhooks/razorpay` with all `subscription.*` events and set
     `RAZORPAY_WEBHOOK_SECRET`.
7. **Jobs.** `vercel.json` runs `/api/cron/run` hourly; Vercel sends `CRON_SECRET`. Elsewhere,
   call it with `Authorization: Bearer $CRON_SECRET`. If `CRON_SECRET` is unset in production
   the endpoint refuses every call.
8. **Client IP.** Rate limits read the visitor's IP only from the header your edge sets. This is
   `cf-connecting-ip` on Cloudflare, `x-real-ip` on Vercel, and otherwise the last
   `x-forwarded-for` entry. Set `CLIENT_IP_HEADER` if your setup differs.
9. Set `APP_SECRET` to a random 32-byte value (without it, production uses a random
   per-process secret and logs a warning) and `ADMIN_EMAILS` to your staff emails.
   Optionally set `TURNSTILE_*` for form CAPTCHA.
10. **Before taking money:** have Indian counsel review the generated legal text (DPDP Act,
   consumer protection, GST invoicing, CERT-In log retention). Test a backup restore and
   a tenant export.

## Deliberately not built yet

These are sequenced in the research's roadmap; each needs evidence from paying pilots first.

- Availability calendar and instant booking
- Gateway payment links with webhook confirmation (Razorpay/Cashfree per hotel)
- PMS or channel-manager sync and Google Hotel free booking links
- Team invitations (the data model has owner/manager/front-desk roles)
- Hotel-domain email sending (`From: @hotel.com` with the hotel's own DKIM)
- Multi-property accounts and phone OTP
- AI-polished copy (the built-in copywriter is rule-based: free, instant and limited to the
  owner's facts) and a Hindi version of the setup screens themselves

## Known limitations

- The host→site cache lives in each process (15 s). With several instances, other
  instances catch up within that time.
- Rate limiting runs in Postgres. Move it to Redis or Upstash at higher traffic.
- The maintenance page returns HTTP 200 with `noindex`, not 503.
- Cache Components / PPR are off (`next.config.ts`): every hotel page is resolved per
  request. Migrating is a later optimisation.
- The apex-domain check uses a short built-in suffix list (`.in`, `.co.in`, …), not the full
  Public Suffix List.
