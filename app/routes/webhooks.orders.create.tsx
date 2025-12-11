import type { ActionFunctionArgs } from "@remix-run/node";
import { shopify } from "~/shopify.server";
import { handleOrdersCreate } from "~/lib/webhooks.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const topic = "ORDERS_CREATE";
  const shop = request.headers.get("X-Shopify-Shop-Domain") || "";

  try {
    const result = await shopify.webhooks.process({
      rawRequest: request,
      rawResponse: new Response(),
    });

    // The webhook payload is in result.payload
    if (result.payload) {
      await handleOrdersCreate(shop, result.payload);
    }

    return new Response("OK", { status: 200 });
  } catch (error: any) {
    console.error(`Webhook ${topic} error:`, error);
    return new Response(error.message, { status: 500 });
  }
};

