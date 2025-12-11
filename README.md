# Printavo Sync - Shopify App

A Shopify embedded app that automatically syncs new orders to Printavo using Printavo's API. Built with Remix, App Bridge, and Polaris.

## Features

- ✅ **Shopify Embedded App** - Native UI inside Shopify admin
- ✅ **OAuth & Billing** - $20/month with 7-day trial via Shopify Billing API
- ✅ **Webhook Integration** - Automatic order sync on `orders/create`
- ✅ **Smart Filtering** - Skip gift cards, non-physical products, and custom tags
- ✅ **Merchant Dashboard** - Configure sync settings and view activity logs
- ✅ **GDPR Compliant** - Data deletion endpoint for compliance
- ✅ **Health Monitoring** - Health check endpoint for uptime monitoring

## Tech Stack

- **Backend**: Node.js + Remix
- **Frontend**: React + Polaris + App Bridge
- **Database**: SQLite (can be migrated to PostgreSQL)
- **Deployment**: Fly.io or Railway

## Setup

### Prerequisites

- Node.js 18+ 
- Shopify Partner account
- Printavo account with API access

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd SendToPrintavo
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file:
```bash
cp .env.example .env
```

4. Configure environment variables:
```env
SHOPIFY_API_KEY=your_api_key_here
SHOPIFY_API_SECRET=your_api_secret_here
SCOPES=read_orders,read_products
HOST=https://your-app-name.fly.dev
PRINTAVO_API_KEY=optional_default_key
SESSION_SECRET=your_random_secret_here
DATABASE_URL=sqlite:./data.db
NODE_ENV=production
```

### Development

1. Start the development server:
```bash
npm run dev
```

2. Use Shopify CLI tunnel for local development:
```bash
shopify app dev
```

### Production Deployment

#### Fly.io

1. Install Fly CLI:
```bash
curl -L https://fly.io/install.sh | sh
```

2. Login and launch:
```bash
fly auth login
fly launch
```

3. Set environment variables:
```bash
fly secrets set SHOPIFY_API_KEY=your_key
fly secrets set SHOPIFY_API_SECRET=your_secret
# ... set other variables
```

#### Railway

1. Connect your repository to Railway
2. Set environment variables in Railway dashboard
3. Deploy automatically on push

## App Structure

```
app/
├── db.server.ts              # Database setup and schema
├── shopify.server.ts         # Shopify API configuration
├── lib/
│   ├── session.server.ts    # Session storage
│   ├── billing.server.ts    # Billing management
│   ├── printavo.server.ts   # Printavo API integration
│   └── webhooks.server.ts   # Webhook handlers
└── routes/
    ├── auth.tsx             # OAuth initiation
    ├── auth.callback.tsx    # OAuth callback
    ├── apps.printavo-sync.tsx           # Main dashboard
    ├── apps.printavo-sync.gdpr.delete.tsx  # GDPR endpoint
    ├── apps.printavo-sync.health.tsx       # Health check
    ├── webhooks.orders.create.tsx          # Order webhook
    └── webhooks.app.uninstalled.tsx        # Uninstall webhook
```

## Configuration

### Sync Settings

Merchants can configure:
- **Enable/Disable Sync** - Toggle order synchronization
- **Skip Gift Cards** - Exclude gift card orders
- **Skip Non-Physical Products** - Exclude digital/downloadable products
- **Excluded Tags** - Comma-separated list of product tags to exclude
- **Printavo API Key** - Merchant-specific API key

### Filtering Logic

Orders are skipped if:
- All products are non-physical (`requires_shipping: false`)
- Line items are Gift Cards, Digital, or Service types
- Line items have excluded tags (e.g., "no-print", "internal-use")

## API Endpoints

- `GET /auth` - Initiate OAuth flow
- `GET /auth/callback` - OAuth callback handler
- `GET /apps/printavo-sync` - Main dashboard
- `POST /webhooks/orders/create` - Order creation webhook
- `POST /webhooks/app/uninstalled` - App uninstall webhook
- `POST /apps/printavo-sync/gdpr/delete` - GDPR data deletion
- `GET /apps/printavo-sync/health` - Health check

## Database Schema

### Sessions
Stores Shopify OAuth sessions for authentication.

### Merchants
Stores merchant configuration:
- Sync settings
- Printavo API key
- Billing status
- Trial expiration

### Activity Logs
Tracks all sync attempts:
- Order ID and name
- Sync status (synced/skipped/error)
- Error messages
- Timestamps

## Shopify App Store Compliance

- ✅ Native Shopify Billing (not custom)
- ✅ HMAC-verified webhooks
- ✅ GDPR-compliant data deletion
- ✅ Hosted merchant-facing UI
- ✅ HTTPS deployment
- ✅ Proper uninstall handling
- ✅ Activity logging for audit trail

## Testing

1. Install the app in a development store
2. Complete OAuth and billing flow
3. Create a test order
4. Verify sync in Printavo dashboard
5. Check activity log in app dashboard

## Troubleshooting

### Webhooks not firing
- Verify webhook registration after billing
- Check webhook endpoint is accessible
- Verify HMAC validation

### Orders not syncing
- Check Printavo API key is configured
- Verify sync is enabled in dashboard
- Check activity log for error messages
- Ensure order passes filtering rules

### Billing issues
- Verify billing plan configuration
- Check trial expiration dates
- Ensure billing status is "active"

## License

MIT

## Support

For issues and questions, please open an issue in the repository.

