/** Probed over HTTPS by the manual domain provider to confirm a custom hostname reaches us. */
export function GET(req: Request) {
  return Response.json({ ok: true, host: req.headers.get("host") }, { headers: { "Cache-Control": "no-store" } });
}
