/**
 * API Key Manager - Handles key rotation and rate limiting for the Companies House API
 * 
 * This utility manages a pool of API keys, tracks usage, and implements key rotation
 * to maximize throughput while respecting the rate limits imposed by the API.
 */

// Companies House API rate limits are 600 requests per 5 minutes per key
const RATE_LIMIT_PER_KEY = 600;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

// Enable debug logging - set this to false in production
const DEBUG_LOGGING = true;

export interface KeyStats {
  key: string;
  requestCount: number;
  windowStartTime: number;
  usagePercent: number;
  maskedKey: string;
}

/**
 * API Key Manager class that handles key rotation and rate limiting
 */
export class ApiKeyManager {
  private keys: string[] = [];
  private usage: Record<string, { count: number; windowStart: number }> = {};
  private currentKeyIndex = 0;
  
  constructor(apiKeys: string[]) {
    if (!apiKeys || apiKeys.length === 0) {
      throw new Error('At least one API key must be provided');
    }
    
    // Filter out any invalid keys (empty strings, malformed keys, etc.)
    this.keys = apiKeys.filter(key => {
      // Basic validation - ensure key is non-empty and properly formatted
      const isValid = key && typeof key === 'string' && key.trim().length > 0;
      
      if (!isValid && DEBUG_LOGGING) {
        console.warn(`[KEY MANAGER] Ignoring invalid API key: "${key}"`);
      }
      
      return isValid;
    });
    
    if (this.keys.length === 0) {
      throw new Error('No valid API keys provided');
    }
    
    if (DEBUG_LOGGING) {
      console.log(`[KEY MANAGER] Initialized with ${this.keys.length} API keys`);
      this.keys.forEach((key, index) => {
        console.log(`[KEY MANAGER] Key ${index + 1}: ${key.substring(0, 8)}...${key.substring(key.length - 4)}`);
      });
    }
    
    // Initialize usage tracking for each key
    this.keys.forEach(key => {
      this.usage[key] = {
        count: 0,
        windowStart: Date.now()
      };
    });
  }
  
  /**
   * Get the next available API key, prioritizing keys with the most available capacity
   */
  public getNextKey(): string {
    // Reset windows that have expired
    this.resetExpiredWindows();
    
    // Sort keys by usage percentage (lowest first)
    const sortedKeys = this.keys.sort((a, b) => {
      const usageA = this.getKeyUsagePercent(a);
      const usageB = this.getKeyUsagePercent(b);
      return usageA - usageB;
    });
    
    const selectedKey = sortedKeys[0];
    const usagePercent = this.getKeyUsagePercent(selectedKey);
    
    if (DEBUG_LOGGING) {
      console.log(`[KEY MANAGER] Selected key: ${selectedKey.substring(0, 8)}... (${usagePercent.toFixed(1)}% used)`);
    }
    
    // Use the key with the lowest usage percentage
    return selectedKey;
  }
  
  /**
   * Register a request with the specified key
   */
  public registerRequest(key: string): void {
    if (!this.keys.includes(key)) {
      const error = `Unknown API key: ${key.substring(0, 8)}...`;
      console.error(`[KEY MANAGER] ${error}`);
      throw new Error(error);
    }
    
    // Reset window if needed
    if (Date.now() - this.usage[key].windowStart > RATE_LIMIT_WINDOW_MS) {
      if (DEBUG_LOGGING) {
        console.log(`[KEY MANAGER] Resetting window for key: ${key.substring(0, 8)}...`);
      }
      
      this.usage[key] = {
        count: 0,
        windowStart: Date.now()
      };
    }
    
    // Increment the request count
    this.usage[key].count += 1;
    
    if (DEBUG_LOGGING && this.usage[key].count % 10 === 0) {
      console.log(`[KEY MANAGER] Key ${key.substring(0, 8)}... has made ${this.usage[key].count} requests (${this.getKeyUsagePercent(key).toFixed(1)}%)`);
    }
  }
  
  /**
   * Get stats for all keys
   */
  public getStats(): KeyStats[] {
    this.resetExpiredWindows();
    
    return this.keys.map(key => {
      const usagePercent = this.getKeyUsagePercent(key);
      return {
        key,
        requestCount: this.usage[key].count,
        windowStartTime: this.usage[key].windowStart,
        usagePercent,
        maskedKey: `${key.substring(0, 8)}...`
      };
    });
  }
  
  /**
   * Check if all keys are currently exhausted (>90% capacity)
   */
  public areAllKeysExhausted(): boolean {
    this.resetExpiredWindows();
    return this.keys.every(key => this.getKeyUsagePercent(key) > 90);
  }
  
  /**
   * Calculate how long to wait before keys become available again
   */
  public getWaitTimeMs(): number {
    this.resetExpiredWindows();
    
    // Find the key with the earliest window that will expire
    const earliestReset = Math.min(
      ...this.keys.map(key => {
        return this.usage[key].windowStart + RATE_LIMIT_WINDOW_MS;
      })
    );
    
    const waitTime = earliestReset - Date.now();
    return waitTime > 0 ? waitTime : 0;
  }
  
  /**
   * Reset windows that have expired
   */
  private resetExpiredWindows(): void {
    const now = Date.now();
    
    this.keys.forEach(key => {
      if (now - this.usage[key].windowStart > RATE_LIMIT_WINDOW_MS) {
        this.usage[key] = {
          count: 0,
          windowStart: now
        };
      }
    });
  }
  
  /**
   * Get the usage percentage for a key
   */
  private getKeyUsagePercent(key: string): number {
    const usage = this.usage[key];
    return (usage.count / RATE_LIMIT_PER_KEY) * 100;
  }
  
  /**
   * Manually reset all key usage counters
   * This is useful after a cool-down period to start with a clean slate
   */
  public resetCounters(): void {
    const now = Date.now();
    if (DEBUG_LOGGING) {
      console.log(`[KEY MANAGER] Manually resetting all key usage counters at ${new Date(now).toISOString()}`);
    }
    
    this.keys.forEach(key => {
      this.usage[key] = {
        count: 0,
        windowStart: now
      };
    });
  }
}

// Singleton instance
let keyManagerInstance: ApiKeyManager | null = null;

/**
 * Get the API key manager instance (or create it if it doesn't exist)
 */
export function getKeyManager(apiKeys?: string[]): ApiKeyManager {
  if (!keyManagerInstance && apiKeys) {
    keyManagerInstance = new ApiKeyManager(apiKeys);
  } else if (!keyManagerInstance) {
    throw new Error('API keys must be provided the first time getKeyManager is called');
  }
  
  return keyManagerInstance;
} 