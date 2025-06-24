interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (identifier: string) => string;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
  blocked: boolean;
}

export class RateLimiter {
  private static instances: Map<string, RateLimiter> = new Map();
  private requests: Map<string, RateLimitEntry> = new Map();
  private config: RateLimitConfig;
  private cleanupInterval: NodeJS.Timeout;
  
  private constructor(name: string, config: RateLimitConfig) {
    this.config = {
      skipSuccessfulRequests: false,
      skipFailedRequests: false,
      keyGenerator: (id: string) => id,
      ...config
    };
    
    // Clean up expired entries every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60 * 1000);
  }
  
  static getInstance(name: string, config: RateLimitConfig): RateLimiter {
    if (!RateLimiter.instances.has(name)) {
      RateLimiter.instances.set(name, new RateLimiter(name, config));
    }
    return RateLimiter.instances.get(name)!;
  }
  
  async checkLimit(identifier: string): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    const key = this.config.keyGenerator!(identifier);
    const now = Date.now();
    
    let entry = this.requests.get(key);
    
    // Create new entry or reset if window expired
    if (!entry || now >= entry.resetTime) {
      entry = {
        count: 0,
        resetTime: now + this.config.windowMs,
        blocked: false
      };
      this.requests.set(key, entry);
    }
    
    // Check if blocked
    if (entry.blocked) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: entry.resetTime
      };
    }
    
    // Increment count
    entry.count++;
    
    // Check if limit exceeded
    if (entry.count > this.config.maxRequests) {
      entry.blocked = true;
      console.warn(`Rate limit exceeded for ${key}`, {
        count: entry.count,
        limit: this.config.maxRequests,
        resetTime: new Date(entry.resetTime).toISOString()
      });
      
      return {
        allowed: false,
        remaining: 0,
        resetTime: entry.resetTime
      };
    }
    
    return {
      allowed: true,
      remaining: this.config.maxRequests - entry.count,
      resetTime: entry.resetTime
    };
  }
  
  async recordRequest(identifier: string, success: boolean): Promise<void> {
    // Skip recording based on config
    if ((success && this.config.skipSuccessfulRequests) ||
        (!success && this.config.skipFailedRequests)) {
      return;
    }
    
    // Request is already recorded in checkLimit
    // This method can be used for additional logging or metrics
  }
  
  async resetLimit(identifier: string): Promise<void> {
    const key = this.config.keyGenerator!(identifier);
    this.requests.delete(key);
  }
  
  async getStatus(identifier: string): Promise<RateLimitEntry | null> {
    const key = this.config.keyGenerator!(identifier);
    return this.requests.get(key) || null;
  }
  
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.requests.entries()) {
      if (now >= entry.resetTime) {
        this.requests.delete(key);
      }
    }
  }
  
  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.requests.clear();
  }
}

// Pre-configured rate limiters for different use cases
export const rateLimiters = {
  // General API requests
  api: RateLimiter.getInstance('api', {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100
  }),
  
  // File uploads
  upload: RateLimiter.getInstance('upload', {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 10
  }),
  
  // Authentication attempts
  auth: RateLimiter.getInstance('auth', {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5
  }),
  
  // Search requests
  search: RateLimiter.getInstance('search', {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 20
  }),
  
  // Blockchain transactions
  transaction: RateLimiter.getInstance('transaction', {
    windowMs: 5 * 60 * 1000, // 5 minutes
    maxRequests: 3
  })
};

// Utility function to create rate limit middleware
export const createRateLimitMiddleware = (limiter: RateLimiter, getIdentifier: () => string) => {
  return async (): Promise<{ allowed: boolean; remaining: number; resetTime: number }> => {
    const identifier = getIdentifier();
    return await limiter.checkLimit(identifier);
  };
};

// Helper to get user identifier for rate limiting
export const getUserIdentifier = (): string => {
  // Try to get wallet address from current session
  const session = sessionStorage.getItem('tuma_session');
  if (session) {
    try {
      // In a real implementation, you'd decode the JWT
      // For now, use a combination of factors
      return `user_${session.slice(-10)}`;
    } catch {
      // Fallback to IP-based limiting (would need server-side implementation)
    }
  }
  
  // Fallback to browser fingerprint
  const fingerprint = [
    navigator.userAgent,
    navigator.language,
    screen.width,
    screen.height,
    new Date().getTimezoneOffset()
  ].join('|');
  
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < fingerprint.length; i++) {
    const char = fingerprint.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  return `anon_${Math.abs(hash)}`;
};