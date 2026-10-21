// Runs the scheduled jobs once (billing, domains, email retries, retention).
// In production prefer an HTTP scheduler hitting /api/cron/run with the CRON_SECRET.
import { runJobs, type JobName } from "../src/lib/jobs";

runJobs((process.argv[2] as JobName) ?? "all")
  .then((r) => {
    console.log(JSON.stringify(r, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
