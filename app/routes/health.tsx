import { json } from "@remix-run/node";

export const loader = async () => {
  console.log("[HEALTH CHECK] /health endpoint hit");
  return json({ ok: true, timestamp: new Date().toISOString() });
};

