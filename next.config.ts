import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  // Every hotel page is resolved per request from the Host header, so the app
  // uses the classic dynamic model rather than Cache Components / PPR.
  cacheComponents: false,
  poweredByHeader: false,
  serverExternalPackages: ["@electric-sql/pglite", "sharp", "postgres"],
  experimental: {
    // The UPI QR form uploads an image through a server action.
    serverActions: { bodySizeLimit: "13mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
