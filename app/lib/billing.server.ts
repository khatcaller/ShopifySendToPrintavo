import { shopify, BILLING_PLAN } from "../shopify.server";
import { db } from "../db.server";
import type { Session } from "@shopify/shopify-api";

export async function ensureBilling(
  session: any,
  isProd: boolean
): Promise<{ hasPayment: boolean; confirmationUrl?: string }> {
  const merchant = db
    .prepare("SELECT billing_status, billing_subscription_id, trial_ends_at FROM merchants WHERE shop = ?")
    .get(session.shop) as any;

  if (merchant?.billing_status === "active") {
    return { hasPayment: true };
  }

  // Create billing subscription via GraphQL since we can't use shopify.billing.ensure
  const mutation = `
    mutation appSubscriptionCreate($name: String!, $returnUrl: URL!, $test: Boolean, $trialDays: Int, $lineItems: [AppSubscriptionLineItemInput!]!) {
      appSubscriptionCreate(name: $name, returnUrl: $returnUrl, test: $test, trialDays: $trialDays, lineItems: $lineItems) {
        appSubscription {
          id
        }
        confirmationUrl
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variables = {
    name: BILLING_PLAN,
    returnUrl: `${shopify.config.hostScheme}://${shopify.config.hostName}/auth/callback`,
    test: !isProd,
    trialDays: 7,
    lineItems: [
      {
        plan: {
          appRecurringPricingDetails: {
            price: { amount: 20.0, currencyCode: "USD" },
            interval: "EVERY_30_DAYS",
          },
        },
      },
    ],
  };

  try {
    const response = await fetch(
      `https://${session.shop}/admin/api/2024-01/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": session.accessToken,
        },
        body: JSON.stringify({ query: mutation, variables }),
      }
    );

    const result = await response.json();
    const subscriptionData = result.data?.appSubscriptionCreate;

    if (subscriptionData?.confirmationUrl) {
      return {
        hasPayment: false,
        confirmationUrl: subscriptionData.confirmationUrl,
      };
    }

    if (subscriptionData?.appSubscription) {
      const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      db.prepare(`
        INSERT OR REPLACE INTO merchants (shop, billing_status, billing_subscription_id, trial_ends_at)
        VALUES (?, ?, ?, ?)
      `).run(
        session.shop,
        "active",
        subscriptionData.appSubscription.id,
        trialEndsAt
      );

      return { hasPayment: true };
    }

    console.error("Billing creation failed:", subscriptionData?.userErrors);
    return { hasPayment: false };
  } catch (error) {
    console.error("Billing error:", error);
    return { hasPayment: false };
  }
}

export function checkBillingStatus(shop: string): {
  status: string;
  trialEndsAt: string | null;
} {
  const merchant = db
    .prepare("SELECT billing_status, trial_ends_at FROM merchants WHERE shop = ?")
    .get(shop) as any;

  if (!merchant) {
    return { status: "pending", trialEndsAt: null };
  }

  // Check if trial has expired
  if (merchant.trial_ends_at && new Date(merchant.trial_ends_at) < new Date()) {
    db.prepare("UPDATE merchants SET billing_status = ? WHERE shop = ?").run("expired", shop);
    return { status: "expired", trialEndsAt: merchant.trial_ends_at };
  }

  return {
    status: merchant.billing_status || "pending",
    trialEndsAt: merchant.trial_ends_at,
  };
}


