import { db } from "../db.server";

interface PrintavoLineItem {
  name: string;
  quantity: number;
  price: string;
  sku?: string;
}

interface PrintavoOrder {
  customer_name: string;
  customer_email?: string;
  order_number: string;
  line_items: PrintavoLineItem[];
  notes?: string;
}

export async function syncOrderToPrintavo(
  shop: string,
  order: any
): Promise<{ success: boolean; message: string }> {
  const merchant = db
    .prepare("SELECT printavo_api_key, sync_enabled, sync_mode, skip_gift_cards, skip_non_physical, included_tags FROM merchants WHERE shop = ?")
    .get(shop) as any;

  if (!merchant) {
    return { success: false, message: "Merchant not found" };
  }

  if (!merchant.sync_enabled) {
    return { success: false, message: "Sync is disabled" };
  }

  const apiKey = merchant.printavo_api_key || process.env.PRINTAVO_API_KEY;
  if (!apiKey) {
    return { success: false, message: "Printavo API key not configured" };
  }

  // Check sync mode - if "tagged", only sync orders with included tags
  const syncMode = merchant.sync_mode || "all";
  if (syncMode === "tagged") {
    const includedTags = (merchant.included_tags || "")
      .split(",")
      .map((t: string) => t.trim().toLowerCase())
      .filter((t: string) => t.length > 0);

    if (includedTags.length === 0) {
      return { success: false, message: "No included tags configured for tagged sync mode" };
    }

    const orderTags = (order.tags || "")
      .split(",")
      .map((t: string) => t.trim().toLowerCase())
      .filter((t: string) => t.length > 0);

    const hasMatchingTag = orderTags.some((tag: string) => includedTags.includes(tag));

    if (!hasMatchingTag) {
      return { success: false, message: "Order does not have required tags" };
    }
  }

  // Check if all products are non-physical
  if (merchant.skip_non_physical) {
    const allNonPhysical = order.line_items.every(
      (item: any) => !item.requires_shipping
    );
    if (allNonPhysical) {
      return { success: false, message: "All products are non-physical" };
    }
  }

  // Filter line items
  let filteredItems = order.line_items.filter((item: any) => {
    // Skip gift cards
    if (merchant.skip_gift_cards && item.product_type === "Gift Card") {
      return false;
    }

    // Skip digital products
    if (item.product_type === "Digital" || item.product_type === "Service") {
      return false;
    }

    // Skip non-physical if enabled
    if (merchant.skip_non_physical && !item.requires_shipping) {
      return false;
    }

    return true;
  });

  if (filteredItems.length === 0) {
    return { success: false, message: "No items to sync after filtering" };
  }

  // Prepare Printavo order
  const printavoOrder: PrintavoOrder = {
    customer_name: `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.trim() || "Guest",
    customer_email: order.customer?.email,
    order_number: order.name || order.order_number,
    line_items: filteredItems.map((item: any) => ({
      name: item.name,
      quantity: item.quantity,
      price: item.price,
      sku: item.sku,
    })),
    notes: `Shopify Order: ${order.name}`,
  };

  try {
    // Call Printavo API
    const response = await fetch("https://www.printavo.com/api/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(printavoOrder),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        message: `Printavo API error: ${response.status} - ${errorText}`,
      };
    }

    return { success: true, message: "Order synced successfully" };
  } catch (error: any) {
    return {
      success: false,
      message: `Failed to sync: ${error.message}`,
    };
  }
}

export async function testPrintavoConnection(apiKey: string): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    const response = await fetch("https://www.printavo.com/api/v1/orders", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
      },
    });

    if (response.status === 401 || response.status === 403) {
      return { success: false, message: "Invalid API key" };
    }

    if (!response.ok) {
      return {
        success: false,
        message: `Connection test failed: ${response.status}`,
      };
    }

    return { success: true, message: "Connection successful" };
  } catch (error: any) {
    return {
      success: false,
      message: `Connection error: ${error.message}`,
    };
  }
}


