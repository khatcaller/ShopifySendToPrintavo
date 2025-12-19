# Printavo Sync - User Guide

## Overview

This app automatically sends your paid Shopify orders to Printavo as quotes. It runs in the background and requires minimal configuration.

---

## Getting Started

### 1. Install the App

Install the app from the Shopify App Store or via the provided link.

### 2. Connect to Printavo

1. Open the app from your Shopify admin
2. Enter your **Printavo API Key**
   - Get this from Printavo: Settings → API → Generate Key
   - Make sure to use a **v2 API key**
3. Click **Test Connection** to verify
4. Once connected, the app is ready to sync

---

## How It Works

### Automatic Syncing

When a customer **pays** for an order:
1. The app receives a notification from Shopify
2. It checks if the order meets your sync rules
3. If yes, it creates a quote in Printavo automatically
4. The quote includes all order details, customer info, and line items

### What Gets Synced

Each Shopify order becomes a Printavo quote with:
- **Customer contact** (looked up by email or created automatically)
- **Quote nickname**: "Shopify #1043"
- **PO number**: Shopify order number
- **Line items**: Products with sizes and quantities
- **Addresses**: Billing and shipping
- **Notes**: Order notes from customer

---

## Sync Rules

### Order-Level Rules

**Exclude Tag** (default: `no-printavo`)
- Orders with this tag will **never** sync
- Use this to manually exclude specific orders
- Example: Tag an order with "no-printavo" to skip it

**Require Include Tag** (optional)
- When enabled, **only** orders with a specific tag will sync
- Default tag: `printavo`
- Recommended for production to have full control
- Example: Only orders tagged "printavo" or "approved" will sync

### Line Item Rules

**Respect Line-Item Exclusion Property** (optional)
- When enabled, line items can be excluded individually
- Default property name: `printavo_skip`
- Add this as a line item property to exclude that item
- If all items are excluded, the entire order is skipped

**Skip Gift Cards** (recommended: on)
- Gift card products won't be included in Printavo quotes

**Skip Non-Physical Products** (recommended: on)
- Digital downloads and services won't be synced

---

## Typical Workflows

### Workflow 1: Sync Everything (Simple)
1. Leave "Require order tag to sync" **unchecked**
2. Keep "Exclude tag" as `no-printavo`
3. All paid orders sync automatically
4. Tag specific orders with `no-printavo` if you want to skip them

**Best for:** Small shops with consistent order types

### Workflow 2: Manual Approval (Recommended)
1. Enable "Require order tag to sync"
2. Set required tag to `printavo` or `approved`
3. Orders only sync when you add the tag
4. Review orders in Shopify, then tag them to sync

**Best for:** Shops that need to review orders before production

### Workflow 3: Advanced Filtering
1. Use required tag: `production`
2. Use exclude tag: `hold`
3. Enable line-item exclusion for custom orders
4. Skip gift cards and digital products

**Best for:** Complex product mixes or custom orders

---

## Activity Log

The **Activity Log** shows recent sync attempts:
- **Success**: Order synced to Printavo
- **Skipped**: Order didn't meet sync rules
- **Failed**: Technical error (check message for details)

### Common Skip Reasons

| Message | Meaning |
|---------|---------|
| "Order skipped: excluded by tag" | Order had exclude tag |
| "Order skipped: missing required tag" | Order didn't have required tag |
| "No items to sync after filtering" | All items were filtered out |
| "Order missing customer email" | No email address on order |

---

## Statistics

The app shows:
- **Last successful sync**: How recently an order synced
- **Orders synced today**: Count of successful syncs today
- **Failed syncs today**: Count of errors (should be zero)

If you see failures, check the Activity Log for details.

---

## Troubleshooting

### "Printavo API key not configured"
- Enter your Printavo API key in the app
- Make sure it's a v2 API key
- Test the connection

### "Order missing customer email"
- Order has no email address
- Guest checkouts require email
- Add email manually in Shopify, then resend webhook

### Orders aren't syncing
1. Check "Auto-sync enabled" is checked
2. Verify "Printavo" shows "Connected"
3. Check if orders have required tags
4. Check if orders have exclude tags
5. Look in Activity Log for skip reasons

### Duplicate quotes in Printavo
- Should never happen (built-in duplicate prevention)
- If you see duplicates, contact support with order numbers

### Wrong sizes in Printavo
- App auto-maps Shopify variant sizes to Printavo size enums
- Standard sizes (S, M, L, XL) map automatically
- Non-standard sizes default to "M"
- Verify variant titles include size information

---

## Best Practices

### Order Tags

Create Shopify automation rules to tag orders:
- Auto-tag paid orders with `printavo`
- Tag wholesale orders with `wholesale`
- Tag rush orders with `rush`

These tags will appear in Printavo for production team reference.

### Testing

Before going live:
1. Create a test order in Shopify
2. Make sure it's **paid** (not draft)
3. Check Activity Log in app
4. Verify quote appears in Printavo
5. Check all details are correct

### Email Addresses

- Always collect customer email addresses
- Orders without emails cannot sync
- Use Shopify settings to require email at checkout

---

## Support

### Need Help?

1. Check the Activity Log for error messages
2. Review this guide for common issues
3. Contact your app administrator

### Technical Details

- Uses Printavo v2 GraphQL API
- Syncs on `orders/paid` webhook
- Idempotent (duplicate webhooks are safe)
- Customer lookup by email

---

## Changelog

### Version 2.0
- Upgraded to Printavo v2 API
- Added exclude/include tag rules
- Added line-item exclusion property
- Improved activity log with friendly messages
- Added connection status and statistics

---

**Last Updated**: December 2025  
**App Version**: 2.0.0

