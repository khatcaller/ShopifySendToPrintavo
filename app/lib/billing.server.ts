import { shopify, BILLING_PLAN } from "~/shopify.server";
import { db } from "~/db.server";
import type { Session } from "@shopify/shopify-api";

export async function ensureBilling(
  session: Session,
  isProd: boolean
): Promise<{ hasPayment: boolean; confirmationUrl?: string }> {
  const merchant = db
    .prepare("SELECT billing_status, billing_subscription_id, trial_ends_at FROM merchants WHERE shop = ?")
    .get(session.shop) as any;

  if (merchant?.billing_status === "active") {
    return { hasPayment: true };
  }

  const billing = await shopify.billing.ensure({
    session,
    plan: BILLING_PLAN,
    isTest: !isProd,
  });

  if (billing.hasPayment) {
    const trialEndsAt = billing.confirmationUrl
      ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      : merchant?.trial_ends_at || null;

    db.prepare(`
      INSERT OR REPLACE INTO merchants (shop, billing_status, billing_subscription_id, trial_ends_at)
      VALUES (?, ?, ?, ?)
    `).run(
      session.shop,
      "active",
      billing.subscriptionId || null,
      trialEndsAt
    );

    return { hasPayment: true };
  }

  return {
    hasPayment: false,
    confirmationUrl: billing.confirmationUrl,
  };
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

