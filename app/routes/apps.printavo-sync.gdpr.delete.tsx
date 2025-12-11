import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { db } from "../db.server";
import { deleteSessionsByShop } from "../lib/session.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = await request.json();
    const shop = body.shop_domain || body.shop;

    if (!shop) {
      return json({ error: "Missing shop parameter" }, { status: 400 });
    }

    // Delete all merchant data (GDPR compliance)
    await deleteSessionsByShop(shop);
    db.prepare("DELETE FROM merchants WHERE shop = ?").run(shop);
    db.prepare("DELETE FROM activity_logs WHERE shop = ?").run(shop);

    return json({ success: true, message: "Data deleted successfully" });
  } catch (error: any) {
    console.error("GDPR delete error:", error);
    return json({ error: error.message }, { status: 500 });
  }
};


