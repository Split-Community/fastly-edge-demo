# Fastly Compute + Harness FME Feature Flags

A demonstration of using [Harness FME](https://www.harness.io/products/feature-management-experimentation/) feature flags with [Fastly Compute](https://www.fastly.com/products/edge-compute) and Fastly KV Store for ultra-low-latency feature flag evaluations at the edge.

This project is a re-write of the [Cloudflare Workers example](https://github.com/splitio/cloudflare-workers-template) to Fastly Compute.

## Architecture

This implementation uses an **external synchronization** pattern for optimal edge performance:

1. **External Sync Script** (`sync-to-kv.js`) - Runs outside of Fastly Compute to sync Harness FME feature flag data to Fastly KV Store via Fastly API
2. **Fastly KV Store** - Stores feature flag data at the edge for fast lookups
3. **Fastly Compute Service** - Reads from KV Store in `consumer_partial` mode for low-latency feature flag evaluations
4. **No Outbound Calls from Edge** - All feature flag data is read locally from the Fastly POP

### Why External Synchronization?

Fastly Compute is request-driven and doesn't support scheduled tasks (unlike Cloudflare Workers' Cron Triggers). Additionally, outbound HTTP requests require explicit backend configuration. The external sync approach is simpler, more flexible, and aligns with edge computing best practices:

- Separates concerns (data sync vs. request handling)
- Enables flexible scheduling (cron, GitHub Actions, manual)
- Reduces complexity in the edge service
- Maintains ultra-low latency (no network calls during request handling)

## Features

- Interactive web UI for testing feature flags
- Secure SDK key storage using Fastly Secret Store
- External synchronization script for updating feature flag data
- Full Harness FME SDK support in `consumer_partial` mode


## Prerequisites

- [Fastly account](https://www.fastly.com/signup/)
- [Fastly CLI](https://developer.fastly.com/reference/cli/) installed and authenticated
- [Harness FME account](https://www.harness.io/products/feature-management-experimentation/)
- [Node.js](https://nodejs.org/) 18+ installed

## Quick Start

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd split-app
npm install
```

### 2. Configure Environment Variables

Copy the example environment file and fill in your credentials:

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
FASTLY_API_TOKEN=your_fastly_api_token_here
SPLIT_SDK_KEY=your_split_sdk_key_here
KV_STORE_ID=your_kv_store_id_here  # You'll get this after deployment
```

**Where to find these:**

- **FASTLY_API_TOKEN**: [Fastly API Tokens](https://manage.fastly.com/account/personal/tokens)
- **SPLIT_SDK_KEY**: Harness FME SDK API Keys ( FME Settings -> Projects -> SDK API Keys -> Server-side SDK key)
- **KV_STORE_ID**: You'll get this from the deploy script output

### 3. Deploy to Fastly

The deployment script will create all necessary stores and deploy your service:

```bash
chmod +x deploy.sh
./deploy.sh
```
(if this gets stuck at the service deployment step - you may need to deploy the service seperately and then add the service id to the script and re-run for it to complete the configuration)
The script will:
1. Create KV Store, Config Store, and Secret Store
2. Store your Harness FME SDK key securely in Secret Store
3. Deploy the Fastly Compute service
4. Link all stores to the service
5. Activate the service

**Save the IDs** from the output for future deployments and for the sync script.

### 4. Create Your Environment File

After deployment, update your `.env` file with the `KV_STORE_ID` from the deploy script output.

### 5. Sync Feature Flag Data

Run the sync script to populate the KV Store with your Harness FME feature flags:

```bash
npm run sync
```

You should see output like:

```
🔄 Starting Harness FME → Fastly KV Store synchronization...
   KV Store ID: b9zvoaz9ojblxjyafa0bfl
   Split SDK Key: 386kotal30...

✅ Synchronization completed successfully!
   Feature flag data has been written to Fastly KV Store
   Your Fastly Compute service can now evaluate feature flags
```

### 6. Test Your Service

Visit your deployed service URL (from deploy script output) to see the interactive demo.

Test a feature flag evaluation:
- Visit `/get-treatment?key=user-123&feature-flag=my-feature-flag`
- Or use the interactive form on the homepage



## Development

### Local Development

To run locally with Fastly's local development server:

```bash
npm run build
npm start
```

The service will be available at `http://localhost:7676`

**Note:** For local development, you need to create local store data files or the SDK key will fall back to the default in `src/config.js`.

### Project Structure

```
split-app/
├── src/
│   ├── index.js              # Main Fastly Compute service
│   ├── config.js             # Configuration loader (Secret Store + Config Store)
│   └── SplitStorageWrapper.js # KV Store adapter for Harness FME SDK
├── sync-to-kv.js             # External sync script
├── deploy.sh                 # Deployment automation script
├── package.json              # Dependencies and scripts
├── fastly.toml               # Fastly service configuration
├── .env.example              # Environment variables template
└── README.md                 # This file
```

## Automated Synchronization

Feature flag data should be synchronized periodically. Here are some options:

### Option 1: Cron Job

Add to your crontab to sync every 5 minutes:

```bash
*/5 * * * * cd /path/to/split-app && npm run sync >> /var/log/split-sync.log 2>&1
```

### Option 2: Manual Sync

Run manually whenever you update feature flags:

```bash
npm run sync
```

## Configuration

### Fastly Secret Store

Sensitive data is stored in Fastly Secret Store:

- `SPLIT_SDK_KEY` - Your Harness FME Server-side SDK key (encrypted at rest)

### Fastly Config Store

Non-sensitive configuration is stored in Fastly Config Store:

- `FEATURE_FLAG_NAME` - Default feature flag name for testing
- `KV_STORE_NAME` - Name of the KV Store (defaults to "split-storage")
- `DEFAULT_USER_KEY` - Default user key for testing

You can update these values in the Fastly dashboard or using the CLI:

```bash
fastly config-store-entry update \
  --store-id=<CONFIG_STORE_ID> \
  --key=FEATURE_FLAG_NAME \
  --value=my-new-flag
```

## API Endpoints

### `GET /`

Interactive homepage with feature flag tester and documentation.

### `GET /get-treatment`

Evaluate a feature flag for a user.

**Query Parameters:**
- `key` - User key (optional, defaults to configured DEFAULT_USER_KEY)
- `feature-flag` - Feature flag name (optional, defaults to configured FEATURE_FLAG_NAME)

**Example:**
```bash
curl "https://your-service.edgecompute.app/get-treatment?key=user-123&feature-flag=my-feature-flag"
```


## Troubleshooting

### SDK Key showing as "Not configured"

- Verify the Secret Store is linked to your service: `fastly resource-link list --service-id=<SERVICE_ID>`
- Ensure the secret is created: `fastly secret-store-entry list --store-id=<SECRET_STORE_ID>`
- The resource link name must match the store name used in code (`SPLIT_SDK_KEY`)

### KV Store not found error

- Verify the KV Store is linked: `fastly resource-link list --service-id=<SERVICE_ID>`
- Check the correct service version is active: `fastly service-version list --service-id=<SERVICE_ID>`
- Ensure `KV_STORE_NAME` in Config Store matches the actual store name

### No feature flag data in KV Store

- Run `npm run sync` to populate the KV Store
- Check sync script output for errors
- Verify your Harness FME SDK key is valid


### Sync script failing

- Verify all environment variables are set correctly in `.env`
- Check that `KV_STORE_ID` matches the actual store ID
- Ensure your Fastly API token has write permissions
- Verify your Harness FME SDK key is valid and has the correct permissions

## Performance

This architecture provides:

- **Sub-millisecond feature flag evaluations** - All data read from local KV Store at the edge
- **No network latency** - No outbound HTTP calls during request handling
- **Global distribution** - Feature flag data replicated across Fastly's global network
- **High availability** - No dependency on Harness FME API during request handling

## Security

- SDK keys stored encrypted in Fastly Secret Store
- Secrets never exposed in code or logs
- API tokens stored in `.env` (gitignored)
- All sensitive data excluded from version control

## License

This project is based on the [Cloudflare Workers template](https://github.com/splitio/cloudflare-workers-template) by Harness FME.

## Resources

- [Fastly Compute Documentation](https://developer.fastly.com/learning/compute/)
- [Fastly KV Store Documentation](https://developer.fastly.com/reference/api/services/resources/kv-store/)
- [Harness FME Documentation](https://developer.harness.io/docs/feature-management-experimentation)
- [Harness FME JavaScript SDK](https://developer.harness.io/docs/feature-management-experimentation/sdks-and-infrastructure/client-side-sdks/browser-sdk/)
- [Original Cloudflare Workers Template](https://github.com/splitio/cloudflare-workers-template)
