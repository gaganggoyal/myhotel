import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { AMENITIES, amenityLabel, highlightFor, isCatalogAmenity, type Highlight } from "@/lib/amenities";
import { findPaymentRequestByToken } from "@/lib/bookings";
import { config } from "@/lib/config";
import type { Room, SiteContent } from "@/lib/content";
import { signTimestamp } from "@/lib/crypto";
import { addressLine } from "@/lib/email/send";
import { formatDate, formatINR, nightsBetween, telLink, todayIST, whatsappLink } from "@/lib/format";
import { bestVariant, srcSet } from "@/lib/media";
import type { LoadedSite } from "@/lib/site";
import { buildUpiIntent } from "@/lib/upi";
import { MapEmbed, PayReportForm, Tracker } from "./client";
import { EnquiryForm } from "./EnquiryForm";
import { translator, type DictKey, type Locale } from "./i18n";
import { TEMPLATE_STYLES, themeVars } from "./theme";

type Search = Record<string, string | string[] | undefined>;
type Ctx = { site: LoadedSite; c: SiteContent; tr: ReturnType<typeof translator>; locale: Locale; href: (p: string) => string };

function ctxFor(site: LoadedSite): Ctx {
  const locale = site.content.locale;
  return {
    site,
    c: site.content,
    tr: translator(locale),
    locale,
    href: (p: string) => (p === "/" ? site.basePath || "/" : `${site.basePath}${p}`),
  };
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

function Img({ ctx, id, sizes, className, eager }: { ctx: Ctx; id: string | undefined; sizes: string; className?: string; eager?: boolean }) {
  const m = id ? ctx.site.media.get(id) : undefined;
  if (!m) return null;
  const hotelId = ctx.site.hotel.id;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/media/${hotelId}/${m.id}/${bestVariant(m, 960)}.webp`}
      srcSet={srcSet(m, hotelId)}
      sizes={sizes}
      alt={m.alt}
      width={m.width}
      height={m.height}
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : undefined}
      decoding="async"
      className={className}
    />
  );
}

function Heading({ ctx, as: Tag = "h2", children, className = "" }: { ctx: Ctx; as?: "h1" | "h2" | "h3"; children: ReactNode; className?: string }) {
  const style = TEMPLATE_STYLES[ctx.c.template];
  const size = Tag === "h1" ? "text-3xl sm:text-4xl" : Tag === "h2" ? "text-2xl sm:text-3xl" : "text-lg";
  return <Tag className={`${style.heading} ${size} text-neutral-900 ${className}`}>{children}</Tag>;
}

function Section({ children, alt, id, className = "" }: { children: ReactNode; alt?: boolean; id?: string; className?: string; ctx?: Ctx }) {
  return (
    <section id={id} className={`${alt ? "bg-black/[0.025]" : ""} ${className}`}>
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">{children}</div>
    </section>
  );
}

function primaryCta(ctx: Ctx): { label: string; key: DictKey } {
  return ctx.c.booking.mode === "request" ? { label: ctx.tr("requestBooking"), key: "requestBooking" } : { label: ctx.tr("enquire"), key: "enquire" };
}

function CtaButtons({ ctx, inverted, roomId }: { ctx: Ctx; inverted?: boolean; roomId?: string }) {
  const phone = telLink(ctx.c.contact.phone);
  const wa = whatsappLink(ctx.c.contact.whatsapp || ctx.c.contact.phone, `Hello ${ctx.c.property.name}, I'd like to know about availability.`);
  const enquireHref = ctx.href(`/enquire${roomId ? `?room=${roomId}` : ""}`);
  const ghost = inverted ? "border-white/70 text-white hover:bg-white/10" : "border-black/20 text-neutral-900 hover:bg-black/5";
  return (
    <div className="flex flex-wrap gap-3">
      <a href={enquireHref} data-cta="enquire_hero" className="rounded-lg bg-[var(--p)] px-5 py-3 text-base font-semibold text-[var(--on-p)] shadow-sm hover:opacity-90">
        {primaryCta(ctx).label}
      </a>
      {wa ? (
        <a href={wa} target="_blank" rel="noopener noreferrer" data-cta="whatsapp_hero" className={`rounded-lg border px-5 py-3 text-base font-semibold ${ghost}`}>
          {ctx.tr("whatsapp")}
        </a>
      ) : null}
      {phone ? (
        <a href={phone} data-cta="call_hero" className={`rounded-lg border px-5 py-3 text-base font-semibold ${ghost}`}>
          {ctx.tr("call")}
        </a>
      ) : null}
    </div>
  );
}

function PriceTag({ ctx, room }: { ctx: Ctx; room: Room }) {
  if (!ctx.c.booking.showPrices || !room.fromPrice) return null;
  return (
    <p className="text-sm text-neutral-700">
      {ctx.tr("from")} <strong className="text-lg text-neutral-900">{formatINR(room.fromPrice)}</strong> {ctx.tr("perNight")}
    </p>
  );
}

function RoomCard({ ctx, room }: { ctx: Ctx; room: Room }) {
  const style = TEMPLATE_STYLES[ctx.c.template];
  return (
    <article className={`flex flex-col overflow-hidden ${style.card}`}>
      <a href={ctx.href(`/rooms/${room.slug}`)} className="block aspect-[4/3] overflow-hidden bg-black/5">
        <Img ctx={ctx} id={room.mediaIds[0]} sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" className="h-full w-full object-cover transition duration-300 hover:scale-[1.02]" />
      </a>
      <div className="flex flex-1 flex-col gap-2 p-5">
        <h3 className={`${style.heading} text-xl text-neutral-900`}>
          <a href={ctx.href(`/rooms/${room.slug}`)}>{room.name}</a>
        </h3>
        <p className="text-sm text-neutral-600">
          {ctx.tr("sleeps", { n: room.maxAdults + room.maxChildren })}
          {room.bedType ? ` · ${room.bedType}` : ""}
          {room.view ? ` · ${room.view}` : ""}
        </p>
        {room.summary ? <p className="text-sm leading-relaxed">{room.summary}</p> : null}
        <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-3">
          <PriceTag ctx={ctx} room={room} />
          <a href={ctx.href(`/rooms/${room.slug}`)} className="text-sm font-semibold text-[var(--p)] underline-offset-4 hover:underline">
            {ctx.tr("viewDetails")} →
          </a>
        </div>
      </div>
    </article>
  );
}

function AmenityGrid({ ctx, items }: { ctx: Ctx; items: string[] }) {
  return (
    <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((a) => (
        <li key={a} className="flex items-start gap-2 text-[15px]">
          <span aria-hidden="true" className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-[var(--a)]" />
          {amenityLabel(a, ctx.locale)}
        </li>
      ))}
    </ul>
  );
}

function Paragraphs({ text }: { text: string }) {
  return (
    <div className="prose-site max-w-3xl text-[16px]">
      {text
        .split(/\n{2,}/)
        .filter((p) => p.trim())
        .map((p, i) => (
          <p key={i}>{p}</p>
        ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Frame: header, sticky mobile actions, footer
// ---------------------------------------------------------------------------

function navItems(ctx: Ctx): { href: string; label: string }[] {
  const s = ctx.c.sections;
  const items = [
    { href: "/rooms", label: ctx.tr("rooms"), show: ctx.c.rooms.some((r) => r.visible) },
    { href: "/amenities", label: ctx.tr("amenities"), show: ctx.c.amenities.length > 0 },
    { href: "/gallery", label: ctx.tr("gallery"), show: s.gallery && ctx.c.gallery.mediaIds.length > 0 },
    { href: "/dining", label: ctx.tr("dining"), show: s.dining && Boolean(ctx.c.dining.body) },
    { href: "/offers", label: ctx.tr("offers"), show: s.offers && ctx.c.offers.length > 0 },
    { href: "/location", label: ctx.tr("location"), show: true },
    { href: "/policies", label: ctx.tr("policies"), show: true },
    { href: "/about", label: ctx.tr("about"), show: Boolean(ctx.c.about.body) },
    { href: "/faq", label: ctx.tr("faq"), show: s.faq && ctx.c.faq.length > 0 },
    { href: "/contact", label: ctx.tr("contact"), show: true },
  ];
  return items.filter((i) => i.show).map((i) => ({ href: ctx.href(i.href), label: i.label }));
}

export function SiteFrame({ site, children }: { site: LoadedSite; children: ReactNode }) {
  const ctx = ctxFor(site);
  const { c, tr } = ctx;
  const style = TEMPLATE_STYLES[c.template];
  const nav = navItems(ctx);
  const solid = style.header === "solid";
  const phone = telLink(c.contact.phone);
  const wa = whatsappLink(c.contact.whatsapp || c.contact.phone, `Hello ${c.property.name}, I'd like to know about availability.`);
  const logo = c.logoMediaId ? site.media.get(c.logoMediaId) : undefined;

  return (
    <div lang={ctx.locale} className={`site min-h-screen ${style.page}`} style={themeVars(c)}>
      <a href="#main" className="skip-link">
        {tr("skip")}
      </a>
      {site.mode === "preview" ? (
        <div className="bg-amber-400 px-4 py-2 text-center text-sm font-semibold text-amber-950">Preview of your unpublished draft · forms are disabled · not visible to guests</div>
      ) : null}
      <header className={`sticky top-0 z-40 border-b ${solid ? "border-transparent bg-[var(--p)] text-[var(--on-p)]" : "border-black/10 bg-white/95 text-neutral-900 backdrop-blur"}`}>
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <a href={ctx.href("/")} className="flex min-w-0 items-center gap-3">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/media/${site.hotel.id}/${logo.id}/${bestVariant(logo, 480)}.webp`} alt="" className="h-10 w-auto" />
            ) : null}
            <span className={`truncate text-lg sm:text-xl ${style.heading}`}>{c.property.name}</span>
          </a>
          <nav aria-label="Main" className="hidden items-center gap-5 text-sm font-medium lg:flex">
            {nav.slice(0, 7).map((n) => (
              <a key={n.href} href={n.href} className="hover:underline hover:underline-offset-4">
                {n.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <a
              href={ctx.href("/enquire")}
              data-cta="enquire_header"
              className={`hidden rounded-lg px-4 py-2 text-sm font-semibold sm:inline-block ${solid ? "bg-[var(--a)] text-[var(--on-a)]" : "bg-[var(--p)] text-[var(--on-p)]"}`}
            >
              {primaryCta(ctx).label}
            </a>
            <details className="relative lg:hidden">
              <summary className="cursor-pointer list-none rounded-lg border border-current/30 px-3 py-2 text-sm font-semibold [&::-webkit-details-marker]:hidden">{tr("menu")}</summary>
              <nav aria-label="Mobile" className="absolute right-0 mt-2 w-56 rounded-xl bg-white p-2 text-neutral-900 shadow-xl ring-1 ring-black/10">
                <a href={ctx.href("/")} className="block rounded-lg px-3 py-2 hover:bg-black/5">
                  {tr("home")}
                </a>
                {nav.map((n) => (
                  <a key={n.href} href={n.href} className="block rounded-lg px-3 py-2 hover:bg-black/5">
                    {n.label}
                  </a>
                ))}
              </nav>
            </details>
          </div>
        </div>
      </header>

      <main id="main" className="pb-20 lg:pb-0">
        {children}
      </main>

      <footer className="border-t border-black/10 bg-neutral-900 pb-24 text-neutral-300 lg:pb-0">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-3">
          <div>
            <p className={`text-lg text-white ${style.heading}`}>{c.property.name}</p>
            {c.property.tagline ? <p className="mt-2 text-sm">{c.property.tagline}</p> : null}
            <address className="mt-4 text-sm not-italic leading-relaxed">{addressLine(c)}</address>
          </div>
          <div className="text-sm">
            <p className="font-semibold text-white">{tr("contactUs")}</p>
            <ul className="mt-3 space-y-2">
              {phone ? (
                <li>
                  <a href={phone} data-cta="call_footer" className="hover:text-white">
                    {c.contact.phone}
                  </a>
                </li>
              ) : null}
              {wa ? (
                <li>
                  <a href={wa} target="_blank" rel="noopener noreferrer" data-cta="whatsapp_footer" className="hover:text-white">
                    {tr("whatsapp")}: {c.contact.whatsapp || c.contact.phone}
                  </a>
                </li>
              ) : null}
              {c.contact.email ? (
                <li>
                  <a href={`mailto:${c.contact.email}`} className="hover:text-white">
                    {c.contact.email}
                  </a>
                </li>
              ) : null}
            </ul>
          </div>
          <div className="text-sm">
            <ul className="grid grid-cols-2 gap-2">
              {nav.map((n) => (
                <li key={n.href}>
                  <a href={n.href} className="hover:text-white">
                    {n.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5 text-xs sm:px-6">
            <p>
              © {new Date().getFullYear()} {c.legal.businessName || c.property.name}
              {c.legal.gstin ? ` · GSTIN ${c.legal.gstin}` : ""}
            </p>
            <p className="flex flex-wrap gap-4">
              <a href={ctx.href("/privacy")} className="hover:text-white">
                {tr("privacy")}
              </a>
              <a href={ctx.href("/terms")} className="hover:text-white">
                {tr("terms")}
              </a>
              <a href={ctx.href("/accessibility")} className="hover:text-white">
                {tr("accessibility")}
              </a>
              <span>{tr("websiteBy", { platform: config.platformName })}</span>
            </p>
          </div>
        </div>
      </footer>

      {/* Sticky mobile actions: the primary conversion path is always one thumb away. */}
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-black/10 bg-white/95 p-2 backdrop-blur lg:hidden">
        <div className="mx-auto grid max-w-md grid-cols-3 gap-2 text-sm font-semibold">
          {phone ? (
            <a href={phone} data-cta="call_sticky" className="rounded-lg border border-black/15 py-3 text-center text-neutral-900">
              {tr("call")}
            </a>
          ) : (
            <span />
          )}
          {wa ? (
            <a href={wa} target="_blank" rel="noopener noreferrer" data-cta="whatsapp_sticky" className="rounded-lg bg-[#1f7a4d] py-3 text-center text-white">
              {tr("whatsapp")}
            </a>
          ) : (
            <span />
          )}
          <a href={ctx.href("/enquire")} data-cta="enquire_sticky" className="rounded-lg bg-[var(--p)] py-3 text-center text-[var(--on-p)]">
            {ctx.c.booking.mode === "request" ? tr("requestBooking").split(" ")[0] : tr("enquire").split(" ")[0]}
          </a>
        </div>
      </div>
      <Tracker enabled={site.mode === "live"} />
    </div>
  );
}

export function OfflinePage({ site }: { site: LoadedSite }) {
  const tr = translator(site.content.locale);
  const phone = telLink(site.content.contact.phone);
  return (
    <main lang={site.content.locale} className="site flex min-h-screen items-center justify-center bg-neutral-50 px-6 text-center" style={themeVars(site.content)}>
      <div className="max-w-md">
        <p className="text-sm uppercase tracking-widest text-neutral-500">{site.content.property.name}</p>
        <h1 className="mt-3 text-2xl font-semibold text-neutral-900">{tr("unavailableTitle")}</h1>
        <p className="mt-3 text-neutral-600">{tr("unavailableBody")}</p>
        {phone ? (
          <a href={phone} className="mt-6 inline-block rounded-lg bg-[var(--p)] px-5 py-3 font-semibold text-[var(--on-p)]">
            {site.content.contact.phone}
          </a>
        ) : null}
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

function HomePage({ ctx }: { ctx: Ctx }) {
  const { c, tr } = ctx;
  const style = TEMPLATE_STYLES[c.template];
  const heroId = c.hero.mediaIds[0] ?? c.gallery.mediaIds[0] ?? c.rooms.find((r) => r.mediaIds.length)?.mediaIds[0];
  const hasHeroImage = Boolean(heroId && ctx.site.media.get(heroId));
  const rooms = c.rooms.filter((r) => r.visible);
  const headline = c.hero.headline || c.property.name;
  const sub = c.hero.subheadline || c.property.tagline;
  const highlights = c.property.highlights
    .map(highlightFor)
    .filter((h): h is Highlight => Boolean(h))
    .slice(0, 6);

  const hero =
    style.hero === "split" ? (
      <section className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-10 sm:px-6 lg:grid-cols-2 lg:py-16">
        <div className="space-y-5">
          <Heading ctx={ctx} as="h1" className="text-4xl leading-tight sm:text-5xl">
            {headline}
          </Heading>
          {sub ? <p className="text-lg text-neutral-600">{sub}</p> : null}
          <CtaButtons ctx={ctx} />
        </div>
        <div className="aspect-[4/3] overflow-hidden rounded-3xl bg-black/5">
          <Img ctx={ctx} id={heroId} sizes="(min-width: 1024px) 50vw, 100vw" eager className="h-full w-full object-cover" />
        </div>
      </section>
    ) : (
      <section className="relative isolate flex min-h-[min(80vh,620px)] items-end overflow-hidden bg-neutral-800 sm:min-h-[min(78vh,760px)]">
        {hasHeroImage ? <Img ctx={ctx} id={heroId} sizes="100vw" eager className="absolute inset-0 -z-10 h-full w-full object-cover" /> : null}
        <div className={`absolute inset-0 -z-10 ${style.hero === "overlay" ? "bg-gradient-to-t from-black/75 via-black/35 to-black/20" : "bg-gradient-to-tr from-black/80 via-black/30 to-transparent"}`} />
        <div className={`mx-auto w-full max-w-6xl px-4 pb-14 pt-32 text-white sm:px-6 ${style.hero === "overlay" ? "text-center" : ""}`}>
          <div className={`space-y-5 ${style.hero === "overlay" ? "mx-auto max-w-3xl" : "max-w-2xl"}`}>
            <h1 className={`${style.heading} text-4xl leading-tight drop-shadow sm:text-6xl`}>{headline}</h1>
            {sub ? <p className="text-lg text-white/90 sm:text-xl">{sub}</p> : null}
            <div className={style.hero === "overlay" ? "flex justify-center" : ""}>
              <CtaButtons ctx={ctx} inverted />
            </div>
          </div>
        </div>
      </section>
    );

  return (
    <>
      {hero}
      {c.property.whyDirect ? (
        <div className="bg-[var(--p)] text-[var(--on-p)]">
          <p className="mx-auto max-w-6xl px-4 py-4 text-center text-sm font-medium sm:px-6 sm:text-base">
            <span className="mr-2 font-semibold uppercase tracking-wider opacity-80">{tr("whyDirect")}:</span>
            {c.property.whyDirect}
          </p>
        </div>
      ) : null}

      {c.property.description ? (
        <Section>
          <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
            <div>
              <Heading ctx={ctx}>{c.about.title || c.property.name}</Heading>
              <div className="mt-5">
                <Paragraphs text={c.property.description} />
              </div>
            </div>
            <aside className={`h-fit space-y-3 p-5 text-sm ${style.card}`}>
              {highlights.length ? (
                <ul className="space-y-1.5 border-b border-black/5 pb-3">
                  {highlights.map((h) => (
                    <li key={h.key} className="flex gap-2 text-neutral-900">
                      <span aria-hidden="true" className="text-[var(--a)]">
                        ✓
                      </span>
                      {h[ctx.locale]}
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className="font-semibold text-neutral-900">{tr("times", { in: c.policies.checkIn, out: c.policies.checkOut })}</p>
              <p>{addressLine(c)}</p>
              <a href={ctx.href("/location")} className="font-semibold text-[var(--p)]">
                {tr("getDirections")} →
              </a>
            </aside>
          </div>
        </Section>
      ) : null}

      {rooms.length ? (
        <Section alt>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <Heading ctx={ctx}>{tr("ourRooms")}</Heading>
            <a href={ctx.href("/rooms")} className="text-sm font-semibold text-[var(--p)]">
              {tr("viewRooms")} →
            </a>
          </div>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {rooms.slice(0, 6).map((r) => (
              <RoomCard key={r.id} ctx={ctx} room={r} />
            ))}
          </div>
          {c.booking.showPrices && rooms.some((r) => r.fromPrice) ? <p className="mt-4 text-xs text-neutral-600">{tr("guidePrice")} {c.policies.taxNote}</p> : null}
        </Section>
      ) : null}

      {c.amenities.length ? (
        <Section>
          <Heading ctx={ctx}>{tr("amenities")}</Heading>
          <div className="mt-6">
            <AmenityGrid ctx={ctx} items={c.amenities.slice(0, 12)} />
          </div>
          {c.amenities.length > 12 ? (
            <a href={ctx.href("/amenities")} className="mt-6 inline-block text-sm font-semibold text-[var(--p)]">
              +{c.amenities.length - 12} →
            </a>
          ) : null}
        </Section>
      ) : null}

      {c.sections.gallery && c.gallery.mediaIds.length ? (
        <Section alt>
          <div className="flex items-end justify-between">
            <Heading ctx={ctx}>{tr("gallery")}</Heading>
            <a href={ctx.href("/gallery")} className="text-sm font-semibold text-[var(--p)]">
              {tr("gallery")} →
            </a>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3">
            {c.gallery.mediaIds.slice(0, 6).map((id) => (
              <Img key={id} ctx={ctx} id={id} sizes="(min-width: 768px) 33vw, 50vw" className="aspect-[4/3] h-full w-full rounded-lg object-cover" />
            ))}
          </div>
        </Section>
      ) : null}

      {c.sections.offers && c.offers.length ? <OffersBlock ctx={ctx} /> : null}

      {c.sections.testimonials && c.testimonials.length ? (
        <Section>
          <Heading ctx={ctx}>{tr("reviews")}</Heading>
          <div className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {c.testimonials.map((q, i) => (
              <figure key={i} className={`p-6 ${style.card}`}>
                <blockquote className="text-[15px] leading-relaxed">“{q.quote}”</blockquote>
                <figcaption className="mt-4 text-sm font-semibold text-neutral-900">
                  {q.author}
                  {q.source ? <span className="font-normal text-neutral-500"> · {q.source}</span> : null}
                </figcaption>
              </figure>
            ))}
          </div>
        </Section>
      ) : null}

      <Section alt>
        <div className="grid items-center gap-8 lg:grid-cols-2">
          <div className="space-y-4">
            <Heading ctx={ctx}>{tr("location")}</Heading>
            <p className="text-[16px]">{addressLine(c)}</p>
            {c.nearby.length && c.sections.nearby ? (
              <ul className="space-y-1 text-sm">
                {c.nearby.slice(0, 5).map((n, i) => (
                  <li key={i}>
                    <strong className="text-neutral-900">{n.name}</strong>
                    {n.distance ? ` · ${n.distance}` : ""}
                  </li>
                ))}
              </ul>
            ) : null}
            <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(c.contact.mapQuery || addressLine(c))}`} target="_blank" rel="noopener noreferrer" data-cta="directions" className="inline-block font-semibold text-[var(--p)]">
              {tr("getDirections")} ↗
            </a>
          </div>
          <MapEmbed query={c.contact.mapQuery || addressLine(c)} label={tr("showMap")} note={tr("mapNote")} />
        </div>
      </Section>

      <Section>
        <div className="flex flex-col items-center gap-5 text-center">
          <Heading ctx={ctx}>{c.property.name}</Heading>
          {c.property.whyDirect ? <p className="max-w-xl text-neutral-600">{c.property.whyDirect}</p> : null}
          <CtaButtons ctx={ctx} />
        </div>
      </Section>
    </>
  );
}

function PageTitle({ ctx, title, intro }: { ctx: Ctx; title: string; intro?: string }) {
  return (
    <div className="border-b border-black/10 bg-black/[0.02]">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <Heading ctx={ctx} as="h1">
          {title}
        </Heading>
        {intro ? <p className="mt-3 max-w-2xl text-neutral-600">{intro}</p> : null}
      </div>
    </div>
  );
}

function RoomsPage({ ctx }: { ctx: Ctx }) {
  const rooms = ctx.c.rooms.filter((r) => r.visible);
  return (
    <>
      <PageTitle ctx={ctx} title={ctx.tr("ourRooms")} intro={ctx.c.booking.showPrices ? `${ctx.tr("guidePrice")} ${ctx.c.policies.taxNote}` : undefined} />
      <Section>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {rooms.map((r) => (
            <RoomCard key={r.id} ctx={ctx} room={r} />
          ))}
        </div>
      </Section>
    </>
  );
}

function RoomDetailPage({ ctx, room }: { ctx: Ctx; room: Room }) {
  const { tr, c } = ctx;
  const style = TEMPLATE_STYLES[c.template];
  const [first, ...rest] = room.mediaIds;
  return (
    <>
      <Section>
        <nav aria-label="Breadcrumb" className="mb-4 text-sm text-neutral-500">
          <a href={ctx.href("/rooms")} className="hover:underline">
            {tr("rooms")}
          </a>{" "}
          / <span aria-current="page">{room.name}</span>
        </nav>
        <div className="grid gap-10 lg:grid-cols-[3fr_2fr]">
          <div className="space-y-3">
            <div className="aspect-[4/3] overflow-hidden rounded-xl bg-black/5">
              <Img ctx={ctx} id={first} sizes="(min-width: 1024px) 60vw, 100vw" eager className="h-full w-full object-cover" />
            </div>
            {rest.length ? (
              <div className="grid grid-cols-3 gap-3">
                {rest.slice(0, 6).map((id) => (
                  <Img key={id} ctx={ctx} id={id} sizes="20vw" className="aspect-[4/3] w-full rounded-lg object-cover" />
                ))}
              </div>
            ) : null}
          </div>
          <div className="space-y-5">
            <Heading ctx={ctx} as="h1">
              {room.name}
            </Heading>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-neutral-500">{tr("adults")}</dt>
                <dd className="font-semibold text-neutral-900">
                  {room.maxAdults}
                  {room.maxChildren ? ` + ${room.maxChildren} ${tr("children").toLowerCase()}` : ""}
                </dd>
              </div>
              {room.bedType ? (
                <div>
                  <dt className="text-neutral-500">{tr("bed")}</dt>
                  <dd className="font-semibold text-neutral-900">{room.bedType}</dd>
                </div>
              ) : null}
              {room.sizeSqft ? (
                <div>
                  <dt className="text-neutral-500">{tr("size")}</dt>
                  <dd className="font-semibold text-neutral-900">{room.sizeSqft} sq ft</dd>
                </div>
              ) : null}
              {room.view ? (
                <div>
                  <dt className="text-neutral-500">{tr("view")}</dt>
                  <dd className="font-semibold text-neutral-900">{room.view}</dd>
                </div>
              ) : null}
            </dl>
            <div className={`space-y-3 p-5 ${style.card}`}>
              <PriceTag ctx={ctx} room={room} />
              {c.booking.showPrices && room.fromPrice ? (
                <p className="text-xs text-neutral-600">
                  {tr("guidePrice")} {c.policies.taxNote}
                </p>
              ) : null}
              <a href={ctx.href(`/enquire?room=${room.id}`)} data-cta="enquire_room" className="block rounded-lg bg-[var(--p)] px-5 py-3 text-center font-semibold text-[var(--on-p)]">
                {c.booking.mode === "request" ? tr("requestRoom") : tr("enquireRoom")}
              </a>
            </div>
            {room.description ? <Paragraphs text={room.description} /> : room.summary ? <p>{room.summary}</p> : null}
            {room.amenities.length ? (
              <div>
                <Heading ctx={ctx} as="h3">
                  {tr("inTheRoom")}
                </Heading>
                <div className="mt-3">
                  <AmenityGrid ctx={ctx} items={room.amenities} />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </Section>
    </>
  );
}

function AmenitiesPage({ ctx }: { ctx: Ctx }) {
  const catalog = AMENITIES.filter((a) => ctx.c.amenities.includes(a.key)).map((a) => a.key);
  const custom = ctx.c.amenities.filter((a) => !isCatalogAmenity(a));
  return (
    <>
      <PageTitle ctx={ctx} title={ctx.tr("amenities")} />
      <Section>
        <AmenityGrid ctx={ctx} items={[...catalog, ...custom]} />
      </Section>
    </>
  );
}

function GalleryPage({ ctx }: { ctx: Ctx }) {
  return (
    <>
      <PageTitle ctx={ctx} title={ctx.tr("gallery")} />
      <Section>
        <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 [&>img]:mb-4">
          {ctx.c.gallery.mediaIds.map((id) => (
            <Img key={id} ctx={ctx} id={id} sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" className="w-full rounded-lg" />
          ))}
        </div>
      </Section>
    </>
  );
}

function DiningPage({ ctx }: { ctx: Ctx }) {
  const d = ctx.c.dining;
  return (
    <>
      <PageTitle ctx={ctx} title={d.title || ctx.tr("dining")} />
      <Section>
        <div className="grid gap-8 lg:grid-cols-2">
          <Paragraphs text={d.body} />
          <div className="grid grid-cols-2 gap-3">
            {d.mediaIds.slice(0, 4).map((id) => (
              <Img key={id} ctx={ctx} id={id} sizes="25vw" className="aspect-square w-full rounded-lg object-cover" />
            ))}
          </div>
        </div>
      </Section>
    </>
  );
}

function OffersBlock({ ctx }: { ctx: Ctx }) {
  const style = TEMPLATE_STYLES[ctx.c.template];
  const today = todayIST();
  const offers = ctx.c.offers.filter((o) => !o.validUntil || o.validUntil >= today);
  if (!offers.length) return null;
  return (
    <Section>
      <Heading ctx={ctx}>{ctx.tr("offers")}</Heading>
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        {offers.map((o) => (
          <article key={o.id} className={`space-y-2 p-6 ${style.card}`}>
            <h3 className={`${style.heading} text-xl text-neutral-900`}>{o.title}</h3>
            {o.body ? <p className="text-[15px] leading-relaxed">{o.body}</p> : null}
            <p className="text-sm text-neutral-600">
              {o.code ? ctx.tr("code", { code: o.code }) : null}
              {o.code && o.validUntil ? " · " : null}
              {o.validUntil ? ctx.tr("validUntil", { date: formatDate(o.validUntil) }) : null}
            </p>
            <a href={ctx.href("/enquire")} data-cta="enquire_offer" className="inline-block text-sm font-semibold text-[var(--p)]">
              {primaryCta(ctx).label} →
            </a>
          </article>
        ))}
      </div>
    </Section>
  );
}

function LocationPage({ ctx }: { ctx: Ctx }) {
  const { c, tr } = ctx;
  const q = c.contact.mapQuery || addressLine(c);
  return (
    <>
      <PageTitle ctx={ctx} title={tr("location")} intro={addressLine(c)} />
      <Section>
        <div className="grid gap-10 lg:grid-cols-2">
          <div className="space-y-6">
            <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}`} target="_blank" rel="noopener noreferrer" data-cta="directions" className="inline-block rounded-lg bg-[var(--p)] px-5 py-3 font-semibold text-[var(--on-p)]">
              {tr("getDirections")} ↗
            </a>
            {c.contact.directions ? (
              <div>
                <Heading ctx={ctx} as="h3">
                  {tr("directions")}
                </Heading>
                <div className="mt-3">
                  <Paragraphs text={c.contact.directions} />
                </div>
              </div>
            ) : null}
            {c.sections.nearby && c.nearby.length ? (
              <div>
                <Heading ctx={ctx} as="h3">
                  {tr("nearby")}
                </Heading>
                <ul className="mt-3 divide-y divide-black/10">
                  {c.nearby.map((n, i) => (
                    <li key={i} className="flex flex-wrap justify-between gap-2 py-3">
                      <span>
                        <strong className="text-neutral-900">{n.name}</strong>
                        {n.note ? <span className="block text-sm text-neutral-600">{n.note}</span> : null}
                      </span>
                      {n.distance ? <span className="text-sm text-neutral-600">{n.distance}</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
          <MapEmbed query={q} label={tr("showMap")} note={tr("mapNote")} />
        </div>
      </Section>
    </>
  );
}

function PoliciesPage({ ctx }: { ctx: Ctx }) {
  const { c, tr } = ctx;
  const rows: [DictKey, string][] = [
    ["cancellation", c.policies.cancellation],
    ["payment", c.policies.payment],
    ["taxes", c.policies.taxNote],
    ["childrenPolicy", c.policies.children],
    ["pets", c.policies.pets],
    ["smoking", c.policies.smoking],
    ["idProof", c.policies.idProof],
    ["houseRules", c.policies.houseRules],
  ];
  return (
    <>
      <PageTitle ctx={ctx} title={tr("policiesTitle")} intro={tr("times", { in: c.policies.checkIn, out: c.policies.checkOut })} />
      <Section>
        <dl className="max-w-3xl divide-y divide-black/10">
          {rows
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k} className="grid gap-2 py-5 sm:grid-cols-[180px_1fr]">
                <dt className="font-semibold text-neutral-900">{tr(k)}</dt>
                <dd className="whitespace-pre-line leading-relaxed">{v}</dd>
              </div>
            ))}
        </dl>
      </Section>
    </>
  );
}

function AboutPage({ ctx }: { ctx: Ctx }) {
  return (
    <>
      <PageTitle ctx={ctx} title={ctx.c.about.title || ctx.tr("about")} />
      <Section>
        <Paragraphs text={ctx.c.about.body || ctx.c.property.description} />
      </Section>
    </>
  );
}

function FaqPage({ ctx }: { ctx: Ctx }) {
  return (
    <>
      <PageTitle ctx={ctx} title={ctx.tr("faqTitle")} />
      <Section>
        <div className="max-w-3xl divide-y divide-black/10">
          {ctx.c.faq.map((f, i) => (
            <details key={i} className="group py-4">
              <summary className="cursor-pointer list-none font-semibold text-neutral-900 [&::-webkit-details-marker]:hidden">
                <span className="mr-2 inline-block transition group-open:rotate-90">›</span>
                {f.q}
              </summary>
              <p className="mt-3 whitespace-pre-line pl-5 leading-relaxed">{f.a}</p>
            </details>
          ))}
        </div>
      </Section>
    </>
  );
}

function enquiryProps(ctx: Ctx, search: Search) {
  const { c } = ctx;
  const policySummary = [
    c.booking.mode === "request" ? ctx.tr("requestNote") : "",
    c.policies.cancellation ? `${ctx.tr("cancellation")}: ${c.policies.cancellation}` : "",
    c.policies.taxNote ? `${ctx.tr("taxes")}: ${c.policies.taxNote}` : "",
    ctx.tr("times", { in: c.policies.checkIn, out: c.policies.checkOut }),
  ].filter(Boolean);
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const checkIn = one(search.checkIn);
  const checkOut = one(search.checkOut);
  return {
    locale: ctx.locale,
    hotelName: c.property.name,
    mode: c.booking.mode,
    rooms: c.rooms.filter((r) => r.visible).map((r) => ({ id: r.id, name: r.name, maxAdults: r.maxAdults, maxChildren: r.maxChildren })),
    defaults: { roomId: one(search.room), checkIn: checkIn && dateRe.test(checkIn) ? checkIn : undefined, checkOut: checkOut && dateRe.test(checkOut) ? checkOut : undefined },
    policySummary,
    privacyHref: ctx.href("/privacy"),
    formToken: signTimestamp(),
    minDate: todayIST(),
    whatsapp: c.contact.whatsapp || c.contact.phone || null,
    disabled: ctx.site.mode === "preview",
    turnstileSiteKey: config.turnstile.siteKey || undefined,
  } as const;
}

function EnquirePage({ ctx, search }: { ctx: Ctx; search: Search }) {
  const style = TEMPLATE_STYLES[ctx.c.template];
  return (
    <>
      <PageTitle ctx={ctx} title={primaryCta(ctx).label} intro={ctx.c.booking.mode === "request" ? ctx.tr("requestNote") : ctx.tr("enquiryNote")} />
      <Section>
        <div className="grid gap-10 lg:grid-cols-[3fr_2fr]">
          <div className={`p-5 sm:p-8 ${style.card}`}>
            <EnquiryForm {...enquiryProps(ctx, search)} />
          </div>
          <ContactDetails ctx={ctx} />
        </div>
      </Section>
    </>
  );
}

function ContactDetails({ ctx }: { ctx: Ctx }) {
  const { c, tr } = ctx;
  const phone = telLink(c.contact.phone);
  const wa = whatsappLink(c.contact.whatsapp || c.contact.phone);
  return (
    <aside className="space-y-5 text-[15px]">
      <div>
        <p className="font-semibold text-neutral-900">{tr("address")}</p>
        <address className="mt-1 not-italic">{addressLine(c)}</address>
      </div>
      {phone ? (
        <div>
          <p className="font-semibold text-neutral-900">{tr("call")}</p>
          <a href={phone} data-cta="call_contact" className="text-[var(--p)] underline-offset-4 hover:underline">
            {c.contact.phone}
          </a>
        </div>
      ) : null}
      {wa ? (
        <div>
          <p className="font-semibold text-neutral-900">{tr("whatsapp")}</p>
          <a href={wa} target="_blank" rel="noopener noreferrer" data-cta="whatsapp_contact" className="text-[var(--p)] underline-offset-4 hover:underline">
            {c.contact.whatsapp || c.contact.phone}
          </a>
        </div>
      ) : null}
      {c.contact.email ? (
        <div>
          <p className="font-semibold text-neutral-900">{tr("email")}</p>
          <a href={`mailto:${c.contact.email}`} className="text-[var(--p)] underline-offset-4 hover:underline">
            {c.contact.email}
          </a>
        </div>
      ) : null}
      <p className="text-sm text-neutral-600">{tr("times", { in: c.policies.checkIn, out: c.policies.checkOut })}</p>
    </aside>
  );
}

function ContactPage({ ctx, search }: { ctx: Ctx; search: Search }) {
  const style = TEMPLATE_STYLES[ctx.c.template];
  return (
    <>
      <PageTitle ctx={ctx} title={ctx.tr("contactUs")} />
      <Section>
        <div className="grid gap-10 lg:grid-cols-[2fr_3fr]">
          <ContactDetails ctx={ctx} />
          <div className={`p-5 sm:p-8 ${style.card}`}>
            <EnquiryForm {...enquiryProps(ctx, search)} />
          </div>
        </div>
      </Section>
    </>
  );
}

function LegalPage({ ctx, kind }: { ctx: Ctx; kind: "privacy" | "terms" | "accessibility" }) {
  const { c } = ctx;
  const entity = c.legal.businessName || c.property.name;
  const contact = c.legal.grievanceEmail || c.contact.email;
  const blocks: Record<typeof kind, { title: string; paras: string[] }> = {
    privacy: {
      title: ctx.tr("privacy"),
      paras: [
        `${entity} (“we”) runs ${c.property.name} and this website. We decide how your personal data is used. ${config.platformName} hosts this website and processes data only on our instructions.`,
        "What we collect: when you send an enquiry or booking request we collect your name, email, phone number, stay dates, number of guests, room preference and your message. If you report a payment, we also receive the transaction reference and any screenshot you choose to upload. We never ask for card numbers, UPI PINs or one-time passwords on this website.",
        "Why we use it: to answer your enquiry, arrange and manage your stay, take payment directly from you, and meet legal obligations such as guest registration at check-in. We send offers only if you tick the box to receive them, and you can withdraw that consent at any time.",
        "Cookies and analytics: this website does not set cookies. We count page visits without cookies and without storing your IP address. The map loads Google Maps only if you choose to show it.",
        "How long we keep it: enquiries that do not become bookings are deleted or anonymised within 24 months. Booking records are kept as long as the law requires.",
        `Your rights: under India’s Digital Personal Data Protection Act, 2023 you can ask to access, correct or erase your personal data, withdraw consent, and raise a grievance.${contact ? ` Contact us at ${contact}.` : ""}`,
      ],
    },
    terms: {
      title: ctx.tr("terms"),
      paras: [
        `This website is operated by ${entity}. Room descriptions, photographs and prices are provided in good faith. Prices shown are guides; your written quote from us is the price that applies.`,
        "Sending an enquiry or booking request does not reserve a room. A booking is confirmed only when we confirm it to you in writing.",
        "Payments are made directly to us. Deposits, balances, cancellations and refunds follow the policies on our Policies page and the terms in your confirmation.",
        "These terms are governed by the laws of India.",
      ],
    },
    accessibility: {
      title: ctx.tr("accessibility"),
      paras: [
        `We want everyone to be able to use the ${c.property.name} website. It is built to meet WCAG 2.2 level AA: it works with a keyboard and screen readers, keeps text readable when zoomed, and does not scroll sideways on phones.`,
        `If something on this website is hard to use, or you need information in another format, ${contact ? `email ${contact} or ` : ""}call us${c.contact.phone ? ` on ${c.contact.phone}` : ""} and we will help.`,
      ],
    },
  };
  const b = blocks[kind];
  return (
    <>
      <PageTitle ctx={ctx} title={b.title} />
      <Section>
        <div className="prose-site max-w-3xl">
          {b.paras.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </Section>
    </>
  );
}

async function PayPage({ ctx, token }: { ctx: Ctx; token: string }) {
  const found = await findPaymentRequestByToken(token);
  if (!found || found.hotel.id !== ctx.site.hotel.id) notFound();
  const { request, reservation } = found;
  const { tr, c } = ctx;
  const style = TEMPLATE_STYLES[c.template];
  const expired = request.expiresAt < new Date() && ["unpaid", "rejected"].includes(request.status);
  const open = !expired && ["unpaid", "guest_reported", "needs_review", "rejected"].includes(request.status);
  const intent = buildUpiIntent({ vpa: request.payee.vpa, payeeName: request.payee.payeeName, amountPaise: request.amount, note: reservation.ref });
  const purpose = request.purpose === "deposit" ? tr("deposit") : request.purpose === "balance" ? tr("balance") : tr("full");
  const statusTone = request.status === "paid" ? "bg-emerald-100 text-emerald-900" : request.status === "guest_reported" ? "bg-sky-100 text-sky-900" : request.status === "unpaid" ? "bg-amber-100 text-amber-900" : "bg-red-100 text-red-900";

  return (
    <>
      <PageTitle ctx={ctx} title={tr("payTitle")} />
      <Section>
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="space-y-5">
            <p className={`rounded-lg px-4 py-3 text-sm font-semibold ${statusTone}`} role="status">
              {expired ? tr("payExpired") : tr(`status.${request.status}` as DictKey)}
            </p>
            <dl className={`divide-y divide-black/10 p-5 text-[15px] ${style.card}`}>
              {[
                [tr("reference"), reservation.ref],
                [tr("amountRequested"), formatINR(request.amount)],
                [tr("forLabel"), purpose],
                [tr("stay"), `${formatDate(reservation.checkIn)} – ${formatDate(reservation.checkOut)} (${nightsBetween(reservation.checkIn, reservation.checkOut)}N) · ${reservation.roomName}`],
                [tr("payTo"), request.payee.payeeName],
                [tr("upiId"), request.payee.vpa],
              ].map(([k, v]) => (
                <div key={k} className="flex flex-wrap justify-between gap-2 py-2.5">
                  <dt className="text-neutral-600">{k}</dt>
                  <dd className="font-semibold text-neutral-900">{v}</dd>
                </div>
              ))}
            </dl>
            <ul className="space-y-2 text-sm leading-relaxed text-neutral-700">
              <li>• {tr("nameCheck", { name: request.payee.payeeName })}</li>
              <li>• {tr("addRef", { ref: reservation.ref })}</li>
              <li>• {tr("directNote", { hotel: c.property.name, platform: config.platformName })}</li>
              <li>• {tr("confirmNote")}</li>
              <li>• {tr("refundNote")}</li>
            </ul>
          </div>

          {open ? (
            <div className="space-y-6">
              <div className={`flex flex-col items-center gap-4 p-6 text-center ${style.card}`}>
                <p className="font-semibold text-neutral-900">{tr("scanPay")}</p>
                {request.payee.qrMediaId ? (
                  // Rendered whole and large with its own quiet zone; never cropped or recoloured.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/site/pay/${token}/qr`} alt={`UPI QR for ${request.payee.payeeName}`} width={280} height={280} className="h-[280px] w-[280px] bg-white object-contain p-2 sm:h-[320px] sm:w-[320px]" />
                ) : null}
                <p className="text-sm">
                  {tr("upiId")}: <strong className="select-all font-mono">{request.payee.vpa}</strong>
                </p>
                <a href={intent} data-cta="upi_intent" className="rounded-lg bg-[var(--p)] px-5 py-3 font-semibold text-[var(--on-p)]">
                  {tr("openUpi")} · {formatINR(request.amount)}
                </a>
                <p className="max-w-xs text-xs text-neutral-600">{tr("openUpiHint")}</p>
              </div>
              <div className={`space-y-3 p-6 ${style.card}`}>
                <Heading ctx={ctx} as="h3">
                  {tr("reportTitle")}
                </Heading>
                <p className="text-sm text-neutral-600">{tr("reportBody")}</p>
                {request.status === "guest_reported" && request.guestUtr ? <p className="text-sm">UTR: <span className="font-mono">{request.guestUtr}</span></p> : null}
                <PayReportForm
                  token={token}
                  labels={{ utr: tr("utr"), utrHint: tr("utrHint"), screenshot: tr("screenshot"), note: tr("note"), report: tr("report"), sending: tr("sending"), sent: tr("reportSent"), error: tr("errorGeneric") }}
                />
              </div>
            </div>
          ) : null}
        </div>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Dispatcher, metadata and structured data
// ---------------------------------------------------------------------------

export async function SitePage({ site, segments, search }: { site: LoadedSite; segments: string[]; search: Search }) {
  const ctx = ctxFor(site);
  const c = site.content;
  const [first, second, ...rest] = segments;
  if (rest.length) notFound();

  let page: ReactNode;
  switch (first ?? "") {
    case "":
      page = <HomePage ctx={ctx} />;
      break;
    case "rooms": {
      if (!second) {
        page = <RoomsPage ctx={ctx} />;
        break;
      }
      const room = c.rooms.find((r) => r.slug === second && r.visible);
      if (!room) notFound();
      page = <RoomDetailPage ctx={ctx} room={room} />;
      break;
    }
    case "amenities":
      if (second || !c.amenities.length) notFound();
      page = <AmenitiesPage ctx={ctx} />;
      break;
    case "gallery":
      if (second || !c.sections.gallery || !c.gallery.mediaIds.length) notFound();
      page = <GalleryPage ctx={ctx} />;
      break;
    case "dining":
      if (second || !c.sections.dining || !c.dining.body) notFound();
      page = <DiningPage ctx={ctx} />;
      break;
    case "offers":
      if (second || !c.sections.offers || !c.offers.length) notFound();
      page = (
        <>
          <PageTitle ctx={ctx} title={ctx.tr("offers")} />
          <OffersBlock ctx={ctx} />
        </>
      );
      break;
    case "faq":
      if (second || !c.sections.faq || !c.faq.length) notFound();
      page = <FaqPage ctx={ctx} />;
      break;
    case "location":
      page = <LocationPage ctx={ctx} />;
      break;
    case "policies":
      page = <PoliciesPage ctx={ctx} />;
      break;
    case "about":
      if (!c.about.body && !c.property.description) notFound();
      page = <AboutPage ctx={ctx} />;
      break;
    case "contact":
      page = <ContactPage ctx={ctx} search={search} />;
      break;
    case "enquire":
      page = <EnquirePage ctx={ctx} search={search} />;
      break;
    case "privacy":
    case "terms":
    case "accessibility":
      page = <LegalPage ctx={ctx} kind={first as "privacy" | "terms" | "accessibility"} />;
      break;
    case "pay":
      if (!second || site.mode === "preview") notFound();
      page = <PayPage ctx={ctx} token={second} />;
      break;
    default:
      notFound();
  }

  return (
    <SiteFrame site={site}>
      {first ? null : <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(hotelJsonLd(site)).replace(/</g, "\\u003c") }} />}
      {page}
    </SiteFrame>
  );
}

const SCHEMA_TYPES: Record<SiteContent["property"]["type"], string> = {
  hotel: "Hotel",
  resort: "Resort",
  guest_house: "BedAndBreakfast",
  homestay: "BedAndBreakfast",
  lodge: "LodgingBusiness",
  boutique_hotel: "Hotel",
  villa: "LodgingBusiness",
};

export function hotelJsonLd(site: LoadedSite) {
  const c = site.content;
  const origin = site.canonicalOrigin;
  const images = Array.from(new Set([...c.hero.mediaIds, ...c.gallery.mediaIds]))
    .slice(0, 6)
    .map((id) => site.media.get(id))
    .filter(Boolean)
    .map((m) => `${origin}/media/${site.hotel.id}/${m!.id}/${bestVariant(m!, 1600)}.webp`);
  const a = c.contact.address;
  const prices = c.booking.showPrices ? c.rooms.filter((r) => r.visible && r.fromPrice).map((r) => r.fromPrice!) : [];
  return {
    "@context": "https://schema.org",
    "@type": SCHEMA_TYPES[c.property.type],
    name: c.property.name,
    description: c.seo.description || c.property.tagline || undefined,
    url: `${origin}/`,
    telephone: c.contact.phone || undefined,
    email: c.contact.email || undefined,
    image: images.length ? images : undefined,
    address: {
      "@type": "PostalAddress",
      streetAddress: [a.line1, a.line2, a.locality].filter(Boolean).join(", ") || undefined,
      addressLocality: a.city || undefined,
      addressRegion: a.state || undefined,
      postalCode: a.postalCode || undefined,
      addressCountry: a.country === "India" ? "IN" : a.country,
    },
    checkinTime: c.policies.checkIn,
    checkoutTime: c.policies.checkOut,
    petsAllowed: /not allowed|no pets/i.test(c.policies.pets) ? false : undefined,
    amenityFeature: c.amenities.slice(0, 30).map((key) => ({ "@type": "LocationFeatureSpecification", name: amenityLabel(key, "en"), value: true })),
    // Only prices that are visible on the page, so structured data matches what guests see.
    priceRange: prices.length ? `From ${formatINR(Math.min(...prices))} per night` : undefined,
  };
}

const PAGE_TITLES: Record<string, DictKey> = {
  rooms: "rooms",
  amenities: "amenities",
  gallery: "gallery",
  dining: "dining",
  offers: "offers",
  faq: "faq",
  location: "location",
  policies: "policies",
  about: "about",
  contact: "contact",
  enquire: "enquire",
  privacy: "privacy",
  terms: "terms",
  accessibility: "accessibility",
  pay: "payTitle",
};

export function siteMetadata(site: LoadedSite, segments: string[]): Metadata {
  const c = site.content;
  const tr = translator(c.locale);
  const [first, second] = segments;
  const room = first === "rooms" && second ? c.rooms.find((r) => r.slug === second) : undefined;
  const baseTitle = c.seo.title || `${c.property.name}${c.contact.address.city ? `, ${c.contact.address.city}` : ""}`;
  const title = room ? `${room.name} · ${c.property.name}` : first && PAGE_TITLES[first] ? `${tr(PAGE_TITLES[first])} · ${c.property.name}` : baseTitle;
  const description = (room?.summary || c.seo.description || c.property.tagline || c.property.description).slice(0, 170) || undefined;
  const path = segments.length ? `/${segments.join("/")}` : "/";
  const ogId = c.seo.ogMediaId ?? c.hero.mediaIds[0] ?? c.gallery.mediaIds[0];
  const og = ogId ? site.media.get(ogId) : undefined;
  const noindex = site.mode === "preview" || site.availability === "offline" || first === "pay" || first === "enquire";
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: `${site.canonicalOrigin}${path === "/" ? "/" : path}` },
    robots: noindex ? { index: false, follow: false } : undefined,
    openGraph: {
      title,
      description,
      siteName: c.property.name,
      type: "website",
      url: `${site.canonicalOrigin}${path}`,
      images: og ? [{ url: `${site.canonicalOrigin}/media/${site.hotel.id}/${og.id}/${bestVariant(og, 1600)}.webp`, width: og.width, height: og.height }] : undefined,
    },
    icons: c.logoMediaId && site.media.get(c.logoMediaId) ? { icon: `/media/${site.hotel.id}/${c.logoMediaId}/480.webp` } : undefined,
  };
}

/** Public URLs for the sitemap: only pages that exist for this property. */
export function sitePaths(c: SiteContent): string[] {
  const s = c.sections;
  return [
    "/",
    ...(c.rooms.some((r) => r.visible) ? ["/rooms", ...c.rooms.filter((r) => r.visible).map((r) => `/rooms/${r.slug}`)] : []),
    ...(c.amenities.length ? ["/amenities"] : []),
    ...(s.gallery && c.gallery.mediaIds.length ? ["/gallery"] : []),
    ...(s.dining && c.dining.body ? ["/dining"] : []),
    ...(s.offers && c.offers.length ? ["/offers"] : []),
    ...(s.faq && c.faq.length ? ["/faq"] : []),
    "/location",
    "/policies",
    ...(c.about.body || c.property.description ? ["/about"] : []),
    "/contact",
    "/privacy",
    "/terms",
    "/accessibility",
  ];
}
