import type { ActionFunctionArgs } from "@remix-run/node";
import { shopify } from "~/shopify.server";
import { handleAppUninstalled } from "~/lib/webhooks.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const topic = "APP_UNINSTALLED";
  const shop = request.headers.get("X-Shopify-Shop-Domain") || "";

  try {
    await shopify.webhooks.process({
      rawRequest: request,
      rawResponse: new Response(),
    });

    // Process uninstall after webhook validation
    await handleAppUninstalled(shop);

    return new Response("OK", { status: 200 });
  } catch (error: any) {
    console.error(`Webhook ${topic} error:`, error);
    return new Response(error.message, { status: 500 });
  }
};

