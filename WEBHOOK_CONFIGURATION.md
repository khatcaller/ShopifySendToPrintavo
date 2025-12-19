# Webhook Configuration Guide

## ⚠️ IMPORTANT: Webhook Choice

### Recommended: `orders/paid` (NOT `orders/create`)

**Why `orders/paid` is better:**

✅ **Avoids unpaid quotes**: Only sync orders that are financially committed  
✅ **Skips test orders**: Prevents test/draft orders from cluttering Printavo  
✅ **Cleaner accounting**: Production team sees only real, paid work  
✅ **Reduces cancellations**: Paid orders are less likely to be voided  
✅ **Better customer experience**: No confusion about unpaid quotes  

**When to use `orders/create`:**

- You need to start production before payment clears
- Your fulfillment model requires immediate quote creation
- You handle payments outside Shopify (COD, terms, etc.)

---

## Current Configuration

The app currently uses **`orders/create`** webhook.

Location: `app/lib/webhooks.server.ts` line 12-14

```typescript
{
  topic: "orders/create",
  address: `${shopify.config.hostScheme}://${shopify.config.hostName}/webhooks/orders/create`,
}
```

---

## How to Switch to `orders/paid`

### Step 1: Update Webhook Registration

Edit `app/lib/webhooks.server.ts`:

```typescript
const webhooks = [
  {
    topic: "orders/paid",  // ← Changed from orders/create
    address: `${shopify.config.hostScheme}://${shopify.config.hostName}/webhooks/orders/paid`,
  },
  {
    topic: "app/uninstalled",
    address: `${shopify.config.hostScheme}://${shopify.config.hostName}/webhooks/app/uninstalled`,
  },
];
```

### Step 2: Create New Route Handler

Create file: `app/routes/webhooks.orders.paid.tsx`

```typescript
import type { ActionFunctionArgs } from "@remix-run/node";
import { shopify } from "../shopify.server";
import { handleOrdersCreate } from "../lib/webhooks.server";
import crypto from "crypto";

export const action = async ({ request }: ActionFunctionArgs) => {
  const topic = "ORDERS_PAID";
  const shop = request.headers.get("X-Shopify-Shop-Domain") || "";
  const hmac = request.headers.get("X-Shopify-Hmac-Sha256");

  try {
    // Manually validate HMAC since we don't have raw Node req/res
    const body = await request.text();
    
    if (hmac) {
      const hash = crypto
        .createHmac("sha256", shopify.config.apiSecretKey)
        .update(body, "utf8")
        .digest("base64");

      if (hash !== hmac) {
        console.error("HMAC validation failed");
        return new Response("Unauthorized", { status: 401 });
      }
    }

    const payload = JSON.parse(body);
    await handleOrdersCreate(shop, payload); // Same handler works for paid orders

    return new Response("OK", { status: 200 });
  } catch (error: any) {
    console.error(`Webhook ${topic} error:`, error);
    return new Response(error.message, { status: 500 });
  }
};
```

### Step 3: Rebuild and Deploy

```bash
npm run build
# Deploy to your hosting platform
```

### Step 4: Verify Webhook Update

1. Log into a merchant's Shopify admin
2. Go to Settings → Notifications → Webhooks
3. Verify webhook shows: `orders/paid` with your app URL

---

## Supporting Both Webhooks (Advanced)

If you want to support both modes (configurable per merchant):

### Database Migration

```sql
ALTER TABLE merchants ADD COLUMN webhook_trigger TEXT DEFAULT 'paid';
-- Values: 'create' or 'paid'
```

### Update Webhook Registration

```typescript
export async function registerWebhooks(session: any): Promise<void> {
  const merchant = db.prepare("SELECT webhook_trigger FROM merchants WHERE shop = ?")
    .get(session.shop) as any;
  
  const trigger = merchant?.webhook_trigger || 'paid';
  
  const webhooks = [
    {
      topic: `orders/${trigger}`,
      address: `${shopify.config.hostScheme}://${shopify.config.hostName}/webhooks/orders/${trigger}`,
    },
    // ... app/uninstalled webhook
  ];
  
  // ... rest of registration logic
}
```

---

## Webhook Comparison Table

| Factor | orders/create | orders/paid |
|--------|---------------|-------------|
| **Timing** | Immediately on order | After payment confirmed |
| **Test orders** | Syncs all | Skips unpaid tests |
| **Refund risk** | Higher | Lower |
| **Production lead time** | Maximum | Slightly delayed |
| **Quote volume** | Higher (includes unpaid) | Lower (paid only) |
| **Recommended for** | Pre-payment fulfillment | Standard fulfillment |

---

## Other Webhook Options (Not Recommended)

### `orders/fulfilled`
- **Too late**: Order already shipped
- **Production missed**: Can't start quote after fulfillment
- **Don't use unless**: You're syncing for reporting only

### `orders/updated`
- **Too noisy**: Fires on every change (tags, notes, status)
- **Complex logic**: Must diff what changed
- **Don't use unless**: You implement update sync (not just create)

---

## Testing Webhook Changes

### Test with Shopify CLI

```bash
# Trigger test webhook
shopify webhook trigger --topic orders/paid --address https://your-app.com/webhooks/orders/paid

# Or use Shopify admin webhook debugger
```

### Verify Correct Webhook

1. Create test order in Shopify
2. Pay for the order
3. Check `activity_logs` table within 10 seconds:

```sql
SELECT * FROM activity_logs 
WHERE shop = 'test-shop.myshopify.com' 
ORDER BY created_at DESC 
LIMIT 5;
```

Should show sync within seconds of payment.

---

## Migration Path (orders/create → orders/paid)

### If you're switching from orders/create to orders/paid:

**What happens to existing orders?**

- Already-synced orders: Unaffected (mapping exists, idempotency prevents re-sync)
- Unpaid orders: Will NOT sync until paid (intentional)
- Paid orders: Will sync immediately

**Do I need to backfill?**

No. The `order_mappings` table prevents duplicates. Orders already synced stay synced.

**What about orders created but not paid?**

They won't sync until paid. This is desired behavior—production shouldn't start until payment.

---

## Recommended Configuration by Business Model

### Print-on-Demand / Fulfillment
→ Use **`orders/paid`**

### Contract Printing (NET-30 terms)
→ Use **`orders/create`** (they pay later)

### Wholesale B2B
→ Use **`orders/create`** (invoiced after)

### Retail / DTC
→ Use **`orders/paid`**

### Custom / Pre-paid
→ Use **`orders/paid`**

---

## Current Status

⚠️ **Action Required**: App currently uses `orders/create`.

**Recommendation**: Switch to `orders/paid` unless your business model specifically requires immediate sync of unpaid orders.

**Estimated Effort**: 15 minutes (code changes + deploy + test)

---

## Questions?

**Q: Will switching webhooks break existing syncs?**  
A: No. Existing mappings remain. Only future orders affected.

**Q: Can I test both webhooks safely?**  
A: Yes. Use different test stores or different webhook URLs.

**Q: What if I need both?**  
A: Implement per-merchant configuration (see "Supporting Both Webhooks" section).

**Q: How do I know which webhook fired?**  
A: Check Shopify admin webhook logs or add topic to activity_logs.

---

**Decision**: Choose the webhook that matches your production workflow, not just "what fires first."

Good luck! 🚀

