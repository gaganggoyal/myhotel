import type { CSSProperties } from "react";
import type { SiteContent, TemplateKey } from "@/lib/content";

// Three template families over one content model. They differ in typography, hero layout
// and surface treatment; every one keeps the same sticky actions, page set and data.

export type TemplateStyle = {
  label: string;
  description: string;
  page: string;
  heading: string;
  hero: "overlay" | "split" | "bottom";
  header: "light" | "solid";
  card: string;
  section: string;
  defaults: { primary: string; accent: string };
};

export const TEMPLATE_STYLES: Record<TemplateKey, TemplateStyle> = {
  heritage: {
    label: "Heritage",
    description: "Warm and classic, with serif headings. Suits havelis, hill hotels and heritage stays.",
    page: "bg-[#faf7f2] text-stone-800",
    heading: "serif-heading font-semibold tracking-tight",
    hero: "overlay",
    header: "light",
    card: "rounded-lg bg-white shadow-sm ring-1 ring-stone-200",
    section: "bg-white",
    defaults: { primary: "#7c2d12", accent: "#b45309" },
  },
  coastal: {
    label: "Coastal",
    description: "Light and airy, with photos beside the text. Suits beach, lake and garden properties.",
    page: "bg-white text-slate-700",
    heading: "font-semibold tracking-tight",
    hero: "split",
    header: "light",
    card: "rounded-2xl bg-white shadow-md ring-1 ring-slate-100",
    section: "bg-sky-50/60",
    defaults: { primary: "#0e7490", accent: "#f59e0b" },
  },
  modern: {
    label: "Modern",
    description: "Bold and minimal, with a solid header. Suits city hotels and boutique stays.",
    page: "bg-neutral-50 text-neutral-700",
    heading: "font-extrabold uppercase tracking-wide",
    hero: "bottom",
    header: "solid",
    card: "rounded-none bg-white ring-1 ring-neutral-200",
    section: "bg-white",
    defaults: { primary: "#111827", accent: "#dc2626" },
  },
};

function luminance(hex: string): number {
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

export function contrastRatio(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Text colour on the owner's primary colour, picked for WCAG contrast. */
export function onColor(hex: string): string {
  return contrastRatio(hex, "#ffffff") >= contrastRatio(hex, "#111827") ? "#ffffff" : "#111827";
}

export function themeVars(content: SiteContent): CSSProperties {
  const p = content.theme.primary;
  const a = content.theme.accent;
  return { "--p": p, "--a": a, "--on-p": onColor(p), "--on-a": onColor(a) } as CSSProperties;
}
