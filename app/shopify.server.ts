import "@shopify/shopify-api/adapters/node";
import { shopifyApi, LATEST_API_VERSION, BillingInterval } from "@shopify/shopify-api";
import { restResources } from "@shopify/shopify-api/rest/admin/2024-01";
import { storeSession, loadSession, deleteSession } from "./lib/session.server";

if (!process.env.SHOPIFY_API_KEY || !process.env.SHOPIFY_API_SECRET) {
  throw new Error("Missing SHOPIFY_API_KEY or SHOPIFY_API_SECRET");
}

const scopes = (process.env.SCOPES || "read_orders,read_products").split(",");

export const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  scopes,
  hostName: process.env.HOST?.replace(/https?:\/\//, "") || "localhost",
  hostScheme: process.env.HOST?.startsWith("https") ? "https" : "http",
  apiVersion: LATEST_API_VERSION,
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

