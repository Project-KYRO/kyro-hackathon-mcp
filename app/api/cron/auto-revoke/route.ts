import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { env } from '@/lib/env';

// Vercel cron — runs hourly during the event window.
//
// After HACKATHON_PAT_EXPIRES_AT passes, revoke every non-revoked token. Cheap
// (single UPDATE on a small table). If the cron is paused or skipped, tokens
// also have a per-row expires_at check inside mcp_verify_pat — so this is
// belt-and-suspenders, not the only line of defense.
//
// Vercel cron requests carry `Authorization: Bearer <CRON_SECRET>` when
// CRON_SECRET is set in env (https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs).
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  if (auth !== `Bearer ${env.cronSecret()}`) {
    return new Response('forbidden', { status: 403 });
  }

  const expiresAt = env.expiresAt();
  const now = Date.now();
  const eventEnded = new Date(expiresAt).getTime() <= now;

  if (!eventEnded) {
    return Response.json({
      action: 'noop',
      reason: 'event_window_active',
      expires_at: expiresAt,
      now: new Date(now).toISOString(),
    });
  }

  const { data, error } = await supabaseAdmin
    .from('mcp_personal_access_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .is('revoked_at', null)
    .select('id');

  if (error) {
    console.error('[cron/auto-revoke] update failed:', error.message);
    return Response.json({ action: 'failed', error: error.message }, { status: 500 });
  }

  return Response.json({
    action: 'revoked',
    revoked_count: data?.length ?? 0,
    expires_at: expiresAt,
  });
}
