#!/bin/bash
# Simple script to run the scraper

cd "$(dirname "$0")/.."

echo "🚀 Starting Edgy Training Sources Scraper..."
echo ""

# Try different methods to run the script
if command -v tsx &> /dev/null; then
    echo "Using tsx..."
    tsx scripts/scrape-training-sources.ts
elif [ -f "./server/node_modules/.bin/tsx" ]; then
    echo "Using tsx from server/node_modules..."
    ./server/node_modules/.bin/tsx scripts/scrape-training-sources.ts
elif [ -f "./server/node_modules/tsx/dist/loader.mjs" ]; then
    echo "Using node with tsx loader..."
    node --experimental-loader ./server/node_modules/tsx/dist/loader.mjs scripts/scrape-training-sources.ts
else
    echo "Using node with JavaScript version..."
    node scripts/scrape-training-sources.js
fi
