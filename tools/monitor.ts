/**
 * KYRO Hackathon — usage monitor.
 *
 * Prints a snapshot of token issuance + recent activity. Use repeatedly during
 * the event to see who's online and whether any token is being hammered.
 *
 * Usage:
 *   doppler run --project kyro-hackathon-mcp --config prd -- pnpm monitor
 *
 *   # Auto-refresh every 10 seconds
 *   doppler run --project kyro-hackathon-mcp --config prd -- pnpm monitor --watch
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) throw new Error('Missing SUPABASE_URL');
if (!SERVICE_ROLE) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

interface SnapshotRow {
  issued_24h: number;
  issued_1h: number;
  active: number;
  active_5min: number;
  active_1h: number;
  recent: Array<{
    user_id: string;
    nickname: string | null;
    created_at: string;
    last_used_at: string | null;
    user_agent: string | null;
  }>;
}

async function snapshot(): Promise<SnapshotRow> {
  // One round-trip per scalar — PostgREST doesn't expose a custom RPC for this,
  // so we issue parallel filtered counts. Each is indexed (created_at,
  // last_used_at, revoked_at) so they're cheap.
  const nowIso = new Date().toISOString();
  const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();
  const fiveMinAgo = new Date(Date.now() - 300_000).toISOString();
  const oneDayAgo = new Date(Date.now() - 86_400_000).toISOString();

  const [issued24, issued1h, active, active5m, active1h, recentTokens] =
    await Promise.all([
      supabase
        .from('mcp_personal_access_tokens')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', oneDayAgo),
      supabase
        .from('mcp_personal_access_tokens')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', oneHourAgo),
      supabase
        .from('mcp_personal_access_tokens')
        .select('*', { count: 'exact', head: true })
        .is('revoked_at', null)
        .gt('expires_at', nowIso),
      supabase
        .from('mcp_personal_access_tokens')
        .select('*', { count: 'exact', head: true })
        .gte('last_used_at', fiveMinAgo),
      supabase
        .from('mcp_personal_access_tokens')
        .select('*', { count: 'exact', head: true })
        .gte('last_used_at', oneHourAgo),
      supabase
        .from('mcp_personal_access_tokens')
        .select('user_id, created_at, last_used_at, user_agent')
        .is('revoked_at', null)
        .gt('expires_at', nowIso)
        .order('last_used_at', { ascending: false, nullsFirst: false })
        .limit(15),
    ]);

  // Resolve current nicknames for the recent users.
  const userIds = (recentTokens.data ?? []).map((r) => r.user_id);
  const nicknames = userIds.length
    ? await supabase
        .from('user_nickname')
        .select('user_id, nickname')
        .in('user_id', userIds)
        .eq('status', 'using')
    : { data: [] };

  const nickByUser = new Map<string, string>();
  for (const row of nicknames.data ?? []) {
    nickByUser.set(row.user_id, row.nickname);
  }

  return {
    issued_24h: issued24.count ?? 0,
    issued_1h: issued1h.count ?? 0,
    active: active.count ?? 0,
    active_5min: active5m.count ?? 0,
    active_1h: active1h.count ?? 0,
    recent: (recentTokens.data ?? []).map((r) => ({
      user_id: r.user_id,
      nickname: nickByUser.get(r.user_id) ?? null,
      created_at: r.created_at,
      last_used_at: r.last_used_at,
      user_agent: r.user_agent,
    })),
  };
}

function ago(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return 'in future';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m ago`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h ago`;
}

function clearScreen() {
  process.stdout.write('\x1B[2J\x1B[H');
}

function printOnce(s: SnapshotRow) {
  console.log('=== KYRO Hackathon — live snapshot ===');
  console.log(`  at  ${new Date().toISOString()}`);
  console.log('');
  console.log('  Tokens');
  console.log(`    issued (24h)        ${s.issued_24h}`);
  console.log(`    issued (1h)         ${s.issued_1h}`);
  console.log(`    active right now    ${s.active}`);
  console.log('');
  console.log('  API activity');
  console.log(`    used in last 5 min  ${s.active_5min}`);
  console.log(`    used in last 1h     ${s.active_1h}`);
  console.log('');
  if (s.recent.length === 0) {
    console.log('  (no active tokens)');
  } else {
    console.log('  Recent active users (most recent use first)');
    console.log(
      `    ${'nickname'.padEnd(28)} ${'user_id'.padEnd(15)} ${'issued'.padEnd(14)} ${'last used'.padEnd(14)}  via`,
    );
    for (const r of s.recent) {
      const nick = (r.nickname ?? '(unknown)').padEnd(28).slice(0, 28);
      const uid = (r.user_id.slice(0, 12) + '…').padEnd(15);
      const issued = ago(r.created_at).padEnd(14);
      const used = ago(r.last_used_at).padEnd(14);
      const via = r.user_agent?.includes('[via nickname:') ? 'nickname' : 'OAuth/email';
      console.log(`    ${nick} ${uid} ${issued} ${used}  ${via}`);
    }
  }
  console.log('');
}

async function main() {
  const watch = process.argv.includes('--watch');
  if (!watch) {
    printOnce(await snapshot());
    return;
  }
  while (true) {
    try {
      clearScreen();
      printOnce(await snapshot());
      console.log('  (auto-refresh every 10s — Ctrl-C to exit)');
    } catch (e) {
      console.error('snapshot failed:', e);
    }
    await new Promise((r) => setTimeout(r, 10_000));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
