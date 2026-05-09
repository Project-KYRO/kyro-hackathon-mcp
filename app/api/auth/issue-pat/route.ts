import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { generateRawToken, hashToken } from '@/lib/pat';
import { jsonOk, jsonError, corsPreflight } from '@/lib/response';

export async function OPTIONS() {
  return corsPreflight();
}

// POST /api/auth/issue-pat
// Authorization: Bearer <supabase access token from signInWithOtp + verifyOtp>
//
// Verifies the JWT against KYRO's auth.users, then issues a PAT for that user
// via mcp_issue_pat RPC. Returns raw token + endpoint URLs (one-time reveal).
export async function POST(req: NextRequest) {
  const header = req.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return jsonError(401, 'missing_supabase_jwt');
  const supabaseJwt = match[1].trim();

  const { data: userResp, error: userErr } = await supabaseAdmin.auth.getUser(
    supabaseJwt
  );
  if (userErr || !userResp?.user) {
    return jsonError(401, 'invalid_supabase_session');
  }
  const authUserId = userResp.user.id;

  const { data: kyroUser, error: lookupErr } = await supabaseAdmin
    .from('users')
    .select('id, email')
    .eq('auth_id', authUserId)
    .maybeSingle();

  if (lookupErr) return jsonError(500, 'lookup_failed', lookupErr.message);
  if (!kyroUser) return jsonError(404, 'no_kyro_profile');

  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt =
    process.env.HACKATHON_PAT_EXPIRES_AT ||
    new Date(Date.now() + 2 * 86400_000).toISOString();

  const { data: issued, error: issueErr } = await supabaseAdmin.rpc(
    'mcp_issue_pat',
    {
      p_user_id: kyroUser.id,
      p_token_hash: tokenHash,
      p_consented_at: new Date().toISOString(),
      p_expires_at: expiresAt,
      p_user_agent: req.headers.get('user-agent') || null,
    }
  );

  if (issueErr) return jsonError(500, 'issue_failed', issueErr.message);

  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL || new URL(req.url).origin;

  return jsonOk({
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
