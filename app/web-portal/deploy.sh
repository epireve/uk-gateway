#!/bin/bash

# Ensure we're in the project directory
cd "$(dirname "$0")"

# Install Vercel CLI if not already installed
if ! command -v vercel &> /dev/null; then
    echo "Installing Vercel CLI..."
    npm install -g vercel
fi

# Run Vercel deployment with production flag
echo "Deploying to Vercel..."
vercel --prod

echo "Deployment complete!" 