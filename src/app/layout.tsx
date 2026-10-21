import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_Devanagari, Playfair_Display } from "next/font/google";
import { config } from "@/lib/config";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const playfair = Playfair_Display({ variable: "--font-playfair", subsets: ["latin"], display: "swap" });
const devanagari = Noto_Sans_Devanagari({ variable: "--font-devanagari", subsets: ["devanagari"], weight: ["400", "600", "700"], display: "swap" });

export const metadata: Metadata = {
  title: { default: config.platformName, template: `%s · ${config.platformName}` },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${playfair.variable} ${devanagari.variable} antialiased`}>
      <body className="min-h-screen bg-white text-slate-900">{children}</body>
    </html>
  );
}
