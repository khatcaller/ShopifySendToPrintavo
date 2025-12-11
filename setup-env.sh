#!/bin/bash

# Setup script for Printavo Sync Shopify App

echo "🚀 Setting up Printavo Sync Shopify App"
echo ""

# Check if .env exists
if [ -f .env ]; then
  echo "⚠️  .env file already exists. Backing up to .env.backup"
  cp .env .env.backup
fi

# Generate a random session secret
SESSION_SECRET=$(openssl rand -base64 32 2>/dev/null || python3 -c "import secrets; print(secrets.token_urlsafe(32))" 2>/dev/null || echo "CHANGE_THIS_TO_A_RANDOM_SECRET")

echo "📝 Creating .env file..."
cat > .env << EOF
# Shopify App Credentials
SHOPIFY_API_KEY=YOUR_SHOPIFY_API_KEY_HERE
SHOPIFY_API_SECRET=YOUR_SHOPIFY_API_SECRET_HERE
SCOPES=read_orders,read_products

# App URL (update after deployment)
HOST=http://localhost:3000

# Printavo API Key (optional default, can be set per merchant in dashboard)
PRINTAVO_API_KEY=YOUR_PINTAVO_API_KEY_HERE

# Session Secret (auto-generated)
SESSION_SECRET=$SESSION_SECRET

# Database
DATABASE_URL=sqlite:./data.db

# Environment
NODE_ENV=development
EOF

echo "✅ .env file created!"
echo ""
echo "📋 Next steps:"
echo "1. Edit .env and add your:"
echo "   - SHOPIFY_API_KEY"
echo "   - SHOPIFY_API_SECRET"
echo "   - PRINTAVO_API_KEY (optional)"
echo ""
echo "2. Install dependencies:"
echo "   npm install"
echo ""
echo "3. Start development server:"
echo "   npm run dev"
echo ""
echo "4. In another terminal, run:"
echo "   shopify app dev"

