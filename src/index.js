/// <reference types="@fastly/js-compute" />

import { KVStore } from "fastly:kv-store";
import { env } from "fastly:env";
import { SplitFactory, PluggableStorage, ErrorLogger } from "@splitsoftware/splitio-browserjs";
import { SplitStorageWrapper } from "./SplitStorageWrapper.js";
import { getConfig } from "./config.js";

// The entry point for your application.
addEventListener("fetch", (event) => event.respondWith(handleRequest(event)));

async function handleRequest(event) {
  // Log service version
  console.log("FASTLY_SERVICE_VERSION:", env('FASTLY_SERVICE_VERSION') || 'local');

  // Load configuration (async because Secret Store is async)
  const config = await getConfig();

  // Get the client request
  const req = event.request;
  const url = new URL(req.url);

  // Initialize KV Store
  let kvStore;
  try {
    kvStore = new KVStore(config.KV_STORE_NAME);
  } catch (error) {
    return new Response(
      `Error: KV Store "${config.KV_STORE_NAME}" not found. Please create it in the Fastly dashboard.\n\nError: ${error.message}`,
      { status: 500, headers: { "Content-Type": "text/plain" } }
    );
  }

  // Route handling
  switch (url.pathname) {
    case "/":
      return handleHomePage(url, config);

    case "/get-treatment":
      return handleGetTreatment(url, kvStore, config);

    case "/status":
      return handleStatus(kvStore, config);

    default:
      return new Response("Not found", {
        status: 404,
        headers: { "Content-Type": "text/plain" }
      });
  }
}

/**
 * Home page with instructions
 */
async function handleHomePage(url, config) {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Fastly Compute + Harness FME Demo</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      max-width: 800px;
      margin: 40px auto;
      padding: 0 20px;
      line-height: 1.6;
    }
    h1 { color: #333; }
    h2 { color: #666; margin-top: 30px; }
    code {
      background: #f4f4f4;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'Courier New', monospace;
    }
    pre {
      background: #f4f4f4;
      padding: 15px;
      border-radius: 5px;
      overflow-x: auto;
    }
    .endpoint {
      background: #e8f4f8;
      padding: 10px;
      margin: 10px 0;
      border-left: 4px solid #0066cc;
    }
    .config {
      background: #fff4e6;
      padding: 10px;
      margin: 10px 0;
      border-left: 4px solid #ff9900;
    }
    a {
      color: #0066cc;
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <h1>Fastly Compute + Harness FME Demo</h1>

  <p>This application demonstrates using <strong>Harness FME feature flags</strong> with <strong>Fastly Compute</strong> and <strong>Fastly KV Store</strong>.</p>

  <div class="config">
    <h3>Current Configuration:</h3>
    <ul>
      <li><strong>SDK Key:</strong> ${config.SPLIT_SDK_KEY.startsWith('<YOUR') ? '⚠️ Not configured' : '✓ Configured'}</li>
      <li><strong>Feature Flag:</strong> <code>${config.FEATURE_FLAG_NAME}</code></li>
      <li><strong>KV Store:</strong> <code>${config.KV_STORE_NAME}</code></li>
    </ul>
  </div>

  <h2>Try It Now</h2>

  <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
    <h3 style="margin-top: 0;">Feature Flag Tester</h3>
    <form action="/get-treatment" method="GET" style="display: flex; flex-direction: column; gap: 15px;">
      <div>
        <label for="key" style="display: block; margin-bottom: 5px; font-weight: bold;">User Key:</label>
        <input
          type="text"
          id="key"
          name="key"
          value="${config.DEFAULT_USER_KEY}"
          placeholder="Enter user key (e.g., user-123)"
          style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-family: monospace;"
        />
      </div>
      <div>
        <label for="feature-flag" style="display: block; margin-bottom: 5px; font-weight: bold;">Feature Flag Name:</label>
        <input
          type="text"
          id="feature-flag"
          name="feature-flag"
          value="${config.FEATURE_FLAG_NAME}"
          placeholder="Enter feature flag name"
          style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-family: monospace;"
        />
      </div>
      <button
        type="submit"
        style="background: #0066cc; color: white; padding: 12px 24px; border: none; border-radius: 4px; font-size: 16px; cursor: pointer; font-weight: bold;"
      >
        Get Treatment
      </button>
    </form>
  </div>

  <h2>Available Endpoints</h2>

  <div class="endpoint">
    <strong>GET /get-treatment</strong>
    <p>Evaluate a feature flag for a user</p>
    <p>Query Parameters:</p>
    <ul>
      <li><code>key</code> - User key (optional, defaults to "${config.DEFAULT_USER_KEY}")</li>
      <li><code>feature-flag</code> - Feature flag name (optional, defaults to "${config.FEATURE_FLAG_NAME}")</li>
    </ul>
    <p>Example: <a href="/get-treatment?key=user-123&feature-flag=${config.FEATURE_FLAG_NAME}">/get-treatment?key=user-123&feature-flag=${config.FEATURE_FLAG_NAME}</a></p>
  </div>

  <div class="endpoint">
    <strong>GET /status</strong>
    <p>Check the status of the KV Store and see stored data</p>
    <p>Example: <a href="/status">/status</a></p>
  </div>

  <h2>Setup Instructions</h2>
  <ol>
    <li>Copy <code>.env.example</code> to <code>.env</code> and configure your credentials</li>
    <li>Run <code>./deploy.sh</code> to create stores and deploy the service</li>
    <li>Run <code>npm run sync</code> to synchronize feature flag data from Harness FME to KV Store</li>
    <li>Visit <code>/get-treatment</code> to test feature flag evaluation</li>
    <li>Set up a cron job to run <code>npm run sync</code> periodically</li>
  </ol>

  <h2>How It Works</h2>
  <p>This implementation uses external synchronization for optimal performance:</p>
  <ul>
    <li><strong>Fastly KV Store</strong> stores Harness FME feature flag data at the edge</li>
    <li><strong>External sync script</strong> (<code>sync-to-kv.js</code>) updates KV Store via Fastly API</li>
    <li><strong>Harness FME SDK in consumer_partial mode</strong> reads from KV Store for low-latency evaluations</li>
    <li><strong>No outbound calls from edge</strong> - all reads are local to the Fastly POP</li>
  </ul>

  <p><a href="https://github.com/splitio/cloudflare-workers-template">Original Cloudflare Workers Template</a></p>
</body>
</html>
  `;

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
}

/**
 * Handle feature flag evaluation
 */
async function handleGetTreatment(url, kvStore, config) {
  const key = url.searchParams.get("key") || config.DEFAULT_USER_KEY;
  const featureFlagName = url.searchParams.get("feature-flag") || config.FEATURE_FLAG_NAME;

  if (!key) {
    return new Response("Error: No user key provided", {
      status: 400,
      headers: { "Content-Type": "text/plain" }
    });
  }

  if (config.SPLIT_SDK_KEY.startsWith('<YOUR')) {
    return new Response(
      "Error: Harness FME SDK key not configured.\n\nFor local development: Edit src/config.js DEFAULTS\nFor production: Configure the 'split-config' Config Store",
      { status: 500, headers: { "Content-Type": "text/plain" } }
    );
  }

  try {
    // Create Split factory with KV Store storage
    const factory = SplitFactory({
      core: {
        authorizationKey: config.SPLIT_SDK_KEY,
        key
      },
      mode: "consumer_partial",
      storage: PluggableStorage({
        wrapper: SplitStorageWrapper(kvStore)
      }),
      debug: ErrorLogger()
    });

    const client = factory.client();

    // Wait for SDK to be ready
    await new Promise((resolve) => {
      client.on(client.Event.SDK_READY, resolve);
      client.on(client.Event.SDK_READY_TIMED_OUT, resolve);
    });

    // Get treatment
    const treatment = await client.getTreatment(featureFlagName);

    // Clean up
    client.destroy();

    // Return result as HTML for better display
    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Feature Flag Result</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      max-width: 600px;
      margin: 40px auto;
      padding: 0 20px;
    }
    .result {
      background: #f4f4f4;
      padding: 20px;
      border-radius: 8px;
      margin: 20px 0;
    }
    .success {
      background: #d4edda;
      border-left: 4px solid #28a745;
    }
    .treatment {
      font-size: 24px;
      font-weight: bold;
      color: #333;
      margin: 10px 0;
    }
    a {
      color: #0066cc;
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <h1>Feature Flag Evaluation</h1>

  <div class="result success">
    <p><strong>User Key:</strong> <code>${key}</code></p>
    <p><strong>Feature Flag:</strong> <code>${featureFlagName}</code></p>
    <p><strong>Treatment:</strong></p>
    <div class="treatment">${treatment}</div>
  </div>

  <p><a href="/">← Back to Home</a></p>
</body>
</html>
    `;

    return new Response(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" }
    });
  } catch (error) {
    console.error("Error getting treatment:", error);
    return new Response(
      `Error evaluating feature flag: ${error.message}\n\nMake sure you have synchronized data first by visiting /sync`,
      { status: 500, headers: { "Content-Type": "text/plain" } }
    );
  }
}

/**
 * Handle status check
 */
async function handleStatus(kvStore, config) {
  try {
    // Try to list some keys from the store
    const keys = [];
    const cursor = await kvStore.list({ limit: 10 });

    for await (const entry of cursor) {
      keys.push(entry.key);
    }

    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Status</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      max-width: 800px;
      margin: 40px auto;
      padding: 0 20px;
    }
    .status-ok {
      background: #d4edda;
      padding: 15px;
      border-radius: 5px;
      border-left: 4px solid #28a745;
    }
    .status-warning {
      background: #fff3cd;
      padding: 15px;
      border-radius: 5px;
      border-left: 4px solid #ffc107;
    }
    code {
      background: #f4f4f4;
      padding: 2px 6px;
      border-radius: 3px;
    }
    ul {
      max-height: 300px;
      overflow-y: auto;
    }
    a {
      color: #0066cc;
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <h1>Status Check</h1>

  <div class="${keys.length > 0 ? 'status-ok' : 'status-warning'}">
    <h3>KV Store: ${config.KV_STORE_NAME}</h3>
    <p><strong>Status:</strong> ${keys.length > 0 ? '✓ Connected and has data' : '⚠️ Connected but empty'}</p>
    <p><strong>Keys found:</strong> ${keys.length}</p>
  </div>

  ${keys.length > 0 ? `
    <h3>Sample Keys (first 10):</h3>
    <ul>
      ${keys.map(key => `<li><code>${key}</code></li>`).join('\n')}
    </ul>
  ` : `
    <p>No data found in KV Store. Run <a href="/sync">/sync</a> to synchronize feature flag data.</p>
  `}

  <h3>Configuration:</h3>
  <ul>
    <li><strong>SDK Key:</strong> ${config.SPLIT_SDK_KEY.startsWith('<YOUR') ? '⚠️ Not configured' : '✓ Configured'}</li>
    <li><strong>Feature Flag:</strong> <code>${config.FEATURE_FLAG_NAME}</code></li>
    <li><strong>Default User Key:</strong> <code>${config.DEFAULT_USER_KEY}</code></li>
  </ul>

  <p><a href="/">← Back to Home</a></p>
</body>
</html>
    `;

    return new Response(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" }
    });
  } catch (error) {
    return new Response(
      `Error checking status: ${error.message}`,
      { status: 500, headers: { "Content-Type": "text/plain" } }
    );
  }
}
