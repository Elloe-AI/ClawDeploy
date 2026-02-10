import { createRateLimiter } from "@clawdeploy/rate-limiter";
import { requireEnv } from "@/lib/config";

const globalForLimiter = global as unknown as {
  apiLimiter?: ReturnType<typeof createRateLimiter>;
  messageLimiter?: ReturnType<typeof createRateLimiter>;
};

export function getApiLimiter() {
  if (!globalForLimiter.apiLimiter) {
    const limit = Number(process.env.RATE_LIMIT_API_PER_MINUTE ?? "120");
    globalForLimiter.apiLimiter = createRateLimiter({
      redisUrl: requireEnv("REDIS_URL"),
      prefix: "api",
      limit,
      windowSeconds: 60
    });
  }
  return globalForLimiter.apiLimiter;
}

export function getMessageLimiter() {
  if (!globalForLimiter.messageLimiter) {
    const limit = Number(process.env.RATE_LIMIT_MESSAGES_PER_MINUTE ?? "60");
    globalForLimiter.messageLimiter = createRateLimiter({
      redisUrl: requireEnv("REDIS_URL"),
      prefix: "msg",
      limit,
      windowSeconds: 60
    });
  }
  return globalForLimiter.messageLimiter;
}
