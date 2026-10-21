import { createHash, createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { config } from "./config";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, keylen: number, opts: object) => Promise<Buffer>;

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, N, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
    maxmem: 64 * 1024 * 1024,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hmacHex(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** One-way, daily-rotating hash of an IP so we can rate-limit without storing addresses. */
export function hashIp(ip: string | null | undefined, salt = new Date().toISOString().slice(0, 10)): string {
  return sha256(`${config.appSecret}:${salt}:${ip ?? "unknown"}`).slice(0, 32);
}

/** A form-render timestamp the server can verify, used to reject instant bot submissions. */
export function signTimestamp(now = Date.now()): string {
  return `${now}.${hmacHex(config.appSecret, `form:${now}`).slice(0, 24)}`;
}

export function verifyTimestamp(value: string, minAgeMs = 2500, maxAgeMs = 24 * 3600_000, now = Date.now()): boolean {
  const [tsRaw, sig] = value.split(".");
  const ts = Number(tsRaw);
  if (!Number.isFinite(ts) || !sig) return false;
  if (!safeEqual(sig, hmacHex(config.appSecret, `form:${ts}`).slice(0, 24))) return false;
  const age = now - ts;
  return age >= minAgeMs && age <= maxAgeMs;
}

const REF_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/** Human-friendly reference like "RVR-7K3Q9M" (no 0/O/1/I to avoid misreading over the phone). */
export function makeRef(prefix: string, length = 6): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += REF_ALPHABET[bytes[i] % REF_ALPHABET.length];
  return `${prefix}-${out}`;
}

export function refPrefix(slug: string): string {
  const letters = slug
    .split("-")
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return (letters || slug.slice(0, 3).toUpperCase()).slice(0, 3).padEnd(2, "X");
}
