// Small in-process cache of host → resolved site, so each page view does not re-query the
// tenant tables. Entries live 15 seconds and are dropped immediately on publish, domain or
// billing changes made by this instance; other instances converge within the TTL.

type Entry<T> = { value: T; hotelId: string | null; expires: number };

const TTL_MS = 15_000;
const globalCache = globalThis as unknown as { __siteCache?: Map<string, Entry<unknown>> };
const cache = (globalCache.__siteCache ??= new Map());

export function cacheGet<T>(host: string): T | undefined {
  const e = cache.get(host);
  if (!e) return undefined;
  if (e.expires < Date.now()) {
    cache.delete(host);
    return undefined;
  }
  return e.value as T;
}

export function cacheSet<T>(host: string, value: T, hotelId: string | null): void {
  if (cache.size > 5000) cache.clear();
  cache.set(host, { value, hotelId, expires: Date.now() + TTL_MS });
}

export function invalidateHotel(hotelId: string): void {
  for (const [host, e] of cache) if (e.hotelId === hotelId || e.hotelId === null) cache.delete(host);
}
