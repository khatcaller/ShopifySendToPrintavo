import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { shopify } from "../shopify.server";
import crypto from "crypto";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (!shop) {
    throw new Response("Missing shop parameter", { status: 400 });
  }

  // Build OAuth URL manually since Remix doesn't have raw Node req/res
  const state = crypto.randomBytes(16).toString("hex");
  const scopes = shopify.config.scopes.toString();
  const redirectUri = `${shopify.config.hostScheme}://${shopify.config.hostName}/auth/callback`;

  const authUrl = `https://${shop}/admin/oauth/authorize?client_id=${shopify.config.apiKey}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;

  return redirect(authUrl);
};


