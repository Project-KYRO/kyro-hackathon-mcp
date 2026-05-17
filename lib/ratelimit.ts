import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import type { NextRequest } from 'next/server';
import { hashToken } from './pat';
import { jsonError } from './response';

// Two layered limits — minute burst + daily ceiling. Both keyed by token hash,
// not raw token, so logs/Redis never contain the raw value.
let minuteLimiter: Ratelimit | null = null;
let dailyLimiter: Ratelimit | null = null;
let redisError: Error | null = null;

function getRedis(): Redis | null {
  try {
    return Redis.fromEnv();
  } catch (e) {
    redisError = e as Error;
    return null;
  }
}

function getMinute(): Ratelimit | null {
  if (minuteLimiter) return minuteLimiter;
  const redis = getRedis();
  if (!redis) return null;
  minuteLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(60, '1 m'),
    analytics: false,
    prefix: 'kyro:rl:min',
  });
  return minuteLimiter;
}

function getDaily(): Ratelimit | null {
  if (dailyLimiter) return dailyLimiter;
  const redis = getRedis();
  if (!redis) return null;
  dailyLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.fixedWindow(5000, '1 d'),
    analytics: false,
    prefix: 'kyro:rl:day',
  });
  return dailyLimiter;
}

interface RateLimitResult {
  ok: boolean;
  reason?: 'minute' | 'day';
  retryAfterSec?: number;
  remainingMinute?: number;
  remainingDay?: number;
}

// Fail-open on Redis error — a transient Upstash outage shouldn't kill the event.
// We log loudly so the operator can see it in Vercel logs and decide to react.
export async function checkRateLimit(rawToken: string): Promise<RateLimitResult> {
  const minute = getMinute();
  const daily = getDaily();
  if (!minute || !daily) {
    if (redisError) {
      console.error('[ratelimit] Redis init failed, failing open:', redisError.message);
    }
    return { ok: true };
  }

  const key = hashToken(rawToken).slice(0, 32);

  try {
    const [minRes, dayRes] = await Promise.all([
      minute.limit(key),
      daily.limit(key),
    ]);

    if (!minRes.success) {
      const reset = Math.max(0, minRes.reset - Date.now());
      return {
        ok: false,
        reason: 'minute',
        retryAfterSec: Math.ceil(reset / 1000),
        remainingMinute: minRes.remaining,
        remainingDay: dayRes.remaining,
      };
    }
    if (!dayRes.success) {
      const reset = Math.max(0, dayRes.reset - Date.now());
      return {
        ok: false,
        reason: 'day',
        retryAfterSec: Math.ceil(reset / 1000),
        remainingMinute: minRes.remaining,
        remainingDay: dayRes.remaining,
      };
    }
    return {
      ok: true,
      remainingMinute: minRes.remaining,
      remainingDay: dayRes.remaining,
    };
  } catch (e: unknown) {
    console.error('[ratelimit] check failed, failing open:', e);
    return { ok: true };
  }
}

// Convenience for REST routes: extracts bearer, applies limit, returns 429 if exceeded.
// Returns null on success so the caller can continue, or a Response on fail.
export async function enforceRateLimitOrRespond(req: NextRequest): Promise<Response | null> {
  const header = req.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const raw = match[1].trim();
  if (!raw.startsWith('kyro_pat_')) return null;

  const result = await checkRateLimit(raw);
  if (result.ok) return null;

  const code = result.reason === 'minute' ? 'rate_limited_per_minute' : 'rate_limited_per_day';
  const res = jsonError(429, code, `Retry after ${result.retryAfterSec ?? 60}s`);
  res.headers.set('Retry-After', String(result.retryAfterSec ?? 60));
  return res;
}
