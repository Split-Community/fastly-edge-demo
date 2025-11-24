/**
 * Configuration for Harness FME SDK
 *
 * This module provides configuration using:
 * - Fastly Secret Store (for sensitive SDK key)
 * - Fastly Config Store (for non-sensitive config)
 *
 * In production:
 * - SDK key is stored in Secret Store named 'SPLIT_SDK_KEY'
 * - Other config is stored in Config Store named 'split-config'
 *
 * For local development, fallback defaults are provided.
 */

import { SecretStore } from "fastly:secret-store";
import { ConfigStore } from "fastly:config-store";

// Default configuration for local development
const DEFAULTS = {
  SPLIT_SDK_KEY: '<YOUR-SERVER-SIDE-SDK-KEY>',
  FEATURE_FLAG_NAME: 'my-feature-flag',
  KV_STORE_NAME: 'split-storage',
  DEFAULT_USER_KEY: 'user-123'
};

/**
 * Load configuration from Secret Store and Config Store
 * Note: This is async because Secret Store requires async access
 */
export async function getConfig() {
  let secretStore;
  let configStore;
  let sdkKey = DEFAULTS.SPLIT_SDK_KEY;

  // Try to load SDK key from Secret Store (production)
  // Note: Use the resource link name, not the store name
  try {
    secretStore = new SecretStore('SPLIT_SDK_KEY');
    const sdkKeySecret = await secretStore.get('SPLIT_SDK_KEY');
    if (sdkKeySecret) {
      sdkKey = await sdkKeySecret.plaintext();
    }
  } catch (error) {
    // Secret Store not available (likely local development)
    console.log('Secret Store not available for SDK key, using default');
  }

  // Try to load other config from Config Store (production)
  try {
    configStore = new ConfigStore('split-config');
  } catch (error) {
    // Config Store not available (likely local development)
    console.log('Config Store not available, using defaults');
    configStore = null;
  }

  return {
    SPLIT_SDK_KEY: sdkKey,
    FEATURE_FLAG_NAME: configStore?.get('FEATURE_FLAG_NAME') || DEFAULTS.FEATURE_FLAG_NAME,
    KV_STORE_NAME: configStore?.get('KV_STORE_NAME') || DEFAULTS.KV_STORE_NAME,
    DEFAULT_USER_KEY: configStore?.get('DEFAULT_USER_KEY') || DEFAULTS.DEFAULT_USER_KEY
  };
}

// Export for backward compatibility
export const config = DEFAULTS;
