import { NextRequest } from 'next/server';
import { supabaseAdmin } from './supabase';
import { hashToken } from './pat';
import { rateLimit } from './redis';

export type AuthResult =
  | { ok: true; userId: string }
  | { ok: false; status: number; error: string };

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

  // Per-token rate limit: 60/min, 5000/day.
  const minute = await rateLimit(`tok:min:${tokenHash}`, 60, 60);
  if (!minute.ok) {
    return { ok: false, status: 429, error: 'rate_limited_per_minute' };
  }
  const day = await rateLimit(`tok:day:${tokenHash}`, 5000, 86400);
  if (!day.ok) {
    return { ok: false, status: 429, error: 'rate_limited_per_day' };
  }

  const { data, error } = await supabaseAdmin.rpc('mcp_verify_pat', {
    p_token_hash: tokenHash,
  });

  if (error) {
    return { ok: false, status: 500, error: 'verify_failed' };
  }
  if (!data) {
    return { ok: false, status: 401, error: 'token_invalid_or_expired' };
  }

  return { ok: true, userId: data as string };
}
