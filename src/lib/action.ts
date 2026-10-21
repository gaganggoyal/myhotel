// Shared shape for server actions used with useActionState.

export type ActionState = {
  ok: boolean;
  message: string;
  /** Changes on every response so the client can react to repeated identical messages. */
  at?: number;
  data?: Record<string, string>;
};

export const initialActionState: ActionState = { ok: false, message: "" };

export function ok(message: string, data?: Record<string, string>): ActionState {
  return { ok: true, message, at: Date.now(), data };
}

export function fail(message: string): ActionState {
  return { ok: false, message, at: Date.now() };
}

export function str(fd: FormData, name: string, max = 5000): string {
  const v = fd.get(name);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export function int(fd: FormData, name: string, fallback = 0): number {
  const n = Number.parseInt(str(fd, name, 20), 10);
  return Number.isFinite(n) ? n : fallback;
}

export function bool(fd: FormData, name: string): boolean {
  const v = fd.get(name);
  return v === "on" || v === "true" || v === "1";
}

export function list(fd: FormData, name: string): string[] {
  return fd
    .getAll(name)
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter(Boolean);
}

/** Converts a zod error into one readable sentence for the form banner. */
export function zodMessage(error: { issues: { path: PropertyKey[]; message: string }[] }): string {
  return error.issues
    .slice(0, 3)
    .map((i) => i.message)
    .join(" ");
}
