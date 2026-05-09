#!/usr/bin/env bash
# KYRO Hackathon — 모든 endpoint smoke test.
# 사용:  KYRO_PAT=kyro_pat_xxxxx ./curl-smoke.sh
set -euo pipefail

: "${KYRO_PAT:?Set KYRO_PAT env first}"
BASE="${KYRO_BASE_URL:-https://kyro-hackathon-mcp.vercel.app}"
H="Authorization: Bearer $KYRO_PAT"

echo "=== /api/v1/runs ==="
curl -sS -H "$H" "$BASE/api/v1/runs?limit=3" | head -c 400 && echo

echo "=== /api/v1/aggregates ==="
curl -sS -H "$H" "$BASE/api/v1/aggregates" | head -c 400 && echo

echo "=== /api/v1/anon-traces (서울, limit 3) ==="
curl -sS -H "$H" "$BASE/api/v1/anon-traces?limit=3&region=서울" | head -c 400 && echo

echo "=== /api/v1/friends/runs ==="
curl -sS -H "$H" "$BASE/api/v1/friends/runs?limit=3" | head -c 400 && echo

echo "=== POST /api/mcp tools/list ==="
curl -sS -X POST -H "$H" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
  "$BASE/api/mcp" | head -c 500 && echo

echo "=== POST /api/mcp tools/call list_my_runs ==="
curl -sS -X POST -H "$H" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_my_runs","arguments":{"limit":3}}}' \
  "$BASE/api/mcp" | head -c 500 && echo

echo "All endpoints reachable ✓"
