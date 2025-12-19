# Testing Guide for Printavo v2 Integration

## Quick Start Testing

### 1. Test API Connection

```bash
# Via SQLite CLI or admin UI
UPDATE merchants SET printavo_api_key = 'your-v2-api-key' WHERE shop = 'yourshop.myshopify.com';
```

Test the connection through your admin interface or by creating a test order in Shopify.

### 2. Monitor Sync Attempts

```sql
-- Check recent activity
SELECT 
  order_name,
  status,
  message,
  created_at
FROM activity_logs
WHERE shop = 'yourshop.myshopify.com'
ORDER BY created_at DESC
LIMIT 20;

-- Check successful syncs
SELECT 
  shopify_order_name,
  printavo_quote_id,
  created_at
FROM order_mappings
WHERE shop = 'yourshop.myshopify.com'
ORDER BY created_at DESC;
```

### 3. Test with Sample Order

Create a test order in Shopify with:
- Customer email
- Billing address with first name, last name
- At least one product with size variant
- Example: "T-Shirt" with variant "Medium / Black"

## Size Mapping Test Cases

### Test these variant patterns:

| Shopify Variant Title | Expected Printavo Size |
|-----------------------|------------------------|
| "Small / Black" | S |
| "Medium / Red" | M |
| "Large / White" | L |
| "XL / Navy" | XL |
| "2XL / Gray" | XXL |
| "Youth Small / Blue" | YOUTH_S |
| "Youth Large / Green" | YOUTH_L |
| "2T / Pink" | _2T |
| "4T / Yellow" | _4T |
| "Size 10 / Black" | _10 |
| "One Size / Purple" | OSFA |
| "Unknown / Red" | M (fallback) |

### Create test products:

```javascript
// In Shopify admin, create products with these variants:
// Product: "Classic T-Shirt"
// Variants:
//   - Small / Black
//   - Medium / Black  
//   - Large / Black
//   - XL / Black

// Product: "Youth T-Shirt"
// Variants:
//   - Youth S / Navy
//   - Youth M / Navy
//   - Youth L / Navy

// Product: "Toddler Tee"
// Variants:
//   - 2T / Pink
//   - 3T / Pink
//   - 4T / Pink
```

## Testing Idempotency

### Test duplicate webhook prevention:

1. Create an order in Shopify
2. Wait for webhook to sync
3. Check `order_mappings` table for entry
4. Manually trigger webhook again (or use Shopify webhook debugger)
5. Verify:
   - No duplicate quote created in Printavo
   - Activity log shows "Order already synced"
   - Same quote ID returned

```sql
-- Should return 1 row per order, not duplicates
SELECT shopify_order_id, COUNT(*) as sync_count
FROM order_mappings
WHERE shop = 'yourshop.myshopify.com'
GROUP BY shopify_order_id
HAVING sync_count > 1;
-- Should return 0 rows
```

## Testing Customer Creation

### Test cases:

**Case 1: New Customer**
- Create order with email that doesn't exist in Printavo
- Expected: New customer created, quote linked to it
- Check activity log for "New customer created"

**Case 2: Existing Customer**
- Create order with email that exists in Printavo
- Expected: Existing customer used, no duplicate created
- Check activity log for "Existing customer found"

**Case 3: Customer with Company**
- Create order with billing address company field filled
- Expected: Company name appears in Printavo customer record

**Case 4: Guest Checkout**
- Ensure order has email even if customer object is minimal
- Expected: Customer created with email as primary identifier

## Testing Filter Settings

### Test sync_mode = "all"

```sql
UPDATE merchants SET sync_mode = 'all' WHERE shop = 'yourshop.myshopify.com';
```

- Create orders with and without tags
- Expected: All orders sync regardless of tags

### Test sync_mode = "tagged"

```sql
UPDATE merchants 
SET sync_mode = 'tagged', included_tags = 'print,wholesale' 
WHERE shop = 'yourshop.myshopify.com';
```

- Create order with tag "print" → Should sync
- Create order with tag "wholesale" → Should sync
- Create order with tag "retail" → Should skip
- Create order with no tags → Should skip

### Test skip_gift_cards

```sql
UPDATE merchants SET skip_gift_cards = 1 WHERE shop = 'yourshop.myshopify.com';
```

- Create order with only gift cards → Should skip entirely
- Create order with mix of gift cards and products → Should sync products only

### Test skip_non_physical

```sql
UPDATE merchants SET skip_non_physical = 1 WHERE shop = 'yourshop.myshopify.com';
```

- Create order with only digital products → Should skip
- Create order with mix of physical and digital → Should sync physical only

## Testing Quote Data Mapping

### Verify in Printavo:

1. **Quote Nickname**: Should be "Shopify #1043" (order name)
2. **Visual PO Number**: Should be "Shopify-1043"
3. **Customer Note**: Should contain order note if present
4. **Production Note**: Should contain:
   - Shopify Order ID
   - Order Number
   - Created timestamp
   - Customer note

5. **Tags**: Should include:
   - "shopify" (always)
   - "paid" (if financial_status = paid)
   - Any custom tags from Shopify order

6. **Addresses**: Should match billing/shipping from Shopify

7. **Line Items**: 
   - Description = product name + variant
   - Item number = SKU
   - Sizes = correctly mapped
   - Quantities = match Shopify

## Testing Error Scenarios

### Test missing API key:

```sql
UPDATE merchants SET printavo_api_key = NULL WHERE shop = 'yourshop.myshopify.com';
```

Create order → Should fail with "Printavo API key not configured"

### Test invalid API key:

```sql
UPDATE merchants SET printavo_api_key = 'invalid-key-123' WHERE shop = 'yourshop.myshopify.com';
```

Create order → Should fail with API authentication error

### Test order without email:

Manually craft webhook payload with null email → Should fail with "Order must have a customer email"

### Test order with no valid items:

Create order with only gift cards (and skip_gift_cards = 1) → Should fail with "No valid line items to sync"

## Webhook Testing Tools

### 1. Shopify Admin Webhook Debugger

1. Go to Settings → Notifications → Webhooks
2. Click on "orders/create" webhook
3. View recent deliveries
4. Click "Send test notification" to replay

### 2. Manual Webhook Testing

```bash
# Send test webhook to your server
curl -X POST https://your-app.com/webhooks/orders/create \
  -H "Content-Type: application/json" \
  -H "X-Shopify-Shop-Domain: yourshop.myshopify.com" \
  -H "X-Shopify-Hmac-Sha256: [calculated-hmac]" \
  -d @test-order.json
```

### 3. ngrok for Local Testing

```bash
# Start your app locally
npm run dev

# In another terminal
ngrok http 3000

# Update webhook URL in Shopify to ngrok URL
# https://abc123.ngrok.io/webhooks/orders/create
```

## Performance Testing

### Test large orders:

Create order with:
- 50+ line items
- Multiple variants per product
- Complex variant titles

Expected: Should complete within 5 seconds

### Test concurrent webhooks:

Create 5 orders simultaneously in Shopify.

Expected: 
- All should sync successfully
- No race conditions in database
- No duplicate quotes created

## Debugging Checklist

When a sync fails:

- [ ] Check `activity_logs` table for error message
- [ ] Verify API key is set and valid
- [ ] Verify merchant has `sync_enabled = 1`
- [ ] Check sync mode and tag requirements
- [ ] Verify order has customer email
- [ ] Check line items aren't all filtered out
- [ ] Look for GraphQL errors in activity log
- [ ] Verify Printavo API is accessible (not rate limited)
- [ ] Check that order isn't already synced (`order_mappings`)

## GraphQL Query Testing

### Test contact lookup directly:

```bash
curl -X POST https://www.printavo.com/api/v2/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "query": "query { contacts(query: \"customer@example.com\", primaryOnly: true, first: 5) { nodes { id emails { email } } } }"
  }'
```

### Test customer creation:

```bash
curl -X POST https://www.printavo.com/api/v2/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "query": "mutation($input: CustomerCreateInput!) { customerCreate(input: $input) { customer { id companyName primaryContact { id } } } }",
    "variables": {
      "input": {
        "primaryContact": {
          "firstName": "Test",
          "lastName": "Customer",
          "email": "test@example.com"
        },
        "companyName": "Test Company"
      }
    }
  }'
```

## Regression Testing

After any code changes, verify:

1. **Existing functionality**:
   - [ ] New orders still sync
   - [ ] Idempotency still works
   - [ ] Filters still apply correctly

2. **Edge cases**:
   - [ ] Orders without shipping address
   - [ ] Orders without billing address
   - [ ] Orders with special characters in names
   - [ ] Orders with very long product names
   - [ ] Orders with missing SKUs

3. **Database integrity**:
   - [ ] No orphaned records
   - [ ] Foreign keys maintained
   - [ ] Indexes working efficiently

## Monitoring in Production

### Daily checks:

```sql
-- Sync success rate (last 24 hours)
SELECT 
  status,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM activity_logs
WHERE created_at > datetime('now', '-1 day')
GROUP BY status;

-- Recent failures
SELECT 
  order_name,
  message,
  created_at
FROM activity_logs
WHERE status NOT IN ('synced', 'skipped')
  AND created_at > datetime('now', '-1 day')
ORDER BY created_at DESC;

-- Average orders per merchant
SELECT 
  shop,
  COUNT(*) as order_count
FROM order_mappings
WHERE created_at > datetime('now', '-7 days')
GROUP BY shop
ORDER BY order_count DESC;
```

### Alert thresholds:

- Success rate below 95% → Investigate
- Any authentication errors → Check API keys
- Spike in "already synced" messages → Possible webhook loop

## Load Testing

### Simulate high volume:

```bash
# Generate 100 test orders
for i in {1..100}; do
  # Create order via Shopify API
  # or trigger webhook manually
done
```

Expected:
- All orders processed within reasonable time
- No database locks
- No memory issues
- Consistent performance

## Rollback Plan

If v2 API has issues:

1. Revert to previous v1 code (git)
2. Update API endpoints back to `/api/v1/orders`
3. Clear `order_mappings` table or adjust logic
4. Monitor for stability

## Success Criteria

✅ **Integration is working if:**

1. Orders create quotes in Printavo within 30 seconds
2. No duplicate quotes for same Shopify order
3. Customer info correctly mapped
4. Line items have correct sizes and quantities
5. All addresses transferred accurately
6. Tags and notes preserved
7. Success rate > 99% for valid orders
8. Graceful handling of invalid orders (clear error messages)

---

**Note**: Always test on a staging/development store before deploying to production!

