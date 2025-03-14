/**
 * API Key Manager - Handles key rotation and rate limiting for the Companies House API
 * 
 * This utility manages a pool of API keys, tracks usage, and implements key rotation
 * to maximize throughput while respecting the rate limits imposed by the API.
 */

// Companies House API rate limits are 600 requests per 5 minutes per key
const RATE_LIMIT_PER_KEY = 600;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

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
    
    this.keys = [...apiKeys];
    
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
    
    // Use the key with the lowest usage percentage
    return sortedKeys[0];
  }
  
  /**
   * Register a request with the specified key
   */
  public registerRequest(key: string): void {
    if (!this.keys.includes(key)) {
      throw new Error(`Unknown API key: ${key.substring(0, 8)}...`);
    }
    
    // Reset window if needed
    if (Date.now() - this.usage[key].windowStart > RATE_LIMIT_WINDOW_MS) {
      this.usage[key] = {
        count: 0,
        windowStart: Date.now()
      };
    }
    
    // Increment the request count
    this.usage[key].count += 1;
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