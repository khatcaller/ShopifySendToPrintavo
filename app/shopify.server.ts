import "@shopify/shopify-api/adapters/node";
import { shopifyApi, ApiVersion, BillingInterval } from "@shopify/shopify-api";
import { restResources } from "@shopify/shopify-api/rest/admin/2024-01";
import { storeSession, loadSession, deleteSession } from "./lib/session.server";

// Prefer APP_URL for Shopify host config; fall back to HOST; default localhost.
const appUrl =
  process.env.APP_URL ||
  process.env.HOST ||
  "http://localhost:3000";

if (!process.env.SHOPIFY_API_KEY || !process.env.SHOPIFY_API_SECRET) {
  console.error("Shopify env check failed", {
    hasKey: !!process.env.SHOPIFY_API_KEY,
    keyLen: process.env.SHOPIFY_API_KEY?.length,
    hasSecret: !!process.env.SHOPIFY_API_SECRET,
    secretLen: process.env.SHOPIFY_API_SECRET?.length,
    envKeys: Object.keys(process.env || {}).filter((k) => k.startsWith("SHOPIFY_")),
  });
  throw new Error("Missing SHOPIFY_API_KEY or SHOPIFY_API_SECRET");
}

const scopes = (process.env.SCOPES || "read_orders,read_products").split(",");

export const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  scopes,
  hostName: appUrl.replace(/https?:\/\//, "").replace(/\/$/, ""),
  hostScheme: appUrl.startsWith("https") ? "https" : "http",
  apiVersion: ApiVersion.January24,
  isEmbeddedApp: true,
  restResources,
  sessionStorage: {
    async storeSession(session) {
      await storeSession(session);
      return true;
    },
    async loadSession(id) {
      return await loadSession(id);
    },
    async deleteSession(id) {
      await deleteSession(id);
      return true;
    },
  },
  billing: {
    "Printavo Sync": {
      amount: 20.0,
      currencyCode: "USD",
      interval: BillingInterval.Every30Days,
      trialDays: 7,
    },
  },
});

export const BILLING_PLAN = "Printavo Sync";

