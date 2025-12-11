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

  if (!shop) {
    throw new Response("Missing shop parameter", { status: 400 });
  }

  try {
    const callbackResponse = await shopify.auth.callback({
      rawRequest: request,
      rawResponse: new Response(),
    });

    const { session } = callbackResponse;

    await storeSession(session);

    // Create or update merchant record
    db.prepare(`
      INSERT OR IGNORE INTO merchants (shop) VALUES (?)
    `).run(session.shop);

    // Check billing
    const isProd = process.env.NODE_ENV === "production";
    const billing = await ensureBilling(session, isProd);

    if (!billing.hasPayment) {
      return redirect(billing.confirmationUrl || "/");
    }

    // Register webhooks after billing is confirmed
    await registerWebhooks(session);

    // Redirect to app
    return redirect(`/apps/printavo-sync?shop=${session.shop}&host=${url.searchParams.get("host")}`);
  } catch (error: any) {
    console.error("Auth callback error:", error);
    throw new Response(`Authentication failed: ${error.message}`, { status: 500 });
  }
}


