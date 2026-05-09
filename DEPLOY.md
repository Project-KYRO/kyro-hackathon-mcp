# Deploy + 운영 가이드

## 시크릿 위치 — Doppler

Doppler project: **`kyro-hackathon-mcp`** / config: **`prd`**

이미 등록된 secret (Claude 가 자동 등록):

| Name | 출처 |
|---|---|
| `SUPABASE_URL` | doppler kyro-frontend/prd 에서 복사 |
| `SUPABASE_SERVICE_ROLE_KEY` | 위와 동일 (이름 typo `_` 정정) |
| `PAT_HASH_PEPPER` | `openssl rand -base64 32` 자동 생성 |
| `HACKATHON_PAT_EXPIRES_AT` | `2026-05-11T20:00:00+09:00` |
| `NEXT_PUBLIC_BASE_URL` | `https://kyro-hackathon-mcp.vercel.app` (deploy 후 업데이트) |

값 확인:
```bash
doppler secrets --project kyro-hackathon-mcp --config prd --only-names
```

## Vercel 배포 — 두 옵션

### 옵션 A: Doppler-Vercel integration (가장 깔끔, 권장)

1. Doppler dashboard → **Integrations** → **Vercel**
2. OAuth 1회 (Vercel team 선택)
3. Doppler project `kyro-hackathon-mcp` / config `prd` ↔ Vercel project `kyro-hackathon-mcp` 연결
4. Vercel 자동 빌드 (GitHub integration 이 push 마다 트리거)

장점: Doppler 가 SSOT. secret 변경 시 Vercel 자동 sync.

### 옵션 B: VERCEL_TOKEN 으로 CLI 자동화

1. https://vercel.com/account/settings/tokens 에서 token 발급 (이름 자유, full scope)
2. 발급된 token 을 `VERCEL_TOKEN` env 로 export 하면 Claude 가 vercel CLI 로 link + env 입력 + deploy 자동

## 토큰 일괄 발급 (admin script)

본인 노트북에서 doppler run 으로 한 번에:

```bash
cd ~/Desktop/KYRO/kyro-hackathon-mcp

# 참가자 email 리스트
cat > emails.csv <<'CSV'
alice@example.com
bob@example.com
charlie@example.com
CSV

# Doppler 가 PEPPER / SUPABASE_* 를 process env 로 주입 → script 가 그걸로 발급
doppler run --project kyro-hackathon-mcp --config prd -- pnpm issue-pat emails.csv
```

출력 `emails_tokens.csv` 의 row 별로 카톡/메일 회신.

### 회신 템플릿 (한 명당)

```
[KYRO Hackathon] 본인 API 토큰입니다

🔑 token: kyro_pat_xxxxxxxxxxxxxxxx
⏰ 만료: 2026-05-11 20:00

REST: https://kyro-hackathon-mcp.vercel.app/api/v1
MCP:  https://kyro-hackathon-mcp.vercel.app/api/mcp

cURL 빠른 시작:
curl -H "Authorization: Bearer kyro_pat_xxx" \
  https://kyro-hackathon-mcp.vercel.app/api/v1/runs?limit=10

Claude Desktop 설정:
{
  "mcpServers": {
    "kyro": {
      "url": "https://kyro-hackathon-mcp.vercel.app/api/mcp",
      "headers": { "Authorization": "Bearer kyro_pat_xxx" }
    }
  }
}

가이드: https://github.com/Project-KYRO/kyro-hackathon-mcp
```

## 본인 e2e 검증

```bash
# 본인 token 발급
echo "jeongwoo@kyro.team" > test.csv
doppler run --project kyro-hackathon-mcp --config prd -- pnpm issue-pat test.csv

# 발급된 token 으로 smoke
export KYRO_PAT="kyro_pat_xxx"
export KYRO_BASE_URL=https://kyro-hackathon-mcp.vercel.app
./examples/curl-smoke.sh
```

## 행사 후 sunset

### 토큰 일괄 무효
```bash
doppler run --config prd --project kyro-frontend -- bash -c '
  ref=$(echo "$SUPABASE_URL" | sed -E "s|https?://([^.]+)\..*|\1|")
  PGPASSWORD="$SUPABASE_DB_PASSWORD" psql \
    -h "aws-1-ap-northeast-2.pooler.supabase.com" -p 5432 \
    -U "postgres.${ref}" -d postgres -c \
    "UPDATE public.mcp_personal_access_tokens SET revoked_at = now() WHERE revoked_at IS NULL"
'
```

### Vercel + Doppler + GitHub repo 정리

```bash
# Vercel: dashboard 에서 Settings → Delete Project
# Doppler:
doppler projects delete kyro-hackathon-mcp
# GitHub: dashboard 에서 archive 또는 delete
gh repo delete Project-KYRO/kyro-hackathon-mcp --yes
```

### DB 인프라 (선택)
새 migration 1개로 DROP. 또는 그대로 두고 다음 해커톤 재사용.

## ⚠️ 보안

- **prod DB password rotation 필요**: `supabase db dump --dry-run` output 에서 password 가 plain text 로 출력됨 → Claude conversation 컨텍스트에 노출됨. Supabase Dashboard → Database → Reset password → doppler `kyro-frontend/prd` 의 `SUPABASE_DB_PASSWORD` update.
- **PAT_HASH_PEPPER 일치 강제**: vercel env 와 doppler kyro-hackathon-mcp/prd 가 동일해야 token 검증 성공. integration 또는 CLI 로 sync.
