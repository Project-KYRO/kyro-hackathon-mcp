// KYRO Hackathon — Node.js fetch demo.
//
// 실행:
//   export KYRO_PAT=kyro_pat_xxxxx
//   node js-fetch-demo.mjs

const TOKEN = process.env.KYRO_PAT;
const BASE = process.env.KYRO_BASE_URL || 'https://hackathon.kyro.team';
if (!TOKEN) throw new Error('Set KYRO_PAT env first');

const headers = { Authorization: `Bearer ${TOKEN}` };

async function get(path) {
  const r = await fetch(`${BASE}${path}`, { headers });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

const myRuns = await get('/api/v1/runs?limit=10');
console.log(`내 러닝 ${myRuns.runs?.length ?? 0}건`);

const agg = await get('/api/v1/aggregates');
console.log('시간대별 러닝 분포:');
(agg.hourly_distribution ?? []).forEach((b) => {
  const bar = '█'.repeat(Math.min(40, Math.round(b.n / 50)));
  console.log(`  ${String(b.hour).padStart(2)}시 ${bar} ${b.n}`);
});

const traces = await get('/api/v1/anon-traces?limit=20&region=서울');
console.log(`서울 익명 trace ${traces.traces?.length ?? 0}건 — 첫 trace 의 km 별 페이스:`);
(traces.traces?.[0]?.splits ?? []).forEach((s) => {
  console.log(`  km ${s.split_index + 1}: ${s.avg_pace_s_km}s/km, +${s.elevation_gain_m}m`);
});
