# 🚀 Your App is Ready!

## ✅ What's Done

1. ✅ Node.js 20 installed (LTS version for compatibility)
2. ✅ All dependencies installed
3. ✅ Development server starting...

## 📋 Next Steps

### Step 1: Development Server

The dev server should be running on `http://localhost:3000`

If you need to start it manually:
```bash
cd /Users/karinabravo/SendToPrintavo
source use-node20.sh
npm run dev
```

### Step 2: Install Shopify CLI (if not already installed)

```bash
npm install -g @shopify/cli @shopify/theme
```

### Step 3: Start Shopify Tunnel

Open a **NEW terminal window** and run:

```bash
cd /Users/karinabravo/SendToPrintavo
source use-node20.sh
shopify app dev
```

This will:
- Create a secure tunnel to your local server
- Give you a URL to install the app
- Auto-update redirect URLs in Shopify Partner Dashboard

### Step 4: Install App in Development Store

1. Open the URL provided by `shopify app dev`
2. Select your development store
3. Complete OAuth flow
4. Approve billing (test mode - no charge)
5. App will redirect to dashboard at `/apps/printavo-sync`

## 🔧 Important Notes

### Using Node.js 20

This project uses Node.js 20 (LTS) for better compatibility. Always use:

```bash
source use-node20.sh
```

Or manually:
```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
```

### Environment Variables

Your `.env` file is configured with:
- ✅ Shopify API Key
- ✅ Shopify API Secret  
- ✅ Printavo API Key
- ✅ Session Secret

### Troubleshooting

**Server won't start?**
- Make sure port 3000 is available
- Check `.env` file exists and has correct values
- Run `source use-node20.sh` first

**Shopify CLI not found?**
```bash
npm install -g @shopify/cli @shopify/theme
```

**Webhooks not working?**
- Make sure tunnel is running (`shopify app dev`)
- Check webhook endpoints are accessible
- Verify HMAC validation

## 🎉 You're All Set!

Once the Shopify tunnel is running, you'll get a URL to install your app. The app will:
1. Handle OAuth automatically
2. Prompt for billing (test mode)
3. Register webhooks
4. Start syncing orders to Printavo!

Need help? Check `README.md` or `SETUP.md` for more details.

