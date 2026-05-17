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

export async function OPTIONS(req: NextRequest) {
  return corsAuthPreflight(req);
}

// POST /api/auth/issue-by-nickname
//
// Body (JSON)
//   nickname:        the user's *current* KYRO nickname (user_nickname.status='using')
//   passcode:        event passcode shared only with participants
//   consent:         boolean — must be true
//   turnstileToken:  optional, required when Turnstile is provisioned
//
// Used by Apple Hide-My-Email users (and anyone whose email magic-link fails).
// Trust model: knowing the passcode means you're an event participant; knowing
// a unique nickname means you're plausibly that user. If multiple users share
// the nickname, we refuse (ask them to customize in the app). If the target
// already has a live token, we refuse (prevents pre-emptive abuse).
//
// Errors are intentionally specific in the nickname/passcode arms so legitimate
// users can self-correct. The endpoint is only useful to someone who already
// has the passcode, so enumeration value is limited.
export async function POST(req: NextRequest) {
  if (!env.registrationOpen()) {
    return jsonAuthError(req, 403, 'registration_closed');
  }

  let body: {
    nickname?: string;
    passcode?: string;
    consent?: boolean;
    turnstileToken?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return jsonAuthError(req, 400, 'invalid_input');
  }

  const nickname = (body.nickname || '').trim();
  const passcode = (body.passcode || '').trim().toUpperCase();
  const consent = !!body.consent;

  if (!nickname) return jsonAuthError(req, 400, 'nickname_required');
  if (!consent) return jsonAuthError(req, 400, 'consent_required');
  if (passcode !== env.eventPasscode().toUpperCase()) {
    return jsonAuthError(req, 401, 'invalid_passcode');
  }

  const turnstile = await verifyTurnstile(body.turnstileToken ?? null, clientIpFrom(req));
  if (!turnstile.ok) {
    console.warn('[issue-by-nickname] turnstile failed:', turnstile.reason);
    return jsonAuthError(req, 401, 'turnstile_failed');
  }

  const { data: matches, error: lookupErr } = await supabaseAdmin
    .from('user_nickname')
    .select('user_id')
    .eq('nickname', nickname)
    .eq('status', 'using')
    .limit(2);

  if (lookupErr) {
    console.error('[issue-by-nickname] lookup failed:', lookupErr.message);
    return jsonAuthError(req, 500, 'internal_error');
  }

  if (!matches || matches.length === 0) {
    return jsonAuthError(req, 404, 'nickname_not_found');
  }
  if (matches.length > 1) {
    return jsonAuthError(req, 409, 'nickname_not_unique');
  }

  const userId = matches[0].user_id;

  // Prevent pre-emptive abuse — if a live token already exists for this user,
  // refuse. Legitimate user contacts organizer to revoke + retry.
  const { data: existing, error: existingErr } = await supabaseAdmin
    .from('mcp_personal_access_tokens')
    .select('id')
    .eq('user_id', userId)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .limit(1)
    .maybeSingle();

  if (existingErr) {
    console.error('[issue-by-nickname] existing check failed:', existingErr.message);
    return jsonAuthError(req, 500, 'internal_error');
  }
  if (existing) {
    return jsonAuthError(req, 409, 'token_already_issued');
  }

  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = env.expiresAt();

  if (new Date(expiresAt).getTime() <= Date.now()) {
    return jsonAuthError(req, 503, 'event_already_ended');
  }

  const userAgent = req.headers.get('user-agent') || null;
  const ua = userAgent ? `${userAgent} [via nickname:${nickname}]` : `[via nickname:${nickname}]`;

  const { data: issued, error: issueErr } = await supabaseAdmin.rpc(
    'mcp_issue_pat',
    {
      p_user_id: userId,
      p_token_hash: tokenHash,
      p_consented_at: new Date().toISOString(),
      p_expires_at: expiresAt,
      p_user_agent: ua,
    },
  );

  if (issueErr) {
    console.error('[issue-by-nickname] mcp_issue_pat failed:', issueErr.message);
    return jsonAuthError(req, 500, 'internal_error');
  }

  console.log(
    `[issue-by-nickname] issued ok nickname="${nickname}" user_id="${userId}" ip="${clientIpFrom(req)}"`,
  );

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
