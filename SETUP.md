# Quick Setup Guide

## Prerequisites

1. **Shopify Partner Account**
   - Sign up at https://partners.shopify.com
   - Create a new app in your partner dashboard
   - Note your API key and secret

2. **Printavo Account**
   - Sign up at https://www.printavo.com
   - Get your API key from Printavo settings

3. **Development Environment**
   - Node.js 18+ installed
   - npm or yarn package manager

## Local Development Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Create a `.env` file in the root directory:

```env
SHOPIFY_API_KEY=your_shopify_api_key
SHOPIFY_API_SECRET=your_shopify_api_secret
SCOPES=read_orders,read_products
HOST=http://localhost:3000
PRINTAVO_API_KEY=your_printavo_api_key
SESSION_SECRET=generate_a_random_secret_here
DATABASE_URL=sqlite:./data.db
NODE_ENV=development
```

**Generate SESSION_SECRET:**
```bash
openssl rand -base64 32
```

### 3. Start Development Server

```bash
npm run dev
```

### 4. Use Shopify CLI Tunnel

In a separate terminal, run:

```bash
shopify app dev
```

This will:
- Create a tunnel to your local server
- Update your app's redirect URLs
- Provide a URL to install the app in a development store

### 5. Install App in Development Store

1. Open the URL provided by `shopify app dev`
2. Select your development store
3. Complete OAuth flow
4. Approve billing (test mode)
5. App will redirect to dashboard

## Production Deployment

### Option 1: Fly.io

1. Install Fly CLI:
```bash
curl -L https://fly.io/install.sh | sh
```

2. Login:
```bash
fly auth login
```

3. Launch app:
```bash
fly launch
```

4. Set secrets:
```bash
fly secrets set SHOPIFY_API_KEY=your_key
fly secrets set SHOPIFY_API_SECRET=your_secret
fly secrets set SCOPES=read_orders,read_products
fly secrets set HOST=https://your-app-name.fly.dev
fly secrets set SESSION_SECRET=your_secret
fly secrets set DATABASE_URL=sqlite:/data/data.db
fly secrets set NODE_ENV=production
```

5. Update app redirect URLs in Shopify Partner Dashboard:
   - Allowed redirection URL(s): `https://your-app-name.fly.dev/auth/callback`

### Option 2: Railway

1. Connect your GitHub repository to Railway
2. Add environment variables in Railway dashboard
3. Deploy automatically on push

## Testing the App

1. **Install in Development Store**
   - Complete OAuth flow
   - Approve billing (test mode)

2. **Configure Settings**
   - Go to app dashboard
   - Enter Printavo API key
   - Configure sync settings
   - Test connection

3. **Create Test Order**
   - Create an order in your development store
   - Check activity log in app dashboard
   - Verify order appears in Printavo

4. **Test Filtering**
   - Create order with gift card → should be skipped
   - Create order with digital product → should be skipped
   - Create order with excluded tag → should be skipped

## Troubleshooting

### App won't install
- Check redirect URLs in Shopify Partner Dashboard
- Verify HOST environment variable matches your deployment URL
- Check OAuth callback route is accessible

### Webhooks not firing
- Verify webhooks registered after billing
- Check webhook endpoint is publicly accessible
- Verify HMAC validation is working

### Orders not syncing
- Check Printavo API key is configured
- Verify sync is enabled in dashboard
- Check activity log for error messages
- Ensure order passes filtering rules

### Database issues
- SQLite file is created automatically
- For production, consider PostgreSQL
- Database file location: `./data.db` (or path in DATABASE_URL)

## Next Steps

1. Test all features in development
2. Deploy to production
3. Submit to Shopify App Store
4. Add app listing, icon, and screenshots
5. Complete app review process

