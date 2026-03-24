import { runAlertScan } from "../routes/dispatchAlerts";

const INTERVAL_MS = 2 * 60 * 1000;

export function startAlertScheduler() {
  setTimeout(async () => {
    try {
      await runAlertScan();
    } catch (err) {
      console.error("[AlertScheduler] initial scan failed:", err);
    }
  }, 10_000);

  setInterval(async () => {
    try {
      await runAlertScan();
    } catch (err) {
      console.error("[AlertScheduler] scan failed:", err);
    }
  }, INTERVAL_MS);

  console.log(`[AlertScheduler] started, scanning every ${INTERVAL_MS / 1000}s`);
}
