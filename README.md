# KYRO Hackathon API

Read-only data API + MCP server for KYRO hackathon participants. Build whatever you want — AI agents, dashboards, visualizations, generative art — using KYRO running data.

> Throwaway infra. Tokens auto-expire after the event. Reused across events.

## What you can access

### 1. Your own + friends' running data (full detail)

- **Your runs**: GPS trace · per-km splits (pace + elevation) · distance · duration · pace · territory claimed/stolen · place metadata (city/region) · your title and notes.
- **Runs from people you follow**: filtered by each run's audience rule (`public` / `follower` / `mutual_friend`), exactly the same visibility you have in the KYRO app.
- Follow more people at the event to bring more data into your token's scope.

### 2. KYRO-wide anonymous aggregates (no PII)

- Hourly + day-of-week activity distribution
- Distance + pace histograms
- Region-level activity (country + region label)
- 90-day window
- Active-user **demographics** — gender + age band (share only, no totals exposed, k≥5 anonymity)

### 3. KYRO-wide anonymous trace dataset

- One row per run: anonymized GPS trace + per-km splits (pace + elevation).
- Unlinkable to users: endpoint 5%–95% clip, 50m grid round, hour bucket, run_id randomized daily, k≥3 anonymity by (hour, region).
- `audience='public'` runs only.

## Ideas

- AI running coach — Claude/GPT reads your data and finds trends.
- Popular route discovery — visualize where people run most.
- Time-of-day analysis — weekday vs weekend, morning vs evening patterns.
- Beginner course recommender — short, flat, repeated routes.
- Elevation difficulty maps.
- Pace-drop hotspots — where runners commonly slow down.
- ML trace clustering, territory strategy, music/art generation, …

## Get started (participants)

1. Install the KYRO app and sign up (we'll guide you at the event venue).
2. **My Page → Default audience → set to `Public`** (otherwise other participants can't see your data).
3. Follow other participants in the app.
4. Do a warm-up run (10 min).
5. Open <https://kyro-hackathon-mcp.vercel.app/register> and follow the steps.
6. You'll see your token once — copy it immediately.

### Apple Hide-My-Email users

You have three options, in order of preference:

1. **Use the "Continue with Apple" button** on the register page (recommended — same provider as the KYRO app, no email lookup needed).
2. If the Apple button doesn't work for you: enter your `@privaterelay.appleid.com` address in the email field. Find it at: iPhone Settings → your name → Sign In & Security → Sign in with Apple → KYRO. Apple forwards the sign-in email to your real inbox.
3. As a last resort, ask an organizer to issue a token by user ID.

## Safety / limits

- Everything is **read-only**. KYRO data cannot be modified or deleted through this API.
- Per-token rate limit: **60 requests/minute**, **5,000 requests/day** when the deployment is provisioned with Upstash. Without it, please be reasonable — abusive tokens are revoked manually.
- Tokens expire automatically after the event window closes.
- HR / cadence / photos / raw GPS sample files are **not** exposed (Garmin Developer Program compliance + privacy).
- All anonymized trace records are k-anonymized and unlinkable to users.

## Endpoints

| Method & path | Description |
|---|---|
| `GET /api/v1/runs?limit=50&cursor=...` | Your own runs |
| `GET /api/v1/runs/:id` | Run detail (GPS trace + splits) |
| `GET /api/v1/friends/runs?limit=50&cursor=...` | Runs from people you follow |
| `GET /api/v1/aggregates` | KYRO-wide anonymous aggregates |
| `GET /api/v1/anon-traces?limit=100&cursor=...&region=Singapore` | KYRO-wide anonymous traces |
| `GET /api/v1/demographics` | Anonymous demographics (share only, k≥5) |
| `POST /api/mcp` | MCP transport (Claude Desktop, Cursor, etc.) |

All endpoints use Bearer authentication: `Authorization: Bearer kyro_pat_...`.

## cURL examples

```bash
TOKEN=kyro_pat_xxxxxxxxxxxxxxxx
BASE=https://kyro-hackathon-mcp.vercel.app

curl -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/runs?limit=10"
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/runs/01HX..."
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/friends/runs?limit=20"
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/aggregates"
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/anon-traces?limit=50&region=Singapore"
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/demographics"
```

Full endpoint smoke test: `examples/curl-smoke.sh`.

## Python — Claude agent (anthropic SDK)

See `examples/python-claude-agent.py`.

## Python — popular route starter

`examples/python-popular-routes.py` — extracts popular start-point grid cells from the anonymized trace dataset.

## JavaScript / Next.js dashboard

`examples/js-fetch-demo.mjs` — fetches data and prints an ASCII histogram of hour-of-day activity.

## Claude Desktop / Cursor — talk to it in natural language

`~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "kyro": {
      "url": "https://kyro-hackathon-mcp.vercel.app/api/mcp",
      "headers": { "Authorization": "Bearer kyro_pat_xxxxxxxxx" }
    }
  }
}
```

Restart Claude Desktop. Then ask in plain English: *"Analyze the pace trend of my recent runs"* — Claude will pick the right tool (`list_my_runs`, `get_run_detail`, `list_friend_runs`, `get_aggregate_stats`, `list_anon_traces`, `get_demographics`) and respond.

## Response shapes

For full schemas see `lib/auth.ts`, `app/api/v1/*/route.ts`, and the Supabase migrations under `kyro_frontend/supabase/migrations/20260510*_hackathon_mcp*.sql`.

## Error codes

| Status | Code | Meaning |
|---|---|---|
| 400 | `invalid_input` | Request params malformed |
| 401 | `missing_bearer_token` / `invalid_token_format` / `token_invalid_or_expired` | Auth failed |
| 404 | `not_found_or_no_permission` | Run not found or audience rule didn't permit you |
| 429 | `rate_limited_per_minute` (60/min) / `rate_limited_per_day` (5,000/day) | Rate limit hit — see `Retry-After` header |
| 500 | `rpc_failed` / `verify_failed` | Internal/Supabase error |

## Privacy / PDPA

This API exposes participant data during the event. By accepting a token you agree:

- **Use only your own data and the publicly-shared data of users you follow** for your hackathon project.
- **Do not attempt to identify or de-anonymize** other users from the anonymous datasets.
- **Cross-border**: the API runs in Singapore (Vercel `sin1`) and reads from a Supabase project hosted in `ap-northeast-2` (Seoul). Participant data may transit between these regions for the duration of your queries; nothing is persisted on the hackathon infrastructure beyond token records.
- **Retention**: tokens are revoked at the event end. We recommend deleting any participant data you've downloaded after the event.
- KYRO's full privacy policy applies. The strictest of KYRO's privacy policy, Singapore PDPA, and the data subject's local law governs.

## Self-service token revocation

If you want to invalidate your own token mid-event, contact the organizer with the **first 6 characters** of your token (e.g. `kyro_pa`). The organizer can revoke without exposing the full token. (The token's hash is the only thing the server stores — the raw token is never persisted.)

## Operations (organizer)

See `DEPLOY.md` for the operator's setup + remote-ops + sunset checklist.
