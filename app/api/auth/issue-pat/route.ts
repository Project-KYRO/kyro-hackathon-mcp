import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { generateRawToken, hashToken } from '@/lib/pat';
import {
  jsonAuthOk,
  jsonAuthError,
  corsAuthPreflight,
} from '@/lib/response';
import { env } from '@/lib/env';
import { verifyTurnstile, clientIpFrom } from '@/lib/turnstile';
import { passcodeMatches } from '@/lib/passcode';
import { checkIssuanceRateLimit } from '@/lib/ratelimit';

export async function OPTIONS(req: NextRequest) {
  return corsAuthPreflight(req);
}

// POST /api/auth/issue-pat
//
// Headers
//   Authorization: Bearer <supabase access token from any sign-in method>
//   x-turnstile-token: <Cloudflare Turnstile challenge response>
//   x-event-passcode: <6-char event passcode from organizer>
//
// Verifies the JWT against KYRO's auth.users, checks the gate, then issues a
// PAT for the matching public.users row via mcp_issue_pat. Returns the raw
// token + endpoint URLs (one-time reveal — never reissued).
//
// Errors are intentionally generic ("registration_unavailable") rather than
// leaking which gate failed (turnstile vs passcode vs supabase) so a stranger
// can't probe the gates one at a time.
export async function POST(req: NextRequest) {
  if (!env.registrationOpen()) {
    return jsonAuthError(req, 403, 'registration_closed');
  }

  const ip = clientIpFrom(req);
  const rl = await checkIssuanceRateLimit(ip);
  if (!rl.ok) {
    const res = jsonAuthError(req, 429, 'too_many_requests');
    if (rl.retryAfterSec) res.headers.set('Retry-After', String(rl.retryAfterSec));
    return res;
  }

  const supabaseAuth = req.headers.get('authorization') || '';
  const supabaseMatch = supabaseAuth.match(/^Bearer\s+(.+)$/i);
  if (!supabaseMatch) {
    return jsonAuthError(req, 401, 'registration_unavailable');
  }
  const supabaseJwt = supabaseMatch[1].trim();

  const passcode = req.headers.get('x-event-passcode') || '';
  if (!passcodeMatches(passcode)) {
    return jsonAuthError(req, 401, 'registration_unavailable');
  }

  const turnstileToken = req.headers.get('x-turnstile-token');
  const turnstile = await verifyTurnstile(turnstileToken, ip);
  if (!turnstile.ok) {
    console.warn('[issue-pat] turnstile failed:', turnstile.reason);
    return jsonAuthError(req, 401, 'registration_unavailable');
  }

  const { data: userResp, error: userErr } = await supabaseAdmin.auth.getUser(
    supabaseJwt,
  );
  if (userErr || !userResp?.user) {
    return jsonAuthError(req, 401, 'registration_unavailable');
  }
  const authUserId = userResp.user.id;

  const { data: kyroUser, error: lookupErr } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('auth_id', authUserId)
    .maybeSingle();

  if (lookupErr) {
    console.error('[issue-pat] lookup failed:', lookupErr.message);
    return jsonAuthError(req, 500, 'internal_error');
  }
  if (!kyroUser) {
    return jsonAuthError(req, 403, 'no_kyro_profile');
  }

  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = env.expiresAt();

  if (new Date(expiresAt).getTime() <= Date.now()) {
    return jsonAuthError(req, 503, 'event_already_ended');
  }

  const { data: issued, error: issueErr } = await supabaseAdmin.rpc(
    'mcp_issue_pat',
    {
      p_user_id: kyroUser.id,
      p_token_hash: tokenHash,
      p_consented_at: new Date().toISOString(),
      p_expires_at: expiresAt,
      p_user_agent: req.headers.get('user-agent') || null,
    },
  );

  if (issueErr) {
    console.error('[issue-pat] mcp_issue_pat failed:', issueErr.message);
    return jsonAuthError(req, 500, 'internal_error');
  }

  const baseUrl = env.baseUrl() || new URL(req.url).origin;

  return jsonAuthOk(req, {
    token: rawToken,
    expires_at: (issued as { expires_at: string })?.expires_at,
    rest_url: `${baseUrl}/api/v1`,
    mcp_url: `${baseUrl}/api/mcp`,
    mcp_config_snippet: {
      mcpServers: {
        kyro: {
          url: `${baseUrl}/api/mcp`,
          headers: { Authorization: `Bearer ${rawToken}` },
        },
      },
    },
  });
}
