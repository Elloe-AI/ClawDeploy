type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  reset: number;
};

type Limiter = {
  check: (key: string) => Promise<RateLimitResult>;
};

const globalForLimiter = global as unknown as {
  apiLimiter?: Limiter;
  messageLimiter?: Limiter;
};

function createInMemoryLimiter(limit: number, windowSeconds: number): Limiter {
  const store = new Map<string, { count: number; resetAt: number }>();

  async function check(key: string): Promise<RateLimitResult> {
    const now = Date.now();
    const existing = store.get(key);
    if (!existing || existing.resetAt <= now) {
      const resetAt = now + windowSeconds * 1000;
      store.set(key, { count: 1, resetAt });
      return {
        allowed: true,
        remaining: Math.max(limit - 1, 0),
        reset: resetAt
      };
    }

    const nextCount = existing.count + 1;
    existing.count = nextCount;
    store.set(key, existing);
    return {
      allowed: nextCount <= limit,
      remaining: Math.max(limit - nextCount, 0),
      reset: existing.resetAt
    };
  }

  return { check };
}

export function getApiLimiter() {
  if (!globalForLimiter.apiLimiter) {
    const limit = 120;
    globalForLimiter.apiLimiter = createInMemoryLimiter(limit, 60);
  }
  return globalForLimiter.apiLimiter;
}

export function getMessageLimiter() {
  if (!globalForLimiter.messageLimiter) {
    const limit = 60;
    globalForLimiter.messageLimiter = createInMemoryLimiter(limit, 60);
  }
  return globalForLimiter.messageLimiter;
}
