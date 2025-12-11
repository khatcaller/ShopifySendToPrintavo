import { shopify } from "~/shopify.server";
import { syncOrderToPrintavo } from "~/printavo.server";
import { db } from "~/db.server";
import { deleteSessionsByShop } from "~/session.server";
import type { Session } from "@shopify/shopify-api";

export async function registerWebhooks(session: Session): Promise<void> {
  const webhooks = [
    {
      topic: "ORDERS_CREATE",
      path: "/webhooks/orders/create",
    },
    {
      topic: "APP_UNINSTALLED",
      path: "/webhooks/app/uninstalled",
    },
  ];

  for (const webhook of webhooks) {
    try {
      await shopify.webhooks.register({
        session,
        ...webhook,
      });
    } catch (error) {
      console.error(`Failed to register webhook ${webhook.topic}:`, error);
    }
  }
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

