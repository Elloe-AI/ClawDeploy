import Redis from "ioredis";

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  reset: number;
};

export type RateLimiterOptions = {
  redisUrl: string;
  prefix?: string;
  limit: number;
  windowSeconds: number;
};

export function createRateLimiter(options: RateLimiterOptions) {
  const client = new Redis(options.redisUrl);
  const prefix = options.prefix ?? "rate";

  async function check(key: string): Promise<RateLimitResult> {
    const redisKey = `${prefix}:${key}`;
    const pipeline = client.pipeline();
    pipeline.incr(redisKey);
    pipeline.ttl(redisKey);
    const [incrResult, ttlResult] = await pipeline.exec();
    const count = Number(incrResult[1]);
    let ttl = Number(ttlResult[1]);

    if (count === 1 || ttl < 0) {
      await client.expire(redisKey, options.windowSeconds);
      ttl = options.windowSeconds;
    }

    const remaining = Math.max(options.limit - count, 0);
    return {
      allowed: count <= options.limit,
      remaining,
      reset: Date.now() + ttl * 1000
    };
  }

  return { check, client };
}
