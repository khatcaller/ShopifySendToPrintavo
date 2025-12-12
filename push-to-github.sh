#!/bin/bash

# Script to push Printavo Sync to GitHub

echo "🚀 Push Printavo Sync to GitHub"
echo ""

# Check if remote already exists
if git remote get-url origin > /dev/null 2>&1; then
    echo "✅ Remote 'origin' already exists:"
    git remote get-url origin
    echo ""
    read -p "Push to existing remote? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        git push -u origin main
        exit 0
    fi
fi

echo "📋 To push to GitHub, you need to:"
echo ""
echo "1. Create a new repository on GitHub:"
echo "   Visit: https://github.com/new"
echo "   Name: printavo-sync (or your preferred name)"
echo "   Choose Public or Private"
echo "   DO NOT initialize with README"
echo ""
echo "2. Copy the repository URL (HTTPS or SSH)"
echo ""
read -p "Enter your GitHub username: " GITHUB_USERNAME
read -p "Enter repository name (default: printavo-sync): " REPO_NAME
REPO_NAME=${REPO_NAME:-printavo-sync}

echo ""
echo "Choose connection method:"
echo "1) HTTPS (requires Personal Access Token)"
echo "2) SSH (requires SSH keys set up)"
read -p "Enter choice (1 or 2): " CONNECTION_METHOD

if [ "$CONNECTION_METHOD" = "1" ]; then
    REMOTE_URL="https://github.com/${GITHUB_USERNAME}/${REPO_NAME}.git"
    echo ""
    echo "⚠️  Note: You'll need a GitHub Personal Access Token"
    echo "   Create one at: https://github.com/settings/tokens"
    echo "   Use the token as your password when prompted"
elif [ "$CONNECTION_METHOD" = "2" ]; then
    REMOTE_URL="git@github.com:${GITHUB_USERNAME}/${REPO_NAME}.git"
else
    echo "Invalid choice. Exiting."
    exit 1
fi

echo ""
echo "Adding remote: $REMOTE_URL"
git remote add origin "$REMOTE_URL"

echo ""
echo "Setting branch to 'main'..."
git branch -M main

echo ""
echo "Ready to push! Run:"
echo "  git push -u origin main"
echo ""
read -p "Push now? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    git push -u origin main
    if [ $? -eq 0 ]; then
        echo ""
        echo "✅ Successfully pushed to GitHub!"
        echo "   View at: https://github.com/${GITHUB_USERNAME}/${REPO_NAME}"
    else
        echo ""
        echo "❌ Push failed. Check the error above."
        echo "   Make sure the repository exists on GitHub."
    fi
else
    echo ""
    echo "Run 'git push -u origin main' when ready."
fi


