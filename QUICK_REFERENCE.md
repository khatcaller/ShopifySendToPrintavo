# Printavo v2 Integration - Quick Reference Card

## 🔗 GraphQL Endpoint

```
POST https://www.printavo.com/api/v2/graphql
Authorization: Bearer YOUR_API_KEY
```

## 📊 Workflow Summary

```
Shopify Order Webhook
    ↓
Idempotency Check (order_mappings table)
    ↓
Find Contact by Email (GraphQL query)
    ↓
Create Customer (if not found)
    ↓
Create Quote + Line Items (single mutation)
    ↓
Store Mapping (prevent duplicates)
```

## 🔑 Key Files

| File | Purpose |
|------|---------|
| `app/lib/printavo.server.ts` | Main GraphQL client & sync logic |
| `app/routes/webhooks.orders.create.tsx` | Webhook receiver |
| `app/db.server.ts` | Database schema (order_mappings) |
| `app/lib/webhooks.server.ts` | Webhook dispatcher |

## 🗄️ Database Tables

### order_mappings (NEW)
```sql
shop, shopify_order_id, printavo_quote_id, 
printavo_contact_id, created_at
UNIQUE(shop, shopify_order_id)
```

Purpose: Idempotency tracking

## 📋 Data Mapping Cheat Sheet

| Shopify | Printavo v2 |
|---------|-------------|
| `order.email` | Contact lookup key |
| `billing_address.first_name` | `primaryContact.firstName` |
| `order.name` | `quote.nickname` |
| `line_items[].sku` | `lineItem.itemNumber` |
| `line_items[].variant_title` | Parsed → `sizes[].size` |
| `line_items[].quantity` | `sizes[].count` |
| `order.tags` | `quote.tags` + ["shopify"] |

## 🎯 Size Mapping Quick Ref

```
"Small" / "S" → S
"Medium" / "M" → M
"Large" / "L" → L
"XL" / "Extra Large" → XL
"2XL" / "XXL" → XXL
"Youth S" → YOUTH_S
"2T" → _2T
"10" → _10
"One Size" / "OS" → OSFA
Unknown → M (fallback)
```

## ⚡ Main Functions

### syncOrderToPrintavo(shop, order)
```typescript
// Returns: { success, message, quoteId? }
// Handles: idempotency, filters, customer lookup, quote creation
```

### findOrCreateContact(apiKey, order)
```typescript
// Returns: { contactId, customerId?, isNew }
// Handles: email lookup, customer creation
```

### createQuoteWithItems(apiKey, order, contactId)
```typescript
// Returns: PrintavoQuote
// Handles: quote creation, line items, addresses
```

## 🔍 Debugging Commands

### Check recent syncs
```sql
SELECT order_name, status, message, created_at 
FROM activity_logs 
WHERE shop = 'shop.myshopify.com' 
ORDER BY created_at DESC LIMIT 20;
```

### Check order mappings
```sql
SELECT * FROM order_mappings 
WHERE shop = 'shop.myshopify.com' 
ORDER BY created_at DESC;
```

### Find duplicate syncs (should be 0)
```sql
SELECT shopify_order_id, COUNT(*) 
FROM order_mappings 
GROUP BY shopify_order_id 
HAVING COUNT(*) > 1;
```

## 🚨 Common Errors & Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| "Printavo API key not configured" | Missing API key | Set in merchants table |
| "Order must have a customer email" | No email | Ensure order.email exists |
| "No valid line items to sync" | All filtered | Check filter settings |
| "Contact lookup failed" | API error | Check API key, network |
| "Order already synced" | Duplicate webhook | Normal - idempotency working |

## 🎛️ Merchant Settings

```sql
UPDATE merchants SET
  printavo_api_key = 'your-key',
  sync_enabled = 1,           -- 1=on, 0=off
  sync_mode = 'all',          -- 'all' or 'tagged'
  included_tags = 'print,wholesale',  -- for tagged mode
  skip_gift_cards = 1,        -- 1=skip, 0=sync
  skip_non_physical = 1       -- 1=skip, 0=sync
WHERE shop = 'shop.myshopify.com';
```

## 🧪 Quick Test

### 1. Test API connection
```bash
curl -X POST https://www.printavo.com/api/v2/graphql \
  -H "Authorization: Bearer YOUR_KEY" \
  -d '{"query": "{ __typename }"}'
```

### 2. Create test order in Shopify
- Include email
- Include size variant
- Include billing address

### 3. Check results
```sql
-- Should have activity log entry
SELECT * FROM activity_logs 
WHERE order_name = '#TEST' 
ORDER BY created_at DESC LIMIT 1;

-- Should have mapping
SELECT * FROM order_mappings 
WHERE shopify_order_name = '#TEST';
```

## 📦 Sample Webhook Payload

```json
{
  "id": 1234567890,
  "name": "#1043",
  "email": "customer@example.com",
  "billing_address": {
    "first_name": "John",
    "last_name": "Doe",
    "address1": "123 Main St",
    "city": "New York",
    "province": "NY",
    "zip": "10001"
  },
  "line_items": [{
    "name": "T-Shirt",
    "variant_title": "Medium / Black",
    "sku": "TSH-M-BLK",
    "quantity": 10,
    "price": "18.00"
  }]
}
```

## 📤 Sample GraphQL Mutation

```graphql
mutation {
  quoteCreate(input: {
    contact: { id: "CONTACT_ID" }
    customerDueAt: "2025-12-25"
    dueAt: "2025-12-25T17:00:00Z"
    nickname: "Shopify #1043"
    lineItemGroups: [{
      position: 1
      lineItems: [{
        position: 1
        description: "T-Shirt - Medium / Black"
        itemNumber: "TSH-M-BLK"
        price: 18.0
        sizes: [{ size: M, count: 10 }]
      }]
    }]
  }) {
    quote { id }
  }
}
```

## 🔐 Security Notes

- ✅ HMAC validation on webhooks
- ✅ API keys stored per merchant
- ✅ GDPR: All data deleted on uninstall
- ✅ No sensitive data in logs

## 📈 Performance

- **Typical sync time**: 1-3 seconds
- **API calls per order**: 2-3 (lookup, create customer if needed, create quote)
- **Database writes**: 2 (activity_log, order_mapping)
- **Retry safe**: Idempotency prevents duplicates

## 🎓 Learning Resources

- **Full Documentation**: `PRINTAVO_V2_IMPLEMENTATION.md`
- **Testing Guide**: `TESTING_GUIDE.md`
- **Migration Guide**: `MIGRATION_V1_TO_V2.md`
- **Printavo v2 Docs**: https://www.printavo.com/docs/api/v2/

## 🆘 Emergency Contacts

- **Printavo Support**: support@printavo.com
- **API Documentation**: https://www.printavo.com/docs/api/
- **GraphQL Explorer**: https://www.printavo.com/api/v2/explorer

## ✅ Deployment Checklist

- [ ] Database schema updated (automatic)
- [ ] API keys configured for merchants
- [ ] Test order synced successfully
- [ ] Verified quote in Printavo
- [ ] Checked order_mappings table
- [ ] Monitored activity_logs
- [ ] Confirmed no errors
- [ ] Documented any custom changes

## 🏆 Success Criteria

| Metric | Target |
|--------|--------|
| Sync success rate | > 99% |
| Average sync time | < 3 seconds |
| Duplicate quotes | 0 |
| Customer duplicates | 0 (after first sync) |
| Size mapping accuracy | > 95% |

---

**Keep this card handy for quick reference during development and troubleshooting!** 📌

