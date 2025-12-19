# Printavo v2 GraphQL API Implementation

## Overview

This document describes the complete implementation of the Shopify order → Printavo v2 GraphQL synchronization workflow. The implementation replaces the previous v1 REST API with a robust, idempotent GraphQL-based solution.

## Architecture

### Key Components

1. **Database Layer** (`app/db.server.ts`)
   - New `order_mappings` table for idempotency tracking
   - Stores Shopify order ID → Printavo quote ID mappings
   - Prevents duplicate quote creation on webhook retries

2. **Printavo GraphQL Client** (`app/lib/printavo.server.ts`)
   - Complete type definitions for Printavo v2 API
   - GraphQL query/mutation operations
   - Find-or-create customer logic
   - Quote creation with nested line items
   - Intelligent size mapping from Shopify variants

3. **Webhook Handler** (`app/routes/webhooks.orders.create.tsx`)
   - Receives Shopify order webhooks
   - Validates HMAC signatures
   - Delegates to sync function

## Workflow

### Step 1: Idempotency Check

Before processing, the system checks if the Shopify order has already been synced:

```typescript
const existingMapping = db
  .prepare("SELECT printavo_quote_id FROM order_mappings WHERE shop = ? AND shopify_order_id = ?")
  .get(shop, order.id.toString());

if (existingMapping) {
  return { success: true, message: "Order already synced" };
}
```

### Step 2: Find or Create Customer

**2a. Contact Lookup by Email**

```graphql
query FindPrimaryContactByEmail($q: String!) {
  contacts(query: $q, primaryOnly: true, first: 5) {
    nodes {
      id
      firstName
      lastName
      customer { id companyName }
      emails { email }
    }
  }
}
```

**2b. Create Customer (if not found)**

```graphql
mutation CreateCustomer($input: CustomerCreateInput!) {
  customerCreate(input: $input) {
    customer {
      id
      companyName
      primaryContact {
        id
        emails { email }
      }
    }
  }
}
```

The function extracts:
- Email from `order.email` or `order.customer.email`
- Name from `order.billing_address` or `order.customer`
- Phone, company, and addresses
- Creates full customer profile with billing/shipping addresses

### Step 3: Create Quote with Line Items

```graphql
mutation CreateQuote($input: QuoteCreateInput!) {
  quoteCreate(input: $input) {
    quote {
      id
      nickname
      contact { id }
      lineItemGroups {
        id
        position
        lineItems {
          id
          description
          itemNumber
        }
      }
    }
  }
}
```

**Quote Metadata:**
- `nickname`: "Shopify #1043"
- `visualPoNumber`: "Shopify-1043"
- `customerDueAt` / `dueAt`: 7 business days from order date
- `tags`: ["shopify", "paid", ...custom tags]
- `productionNote`: Includes order ID, number, dates, and customer notes

**Line Items:**
- Position-indexed
- Description includes product name + variant title
- SKU mapped to `itemNumber`
- Price per item
- Tax status preserved

### Step 4: Size Mapping

The most complex part of the implementation is mapping Shopify variant options to Printavo's `LineItemSize` enum.

**Supported Size Formats:**
- Standard: S, M, L, XL, XXL, XXXL, etc.
- Youth: Youth S, Youth M, Youth L, Youth XL
- Toddler: 2T, 3T, 4T, 5T
- Numeric: 6, 8, 10, 12, 14, 16, 18
- One Size: OSFA, One Size, OS

**Extraction Logic:**

```typescript
function extractSizeFromVariant(lineItem: any): string {
  // 1. Parse variant_title (e.g., "Medium / Black")
  // 2. Apply heuristics to identify size component
  // 3. Fall back to first option or "M"
}

function mapSizeToPrintavo(sizeString: string): LineItemSize {
  // Normalize input (uppercase, remove special chars)
  // Match against direct enum values
  // Handle youth/toddler/numeric patterns
  // Default: "M"
}
```

**Example Mappings:**
```
"Small" → S
"Medium" → M
"XL" → XL
"2XL" → XXL
"Youth Large" → YOUTH_L
"3T" → _3T
"10" → _10
"One Size" → OSFA
"Unknown" → M (safe fallback)
```

### Step 5: Store Mapping

After successful quote creation:

```typescript
db.prepare(
  `INSERT INTO order_mappings 
   (shop, shopify_order_id, shopify_order_name, printavo_quote_id, printavo_contact_id, printavo_customer_id)
   VALUES (?, ?, ?, ?, ?, ?)`
).run(shop, order.id, order.name, quote.id, contactId, customerId);
```

## Data Mapping Reference

### Shopify Order → Printavo Customer

| Shopify Field | Printavo Field |
|---------------|----------------|
| `order.email` | `primaryContact.email` |
| `billing_address.first_name` | `primaryContact.firstName` |
| `billing_address.last_name` | `primaryContact.lastName` |
| `billing_address.phone` | `primaryContact.phone` |
| `billing_address.company` | `companyName` |
| `billing_address.*` | `billingAddress.*` |
| `shipping_address.*` | `shippingAddress.*` |

### Shopify Order → Printavo Quote

| Shopify Field | Printavo Field |
|---------------|----------------|
| `order.name` | `nickname` ("Shopify #1043") |
| `order.order_number` | `visualPoNumber` |
| `order.note` | `customerNote` |
| `order.id` + metadata | `productionNote` |
| `order.tags` | `tags` (+ "shopify", "paid") |

### Shopify Line Item → Printavo Line Item

| Shopify Field | Printavo Field |
|---------------|----------------|
| `name` + `variant_title` | `description` |
| `sku` | `itemNumber` |
| `price` | `price` |
| `quantity` | `sizes[].count` |
| `variant_title` (parsed) | `sizes[].size` |
| `taxable` | `taxed` |

## Configuration

### Merchant Settings

The system respects existing merchant settings:

- **`sync_enabled`**: Master on/off switch
- **`sync_mode`**: "all" or "tagged"
- **`included_tags`**: Required tags for "tagged" mode
- **`skip_gift_cards`**: Skip gift card products
- **`skip_non_physical`**: Skip digital/non-physical items

### Environment Variables

- **`PRINTAVO_API_KEY`**: Fallback API key (per-merchant keys take precedence)
- **`DATABASE_URL`**: SQLite database path

## Error Handling

### Validation Errors

- Missing email → Error: "Order must have a customer email"
- No valid line items → Error: "No valid line items to sync"
- Missing API key → Error: "Printavo API key not configured"

### API Errors

All GraphQL errors are caught and returned as:

```typescript
{
  success: false,
  message: "Failed to sync: [detailed error message]"
}
```

### Idempotency

Duplicate webhooks are gracefully handled:

```typescript
{
  success: true,
  message: "Order already synced to Printavo quote QUO-12345"
}
```

## Testing

### Test Connection

```typescript
import { testPrintavoConnection } from "~/lib/printavo.server";

const result = await testPrintavoConnection("your-api-key");
// { success: true, message: "Connection successful" }
```

### Test Order Sync

```typescript
import { syncOrderToPrintavo } from "~/lib/printavo.server";

const result = await syncOrderToPrintavo("shop.myshopify.com", shopifyOrder);
// { success: true, message: "Order synced successfully...", quoteId: "QUO-123" }
```

### Sample Shopify Order Payload

```json
{
  "id": 1234567890,
  "name": "#1043",
  "order_number": 1043,
  "email": "customer@example.com",
  "created_at": "2025-12-18T10:00:00Z",
  "financial_status": "paid",
  "tags": "rush, wholesale",
  "note": "Please use eco-friendly inks",
  "billing_address": {
    "first_name": "John",
    "last_name": "Doe",
    "company": "Acme Corp",
    "address1": "123 Main St",
    "city": "New York",
    "province": "NY",
    "zip": "10001",
    "country_code": "US",
    "phone": "+1-555-1234"
  },
  "shipping_address": { /* same structure */ },
  "line_items": [
    {
      "id": 9876543210,
      "name": "Bella Canvas 3001 Tee",
      "variant_title": "Medium / Black",
      "sku": "BC3001-M-BLK",
      "quantity": 10,
      "price": "18.00",
      "taxable": true,
      "requires_shipping": true,
      "product_type": "T-Shirt"
    }
  ]
}
```

### Expected Printavo Quote

```json
{
  "contact": { "id": "CONTACT_ID" },
  "customerDueAt": "2025-12-25",
  "dueAt": "2025-12-25T17:00:00Z",
  "nickname": "Shopify #1043",
  "visualPoNumber": "Shopify-1043",
  "customerNote": "Please use eco-friendly inks",
  "productionNote": "Shopify Order ID: 1234567890\nOrder Number: #1043\nCreated: 2025-12-18T10:00:00Z\nCustomer Note: Please use eco-friendly inks",
  "tags": ["shopify", "paid", "rush", "wholesale"],
  "lineItemGroups": [
    {
      "position": 1,
      "lineItems": [
        {
          "position": 1,
          "description": "Bella Canvas 3001 Tee - Medium / Black",
          "itemNumber": "BC3001-M-BLK",
          "price": 18.0,
          "taxed": true,
          "sizes": [
            { "size": "M", "count": 10 }
          ]
        }
      ]
    }
  ]
}
```

## Database Schema

### order_mappings Table

```sql
CREATE TABLE order_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop TEXT NOT NULL,
  shopify_order_id TEXT NOT NULL,
  shopify_order_name TEXT,
  printavo_quote_id TEXT NOT NULL,
  printavo_contact_id TEXT,
  printavo_customer_id TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(shop, shopify_order_id)
);
```

## Migration from v1 API

### Breaking Changes

The v1 REST API endpoint (`/api/v1/orders`) has been replaced with v2 GraphQL (`/api/v2/graphql`). No migration script is needed for existing data, but:

1. **API Keys**: v1 keys may not work with v2. Update merchant API keys in the database.
2. **Quote IDs**: v2 uses different ID format. Old v1 order references won't map to new v2 quotes.
3. **Size Handling**: v2 requires explicit enum values. The new size mapper handles this automatically.

### Upgrade Path

1. Deploy new code
2. Test with a single merchant
3. Verify quote creation in Printavo
4. Update API keys for all merchants if needed
5. Monitor activity logs for errors

## Troubleshooting

### Common Issues

**Issue**: "Contact lookup failed"
- **Cause**: Invalid API key or network error
- **Fix**: Verify API key in merchant settings

**Issue**: "Customer creation failed"
- **Cause**: Missing required fields (email, name)
- **Fix**: Check Shopify order has customer info

**Issue**: "Quote creation failed"
- **Cause**: Invalid line item sizes
- **Fix**: Check size mapping logic, verify Printavo's enum values

**Issue**: "No valid line items to sync"
- **Cause**: All items filtered out (gift cards, digital products)
- **Fix**: Adjust merchant filter settings

### Activity Logs

All sync attempts are logged in `activity_logs`:

```sql
SELECT * FROM activity_logs 
WHERE shop = 'myshop.myshopify.com' 
ORDER BY created_at DESC 
LIMIT 50;
```

### Order Mappings

Check sync history:

```sql
SELECT * FROM order_mappings 
WHERE shop = 'myshop.myshopify.com' 
ORDER BY created_at DESC;
```

## Future Enhancements

### Potential Improvements

1. **Batch Syncing**: Sync multiple orders at once for backfilling
2. **Order Updates**: Handle order edits/cancellations
3. **Custom Size Maps**: Per-merchant size mapping rules
4. **Artwork Integration**: Attach images from Shopify to Printavo
5. **Status Sync**: Two-way sync of order/quote status
6. **Advanced Filtering**: More granular product filtering
7. **Retry Logic**: Exponential backoff for API failures
8. **Webhook Queue**: Process webhooks asynchronously

## API Reference

### Main Functions

#### `syncOrderToPrintavo(shop: string, order: any)`

Syncs a Shopify order to Printavo as a quote.

**Parameters:**
- `shop`: Shopify shop domain
- `order`: Shopify order webhook payload

**Returns:**
```typescript
{
  success: boolean;
  message: string;
  quoteId?: string;
}
```

#### `testPrintavoConnection(apiKey: string)`

Tests Printavo API connectivity.

**Parameters:**
- `apiKey`: Printavo API key

**Returns:**
```typescript
{
  success: boolean;
  message: string;
}
```

### Internal Functions

- `findOrCreateContact(apiKey, order)`: Lookup or create customer
- `createQuoteWithItems(apiKey, order, contactId)`: Create quote
- `mapSizeToPrintavo(sizeString)`: Convert size to enum
- `extractSizeFromVariant(lineItem)`: Parse variant options
- `printavoGraphQL(apiKey, query, variables)`: GraphQL client

## Compliance

### GDPR

On app uninstall, all data is deleted:
- Sessions
- Merchant settings
- Activity logs
- Order mappings

See `handleAppUninstalled()` in `webhooks.server.ts`.

## Support

### Printavo API Documentation

- **GraphQL Explorer**: https://www.printavo.com/api/v2/explorer
- **Schema Reference**: https://www.printavo.com/docs/api/v2/

### Contact

For issues or questions, refer to:
- Printavo support: support@printavo.com
- API documentation: https://www.printavo.com/docs/api/

---

**Last Updated**: December 18, 2025  
**Version**: 2.0.0  
**Author**: Shopify × Printavo Integration Team

