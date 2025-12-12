import { shopify } from "../shopify.server";
import { syncOrderToPrintavo } from "./printavo.server";
import { db } from "../db.server";
import { deleteSessionsByShop } from "./session.server";
import type { Session } from "@shopify/shopify-api";

export async function registerWebhooks(session: any): Promise<void> {
  console.log("[WEBHOOKS] Starting registration for shop:", session.shop);
  
  const webhooks = [
    {
      topic: "orders/create",
      address: `${shopify.config.hostScheme}://${shopify.config.hostName}/webhooks/orders/create`,
    },
    {
      topic: "app/uninstalled",
      address: `${shopify.config.hostScheme}://${shopify.config.hostName}/webhooks/app/uninstalled`,
    },
  ];

  for (const webhook of webhooks) {
    try {
      console.log(`[WEBHOOKS] Registering ${webhook.topic} to ${webhook.address}`);
      
      // Register webhook via REST API since we can't use shopify.webhooks.register
      const response = await fetch(
        `https://${session.shop}/admin/api/2024-01/webhooks.json`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": session.accessToken,
          },
          body: JSON.stringify({
            webhook: {
              topic: webhook.topic,
              address: webhook.address,
              format: "json",
            },
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[WEBHOOKS] Failed to register ${webhook.topic}: ${response.status} - ${errorText}`);
      } else {
        const result = await response.json();
        console.log(`[WEBHOOKS] Successfully registered ${webhook.topic}:`, result.webhook?.id);
      }
    } catch (error) {
      console.error(`[WEBHOOKS] Error registering ${webhook.topic}:`, error);
    }
  }
  
  console.log("[WEBHOOKS] Registration complete");
}

export async function handleOrdersCreate(shop: string, order: any): Promise<void> {
  const result = await syncOrderToPrintavo(shop, order);

  // Log activity
  db.prepare(`
    INSERT INTO activity_logs (shop, order_id, order_name, status, message)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    shop,
    order.id?.toString() || null,
    order.name || null,
    result.success ? "synced" : "skipped",
    result.message
  );
}

export async function handleAppUninstalled(shop: string): Promise<void> {
  // Delete all sessions for this shop
  await deleteSessionsByShop(shop);

  // Delete merchant data (GDPR compliance)
  db.prepare("DELETE FROM merchants WHERE shop = ?").run(shop);
  db.prepare("DELETE FROM activity_logs WHERE shop = ?").run(shop);

  // Log the uninstall
  db.prepare(`
    INSERT INTO activity_logs (shop, status, message)
    VALUES (?, ?, ?)
  `).run(shop, "uninstalled", "App uninstalled - all data deleted");
}


