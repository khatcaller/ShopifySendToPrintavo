import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { shopify } from "../shopify.server";
import { storeSession } from "../lib/session.server";
import { ensureBilling } from "../lib/billing.server";
import { registerWebhooks } from "../lib/webhooks.server";
import { db } from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  return handleAuth(request);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  return handleAuth(request);
};

async function handleAuth(request: Request) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  console.log("[AUTH] Callback started for shop:", shop);

  if (!shop) {
    throw new Response("Missing shop parameter", { status: 400 });
  }

  try {
    // Extract OAuth params manually since Remix doesn't have raw Node req/res
    const code = url.searchParams.get("code");
    const hmac = url.searchParams.get("hmac");
    const state = url.searchParams.get("state");

    console.log("[AUTH] OAuth params - code:", !!code, "hmac:", !!hmac);

    if (!code || !hmac) {
      throw new Response("Missing OAuth parameters", { status: 400 });
    }

    // Exchange code for access token
    const tokenResponse = await fetch(
      `https://${shop}/admin/oauth/access_token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: shopify.config.apiKey,
          client_secret: shopify.config.apiSecretKey,
          code,
        }),
      }
    );

    if (!tokenResponse.ok) {
      throw new Response("Failed to exchange OAuth code", { status: 500 });
    }

    const { access_token, scope } = await tokenResponse.json();

    console.log("[AUTH] Token exchange successful, scope:", scope);

    // Create session manually
    const session = {
      id: `offline_${shop}`,
      shop,
      state: state || "",
      isOnline: false,
      scope,
      accessToken: access_token,
    };

    await storeSession(session);
    console.log("[AUTH] Session stored");

    // Create or update merchant record
    db.prepare(`
      INSERT OR IGNORE INTO merchants (shop) VALUES (?)
    `).run(session.shop);
    console.log("[AUTH] Merchant record created");

    // Register webhooks immediately (for testing, regardless of billing)
    console.log("[AUTH] About to register webhooks...");
    await registerWebhooks(session);
    console.log("[AUTH] Webhook registration call completed");

    // Check billing
    const isProd = process.env.NODE_ENV === "production";
    console.log("[AUTH] Checking billing, isProd:", isProd);
    const billing = await ensureBilling(session, isProd);

    if (!billing.hasPayment && isProd) {
      console.log("[AUTH] Redirecting to billing confirmation");
      return redirect(billing.confirmationUrl || "/");
    }

    // Redirect to app - construct host parameter
    const hostParam = url.searchParams.get("host") || Buffer.from(`admin.shopify.com/store/${shop.replace('.myshopify.com', '')}`).toString('base64').replace(/=/g, '');
    console.log("[AUTH] Redirecting to dashboard with host:", hostParam);
    return redirect(`/apps/printavo-sync?shop=${session.shop}&host=${hostParam}`);
  } catch (error: any) {
    console.error("Auth callback error:", error);
    throw new Response(`Authentication failed: ${error.message}`, { status: 500 });
  }
}


