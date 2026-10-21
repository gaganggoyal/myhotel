import { config } from "@/lib/config";
import { safeEqual } from "@/lib/crypto";
import { runJobs, type JobName } from "@/lib/jobs";

const TASKS = new Set<JobName>(["billing", "domains", "email", "retention", "all"]);

async function handle(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!config.cronSecret || !safeEqual(auth, `Bearer ${config.cronSecret}`)) return new Response("unauthorized", { status: 401 });
  const task = (new URL(req.url).searchParams.get("task") ?? "all") as JobName;
  if (!TASKS.has(task)) return new Response("unknown task", { status: 400 });
  return Response.json({ ok: true, ran: task, result: await runJobs(task) });
}

export const GET = handle;
export const POST = handle;
