# 🚀 Quick Start Guide

## Step 1: Install Node.js (if not installed)

Check if Node.js is installed:
```bash
node --version
npm --version
```

If not installed, download from: https://nodejs.org/ (LTS version recommended)

## Step 2: Create .env File

Copy the template and add your API keys:

```bash
cp env.template .env
```

Then edit `.env` and replace:
- `YOUR_SHOPIFY_API_KEY_HERE` → Your Shopify API Key
- `YOUR_SHOPIFY_API_SECRET_HERE` → Your Shopify API Secret  
- `YOUR_PINTAVO_API_KEY_HERE` → Your Printavo API Key (optional)
- Keep the generated `SESSION_SECRET` or generate a new one

## Step 3: Install Dependencies

```bash
npm install
```

## Step 4: Start Development Server

```bash
npm run dev
```

This will start the Remix dev server on port 3000.

## Step 5: Use Shopify CLI Tunnel

In a **new terminal window**, run:

```bash
shopify app dev
```

This will:
- Create a secure tunnel to your local server
- Update your app's redirect URLs automatically
- Give you a URL to install the app

## Step 6: Install App in Development Store

1. Open the URL provided by `shopify app dev`
2. Select your development store
3. Complete OAuth flow
4. Approve billing (test mode - no charge)
5. App will redirect to dashboard

## 📝 Your API Keys

When you're ready, I can help you:
1. Create the `.env` file with your keys
2. Install dependencies
3. Start the development server
4. Set up the Shopify CLI tunnel

Just provide:
- **SHOPIFY_API_KEY**
- **SHOPIFY_API_SECRET**
- **PRINTAVO_API_KEY** (optional)

And I'll set everything up! 🎉


