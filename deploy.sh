#!/bin/bash

################################################################################
# Fastly Compute + Harness FME Deployment Script
################################################################################
#
# This script will:
# 1. Create KV Store and Config Store
# 2. Add configuration to Config Store
# 3. Deploy the service to Fastly
# 4. Link stores to the service
# 5. Activate the service
#
# Usage:
#   1. Fill in the CONFIGURATION section below
#   2. Make executable: chmod +x deploy.sh
#   3. Run: ./deploy.sh
#
################################################################################

set -e  # Exit on any error

################################################################################
# CONFIGURATION - FILL THESE IN
################################################################################

# Harness FME SDK Key (REQUIRED)
# Get this from: FME Settings -> Projects -> SDK API Keys -> Server-side SDK key
SPLIT_SDK_KEY="386kotal30nolp5lkffngl2ji9vcvn9k3us8"

# Feature flag name (optional - defaults to 'my-feature-flag')
FEATURE_FLAG_NAME="my-feature-flag"

# If you already have stores/service created, fill these in to skip creation:
EXISTING_KV_STORE_ID="b9zvoaz9ojblxjyafa0bfl"
EXISTING_CONFIG_STORE_ID="IpmEqrZOwO9JJUlKymKKH6"
EXISTING_SECRET_STORE_ID="r11rx2jzLXABDPQKXalkXY"
EXISTING_SERVICE_ID="5tvSejnjUSL5WXzA4TXUMh"

################################################################################
# Script starts here - no need to edit below
################################################################################

echo "🚀 Fastly Compute + Harness FME Deployment Script"
echo "================================================"
echo ""

# Check if SDK key is set
if [ "$SPLIT_SDK_KEY" = "<YOUR-SPLIT-SDK-KEY>" ]; then
  echo "❌ ERROR: Please set your SPLIT_SDK_KEY in this script"
  echo "   Get your SDK key from: FME Settings -> Projects -> SDK API Keys -> Server-side SDK key"
  exit 1
fi

################################################################################
# Step 1: Create or use existing KV Store
################################################################################

if [ -z "$EXISTING_KV_STORE_ID" ]; then
  echo "📦 Step 1: Creating KV Store..."
  KV_STORE_OUTPUT=$(fastly kv-store create --name=split-storage 2>&1)

  if echo "$KV_STORE_OUTPUT" | grep -q "already exists"; then
    echo "   ℹ️  KV Store 'split-storage' already exists"
    # Extract ID from existing store
    KV_STORE_ID=$(fastly kv-store list --json | jq -r '.[] | select(.name=="split-storage") | .id' | head -n 1)
  else
    KV_STORE_ID=$(echo "$KV_STORE_OUTPUT" | grep -oE '[a-zA-Z0-9]{22}' | head -n 1)
    echo "   ✅ Created KV Store"
  fi

  echo "   KV Store ID: $KV_STORE_ID"
  echo ""
else
  echo "📦 Step 1: Using existing KV Store..."
  KV_STORE_ID="$EXISTING_KV_STORE_ID"
  echo "   KV Store ID: $KV_STORE_ID"
  echo ""
fi

################################################################################
# Step 2: Create or use existing Config Store
################################################################################

if [ -z "$EXISTING_CONFIG_STORE_ID" ]; then
  echo "⚙️  Step 2: Creating Config Store..."
  CONFIG_STORE_OUTPUT=$(fastly config-store create --name=split-config 2>&1)

  if echo "$CONFIG_STORE_OUTPUT" | grep -q "already exists"; then
    echo "   ℹ️  Config Store 'split-config' already exists"
    # Extract ID from existing store
    CONFIG_STORE_ID=$(fastly config-store list --json | jq -r '.[] | select(.name=="split-config") | .id' | head -n 1)
  else
    CONFIG_STORE_ID=$(echo "$CONFIG_STORE_OUTPUT" | grep -oE '[a-zA-Z0-9]{22}' | head -n 1)
    echo "   ✅ Created Config Store"
  fi

  echo "   Config Store ID: $CONFIG_STORE_ID"
  echo ""
else
  echo "⚙️  Step 2: Using existing Config Store..."
  CONFIG_STORE_ID="$EXISTING_CONFIG_STORE_ID"
  echo "   Config Store ID: $CONFIG_STORE_ID"
  echo ""
fi

################################################################################
# Step 3: Create or use existing Secret Store
################################################################################

if [ -z "$EXISTING_SECRET_STORE_ID" ]; then
  echo "🔐 Step 3: Creating Secret Store..."
  SECRET_STORE_OUTPUT=$(fastly secret-store create --name=split-secrets 2>&1)

  if echo "$SECRET_STORE_OUTPUT" | grep -q "already exists"; then
    echo "   ℹ️  Secret Store 'split-secrets' already exists"
    # Extract ID from existing store
    SECRET_STORE_ID=$(fastly secret-store list --json | jq -r '.[] | select(.name=="split-secrets") | .id' | head -n 1)
  else
    SECRET_STORE_ID=$(echo "$SECRET_STORE_OUTPUT" | grep -oE '[a-zA-Z0-9]{22}' | head -n 1)
    echo "   ✅ Created Secret Store"
  fi

  echo "   Secret Store ID: $SECRET_STORE_ID"
  echo ""
else
  echo "🔐 Step 3: Using existing Secret Store..."
  SECRET_STORE_ID="$EXISTING_SECRET_STORE_ID"
  echo "   Secret Store ID: $SECRET_STORE_ID"
  echo ""
fi

################################################################################
# Step 4: Add SDK key to Secret Store
################################################################################

echo "🔒 Step 4: Adding SDK key to Secret Store..."

# Try to create, if it fails (already exists), recreate it
# Use --stdin to pass the secret value
if ! echo "$SPLIT_SDK_KEY" | fastly secret-store-entry create \
  --store-id="$SECRET_STORE_ID" \
  --name="SPLIT_SDK_KEY" \
  --stdin 2>/dev/null; then

  # Secret exists, need to recreate it (secrets can't be updated, only recreated)
  # Use --recreate flag to replace existing secret
  echo "$SPLIT_SDK_KEY" | fastly secret-store-entry create \
    --store-id="$SECRET_STORE_ID" \
    --name="SPLIT_SDK_KEY" \
    --stdin \
    --recreate >/dev/null

  echo "   ✅ Updated SPLIT_SDK_KEY in Secret Store"
else
  echo "   ✅ Created SPLIT_SDK_KEY in Secret Store"
fi

echo ""

################################################################################
# Step 5: Add non-sensitive configuration to Config Store
################################################################################

echo "🔧 Step 5: Adding configuration to Config Store..."

# Helper function to create or update config entry
update_config() {
  local key=$1
  local value=$2

  # Try to create, if it fails (already exists), update instead
  if ! fastly config-store-entry create \
    --store-id="$CONFIG_STORE_ID" \
    --key="$key" \
    --value="$value" 2>/dev/null; then

    fastly config-store-entry update \
      --store-id="$CONFIG_STORE_ID" \
      --key="$key" \
      --value="$value" >/dev/null
    echo "   ✅ Updated $key"
  else
    echo "   ✅ Created $key"
  fi
}

update_config "FEATURE_FLAG_NAME" "$FEATURE_FLAG_NAME"
update_config "KV_STORE_NAME" "split-storage"
update_config "DEFAULT_USER_KEY" "user-123"

echo ""

################################################################################
# Step 6: Deploy the service
################################################################################

echo "🚢 Step 6: Building and deploying service..."

if [ -z "$EXISTING_SERVICE_ID" ]; then
  # First deployment - will create new service
  echo "   Deploying service (this may take a minute)..."

  # Run deploy and capture output
  if ! DEPLOY_OUTPUT=$(npm run deploy 2>&1); then
    echo "$DEPLOY_OUTPUT"
    echo "❌ Deployment failed"
    exit 1
  fi

  # Extract service ID and version from output
  # Look for patterns like "service ID: abc123" or "(service abc123"
  SERVICE_ID=$(echo "$DEPLOY_OUTPUT" | grep -oE '\(service [a-zA-Z0-9]{22}' | grep -oE '[a-zA-Z0-9]{22}' | head -n 1)

  # If that didn't work, try alternative pattern
  if [ -z "$SERVICE_ID" ]; then
    SERVICE_ID=$(echo "$DEPLOY_OUTPUT" | grep -oE 'service-id[=: ]+[a-zA-Z0-9]{22}' | grep -oE '[a-zA-Z0-9]{22}' | head -n 1)
  fi

  VERSION=$(echo "$DEPLOY_OUTPUT" | grep -oE 'version [0-9]+' | tail -n 1 | awk '{print $2}')

  if [ -z "$SERVICE_ID" ]; then
    echo "   ❌ Could not extract Service ID from deployment output"
    echo "   Please check the output below and manually set EXISTING_SERVICE_ID"
    echo ""
    echo "$DEPLOY_OUTPUT"
    exit 1
  fi

  echo "   ✅ Deployed service"
  echo "   Service ID: $SERVICE_ID"
  echo "   Version: $VERSION"
  echo ""
else
  # Update existing service
  echo "   Updating service (this may take a minute)..."
  SERVICE_ID="$EXISTING_SERVICE_ID"

  if ! DEPLOY_OUTPUT=$(npm run deploy 2>&1); then
    echo "$DEPLOY_OUTPUT"
    echo "❌ Deployment failed"
    exit 1
  fi

  VERSION=$(echo "$DEPLOY_OUTPUT" | grep -oE 'version [0-9]+' | tail -n 1 | awk '{print $2}')

  echo "   ✅ Updated service"
  echo "   Service ID: $SERVICE_ID"
  echo "   Version: $VERSION"
  echo ""
fi

################################################################################
# Step 7: Link Secret Store to service
################################################################################

echo "🔗 Step 7: Linking Secret Store to service..."

if fastly resource-link create \
  --service-id="$SERVICE_ID" \
  --version="$VERSION" \
  --resource-id="$SECRET_STORE_ID" \
  --autoclone 2>&1 | grep -q "already exists"; then
  echo "   ℹ️  Secret Store already linked"
else
  echo "   ✅ Linked Secret Store"
fi

echo ""

################################################################################
# Step 8: Link Config Store to service
################################################################################

echo "🔗 Step 8: Linking Config Store to service..."

if fastly resource-link create \
  --service-id="$SERVICE_ID" \
  --version="$VERSION" \
  --resource-id="$CONFIG_STORE_ID" \
  --autoclone 2>&1 | grep -q "already exists"; then
  echo "   ℹ️  Config Store already linked"
else
  echo "   ✅ Linked Config Store"
fi

echo ""

################################################################################
# Step 9: Link KV Store to service
################################################################################

echo "🔗 Step 9: Linking KV Store to service..."

if fastly resource-link create \
  --service-id="$SERVICE_ID" \
  --version="$VERSION" \
  --resource-id="$KV_STORE_ID" \
  --autoclone 2>&1 | grep -q "already exists"; then
  echo "   ℹ️  KV Store already linked"
else
  echo "   ✅ Linked KV Store"
fi

echo ""

################################################################################
# Step 10: Activate the service
################################################################################

echo "✨ Step 10: Activating service version $VERSION..."

# Try to activate, handle "already active" error gracefully
ACTIVATE_OUTPUT=$(fastly service-version activate \
  --service-id="$SERVICE_ID" \
  --version="$VERSION" 2>&1) || true

if echo "$ACTIVATE_OUTPUT" | grep -q "is active"; then
  echo "   ℹ️  Version $VERSION is already active"
elif echo "$ACTIVATE_OUTPUT" | grep -q -i "error"; then
  echo "   ❌ Activation failed:"
  echo "$ACTIVATE_OUTPUT"
  exit 1
else
  echo "   ✅ Service activated"
fi

echo ""

################################################################################
# Success! Print summary
################################################################################

echo "🎉 Deployment Complete!"
echo "================================================"
echo ""

# Get the actual domain(s) for the service
echo "Fetching service domain..."
# Parse the plain text output to extract domain name
DOMAINS=$(fastly domain list --service-id="$SERVICE_ID" --version="$VERSION" 2>/dev/null | awk 'NR>1 {print $3; exit}')

if [ -z "$DOMAINS" ] || [ "$DOMAINS" = "NAME" ]; then
  # Fallback: try to get from service description
  SERVICE_NAME=$(fastly service describe --service-id="$SERVICE_ID" --json 2>/dev/null | grep -o '"name":"[^"]*"' | cut -d'"' -f4)

  if [ ! -z "$SERVICE_NAME" ]; then
    # Convert service name to likely domain format
    DOMAIN_SLUG=$(echo "$SERVICE_NAME" | tr '[:upper:]' '[:lower:]' | tr ' ' '-')
    echo "Your service is now live at:"
    echo "  https://${DOMAIN_SLUG}.edgecompute.app"
    echo "  (or check Fastly dashboard for exact domain)"
  else
    echo "Your service is deployed!"
    echo "  Service ID: $SERVICE_ID"
    echo "  Check the Fastly dashboard for the domain URL"
  fi
else
  echo "Your service is now live at:"
  echo "  https://${DOMAINS}"
fi

echo ""
echo "Configuration:"
echo "  Service ID:        $SERVICE_ID"
echo "  Version:           $VERSION"
echo "  KV Store ID:       $KV_STORE_ID"
echo "  Config Store ID:   $CONFIG_STORE_ID"
echo "  Secret Store ID:   $SECRET_STORE_ID"
echo ""
echo "Next Steps:"
if [ ! -z "$DOMAINS" ]; then
  SERVICE_URL="https://${DOMAINS}"
  echo "  1. Visit ${SERVICE_URL} to see your app"
  echo "  2. Sync Harness FME data to KV Store:"
  echo "     FASTLY_API_TOKEN=your_token SPLIT_SDK_KEY=your_key KV_STORE_ID=$KV_STORE_ID npm run sync"
  echo "  3. Set up automated syncing with cron or GitHub Actions (see README.md)"
else
  echo "  1. Check Fastly dashboard for your service domain"
  echo "  2. Visit your domain to see the app"
  echo "  3. Sync Harness FME data using: npm run sync (see README.md for details)"
fi

echo ""
echo "💾 Save these IDs for future deployments!"
echo "   You can add them to the top of this script as:"
echo "   EXISTING_SERVICE_ID=\"$SERVICE_ID\""
echo "   EXISTING_KV_STORE_ID=\"$KV_STORE_ID\""
echo "   EXISTING_CONFIG_STORE_ID=\"$CONFIG_STORE_ID\""
echo "   EXISTING_SECRET_STORE_ID=\"$SECRET_STORE_ID\""
echo ""
echo "🔐 Security Note:"
echo "   Your Harness FME SDK key is securely stored in Fastly Secret Store"
echo "   It is encrypted at rest and only accessible during request processing"
echo ""
