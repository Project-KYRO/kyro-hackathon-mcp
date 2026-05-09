import { Redis } from '@upstash/redis';

let _redis: Redis | null = null;

function getRedis(): Redis {
  if (_redis) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error('Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN.');
  }
  _redis = new Redis({ url, token });
  return _redis;
}

export const redis = new Proxy({} as Redis, {
  get(_t, prop) {
    return (getRedis() as any)[prop];
  },
});

export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<{ ok: boolean; remaining: number; resetSec: number }> {
  const k = `rl:${key}`;
  const r = getRedis();
  const count = await r.incr(k);
  if (count === 1) await r.expire(k, windowSeconds);
  const ttl = await r.ttl(k);
  return {
    ok: count <= limit,
    remaining: Math.max(0, limit - count),
    resetSec: ttl > 0 ? ttl : windowSeconds,
  };
}
