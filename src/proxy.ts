import { NextResponse, type NextRequest } from "next/server";
import { classifyHost, encodeHostSegment } from "@/lib/hosts";

// Routes every request by Host. The platform host serves marketing + dashboard; any other
// host is rewritten to /sites/<host>/... where the page resolves the hotel from our own
// tables. No database access here: proxy only classifies and rewrites.

const ROOT = (process.env.ROOT_DOMAIN ?? "localhost:3000").toLowerCase();
const PROTOCOL = process.env.APP_PROTOCOL ?? (process.env.NODE_ENV === "production" ? "https" : "http");

export function proxy(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").toLowerCase();
  const { pathname, search } = request.nextUrl;
  const kind = classifyHost(host, ROOT);

  // Never let a client smuggle routing headers into the app.
  const headers = new Headers(request.headers);
  headers.delete("x-site-host");
  headers.delete("x-site-path");

  if (kind.kind === "platform") {
    if (pathname === "/sites" || pathname.startsWith("/sites/")) return new NextResponse("Not found", { status: 404 });
    return NextResponse.next({ request: { headers } });
  }
  if (kind.kind === "platform-www") {
    return NextResponse.redirect(`${PROTOCOL}://${ROOT}${pathname}${search}`, 308);
  }
  if (kind.kind === "invalid") return new NextResponse("Not found", { status: 404 });

  headers.set("x-site-host", host);
  headers.set("x-site-path", `${pathname}${search}`);
  const url = request.nextUrl.clone();
  url.pathname = `/sites/${encodeHostSegment(host)}${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url, { request: { headers } });
}

export const config = {
  matcher: ["/((?!api/|_next/|media/|favicon.ico).*)"],
};
