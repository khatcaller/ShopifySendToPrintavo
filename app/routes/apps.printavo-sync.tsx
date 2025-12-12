import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useActionData, useSubmit, Form } from "@remix-run/react";
import {
  AppProvider,
  Page,
  Card,
  Layout,
  Text,
  Button,
  TextField,
  Banner,
  Badge,
  DataTable,
  EmptyState,
  Box,
  Checkbox,
} from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";
import { shopify } from "../shopify.server";
import { loadSession } from "../lib/session.server";
import { checkBillingStatus } from "../lib/billing.server";
import { testPrintavoConnection } from "../lib/printavo.server";
import { db } from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const host = url.searchParams.get("host");

  if (!shop || !host) {
    throw new Response("Missing shop or host parameter", { status: 400 });
  }

  // For embedded apps, verify session exists for this shop
  // The session should have been created during OAuth
  const sessionId = `offline_${shop}`;
  const session = await loadSession(sessionId);

  if (!session) {
    // For embedded apps, we need to exit iframe and do OAuth
    // Return HTML that uses App Bridge to redirect
    const authUrl = `${process.env.APP_URL || process.env.HOST}/auth?shop=${shop}`;
    return new Response(
      `<!DOCTYPE html>
      <html>
        <head><script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script></head>
        <body>
          <script>
            document.addEventListener('DOMContentLoaded', function() {
              if (window.top === window.self) {
                window.location.href = "${authUrl}";
              } else {
                var AppBridge = window['app-bridge'];
                var createApp = AppBridge.default;
                var Redirect = AppBridge.actions.Redirect;
                var app = createApp({
                  apiKey: "${shopify.config.apiKey}",
                  host: "${Buffer.from(shop).toString('base64').replace(/=/g, '')}",
                });
                var redirect = Redirect.create(app);
                redirect.dispatch(Redirect.Action.REMOTE, "${authUrl}");
              }
            });
          </script>
          <p>Redirecting to authentication...</p>
        </body>
      </html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }

  const billing = checkBillingStatus(shop);
  const merchant = db.prepare("SELECT * FROM merchants WHERE shop = ?").get(shop) as any;

  const activityLogs = db
    .prepare(`
      SELECT * FROM activity_logs 
      WHERE shop = ? 
      ORDER BY created_at DESC 
      LIMIT 50
    `)
    .all(shop) as any[];

  return json({
    shop,
    host,
    billing,
    merchant: merchant || {
      sync_enabled: true,
      skip_gift_cards: true,
      skip_non_physical: true,
      excluded_tags: "",
      printavo_api_key: "",
    },
    activityLogs: activityLogs || [],
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const intent = formData.get("intent");
  const shop = formData.get("shop") as string;

  if (intent === "update_settings") {
    const syncEnabled = formData.get("sync_enabled") === "on";
    const skipGiftCards = formData.get("skip_gift_cards") === "on";
    const skipNonPhysical = formData.get("skip_non_physical") === "on";
    const excludedTags = formData.get("excluded_tags") as string;
    const printavoApiKey = formData.get("printavo_api_key") as string;

    db.prepare(`
      INSERT OR REPLACE INTO merchants (
        shop, sync_enabled, skip_gift_cards, skip_non_physical, 
        excluded_tags, printavo_api_key, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(shop, syncEnabled ? 1 : 0, skipGiftCards ? 1 : 0, skipNonPhysical ? 1 : 0, excludedTags, printavoApiKey);

    return json({ success: true, message: "Settings updated" });
  }

  if (intent === "test_connection") {
    const apiKey = formData.get("api_key") as string;
    const result = await testPrintavoConnection(apiKey);
    return json(result);
  }

  return json({ success: false, message: "Invalid action" });
};

export default function Dashboard() {
  const { shop, host, billing, merchant, activityLogs } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const app = useAppBridge();

  const handleToggle = (field: string, value: boolean) => {
    const formData = new FormData();
    formData.append("intent", "update_settings");
    formData.append("shop", shop);
    formData.append("sync_enabled", merchant.sync_enabled ? "on" : "off");
    formData.append("skip_gift_cards", merchant.skip_gift_cards ? "on" : "off");
    formData.append("skip_non_physical", merchant.skip_non_physical ? "on" : "off");
    formData.append("excluded_tags", merchant.excluded_tags || "");
    formData.append("printavo_api_key", merchant.printavo_api_key || "");

    if (field === "sync_enabled") {
      formData.set("sync_enabled", value ? "on" : "off");
    } else if (field === "skip_gift_cards") {
      formData.set("skip_gift_cards", value ? "on" : "off");
    } else if (field === "skip_non_physical") {
      formData.set("skip_non_physical", value ? "on" : "off");
    }

    submit(formData, { method: "post" });
  };

  const handleSave = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.append("intent", "update_settings");
    formData.append("shop", shop);
    submit(formData, { method: "post" });
  };

  const handleTestConnection = () => {
    const formData = new FormData();
    formData.append("intent", "test_connection");
    formData.append("api_key", merchant.printavo_api_key || "");
    submit(formData, { method: "post" });
  };

  const safeLogs = Array.isArray(activityLogs) ? activityLogs : [];
  const safeBilling = billing || { status: "pending", trialEndsAt: null };
  const safeMerchant =
    merchant || {
      sync_enabled: true,
      skip_gift_cards: true,
      skip_non_physical: true,
      excluded_tags: "",
      printavo_api_key: "",
    };

  const activityRows = safeLogs.map((log) => [
    log.order_name || "N/A",
    log.status,
    log.message || "",
    new Date(log.created_at).toLocaleString(),
  ]);

  const isTrialActive =
    safeBilling.trialEndsAt && new Date(safeBilling.trialEndsAt) > new Date();

  return (
    <AppProvider
      config={{
        apiKey: process.env.SHOPIFY_API_KEY || "",
        host,
        forceRedirect: true,
      }}
    >
      <Page title="Printavo Sync">
        {safeBilling.status !== "active" && !isTrialActive && (
          <Banner status="critical" title="Billing Required">
            <p>Please complete billing setup to continue using the app.</p>
          </Banner>
        )}

        {isTrialActive && (
          <Banner status="info" title="Trial Active">
            <p>
              Your 7-day trial ends on {new Date(safeBilling.trialEndsAt!).toLocaleDateString()}
            </p>
          </Banner>
        )}

        {actionData?.message && (
          <Banner
            status={actionData.success ? "success" : "critical"}
            title={actionData.success ? "Success" : "Error"}
          >
            <p>{actionData.message}</p>
          </Banner>
        )}

        <Layout>
          <Layout.Section>
            <Card>
              <Box display="flex" flexDirection="column" gap="400">
                <Text variant="headingMd" as="h2">
                  Sync Settings
                </Text>

                <Form onSubmit={handleSave}>
                  <Box display="flex" flexDirection="column" gap="300">
                    <Checkbox
                      label="Enable Sync"
                      checked={safeMerchant.sync_enabled === 1 || safeMerchant.sync_enabled === true}
                      onChange={(checked) => handleToggle("sync_enabled", checked)}
                    />

                    <Checkbox
                      label="Skip Gift Cards"
                      checked={safeMerchant.skip_gift_cards === 1 || safeMerchant.skip_gift_cards === true}
                      onChange={(checked) => handleToggle("skip_gift_cards", checked)}
                    />

                    <Checkbox
                      label="Skip Non-Physical Products"
                      checked={safeMerchant.skip_non_physical === 1 || safeMerchant.skip_non_physical === true}
                      onChange={(checked) => handleToggle("skip_non_physical", checked)}
                    />

                    <TextField
                      label="Excluded Tags"
                      value={safeMerchant.excluded_tags || ""}
                      onChange={(value) => {
                        const formData = new FormData();
                        formData.append("intent", "update_settings");
                        formData.append("shop", shop);
                        formData.append("sync_enabled", merchant.sync_enabled ? "on" : "off");
                        formData.append("skip_gift_cards", merchant.skip_gift_cards ? "on" : "off");
                        formData.append("skip_non_physical", merchant.skip_non_physical ? "on" : "off");
                        formData.append("excluded_tags", value);
                        formData.append("printavo_api_key", merchant.printavo_api_key || "");
                        submit(formData, { method: "post" });
                      }}
                      helpText="Comma-separated list of tags to exclude (e.g., no-print, internal-use)"
                      autoComplete="off"
                    />

                    <TextField
                      label="Printavo API Key"
                      type="password"
                      value={safeMerchant.printavo_api_key || ""}
                      onChange={(value) => {
                        const formData = new FormData();
                        formData.append("intent", "update_settings");
                        formData.append("shop", shop);
                        formData.append("sync_enabled", merchant.sync_enabled ? "on" : "off");
                        formData.append("skip_gift_cards", merchant.skip_gift_cards ? "on" : "off");
                        formData.append("skip_non_physical", merchant.skip_non_physical ? "on" : "off");
                        formData.append("excluded_tags", merchant.excluded_tags || "");
                        formData.append("printavo_api_key", value);
                        submit(formData, { method: "post" });
                      }}
                      helpText="Your Printavo API key for order synchronization"
                      autoComplete="off"
                    />

                    <Button onClick={handleTestConnection} submit>
                      Test Connection
                    </Button>
                  </Box>
                </Form>
              </Box>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <Box display="flex" flexDirection="column" gap="300">
                <Text variant="headingMd" as="h2">
                  Activity Log
                </Text>

                {safeLogs.length === 0 ? (
                  <EmptyState
                    heading="No activity yet"
                    action={{ content: "View orders", url: "/admin/orders" }}
                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  >
                    <p>Order sync activity will appear here once orders are created.</p>
                  </EmptyState>
                ) : (
                  <DataTable
                    columnContentTypes={["text", "text", "text", "text"]}
                    headings={["Order", "Status", "Message", "Date"]}
                    rows={activityRows}
                  />
                )}
              </Box>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    </AppProvider>
  );
}

