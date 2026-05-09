/**
 * KYRO Hackathon — admin token 일괄 발급.
 *
 * 사용:
 *   1. emails.csv 작성 (한 줄에 하나, header 무관):
 *        email
 *        alice@example.com
 *        bob@example.com
 *
 *   2. 환경변수 export (Vercel dashboard 의 production env 와 같은 값):
 *        export SUPABASE_URL="https://zkjpqbhmsvbibygemqfb.supabase.co"
 *        export SUPABASE_SERVICE_ROLE_KEY="..."
 *        export PAT_HASH_PEPPER="..."
 *        export HACKATHON_PAT_EXPIRES_AT="2026-05-11T20:00:00+09:00"
 *
 *   3. 실행:
 *        pnpm issue-pat emails.csv
 *
 *   4. 출력 emails_tokens.csv 의 각 row 를 카톡/슬랙으로 회신.
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

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error('Usage: pnpm issue-pat <emails.csv>');
    process.exit(1);
  }

  const lines = readFileSync(csvPath, 'utf-8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  // Skip header if present (first row has no '@')
  const emails = lines[0]?.includes('@') ? lines : lines.slice(1);

  const out: string[] = ['email,user_id,token,expires_at,note'];
  let issued = 0;
  let missing = 0;
  let failed = 0;

  for (const rawEmail of emails) {
    const email = rawEmail.toLowerCase().trim().replace(/^,+|,+$/g, '');
    if (!email.includes('@')) continue;

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (!user) {
      out.push(`${email},,,${EXPIRES_AT},user_not_found`);
      console.log(`✗ ${email} — not in KYRO (가입 X 또는 다른 email)`);
      missing++;
      continue;
    }

    const raw = generateRawToken();
    const hash = hashToken(raw);

    const { error } = await supabase.rpc('mcp_issue_pat', {
      p_user_id: user.id,
      p_token_hash: hash,
      p_consented_at: new Date().toISOString(),
      p_expires_at: EXPIRES_AT,
      p_user_agent: 'admin-issue-pat-script',
    });

    if (error) {
      out.push(`${email},${user.id},,${EXPIRES_AT},error:${error.message}`);
      console.log(`✗ ${email} — ${error.message}`);
      failed++;
    } else {
      out.push(`${email},${user.id},${raw},${EXPIRES_AT},ok`);
      console.log(`✓ ${email} → ${raw}`);
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
