/**
 * KYRO Hackathon — emergency kill switch.
 *
 * What it does (in order):
 *   1. Revokes every non-revoked PAT in public.mcp_personal_access_tokens.
 *   2. If VERCEL_TOKEN + VERCEL_PROJECT_ID are set, updates the Vercel project's
 *      REGISTRATION_OPEN env var to "false" (stops new registrations too).
 *
 * Step 1 is the line of defense. Step 2 closes the front door but is optional;
 * if you don't have a Vercel token handy, just running step 1 is enough.
 *
 * Usage:
 *   doppler run --project kyro-hackathon-mcp --config prd -- pnpm kill-switch
 *
 *   # Optional second factor for step 2 — supply Vercel deploy token:
 *   VERCEL_TOKEN=xxx VERCEL_PROJECT_ID=prj_xxx doppler run --project kyro-hackathon-mcp --config prd -- pnpm kill-switch
 *
 * No flags. Run only when you mean it.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID;
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID;

if (!SUPABASE_URL) throw new Error('Missing SUPABASE_URL');
if (!SERVICE_ROLE) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function revokeAllTokens() {
  console.log('→ revoking all live tokens...');
  const { data, error } = await supabase
    .from('mcp_personal_access_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .is('revoked_at', null)
    .select('id');

  if (error) throw new Error(`token revoke failed: ${error.message}`);
  console.log(`✓ revoked ${data?.length ?? 0} token(s)`);
}

async function closeRegistration() {
  if (!VERCEL_TOKEN || !VERCEL_PROJECT_ID) {
    console.log(
      'ℹ skipping Vercel env update — set VERCEL_TOKEN + VERCEL_PROJECT_ID to close registration too',
    );
    return;
  }

  console.log('→ flipping REGISTRATION_OPEN=false in Vercel env...');

  const teamQuery = VERCEL_TEAM_ID ? `?teamId=${VERCEL_TEAM_ID}` : '';
  const listUrl = `https://api.vercel.com/v9/projects/${VERCEL_PROJECT_ID}/env${teamQuery}`;

  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
  });
  if (!listRes.ok) {
    console.warn(`✗ Vercel env list failed: ${listRes.status} ${await listRes.text()}`);
    return;
  }
  const { envs } = (await listRes.json()) as { envs: Array<{ id: string; key: string }> };
  const existing = envs.find((e) => e.key === 'REGISTRATION_OPEN');

  if (existing) {
    const editUrl = `https://api.vercel.com/v9/projects/${VERCEL_PROJECT_ID}/env/${existing.id}${teamQuery}`;
    const editRes = await fetch(editUrl, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${VERCEL_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ value: 'false', target: ['production', 'preview', 'development'] }),
    });
    if (!editRes.ok) {
      console.warn(`✗ Vercel env edit failed: ${editRes.status} ${await editRes.text()}`);
      return;
    }
  } else {
    const createUrl = `https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/env${teamQuery}`;
    const createRes = await fetch(createUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${VERCEL_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        key: 'REGISTRATION_OPEN',
        value: 'false',
        type: 'plain',
        target: ['production', 'preview', 'development'],
      }),
    });
    if (!createRes.ok) {
      console.warn(`✗ Vercel env create failed: ${createRes.status} ${await createRes.text()}`);
      return;
    }
  }
  console.log('✓ REGISTRATION_OPEN=false set in Vercel env');
  console.log(
    'ℹ Vercel reads the new value on the next deployment. Trigger a redeploy or wait for the next cron run.',
  );
}

async function main() {
  console.log('=== KYRO Hackathon kill switch ===');
  await revokeAllTokens();
  await closeRegistration();
  console.log('=== done ===');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
