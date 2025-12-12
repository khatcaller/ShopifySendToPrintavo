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
  BlockStack,
  InlineStack,
  Collapsible,
  ChoiceList,
  Divider,
} from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useState, useEffect } from "react";
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
  const sessionId = `offline_${shop}`;
  const session = await loadSession(sessionId);

  if (!session) {
    // For embedded apps, we need to exit iframe and do OAuth
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
      sync_mode: "all",
      skip_gift_cards: true,
      skip_non_physical: true,
      included_tags: "",
      printavo_api_key: "",
    },
    activityLogs: activityLogs || [],
    apiKey: process.env.SHOPIFY_API_KEY || "",
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const intent = formData.get("intent");
  const shop = formData.get("shop") as string;

  if (intent === "update_settings") {
    const syncEnabled = formData.get("sync_enabled") === "on";
    const syncMode = formData.get("sync_mode") as string || "all";
    const skipGiftCards = formData.get("skip_gift_cards") === "on";
    const skipNonPhysical = formData.get("skip_non_physical") === "on";
    const includedTags = formData.get("included_tags") as string || "";
    const printavoApiKey = formData.get("printavo_api_key") as string || "";

    db.prepare(`
      INSERT OR REPLACE INTO merchants 
      (shop, sync_enabled, sync_mode, skip_gift_cards, skip_non_physical, included_tags, printavo_api_key)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      shop,
      syncEnabled ? 1 : 0,
      syncMode,
      skipGiftCards ? 1 : 0,
      skipNonPhysical ? 1 : 0,
      includedTags,
      printavoApiKey
    );

    return json({ success: true, message: "Settings saved successfully" });
  }

  if (intent === "test_connection") {
    const apiKey = formData.get("api_key") as string;
    const result = await testPrintavoConnection(apiKey);
    return json({
      success: result.success,
      message: result.message,
    });
  }

  return json({ success: false, message: "Invalid action" });
};

export default function Dashboard() {
  const { shop, host, billing, merchant, activityLogs, apiKey } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  
  const safeLogs = Array.isArray(activityLogs) ? activityLogs : [];
  const safeBilling = billing || { status: "pending", trialEndsAt: null };
  const safeMerchant = merchant || {
    sync_enabled: true,
    sync_mode: "all",
    skip_gift_cards: true,
    skip_non_physical: true,
    included_tags: "",
    printavo_api_key: "",
  };

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [apiKeyValue, setApiKeyValue] = useState(safeMerchant.printavo_api_key || "");
  const [syncMode, setSyncMode] = useState(safeMerchant.sync_mode || "all");
  const [includedTags, setIncludedTags] = useState(safeMerchant.included_tags || "");
  const [skipGiftCards, setSkipGiftCards] = useState(safeMerchant.skip_gift_cards === 1 || safeMerchant.skip_gift_cards === true);
  const [skipNonPhysical, setSkipNonPhysical] = useState(safeMerchant.skip_non_physical === 1 || safeMerchant.skip_non_physical === true);
  const [testing, setTesting] = useState(false);

  // Clear testing state when action completes
  useEffect(() => {
    if (actionData && testing) {
      setTesting(false);
    }
  }, [actionData]);

  const handleSave = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.append("intent", "update_settings");
    formData.append("shop", shop);
    submit(formData, { method: "post" });
  };

  const handleTestConnection = () => {
    setTesting(true);
    const formData = new FormData();
    formData.append("intent", "test_connection");
    formData.append("api_key", apiKeyValue);
    submit(formData, { method: "post" });
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
        apiKey,
        host,
        forceRedirect: true,
      }}
    >
      <Page
        title="Printavo Sync"
        subtitle="Automatically send approved Shopify orders to Printavo."
      >
        {safeBilling.status !== "active" && !isTrialActive && (
          <Banner tone="info" title="App Configuration">
            <p>
              Configure your sync settings and test your Printavo connection below. 
              Automatic syncing will be enabled once billing is set up.
            </p>
          </Banner>
        )}

        {isTrialActive && (
          <Banner tone="info" title="Trial Active">
            <p>
              Your 7-day trial ends on {new Date(safeBilling.trialEndsAt!).toLocaleDateString()}
            </p>
          </Banner>
        )}

        <BlockStack gap="400">
          {actionData?.message && actionData.message !== "Invalid action" && (
            <Banner
              tone={actionData.success ? "success" : "critical"}
              title={actionData.success ? "Success" : "Error"}
            >
              <p>{actionData.message}</p>
            </Banner>
          )}
        </BlockStack>

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">
                  Connect to Printavo
                </Text>
                
                <TextField
                  label="Printavo API Key"
                  value={apiKeyValue}
                  onChange={setApiKeyValue}
                  helpText="Your Printavo API key for order synchronization"
                  autoComplete="off"
                />

                <Button 
                  onClick={handleTestConnection}
                  loading={testing}
                  disabled={!apiKeyValue}
                >
                  Test Connection
                </Button>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="headingMd" as="h2">
                    Sync Settings
                  </Text>
                  <Button
                    plain
                    onClick={() => setAdvancedOpen(!advancedOpen)}
                    ariaExpanded={advancedOpen}
                    ariaControls="advanced-settings"
                  >
                    {advancedOpen ? "Hide" : "Show"} Advanced Settings
                  </Button>
                </InlineStack>

                <Collapsible
                  open={advancedOpen}
                  id="advanced-settings"
                  transition={{ duration: "200ms", timingFunction: "ease-in-out" }}
                >
                  <Form onSubmit={handleSave}>
                    <BlockStack gap="400">
                      <ChoiceList
                        title="Sync Mode"
                        choices={[
                          { label: "Sync all orders", value: "all" },
                          { label: "Sync only tagged orders (recommended for production)", value: "tagged" },
                        ]}
                        selected={[syncMode]}
                        onChange={(value) => setSyncMode(value[0])}
                      />

                      {syncMode === "tagged" && (
                        <TextField
                          label="Included Tags"
                          value={includedTags}
                          onChange={setIncludedTags}
                          name="included_tags"
                          helpText="Only orders containing one of these tags will be sent to Printavo."
                          placeholder="production, ready-for-print, approved"
                          autoComplete="off"
                        />
                      )}

                      <Divider />

                      <Checkbox
                        label="Skip Gift Cards"
                        checked={skipGiftCards}
                        onChange={setSkipGiftCards}
                        helpText="Gift card orders will not be sent to Printavo."
                      />

                      <Checkbox
                        label="Skip Non-Physical Products"
                        checked={skipNonPhysical}
                        onChange={setSkipNonPhysical}
                        helpText="Digital or service products will be excluded."
                      />

                      <input type="hidden" name="sync_mode" value={syncMode} />
                      <input type="hidden" name="printavo_api_key" value={apiKeyValue} />
                      <input type="hidden" name="sync_enabled" value="on" />
                      <input type="hidden" name="skip_gift_cards" value={skipGiftCards ? "on" : "off"} />
                      <input type="hidden" name="skip_non_physical" value={skipNonPhysical ? "on" : "off"} />

                      <Button submit variant="primary">
                        Save Settings
                      </Button>
                    </BlockStack>
                  </Form>
                </Collapsible>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">
                  Activity Log
                </Text>

                {safeLogs.length === 0 ? (
                  <EmptyState
                    heading="No sync activity yet"
                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  >
                    <p>
                      Order sync activity will appear here once orders matching your sync rules are created.
                    </p>
                  </EmptyState>
                ) : (
                  <DataTable
                    columnContentTypes={["text", "text", "text", "text"]}
                    headings={["Order", "Status", "Message", "Date"]}
                    rows={activityRows}
                  />
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    </AppProvider>
  );
}

