import { NextRequest } from 'next/server';
import { supabaseAdmin } from './supabase';
import { hashToken } from './pat';
import { checkRateLimit } from './ratelimit';

export type AuthResult =
  | { ok: true; userId: string }
  | { ok: false; status: number; error: string; retryAfterSec?: number };

export async function authenticate(req: NextRequest): Promise<AuthResult> {
  const header = req.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return { ok: false, status: 401, error: 'missing_bearer_token' };
  }
  const raw = match[1].trim();
  if (!raw.startsWith('kyro_pat_')) {
    return { ok: false, status: 401, error: 'invalid_token_format' };
  }

  const tokenHash = hashToken(raw);

  const { data, error } = await supabaseAdmin.rpc('mcp_verify_pat', {
    p_token_hash: tokenHash,
  });

  if (error) {
    return { ok: false, status: 500, error: 'verify_failed' };
  }
  if (!data) {
    return { ok: false, status: 401, error: 'token_invalid_or_expired' };
  }

  // Token verified — now enforce per-token rate limit. We do this AFTER verify
  // so unauthenticated requests don't hit Redis (cheap path stays cheap).
  const rl = await checkRateLimit(raw);
  if (!rl.ok) {
    return {
      ok: false,
      status: 429,
      error: rl.reason === 'minute' ? 'rate_limited_per_minute' : 'rate_limited_per_day',
      retryAfterSec: rl.retryAfterSec,
    };
  }

  return { ok: true, userId: data as string };
}
