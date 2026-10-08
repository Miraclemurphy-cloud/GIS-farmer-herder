import { API_URL } from "./tests/helpers";

/** Wake sleeping free-tier services before the first test. */
export default async function globalSetup() {
  const web = process.env.WEB_URL ?? "http://localhost:3000";
  const deadline = Date.now() + 240_000;
  for (const url of [`${API_URL}/api/health`, web]) {
    for (;;) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
        if (res.ok) break;
      } catch {
        /* still waking up */
      }
      if (Date.now() > deadline) throw new Error(`${url} did not respond within 4 minutes`);
      await new Promise((r) => setTimeout(r, 5_000));
    }
  }
}
