# rate-limiter

Redis-backed rate limiter helpers.

## What is enforced

- per-instance message throughput
- per-user API request rate

## Configuration

The limiter uses a fixed window in seconds. Limits are configured by the caller.

## Usage

```ts
import { createRateLimiter } from "@clawdeploy/rate-limiter";

const limiter = createRateLimiter({
  redisUrl: process.env.REDIS_URL!,
  limit: 60,
  windowSeconds: 60
});

const result = await limiter.check("instance:123");
```
