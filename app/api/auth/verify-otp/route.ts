import { NextRequest } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase';
import { redis, rateLimit } from '@/lib/redis';
import { generateRawToken, hashToken, hashOtp } from '@/lib/pat';
import { jsonOk, jsonError, corsPreflight } from '@/lib/response';

const Body = z.object({
  email: z.string().email().max(200),
  otp: z.string().regex(/^\d{6}$/),
});

export async function OPTIONS() {
  return corsPreflight();
}

export async function POST(req: NextRequest) {
  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return jsonError(400, 'invalid_input');
  }

  const email = parsed.email.trim().toLowerCase();
  const otp = parsed.otp;

  // Brute-force guard per email: 5 attempts per 10min.
  const guard = await rateLimit(`otp:verify:${email}`, 5, 600);
  if (!guard.ok) {
    return jsonError(429, 'too_many_attempts');
  }

  const stored = await redis.get<string>(`otp:${email}`);
  if (!stored || stored !== hashOtp(otp, email)) {
    return jsonError(401, 'invalid_otp');
  }
  await redis.del(`otp:${email}`);

  const { data: user, error: userErr } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (userErr) return jsonError(500, 'lookup_failed');
  if (!user) return jsonError(404, 'user_not_found');

  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt =
    process.env.HACKATHON_PAT_EXPIRES_AT || defaultExpires();

  const { data: issued, error: issueErr } = await supabaseAdmin.rpc(
    'mcp_issue_pat',
    {
      p_user_id: user.id,
      p_token_hash: tokenHash,
      p_consented_at: new Date().toISOString(),
      p_expires_at: expiresAt,
      p_user_agent: req.headers.get('user-agent') || null,
    }
  );

  if (issueErr) return jsonError(500, 'issue_failed', issueErr.message);

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || new URL(req.url).origin;

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

function defaultExpires() {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  return d.toISOString();
}
