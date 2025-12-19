import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useActionData, useSubmit, useFetcher, Form } from "@remix-run/react";
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
  EmptyState,
  BlockStack,
  InlineStack,
  InlineGrid,
  Divider,
} from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useState, useEffect } from "react";
import { shopify } from "../shopify.server";
import { loadSession } from "../lib/session.server";
import { testPrintavoConnection } from "../lib/printavo.server";
import { db } from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const host = url.searchParams.get("host");

  if (!shop || !host) {
    throw new Response("Missing shop or host parameter", { status: 400 });
  }

  const sessionId = `offline_${shop}`;
  const session = await loadSession(sessionId);

  if (!session) {
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

  const merchantRow = db.prepare("SELECT * FROM merchants WHERE shop = ?").get(shop) as any;

  // Get activity logs
  const activityLogs = db
    .prepare(`
      SELECT * FROM activity_logs 
      WHERE shop = ? 
      ORDER BY created_at DESC 
      LIMIT 50
    `)
    .all(shop) as any[];

  // Calculate stats
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  const statsToday = db
    .prepare(`
      SELECT 
        COUNT(CASE WHEN status = 'synced' THEN 1 END) as synced_count,
        COUNT(CASE WHEN status IN ('failed', 'error') THEN 1 END) as failed_count,
        MAX(CASE WHEN status = 'synced' THEN created_at END) as last_success
      FROM activity_logs 
      WHERE shop = ? AND created_at >= ?
    `)
    .get(shop, startOfDay.toISOString()) as any;

  // Always return a safe merchant object with proper defaults
  const merchant = {
    sync_enabled: merchantRow?.sync_enabled ?? 1,
    printavo_api_key: merchantRow?.printavo_api_key ?? "",
    exclude_tag: merchantRow?.exclude_tag ?? "no-printavo",
    require_include_tag: merchantRow?.require_include_tag ?? 0,
    include_tag: merchantRow?.include_tag ?? "printavo",
    respect_line_item_skip: merchantRow?.respect_line_item_skip ?? 0,
    line_item_skip_property: merchantRow?.line_item_skip_property ?? "printavo_skip",
    skip_gift_cards: merchantRow?.skip_gift_cards ?? 1,
    skip_non_physical: merchantRow?.skip_non_physical ?? 1,
  };

  return json({
    shop,
    host,
    merchant,
    activityLogs: Array.isArray(activityLogs) ? activityLogs : [],
    stats: {
      syncedToday: Number(statsToday?.synced_count) || 0,
      failedToday: Number(statsToday?.failed_count) || 0,
      lastSuccess: statsToday?.last_success || null,
    },
    apiKey: process.env.SHOPIFY_API_KEY || "",
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  console.log("[ACTION] Received request, method:", request.method);
  console.log("[ACTION] URL:", request.url);
  
  const formData = await request.formData();
  const intent = formData.get("intent");
  console.log("[ACTION] Intent:", intent);
  
  const shop = formData.get("shop") as string;

  if (intent === "save_settings") {
    const printavoApiKey = formData.get("printavo_api_key") as string || "";
    const syncEnabled = formData.get("sync_enabled") === "true";
    const excludeTag = formData.get("exclude_tag") as string || "no-printavo";
    const requireIncludeTag = formData.get("require_include_tag") === "true";
    const includeTag = formData.get("include_tag") as string || "printavo";
    const respectLineItemSkip = formData.get("respect_line_item_skip") === "true";
    const lineItemSkipProperty = formData.get("line_item_skip_property") as string || "printavo_skip";
    const skipGiftCards = formData.get("skip_gift_cards") === "true";
    const skipNonPhysical = formData.get("skip_non_physical") === "true";

    db.prepare(`
      INSERT OR REPLACE INTO merchants 
      (shop, printavo_api_key, sync_enabled, exclude_tag, require_include_tag, include_tag,
       respect_line_item_skip, line_item_skip_property, skip_gift_cards, skip_non_physical)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      shop,
      printavoApiKey,
      syncEnabled ? 1 : 0,
      excludeTag,
      requireIncludeTag ? 1 : 0,
      includeTag,
      respectLineItemSkip ? 1 : 0,
      lineItemSkipProperty,
      skipGiftCards ? 1 : 0,
      skipNonPhysical ? 1 : 0
    );

    return json({ success: true, message: "Settings saved" });
  }

  if (intent === "test_connection") {
    console.log("[ACTION] Test connection request received");
    const apiKey = formData.get("api_key") as string;
    
    if (!apiKey) {
      console.log("[ACTION] No API key provided");
      return json({ success: false, message: "API key is required" });
    }

    console.log("[ACTION] Testing Printavo connection...");
    const result = await testPrintavoConnection(apiKey);
    console.log("[ACTION] Test result:", result);
    return json({
      success: result.success,
      message: result.message,
    });
  }

  return json({ success: false, message: "Invalid action" });
};

export default function Dashboard() {
  const { shop, host, merchant, activityLogs, stats, apiKey } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const testConnectionFetcher = useFetcher<typeof action>();

  // Initialize App Bridge
  useEffect(() => {
    if (typeof window !== 'undefined' && window.shopify) {
      // App Bridge is already loaded via script tag in root.tsx
      console.log("[App Bridge] Available");
    }
  }, []);

  // Defensive state initialization with safe defaults
  const [printavoApiKey, setPrintavoApiKey] = useState(merchant?.printavo_api_key || "");
  const [syncEnabled, setSyncEnabled] = useState(Boolean(merchant?.sync_enabled));
  const [excludeTag, setExcludeTag] = useState(merchant?.exclude_tag || "no-printavo");
  const [requireIncludeTag, setRequireIncludeTag] = useState(Boolean(merchant?.require_include_tag));
  const [includeTag, setIncludeTag] = useState(merchant?.include_tag || "printavo");
  const [respectLineItemSkip, setRespectLineItemSkip] = useState(Boolean(merchant?.respect_line_item_skip));
  const [lineItemSkipProperty, setLineItemSkipProperty] = useState(merchant?.line_item_skip_property || "printavo_skip");
  const [skipGiftCards, setSkipGiftCards] = useState(Boolean(merchant?.skip_gift_cards));
  const [skipNonPhysical, setSkipNonPhysical] = useState(Boolean(merchant?.skip_non_physical));

  const handleTestConnection = () => {
    if (!printavoApiKey) return;
    
    console.log("[UI] Test Connection clicked, API key length:", printavoApiKey.length);
    const formData = new FormData();
    formData.append("intent", "test_connection");
    formData.append("api_key", printavoApiKey);
    console.log("[UI] Submitting test connection request...");
    
    // Fetcher needs relative path with query params for Shopify embedded app
    const searchParams = new URLSearchParams(window.location.search);
    console.log("[UI] Current search params:", searchParams.toString());
    
    testConnectionFetcher.submit(formData, { 
      method: "post",
      // Don't specify action - let it default to current route
    });
  };

  const isTestingConnection = testConnectionFetcher.state === "submitting" || testConnectionFetcher.state === "loading";

  // Debug: Log fetcher state
  useEffect(() => {
    console.log("[UI] testConnectionFetcher.state:", testConnectionFetcher.state);
    console.log("[UI] testConnectionFetcher.data:", testConnectionFetcher.data);
  }, [testConnectionFetcher.state, testConnectionFetcher.data]);

  const handleSaveSettings = () => {
    const formData = new FormData();
    formData.append("intent", "save_settings");
    formData.append("shop", shop);
    formData.append("printavo_api_key", printavoApiKey);
    formData.append("sync_enabled", syncEnabled.toString());
    formData.append("exclude_tag", excludeTag);
    formData.append("require_include_tag", requireIncludeTag.toString());
    formData.append("include_tag", includeTag);
    formData.append("respect_line_item_skip", respectLineItemSkip.toString());
    formData.append("line_item_skip_property", lineItemSkipProperty);
    formData.append("skip_gift_cards", skipGiftCards.toString());
    formData.append("skip_non_physical", skipNonPhysical.toString());
    submit(formData, { method: "post" });
  };

  const isPrintavoConnected = Boolean(printavoApiKey);

  const formatTimestamp = (timestamp: string | null) => {
    if (!timestamp) return "Never";
    
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
    if (diffMins < 1440) {
      const hours = Math.floor(diffMins / 60);
      return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    }
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  const getStatusBadge = (status: string) => {
    if (status === "synced") {
      return <Badge tone="success">Success</Badge>;
    }
    if (status === "skipped") {
      return <Badge>Skipped</Badge>;
    }
    return <Badge tone="critical">Failed</Badge>;
  };

  const getFriendlyMessage = (message: string) => {
    // Convert technical messages to friendly ones
    if (message.includes("excluded by tag")) return message;
    if (message.includes("missing required tag")) return message;
    if (message.includes("already synced")) return "Order already synced to Printavo";
    if (message.includes("No valid line items")) return "No items to sync after filtering";
    if (message.includes("Printavo API key")) return "Printavo API key not configured";
    if (message.includes("must have a customer email")) return "Order missing customer email";
    return message;
  };

  return (
    <AppProvider i18n={{}}>
      <Page
        title="Printavo Sync"
        subtitle="Automatically send approved Shopify orders to Printavo."
      >
        <BlockStack gap="500">
          {actionData?.message && (
            <Banner
              tone={actionData.success ? "success" : "critical"}
            >
              {actionData.message}
            </Banner>
          )}

          {testConnectionFetcher.data?.message && (
            <Banner
              tone={testConnectionFetcher.data.success ? "success" : "critical"}
            >
              {testConnectionFetcher.data.message}
            </Banner>
          )}

          {/* Connection Status */}
          <Layout>
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h2">
                    Connection Status
                  </Text>
                  
                  <InlineGrid columns={2} gap="400">
                    <BlockStack gap="200">
                      <Text as="p" variant="bodyMd" tone="subdued">
                        Shopify
                      </Text>
                      <InlineStack gap="200" blockAlign="center">
                        <Badge tone="success">Connected</Badge>
                      </InlineStack>
                    </BlockStack>

                    <BlockStack gap="200">
                      <Text as="p" variant="bodyMd" tone="subdued">
                        Printavo
                      </Text>
                      <InlineStack gap="200" blockAlign="center">
                        {isPrintavoConnected ? (
                          <Badge tone="success">Connected</Badge>
                        ) : (
                          <Badge tone="attention">Not connected</Badge>
                        )}
                      </InlineStack>
                    </BlockStack>
                  </InlineGrid>

                  <Divider />

                  <BlockStack gap="300">
                    <TextField
                      label="Printavo API Key"
                      value={printavoApiKey}
                      onChange={setPrintavoApiKey}
                      disabled={isPrintavoConnected}
                      type="password"
                      autoComplete="off"
                      helpText={isPrintavoConnected ? "API key configured" : "Enter your Printavo v2 API key"}
                    />

                    <InlineStack gap="200">
                      <Button
                        onClick={handleTestConnection}
                        loading={isTestingConnection}
                        disabled={!printavoApiKey || isTestingConnection}
                      >
                        Test Connection
                      </Button>
                      {isPrintavoConnected && (
                        <Button
                          onClick={() => setPrintavoApiKey("")}
                        >
                          Change Key
                        </Button>
                      )}
                    </InlineStack>
                  </BlockStack>
                </BlockStack>
              </Card>
            </Layout.Section>

            {/* Stats */}
            {isPrintavoConnected && (
              <Layout.Section>
                <Card>
                  <BlockStack gap="400">
                    <Text variant="headingMd" as="h2">
                      Sync Activity
                    </Text>

                    <InlineGrid columns={3} gap="400">
                      <BlockStack gap="200">
                        <Text as="p" variant="bodyMd" tone="subdued">
                          Last successful sync
                        </Text>
                        <Text as="p" variant="headingSm">
                          {formatTimestamp(stats?.lastSuccess || null)}
                        </Text>
                      </BlockStack>

                      <BlockStack gap="200">
                        <Text as="p" variant="bodyMd" tone="subdued">
                          Orders synced today
                        </Text>
                        <Text as="p" variant="headingSm">
                          {stats?.syncedToday || 0}
                        </Text>
                      </BlockStack>

                      <BlockStack gap="200">
                        <Text as="p" variant="bodyMd" tone="subdued">
                          Failed syncs today
                        </Text>
                        <Text as="p" variant="headingSm">
                          {(stats?.failedToday || 0) > 0 ? (
                            <Text as="span" tone="critical">{stats?.failedToday || 0}</Text>
                          ) : (
                            stats?.failedToday || 0
                          )}
                        </Text>
                      </BlockStack>
                    </InlineGrid>
                  </BlockStack>
                </Card>
              </Layout.Section>
            )}

            {/* Sync Settings */}
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h2">
                    Sync Settings
                  </Text>

                  <BlockStack gap="400">
                    <InlineStack gap="200" blockAlign="center">
                      <input
                        type="checkbox"
                        id="sync-enabled"
                        checked={syncEnabled}
                        onChange={(e) => setSyncEnabled(e.target.checked)}
                        style={{ width: '16px', height: '16px' }}
                      />
                      <label htmlFor="sync-enabled">
                        <Text as="span" variant="bodyMd">
                          Auto-sync enabled
                        </Text>
                      </label>
                    </InlineStack>

                    <InlineStack gap="200" blockAlign="center">
                      <input
                        type="checkbox"
                        id="sync-paid-only"
                        checked={true}
                        disabled
                        style={{ width: '16px', height: '16px' }}
                      />
                      <label htmlFor="sync-paid-only">
                        <Text as="span" variant="bodyMd" tone="subdued">
                          Sync paid orders only (recommended)
                        </Text>
                      </label>
                    </InlineStack>

                    <Divider />

                    <BlockStack gap="300">
                      <InlineStack gap="200" blockAlign="center">
                        <input
                          type="checkbox"
                          id="require-tag"
                          checked={requireIncludeTag}
                          onChange={(e) => setRequireIncludeTag(e.target.checked)}
                          style={{ width: '16px', height: '16px' }}
                        />
                        <label htmlFor="require-tag">
                          <Text as="span" variant="bodyMd">
                            Require order tag to sync
                          </Text>
                        </label>
                      </InlineStack>

                      {requireIncludeTag && (
                        <TextField
                          label="Required tag"
                          value={includeTag}
                          onChange={setIncludeTag}
                          autoComplete="off"
                          helpText="Only orders with this tag will sync"
                        />
                      )}
                    </BlockStack>

                    <TextField
                      label="Exclude tag"
                      value={excludeTag}
                      onChange={setExcludeTag}
                      autoComplete="off"
                      helpText="Orders with this tag will never sync"
                    />

                    <Divider />

                    <BlockStack gap="300">
                      <InlineStack gap="200" blockAlign="center">
                        <input
                          type="checkbox"
                          id="respect-line-item"
                          checked={respectLineItemSkip}
                          onChange={(e) => setRespectLineItemSkip(e.target.checked)}
                          style={{ width: '16px', height: '16px' }}
                        />
                        <label htmlFor="respect-line-item">
                          <Text as="span" variant="bodyMd">
                            Respect line-item exclusion property
                          </Text>
                        </label>
                      </InlineStack>

                      {respectLineItemSkip && (
                        <TextField
                          label="Property name"
                          value={lineItemSkipProperty}
                          onChange={setLineItemSkipProperty}
                          autoComplete="off"
                          helpText="Line items with this property will be excluded"
                        />
                      )}
                    </BlockStack>

                    <Divider />

                    <InlineStack gap="200" blockAlign="center">
                      <input
                        type="checkbox"
                        id="skip-gift-cards"
                        checked={skipGiftCards}
                        onChange={(e) => setSkipGiftCards(e.target.checked)}
                        style={{ width: '16px', height: '16px' }}
                      />
                      <label htmlFor="skip-gift-cards">
                        <Text as="span" variant="bodyMd">
                          Skip gift cards
                        </Text>
                      </label>
                    </InlineStack>

                    <InlineStack gap="200" blockAlign="center">
                      <input
                        type="checkbox"
                        id="skip-non-physical"
                        checked={skipNonPhysical}
                        onChange={(e) => setSkipNonPhysical(e.target.checked)}
                        style={{ width: '16px', height: '16px' }}
                      />
                      <label htmlFor="skip-non-physical">
                        <Text as="span" variant="bodyMd">
                          Skip non-physical products
                        </Text>
                      </label>
                    </InlineStack>

                    <InlineStack gap="200">
                      <Button
                        variant="primary"
                        onClick={handleSaveSettings}
                      >
                        Save Settings
                      </Button>
                    </InlineStack>
                  </BlockStack>
                </BlockStack>
              </Card>
            </Layout.Section>

            {/* Activity Log */}
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h2">
                    Activity Log
                  </Text>

                  {!activityLogs || activityLogs.length === 0 ? (
                    <EmptyState
                      heading="No sync activity yet"
                      image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                    >
                      <Text as="p" tone="subdued">
                        Order sync activity will appear here once orders matching your sync rules are created.
                      </Text>
                    </EmptyState>
                  ) : (
                    <BlockStack gap="300">
                      {activityLogs?.map((log: any, index: number) => (
                        <div key={index} style={{ borderBottom: index < activityLogs.length - 1 ? '1px solid #e1e3e5' : 'none', paddingBottom: '12px' }}>
                          <BlockStack gap="200">
                            <InlineStack align="space-between" blockAlign="center">
                              <InlineStack gap="200" blockAlign="center">
                                <Text as="span" variant="bodyMd" fontWeight="semibold">
                                  {log.order_name || "Order"}
                                </Text>
                                {getStatusBadge(log.status)}
                              </InlineStack>
                              <Text as="span" variant="bodySm" tone="subdued">
                                {formatTimestamp(log.created_at)}
                              </Text>
                            </InlineStack>
                            {log.message && (
                              <Text as="p" variant="bodySm" tone="subdued">
                                {getFriendlyMessage(log.message)}
                              </Text>
                            )}
                          </BlockStack>
                        </div>
                      ))}
                    </BlockStack>
                  )}
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        </BlockStack>
      </Page>
    </AppProvider>
  );
}
