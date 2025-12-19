# Migration Guide: Printavo v1 → v2 API

## Overview

This guide helps you migrate from Printavo's v1 REST API to the v2 GraphQL API. The new implementation offers:

- ✅ **Idempotency**: Prevents duplicate quote creation
- ✅ **Better data mapping**: Richer customer and quote information
- ✅ **Size intelligence**: Automatic variant → size enum mapping
- ✅ **Customer management**: Find-or-create logic prevents duplicates
- ✅ **Nested creation**: Quote + line items in single operation
- ✅ **Enhanced metadata**: Better tracking with tags and notes

## What's Changed

### API Endpoint

**Before (v1):**
```
POST https://www.printavo.com/api/v1/orders
```

**After (v2):**
```
POST https://www.printavo.com/api/v2/graphql
```

### Data Structure

**Before (v1):**
```json
{
  "customer_name": "John Doe",
  "customer_email": "john@example.com",
  "order_number": "#1043",
  "line_items": [
    {
      "name": "T-Shirt",
      "quantity": 10,
      "price": "18.00",
      "sku": "TSH-001"
    }
  ]
}
```

**After (v2):**
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
        description: "T-Shirt"
        itemNumber: "TSH-001"
        price: 18.0
        sizes: [{ size: M, count: 10 }]
      }]
    }]
  }) {
    quote { id }
  }
}
```

### Key Differences

| Feature | v1 | v2 |
|---------|-----|-----|
| **API Type** | REST | GraphQL |
| **Customer Lookup** | Auto-create by name | Find by email, then create |
| **Sizes** | Free-form text | Enum (S, M, L, XL, etc.) |
| **Line Items** | Flat list | Grouped with positions |
| **Addresses** | Limited | Full billing + shipping |
| **Idempotency** | None | Built-in tracking |
| **Tags** | Not supported | Full support |
| **Due Dates** | Optional | Required |

## Pre-Migration Checklist

- [ ] Backup your database
- [ ] Document current API key
- [ ] Note any custom modifications to sync logic
- [ ] Test v2 API with your Printavo account
- [ ] Review size variants in your Shopify products
- [ ] Plan maintenance window (recommended: 15-30 min)

## Migration Steps

### Step 1: Verify API Access

Test that your Printavo API key works with v2:

```bash
curl -X POST https://www.printavo.com/api/v2/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"query": "{ __typename }"}'
```

Expected response:
```json
{"data": {"__typename": "Query"}}
```

If you get a 401/403 error, you may need to regenerate your API key in Printavo settings.

### Step 2: Update Database Schema

The new code automatically adds the `order_mappings` table when `db.server.ts` initializes. No manual SQL required.

Verify the table was created:

```sql
SELECT name FROM sqlite_master 
WHERE type='table' AND name='order_mappings';
```

### Step 3: Deploy Code Changes

```bash
# Pull latest code
git pull origin main

# Install dependencies (if any were added)
npm install

# Build
npm run build

# Restart application
# (Process depends on your hosting: Railway, Fly.io, etc.)
```

### Step 4: Verify Deployment

1. Check application logs for errors
2. Visit your app admin page
3. Verify merchant settings are intact
4. Check database connection

### Step 5: Test with Single Merchant

**Option A: Use test store**

If you have a development Shopify store:

1. Install app on test store
2. Configure Printavo API key
3. Create test order
4. Verify quote created in Printavo
5. Check `order_mappings` table for entry

**Option B: Cautious production test**

1. Choose one low-volume merchant
2. Enable sync for that merchant only
3. Monitor first few orders closely
4. Check Printavo for correct quote creation
5. Verify customer info mapped correctly

### Step 6: Gradual Rollout

**For multi-tenant deployments:**

1. Start with 10% of merchants
2. Monitor for 24 hours
3. Check error rates in `activity_logs`
4. If stable, increase to 50%
5. Monitor for another 24 hours
6. Roll out to 100%

**Single-tenant:** Skip to full rollout after successful test.

### Step 7: Monitor Activity Logs

```sql
-- Check sync success rate (first hour)
SELECT 
  status,
  COUNT(*) as count
FROM activity_logs
WHERE created_at > datetime('now', '-1 hour')
GROUP BY status;
```

Expected:
- Most should be "synced" or "skipped"
- Few or no "error" status
- "skipped" reasons should be clear (e.g., "no matching tags")

## Common Migration Issues

### Issue 1: "Invalid API key"

**Cause:** v1 API key doesn't work with v2

**Solution:**
1. Log into Printavo
2. Go to Settings → API
3. Generate new API key
4. Update in merchant settings:

```sql
UPDATE merchants 
SET printavo_api_key = 'new-v2-api-key' 
WHERE shop = 'yourshop.myshopify.com';
```

### Issue 2: "Customer creation failed"

**Cause:** Missing required fields (email, first name)

**Solution:**
- Ensure Shopify orders have customer email
- For guest checkouts, ensure `order.email` is set
- Check that names aren't empty strings

### Issue 3: "Quote creation failed - Invalid size"

**Cause:** Size mapping produced invalid enum value

**Solution:**
- Check the `mapSizeToPrintavo()` function
- Verify your Shopify products use standard size formats
- Update size mapping logic if you use custom size names

### Issue 4: "No valid line items to sync"

**Cause:** All items filtered out (gift cards, digital, etc.)

**Solution:**
- Review merchant filter settings
- Adjust `skip_gift_cards` and `skip_non_physical` if too aggressive
- Ensure physical products are marked `requires_shipping = true`

### Issue 5: Duplicate customers in Printavo

**Cause:** Email matching not working

**Solution:**
- Verify email addresses are lowercase normalized
- Check for leading/trailing whitespace
- Review contact lookup query

### Issue 6: Performance degradation

**Cause:** Additional API calls (lookup + create customer + create quote)

**Solution:**
- v2 makes 2-3 calls vs v1's 1 call
- Acceptable tradeoff for better data integrity
- Most calls complete in < 2 seconds
- If needed, implement caching layer for frequent customers

## Data Cleanup (Optional)

### Remove duplicate customers

After migration, you may have duplicate customers in Printavo (from v1 and v2 syncs). To consolidate:

1. Export customers from Printavo
2. Identify duplicates by email
3. Manually merge or delete in Printavo UI
4. Going forward, v2 prevents new duplicates

### Backfill order mappings

If you want to track historical orders:

```sql
-- This is OPTIONAL and only if you need historical tracking
-- Requires knowing which Shopify orders correspond to which Printavo quotes

INSERT INTO order_mappings (shop, shopify_order_id, shopify_order_name, printavo_quote_id)
SELECT 
  shop,
  order_id,
  order_name,
  'PRINTAVO_QUOTE_ID' -- You'd need to determine this somehow
FROM activity_logs
WHERE status = 'synced'
  AND created_at < 'MIGRATION_DATE';
```

**Note:** This is complex and usually not necessary. Idempotency only matters for new orders going forward.

## Rollback Procedure

If you need to revert to v1:

### Step 1: Revert Code

```bash
git revert HEAD  # or git checkout previous-commit
npm run build
# Restart app
```

### Step 2: Verify v1 Endpoint

Check that v1 API still works:

```bash
curl -X POST https://www.printavo.com/api/v1/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "customer_name": "Test",
    "customer_email": "test@example.com",
    "order_number": "TEST-001",
    "line_items": []
  }'
```

### Step 3: Monitor

Watch for successful syncs in `activity_logs`.

### Step 4: Document Issues

If you had to rollback, document why:
- What errors occurred?
- Which merchants were affected?
- What data was problematic?

Share with development team for investigation.

## Post-Migration Tasks

### Week 1: Close Monitoring

- [ ] Check `activity_logs` daily
- [ ] Monitor error rates
- [ ] Verify quotes appear correctly in Printavo
- [ ] Confirm no duplicate quotes
- [ ] Test idempotency (resend webhook)

### Week 2-4: Optimization

- [ ] Review size mapping accuracy
- [ ] Adjust filter settings based on feedback
- [ ] Document any custom mapping rules needed
- [ ] Train users on new Printavo quote format

### Ongoing: Maintenance

- [ ] Monthly review of sync success rates
- [ ] Quarterly check for Printavo API updates
- [ ] Keep size mapping updated as new products added

## FAQ

### Q: Will existing Printavo quotes be affected?

**A:** No. Migration only affects new orders going forward. Historical quotes remain unchanged.

### Q: Do I need to update webhooks in Shopify?

**A:** No. Webhook URLs remain the same. Only the backend processing changes.

### Q: What happens to orders during migration?

**A:** Orders created during deployment may fail. They'll appear in `activity_logs` with errors. You can manually resend these webhooks from Shopify admin after migration completes.

### Q: Can I run v1 and v2 simultaneously?

**A:** Not recommended. Choose one approach to avoid data inconsistencies. Test v2 thoroughly, then fully migrate.

### Q: Will quote IDs change?

**A:** Yes. v2 generates new quote IDs. They won't match v1's format. If you reference quote IDs externally, update those systems.

### Q: How do I test size mapping before going live?

**A:** Create test orders with various size variants. Check resulting Printavo quotes. Adjust `mapSizeToPrintavo()` function as needed.

### Q: What if my Shopify store uses non-standard sizes?

**A:** Update the size mapping function in `printavo.server.ts`. Add custom patterns to `mapSizeToPrintavo()`. Example:

```typescript
// Custom sizes for your store
if (normalized === "EXTRASMALL") return "XS";
if (normalized === "EXTRALARGE") return "XL";
```

### Q: Can I customize which data syncs?

**A:** Yes. Edit `createQuoteWithItems()` in `printavo.server.ts`. You control:
- Which fields map where
- How notes are formatted
- Which tags to add
- Due date calculation

### Q: How do I handle orders with multiple variants of same product?

**A:** The code automatically creates separate line items for each Shopify line item. If you want to combine them, you'd need custom logic to group by SKU.

### Q: What about order updates/cancellations?

**A:** Current implementation only handles order creation. Updates require additional webhooks (`orders/updated`, `orders/cancelled`) and logic to update existing Printavo quotes.

## Support Resources

### Documentation

- **Printavo v2 API**: https://www.printavo.com/docs/api/v2/
- **GraphQL Explorer**: https://www.printavo.com/api/v2/explorer
- **Shopify Webhooks**: https://shopify.dev/docs/api/admin-rest/latest/resources/webhook

### Getting Help

1. Check `PRINTAVO_V2_IMPLEMENTATION.md` for detailed technical docs
2. Review `TESTING_GUIDE.md` for debugging steps
3. Check `activity_logs` table for error messages
4. Search Printavo API documentation
5. Contact Printavo support: support@printavo.com

## Success Metrics

Your migration is successful when:

✅ All new orders sync to Printavo as quotes  
✅ No duplicate quotes created  
✅ Customer information correctly mapped  
✅ Line items have accurate sizes and quantities  
✅ Sync success rate > 99%  
✅ No increase in support tickets  
✅ Users report quotes look correct in Printavo  

## Timeline

**Recommended migration timeline:**

- **Day 1**: Deploy and test with one merchant
- **Day 2-3**: Monitor, fix any issues
- **Day 4**: Roll out to 25% of merchants
- **Day 5-7**: Monitor, optimize
- **Week 2**: Roll out to 100%
- **Week 3-4**: Close monitoring, document learnings
- **Month 2+**: Normal operations

## Conclusion

The v2 migration improves data quality, prevents duplicates, and provides better long-term maintainability. While the initial deployment requires careful testing, the benefits far outweigh the v1 approach.

Take your time, test thoroughly, and don't hesitate to rollback if issues arise. The v1 code remains available as a safety net.

Good luck with your migration! 🚀

---

**Document Version**: 1.0  
**Last Updated**: December 18, 2025  
**Maintained By**: Development Team

