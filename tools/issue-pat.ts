/**
 * KYRO Hackathon — admin token 일괄 발급.
 *
 * Input csv 의 각 row 는 email (`@` 포함) 또는 user_id (ULID 26 chars).
 * Apple Hide My Email 사용자는 email 매칭 불가 → 운영자가 닉네임 등으로
 * lookup 후 user_id 로 발급.
 *
 * 사용:
 *   1. emails_or_userids.csv 작성:
 *        alice@example.com
 *        bob@example.com
 *        01KCY451HDY6Q9NQNZSNEQ055H        # user_id 직접
 *        01HX2K3MR5QWE9TYAS2KZYCXC4
 *
 *   2. 환경변수 (Doppler 가 주입):
 *        doppler run --project kyro-hackathon-mcp --config prd -- pnpm issue-pat <csv>
 *
 *   3. 출력 <csv>_tokens.csv 의 row 별로 카톡/슬랙 회신.
 *
 * 닉네임으로 user_id 찾기 (Apple Hide My Email 사용자 운영 시):
 *   SELECT u.id, un.nickname
 *   FROM public.users u
 *   JOIN public.user_nickname un ON un.user_id = u.id
 *   WHERE un.nickname ILIKE '%Jay%';   -- 부분 일치
 */

import { readFileSync, writeFileSync } from 'fs';
import { createHash, randomBytes } from 'crypto';
import { createClient } from '@supabase/supabase-js';

const PEPPER = process.env.PAT_HASH_PEPPER;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EXPIRES_AT =
  process.env.HACKATHON_PAT_EXPIRES_AT || '2026-05-11T20:00:00+09:00';

if (!PEPPER) throw new Error('Missing PAT_HASH_PEPPER');
if (!SUPABASE_URL) throw new Error('Missing SUPABASE_URL');
if (!SERVICE_ROLE) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function generateRawToken(): string {
  return `kyro_pat_${randomBytes(32).toString('base64url')}`;
}

function hashToken(raw: string): string {
  return createHash('sha256').update(`${PEPPER}|${raw}`).digest('hex');
}

const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/i;

async function resolveUserId(token: string): Promise<string | null> {
  const trimmed = token.trim();
  if (!trimmed) return null;

  // Direct user_id (ULID)
  if (ULID_REGEX.test(trimmed)) {
    const { data } = await supabase
      .from('users')
      .select('id')
      .eq('id', trimmed)
      .maybeSingle();
    return data?.id ?? null;
  }

  // Email path: try public.users.email first
  if (trimmed.includes('@')) {
    const email = trimmed.toLowerCase();
    const { data: pub } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    if (pub) return pub.id;

    // Fallback: auth.users.email -> public.users.auth_id (Apple Hide My Email
    // can leave public.users.email empty while auth.users.email holds the
    // privaterelay alias the user actually receives mail at).
    const {
      data: { users },
    } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
    const authUser = users.find(
      (u) => (u.email || '').toLowerCase() === email
    );
    if (authUser) {
      const { data: byAuth } = await supabase
        .from('users')
        .select('id')
        .eq('auth_id', authUser.id)
        .maybeSingle();
      return byAuth?.id ?? null;
    }
  }

  return null;
}

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error('Usage: pnpm issue-pat <csv>');
    console.error('  csv rows = email (a@b.com) or user_id (ULID, 26 chars)');
    process.exit(1);
  }

  const lines = readFileSync(csvPath, 'utf-8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  // Skip header — first row that is neither email nor ulid.
  const rows = lines.filter((l) => l.includes('@') || ULID_REGEX.test(l));

  const out: string[] = ['input,user_id,token,expires_at,note'];
  let issued = 0;
  let missing = 0;
  let failed = 0;

  for (const row of rows) {
    const userId = await resolveUserId(row);

    if (!userId) {
      out.push(`${row},,,${EXPIRES_AT},user_not_found`);
      console.log(`✗ ${row} — not in KYRO`);
      missing++;
      continue;
    }

    const raw = generateRawToken();
    const hash = hashToken(raw);

    const { error } = await supabase.rpc('mcp_issue_pat', {
      p_user_id: userId,
      p_token_hash: hash,
      p_consented_at: new Date().toISOString(),
      p_expires_at: EXPIRES_AT,
      p_user_agent: 'admin-issue-pat-script',
    });

    if (error) {
      out.push(`${row},${userId},,${EXPIRES_AT},error:${error.message}`);
      console.log(`✗ ${row} → ${error.message}`);
      failed++;
    } else {
      out.push(`${row},${userId},${raw},${EXPIRES_AT},ok`);
      console.log(`✓ ${row} → ${raw}`);
      issued++;
    }
  }

  const outPath = csvPath.replace(/\.csv$/, '_tokens.csv');
  writeFileSync(outPath, out.join('\n'));

  console.log(`\n=== summary ===`);
  console.log(`issued:        ${issued}`);
  console.log(`user_not_found: ${missing}`);
  console.log(`failed:        ${failed}`);
  console.log(`output:        ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
