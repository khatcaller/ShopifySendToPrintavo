import type { ActionFunctionArgs } from "@remix-run/node";
import { shopify } from "../shopify.server";
import { handleAppUninstalled } from "../lib/webhooks.server";
import crypto from "crypto";

export const action = async ({ request }: ActionFunctionArgs) => {
  const topic = "APP_UNINSTALLED";
  const shop = request.headers.get("X-Shopify-Shop-Domain") || "";
  const hmac = request.headers.get("X-Shopify-Hmac-Sha256");

  try {
    // Manually validate HMAC since we don't have raw Node req/res
    const body = await request.text();
    
    if (hmac) {
      const hash = crypto
        .createHmac("sha256", shopify.config.apiSecretKey)
        .update(body, "utf8")
        .digest("base64");

      if (hash !== hmac) {
        console.error("HMAC validation failed");
        return new Response("Unauthorized", { status: 401 });
      }
    }

    // Process uninstall after webhook validation
    await handleAppUninstalled(shop);

    return new Response("OK", { status: 200 });
  } catch (error: any) {
    console.error(`Webhook ${topic} error:`, error);
    return new Response(error.message, { status: 500 });
  }
};

