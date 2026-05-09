# Deploy + 운영 가이드

## 1. 외부 자원 (~5분)

### Upstash Redis (per-token rate limit)
- https://console.upstash.com → Sign up
- Create Database → Name `kyro-hackathon` / Type `Regional` / Region **Tokyo (ap-northeast-1)**
- "REST API" 탭에서 두 값 복사: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`

### PEPPER 생성
```bash
openssl rand -base64 32
```
출력 32 글자 복사. **이 값은 vercel env 와 admin script 양쪽 다 동일하게 사용**해야 함 (다르면 token 검증 실패).

## 2. Vercel 배포

dashboard 에서:
1. https://vercel.com/new → kyro team 선택
2. `Project-KYRO/kyro-hackathon-mcp` Import
3. Configure Project → Environment Variables 6개 입력:

| Name | Value |
|---|---|
| `SUPABASE_URL` | `https://zkjpqbhmsvbibygemqfb.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | doppler `prd` 의 `SUPABASE_SERVICE_ROLE_KEY_` 값 |
| `UPSTASH_REDIS_REST_URL` | 위 Phase 1 |
| `UPSTASH_REDIS_REST_TOKEN` | 위 Phase 1 |
| `PAT_HASH_PEPPER` | 위 Phase 1 |
| `HACKATHON_PAT_EXPIRES_AT` | `2026-05-11T20:00:00+09:00` |

4. Deploy → 발급된 URL 메모
5. Settings → Env → `NEXT_PUBLIC_BASE_URL` 추가 = 위 URL → Redeploy

## 3. 토큰 일괄 발급 (admin script)

본인 노트북에서:

```bash
cd ~/Desktop/KYRO/kyro-hackathon-mcp

# Vercel env 그대로 가져오기 — Vercel CLI 없으면 dashboard 에서 복사
export SUPABASE_URL="https://zkjpqbhmsvbibygemqfb.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<dashboard 에서 복사>"
export PAT_HASH_PEPPER="<dashboard 에서 복사 — vercel 과 동일해야 함>"
export HACKATHON_PAT_EXPIRES_AT="2026-05-11T20:00:00+09:00"

# 참가자 email 리스트 — 한 줄에 하나
cat > emails.csv <<'CSV'
email
alice@example.com
bob@example.com
charlie@example.com
CSV

pnpm install        # 처음 한 번만
pnpm issue-pat emails.csv
```

출력:
```
✓ alice@example.com → kyro_pat_xxxxxxxxxxxxxxxxxx
✗ bob@example.com — not in KYRO (가입 X 또는 다른 email)
✓ charlie@example.com → kyro_pat_yyyyyyyyyyyyyyyyyy

=== summary ===
issued:        2
user_not_found: 1
failed:        0
output:        emails_tokens.csv
```

`emails_tokens.csv` 의 row 별로 **token + endpoint URL + Claude Desktop config** 를 카톡/메일/슬랙 으로 회신.

### 회신 템플릿 (한 명당)

```
[KYRO Hackathon] API 토큰
- token: kyro_pat_xxxxxxxxxxxxxxxx
- 만료: 2026-05-11 20:00
- REST: https://kyro-hackathon-mcp.vercel.app/api/v1
- MCP: https://kyro-hackathon-mcp.vercel.app/api/mcp
- README + 예제: https://github.com/Project-KYRO/kyro-hackathon-mcp

cURL 빠른 시작:
curl -H "Authorization: Bearer kyro_pat_xxx" \
  https://kyro-hackathon-mcp.vercel.app/api/v1/runs?limit=10

Claude Desktop:
{
  "mcpServers": {
    "kyro": {
      "url": "https://kyro-hackathon-mcp.vercel.app/api/mcp",
      "headers": { "Authorization": "Bearer kyro_pat_xxx" }
    }
  }
}
```

## 4. 본인 e2e 검증

```bash
export KYRO_PAT=kyro_pat_xxxxx     # 본인 token 으로
export KYRO_BASE_URL=https://<deployment>
./examples/curl-smoke.sh
```

5 endpoint + MCP tools/list + tools/call 모두 통과해야 함.

Claude Desktop config 도 본인 토큰으로 등록해 두고 자연어 호출 시도.

## 5. 행사 후 sunset

### 토큰 일괄 무효
```bash
doppler run --config prd -- bash -c '
  ref=$(echo "$SUPABASE_URL" | sed -E "s|https?://([^.]+)\..*|\1|")
  PGPASSWORD="$SUPABASE_DB_PASSWORD" psql \
    -h "aws-1-ap-northeast-2.pooler.supabase.com" -p 5432 \
    -U "postgres.${ref}" -d postgres -c \
    "UPDATE public.mcp_personal_access_tokens SET revoked_at = now() WHERE revoked_at IS NULL"
'
```

### Vercel 프로젝트 제거
Dashboard → Settings → Delete Project. 또는 `vercel project rm kyro-hackathon-mcp`.

### DB 인프라 완전 제거 (선택)
새 migration 1개로 DROP. 또는 그대로 두고 다음 해커톤 재사용.

## ⚠️ 보안

- **prod DB password rotation**: 작업 도중 `supabase db dump --dry-run` output 에 plain text 노출됨. Supabase Dashboard → Database → Reset password → doppler `prd` 의 `SUPABASE_DB_PASSWORD` update.
- **PAT_HASH_PEPPER 보관**: 행사 끝나기 전엔 vercel env 와 admin script 양쪽 같은 값 유지. 행사 후 vercel project 제거 시 함께 사라짐 (보관 X 추천).
