/**
 * Storage wrapper for Fastly KV Store to use with Split.io SDK
 * Adapts Fastly KV Store API to Split SDK storage interface
 */
export function SplitStorageWrapper(kvStore) {
  /**
   * Helper to get a value from KV Store
   */
  async function getValue(key) {
    try {
      const entry = await kvStore.get(key);
      if (!entry) return null;
      const text = await entry.text();
      return text ? JSON.parse(text) : null;
    } catch (error) {
      console.error(`Error getting key ${key}:`, error);
      return null;
    }
  }

  /**
   * Helper to set a value in KV Store
   */
  async function setValue(key, value) {
    try {
      await kvStore.put(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error(`Error setting key ${key}:`, error);
      return false;
    }
  }

  return {
    /** Get a value by key */
    async get(key) {
      return getValue(key);
    },

    /** Set a value by key */
    async set(key, value) {
      return setValue(key, value);
    },

    /** Get a value and then set a new value (atomic operation simulation) */
    async getAndSet(key, value) {
      const oldValue = await getValue(key);
      await setValue(key, value);
      return oldValue;
    },

    /** Delete a key */
    async del(key) {
      try {
        await kvStore.delete(key);
        return true;
      } catch (error) {
        console.error(`Error deleting key ${key}:`, error);
        return false;
      }
    },

    /** Get all keys with a given prefix */
    async getKeysByPrefix(prefix) {
      try {
        // Note: Fastly KV Store list() returns { list: string[], cursor: string | undefined }
        const result = await kvStore.list({ prefix });
        return result.list || [];
      } catch (error) {
        console.error(`Error getting keys by prefix ${prefix}:`, error);
        return [];
      }
    },

    /** Get multiple values by keys */
    async getMany(keys) {
      try {
        const results = await Promise.all(
          keys.map(key => getValue(key))
        );
        return results;
      } catch (error) {
        console.error('Error getting multiple keys:', error);
        return keys.map(() => null);
      }
    },

    /** Increment a numeric value */
    async incr(key, increment = 1) {
      try {
        const current = await getValue(key);
        const newValue = (current || 0) + increment;
        await setValue(key, newValue);
        return newValue;
      } catch (error) {
        console.error(`Error incrementing key ${key}:`, error);
        return increment;
      }
    },

    /** Decrement a numeric value */
    async decr(key, decrement = 1) {
      try {
        const current = await getValue(key);
        const newValue = (current || 0) - decrement;
        await setValue(key, newValue);
        return newValue;
      } catch (error) {
        console.error(`Error decrementing key ${key}:`, error);
        return -decrement;
      }
    },

    /** Check if a set contains an item */
    async itemContains(key, item) {
      try {
        const set = await getValue(key);
        return set && Array.isArray(set) ? set.includes(item) : false;
      } catch (error) {
        console.error(`Error checking item in set ${key}:`, error);
        return false;
      }
    },

    /** Add items to a set */
    async addItems(key, items) {
      try {
        const set = await getValue(key) || [];
        const updatedSet = [...new Set([...set, ...items])];
        await setValue(key, updatedSet);
      } catch (error) {
        console.error(`Error adding items to set ${key}:`, error);
      }
    },

    /** Remove items from a set */
    async removeItems(key, items) {
      try {
        const set = await getValue(key);
        if (set && Array.isArray(set)) {
          const updatedSet = set.filter(item => !items.includes(item));
          await setValue(key, updatedSet);
        }
      } catch (error) {
        console.error(`Error removing items from set ${key}:`, error);
      }
    },

    /** Get all items from a set */
    async getItems(key) {
      try {
        const set = await getValue(key);
        return set && Array.isArray(set) ? set : [];
      } catch (error) {
        console.error(`Error getting items from set ${key}:`, error);
        return [];
      }
    },

    /** Connect to storage (no-op for KV Store) */
    async connect() {
      if (!kvStore) throw new Error("KV Store not provided");
    },

    /** Disconnect from storage (no-op for KV Store) */
    async disconnect() {},

    /** Push items to a queue (no-op - not needed in consumer mode) */
    async pushItems(key, items) {},

    /** Pop items from a queue (no-op - not needed in consumer mode) */
    async popItems(key, count) {
      return [];
    },

    /** Get queue item count (no-op - not needed in consumer mode) */
    async getItemsCount(key) {
      return 0;
    }
  };
}
