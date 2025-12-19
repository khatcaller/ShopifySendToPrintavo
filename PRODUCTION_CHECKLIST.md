# Production Deployment Checklist

## Pre-Deployment

### Code Review
- [x] Backend sync logic implemented
- [x] Idempotency enforced (order_mappings table)
- [x] Email normalization and validation
- [x] Size mapping with safe fallback
- [x] Exclude/include tag logic
- [x] Line item property exclusion
- [x] Race condition handling
- [x] Friendly error messages
- [ ] All linter errors resolved
- [ ] TypeScript compilation successful

### Database
- [x] `order_mappings` table created
- [x] Composite unique constraint on (shop, shopify_order_id)
- [x] Indexes on frequently queried columns
- [x] New merchant settings columns added
- [ ] Backup of production database taken

### Configuration
- [ ] Environment variables set:
  - [ ] `SHOPIFY_API_KEY`
  - [ ] `SHOPIFY_API_SECRET`
  - [ ] `HOST` or `APP_URL`
  - [ ] `DATABASE_URL`
  - [ ] `PRINTAVO_API_KEY` (fallback, optional)
- [ ] Webhook URL accessible from internet
- [ ] SSL certificate valid

### Testing
- [ ] Test order created in development store
- [ ] Test order paid
- [ ] Quote appears in Printavo
- [ ] Activity log shows success
- [ ] Idempotency test (resend webhook)
- [ ] Exclude tag test
- [ ] Include tag test
- [ ] API key validation test
- [ ] Missing email test

---

## Deployment Steps

### 1. Database Migration
```bash
# Backup current database
cp data.db data.db.backup.$(date +%Y%m%d_%H%M%S)

# Deploy code (migrations run automatically on startup)
git push production main

# Or for manual deployment:
npm run build
npm start
```

### 2. Verify Database Schema
```sql
-- Check new table exists
SELECT name FROM sqlite_master WHERE type='table' AND name='order_mappings';

-- Check new columns exist
PRAGMA table_info(merchants);
-- Should show: exclude_tag, require_include_tag, include_tag, 
--              line_item_skip_property, respect_line_item_skip
```

### 3. Update Webhooks

Webhooks will automatically register as `orders/paid` on next merchant install or re-auth.

For existing merchants, webhooks need to be updated:
- Option A: Have merchants reinstall app
- Option B: Manually update via Shopify Admin
- Option C: Run webhook registration script

### 4. Verify Application Health
```bash
# Check app is responding
curl https://your-app.com/health

# Should return: {"status":"ok"}
```

---

## Post-Deployment Verification

### Immediate Checks (First 5 Minutes)

- [ ] Application starts without errors
- [ ] Health endpoint responds
- [ ] Admin UI loads
- [ ] No database connection errors in logs

### First Hour Checks

- [ ] Test merchant can access app
- [ ] Test order syncs successfully
- [ ] Activity log displays correctly
- [ ] Stats update properly
- [ ] No errors in server logs

### First 24 Hours

- [ ] Monitor sync success rate
  ```sql
  SELECT 
    status,
    COUNT(*) as count,
    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
  FROM activity_logs
  WHERE created_at > datetime('now', '-24 hours')
  GROUP BY status;
  ```

- [ ] Check for duplicate quotes
  ```sql
  SELECT shopify_order_id, COUNT(*) as count
  FROM order_mappings
  GROUP BY shopify_order_id
  HAVING count > 1;
  -- Should return 0 rows
  ```

- [ ] Verify error messages are friendly
  ```sql
  SELECT DISTINCT message
  FROM activity_logs
  WHERE status IN ('failed', 'error', 'skipped')
    AND created_at > datetime('now', '-24 hours');
  ```

---

## Monitoring Queries

### Success Rate
```sql
SELECT 
  status,
  COUNT(*) as count
FROM activity_logs
WHERE created_at > datetime('now', '-1 hour')
GROUP BY status;
```

### Recent Failures
```sql
SELECT 
  shop,
  order_name,
  message,
  created_at
FROM activity_logs
WHERE status IN ('failed', 'error')
  AND created_at > datetime('now', '-1 hour')
ORDER BY created_at DESC;
```

### Merchants with API Issues
```sql
SELECT 
  shop,
  COUNT(*) as error_count
FROM activity_logs
WHERE message LIKE '%API%'
  AND created_at > datetime('now', '-24 hours')
GROUP BY shop
ORDER BY error_count DESC;
```

### Daily Sync Volume
```sql
SELECT 
  DATE(created_at) as date,
  COUNT(*) as total_syncs,
  SUM(CASE WHEN status = 'synced' THEN 1 ELSE 0 END) as successful
FROM activity_logs
WHERE created_at > datetime('now', '-7 days')
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

---

## Rollback Procedure

If critical issues are discovered:

### 1. Stop Processing
```bash
# Option A: Disable sync for all merchants
sqlite3 data.db "UPDATE merchants SET sync_enabled = 0;"

# Option B: Revert code
git revert HEAD
npm run build
npm start
```

### 2. Restore Database (if needed)
```bash
# Only if database corruption occurred
cp data.db.backup.[timestamp] data.db
npm start
```

### 3. Communicate
- Notify affected merchants
- Explain what happened
- Provide timeline for fix
- Re-enable after resolution

---

## Success Criteria

Deployment is successful when:

✅ **Functionality**
- Orders sync to Printavo as quotes
- Idempotency prevents duplicates
- Exclude/include tags work correctly
- Line item exclusion works
- Activity log displays properly

✅ **Performance**
- Sync time < 3 seconds per order
- No database locks
- No memory leaks
- Success rate > 99% for valid orders

✅ **Reliability**
- No unhandled exceptions
- Graceful error handling
- Friendly error messages
- No data loss

✅ **User Experience**
- UI loads quickly
- Settings save correctly
- Stats update in real-time
- Activity log is readable

---

## Common Post-Deployment Issues

### Issue: "Orders/paid webhook not firing"

**Diagnosis:**
```sql
-- Check if any orders synced recently
SELECT * FROM activity_logs 
WHERE created_at > datetime('now', '-1 hour') 
ORDER BY created_at DESC;
```

**Resolution:**
1. Check webhook registration in Shopify admin
2. Verify webhook URL is correct
3. Re-register webhooks if needed
4. Test with manual webhook trigger

### Issue: "High failure rate"

**Diagnosis:**
```sql
-- Check failure reasons
SELECT message, COUNT(*) as count
FROM activity_logs
WHERE status IN ('failed', 'error')
  AND created_at > datetime('now', '-24 hours')
GROUP BY message
ORDER BY count DESC;
```

**Resolution:**
- If "API key": Check merchant API keys
- If "email": Verify orders have emails
- If "line items": Review filter settings
- If GraphQL errors: Check Printavo API status

### Issue: "Slow sync times"

**Diagnosis:**
- Check server resources (CPU, memory)
- Review database query performance
- Check Printavo API response times

**Resolution:**
1. Add database indexes if missing
2. Optimize slow queries
3. Consider caching frequent lookups
4. Scale server resources if needed

---

## Maintenance Tasks

### Daily
- Check error logs for new issues
- Monitor sync success rate
- Review failed syncs

### Weekly
- Review activity logs
- Check for duplicate quotes
- Verify webhook health
- Clean old activity logs (optional)

### Monthly
- Database vacuum (SQLite)
- Review size mapping accuracy
- Check for Printavo API changes
- Update documentation if needed

---

## Contact Information

**Technical Support:**
- Check logs: `/var/log/app.log` (or hosting platform logs)
- Database: SQLite at `./data.db`
- Webhook logs: Activity logs table

**Emergency Contacts:**
- Hosting Platform: [Your hosting support]
- Printavo API: support@printavo.com
- Shopify API: partners@shopify.com

---

## Sign-Off

**Deployed by:** _________________________  
**Date:** _________________________  
**Deployment successful:** ☐ Yes ☐ No  
**All checks passed:** ☐ Yes ☐ No  
**Rollback plan tested:** ☐ Yes ☐ No  

**Notes:**
_________________________________________________________________
_________________________________________________________________
_________________________________________________________________

---

**Next Review Date:** _________________________

