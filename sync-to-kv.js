#!/usr/bin/env node

/**
 * External Harness FME to Fastly KV Store Synchronization Script
 *
 * This script runs outside of Fastly Compute to sync Harness FME feature flag data
 * to Fastly KV Store. Run it periodically via cron, GitHub Actions, or manually.
 *
 * Usage:
 *   1. Copy .env.example to .env and fill in your credentials
 *   2. Run: npm run sync
 *
 * Or provide environment variables directly:
 *   FASTLY_API_TOKEN=xxx SPLIT_SDK_KEY=xxx KV_STORE_ID=xxx npm run sync
 */

import { Synchronizer } from '@splitsoftware/splitio-sync-tools';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Configuration from environment variables
const FASTLY_API_TOKEN = process.env.FASTLY_API_TOKEN;
const SPLIT_SDK_KEY = process.env.SPLIT_SDK_KEY;
const KV_STORE_ID = process.env.KV_STORE_ID;

if (!FASTLY_API_TOKEN || !SPLIT_SDK_KEY || !KV_STORE_ID) {
  console.error('❌ Missing required environment variables:');
  console.error('   FASTLY_API_TOKEN - Your Fastly API token');
  console.error('   SPLIT_SDK_KEY - Your Harness FME SDK key');
  console.error('   KV_STORE_ID - Your Fastly KV Store ID');
  process.exit(1);
}

/**
 * Fastly KV Store wrapper that implements Harness FME's complete storage interface
 */
function createFastlyKVWrapper(storeId, apiToken) {
  const baseUrl = `https://api.fastly.com/resources/stores/kv/${storeId}`;

  const headers = {
    'Fastly-Key': apiToken,
    'Content-Type': 'application/json'
  };

  async function getValue(key) {
    try {
      const response = await fetch(`${baseUrl}/keys/${encodeURIComponent(key)}`, {
        headers: { 'Fastly-Key': apiToken }
      });

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        throw new Error(`Fastly KV get failed: ${response.statusText}`);
      }

      const text = await response.text();
      return text ? JSON.parse(text) : null;
    } catch (error) {
      console.error(`Error getting key ${key}:`, error.message);
      return null;
    }
  }

  async function setValue(key, value) {
    try {
      const response = await fetch(`${baseUrl}/keys/${encodeURIComponent(key)}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(value)
      });

      if (!response.ok) {
        throw new Error(`Fastly KV set failed: ${response.statusText}`);
      }

      return true;
    } catch (error) {
      console.error(`Error setting key ${key}:`, error.message);
      return false;
    }
  }

  return {
    async get(key) {
      return getValue(key);
    },

    async set(key, value) {
      return setValue(key, value);
    },

    async getAndSet(key, value) {
      const oldValue = await getValue(key);
      await setValue(key, value);
      return oldValue;
    },

    async del(key) {
      try {
        const response = await fetch(`${baseUrl}/keys/${encodeURIComponent(key)}`, {
          method: 'DELETE',
          headers: { 'Fastly-Key': apiToken }
        });

        if (response.ok || response.status === 404) {
          return true;
        }

        throw new Error(`Fastly KV delete failed: ${response.statusText}`);
      } catch (error) {
        console.error(`Error deleting key ${key}:`, error.message);
        return false;
      }
    },

    async getKeysByPrefix(prefix) {
      try {
        const response = await fetch(`${baseUrl}/keys?prefix=${encodeURIComponent(prefix)}`, {
          headers: { 'Fastly-Key': apiToken }
        });

        if (!response.ok) {
          throw new Error(`Fastly KV list failed: ${response.statusText}`);
        }

        const data = await response.json();
        return data.data ? data.data.map(item => item.key) : [];
      } catch (error) {
        console.error(`Error listing keys with prefix ${prefix}:`, error.message);
        return [];
      }
    },

    async getMany(keys) {
      const results = await Promise.all(
        keys.map(key => getValue(key))
      );
      return results;
    },

    async incr(key, increment = 1) {
      const current = await getValue(key);
      const newValue = (current || 0) + increment;
      await setValue(key, newValue);
      return newValue;
    },

    async decr(key, decrement = 1) {
      const current = await getValue(key);
      const newValue = (current || 0) - decrement;
      await setValue(key, newValue);
      return newValue;
    },

    async itemContains(key, item) {
      const set = await getValue(key);
      return set && Array.isArray(set) ? set.includes(item) : false;
    },

    async addItems(key, items) {
      const set = await getValue(key) || [];
      const updatedSet = [...new Set([...set, ...items])];
      await setValue(key, updatedSet);
    },

    async removeItems(key, items) {
      const set = await getValue(key);
      if (set && Array.isArray(set)) {
        const updatedSet = set.filter(item => !items.includes(item));
        await setValue(key, updatedSet);
      }
    },

    async getItems(key) {
      const set = await getValue(key);
      return set && Array.isArray(set) ? set : [];
    },

    async connect() {
      // No-op for Fastly KV Store API
    },

    async disconnect() {
      // No-op for Fastly KV Store API
    },

    async pushItems(key, items) {
      // No-op - not needed for synchronization
    },

    async popItems(key, count) {
      return [];
    },

    async getItemsCount(key) {
      return 0;
    }
  };
}

/**
 * Main synchronization function
 */
async function syncHarnessFMEToFastly() {
  console.log('🔄 Starting Harness FME → Fastly KV Store synchronization...');
  console.log(`   KV Store ID: ${KV_STORE_ID}`);
  console.log(`   Harness FME SDK Key: ${SPLIT_SDK_KEY.substring(0, 10)}...`);
  console.log('');

  const kvWrapper = createFastlyKVWrapper(KV_STORE_ID, FASTLY_API_TOKEN);

  const synchronizer = new Synchronizer({
    core: {
      authorizationKey: SPLIT_SDK_KEY
    },
    storage: {
      type: 'PLUGGABLE',
      wrapper: kvWrapper
    },
    debug: 'ERROR'
  });

  return new Promise((resolve, reject) => {
    synchronizer.execute((error) => {
      if (error) {
        console.error('❌ Synchronization failed:', error.message);
        reject(error);
      } else {
        console.log('✅ Synchronization completed successfully!');
        console.log('   Feature flag data has been written to Fastly KV Store');
        console.log('   Your Fastly Compute service can now evaluate feature flags');
        resolve();
      }
    });
  });
}

// Run the sync
syncHarnessFMEToFastly()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
