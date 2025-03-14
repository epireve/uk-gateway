#!/bin/bash

# Exit on error
set -e

echo "Building UK Gateway web portal..."

# Change to the web portal directory
cd ../app/web-portal

# Install dependencies
echo "Installing dependencies..."
pnpm install

# Build the application
echo "Building the application..."
pnpm build

echo "Build completed successfully!" 