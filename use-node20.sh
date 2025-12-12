#!/bin/bash
# Helper script to use Node.js 20 for this project

eval "$(/opt/homebrew/bin/brew shellenv)"
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"

echo "✅ Using Node.js $(node --version)"
echo "✅ Using npm $(npm --version)"
echo ""
echo "You can now run:"
echo "  npm run dev    # Start development server"
echo "  npm run build  # Build for production"
echo ""

# If arguments provided, execute them
if [ $# -gt 0 ]; then
  exec "$@"
fi


