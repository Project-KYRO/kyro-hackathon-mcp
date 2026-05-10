# KYRO Hackathon API

KYRO 의 러닝 데이터로 하루 동안 뭐든 만들어볼 수 있어요. AI 에이전트, 대시보드, 시각화, 게임, 작품 — 상상대로.

> 2026-05-10 캐주얼 해커톤용 read-only 인프라. 행사 종료 후 sunset.

## 쓸 수 있는 데이터 3종

### 1. 본인 + 친구의 러닝 데이터 (full detail)

- 본인의 모든 러닝 — GPS trace / km 별 split (페이스·고도) / 거리·시간·페이스 / 영토·뺏은영토 / 위치 메타 (도시·지역) / 본인이 적은 제목·메모
- 본인이 follow 한 사람들의 공개 러닝 — KYRO 앱과 동일한 권한 (`audience` 가 `전체` / `팔로워` / `친구만` 인 러닝이 audience 룰 통과 시 노출)
- 행사장에서 서로 follow 추가하면 그 사람 러닝이 본인 토큰으로 들어옵니다

### 2. KYRO 전체 익명 통계

- 시간대별 러닝 분포 (24시간) / 거리·페이스 히스토그램 / 도시·지역별 활성도 / 90일 window
- **active 사용자 demographics** — 성별 / 연령대 / 교차 분포 (share 비율만, total 미노출, k≥5 anonymity)

### 3. KYRO 전체 익명 trace 데이터셋

- 한 row = 한 러닝의 GPS trace + km 별 split (페이스·고도)
- user 와 unlinkable — 출발/도착 5%-95% clip + 좌표 50m grid round + 시간 hour 단위 + run_id 매일 randomize + k≥3 anonymity (같은 시간·지역에 3명 이상 활동했을 때만)

## 만들어볼 수 있는 것 (영감)

- AI 코치 — Claude/GPT 가 본인 데이터 보고 트렌드 분석
- 인기 코스 분석 — 사람들이 자주 뛰는 경로 시각화
- 시간대 분석 — 주중/주말, 아침/저녁 패턴
- 초보자 코스 추천 — 짧고 평탄하고 반복 많은 코스
- 고도 난이도 지도 — 오르막 많은 구간 표시 (km 별)
- 페이스 변동 지도 — 사람들이 자주 느려지는 구간
- trace 패턴 분류 (ML), 영토 전략, 음악·아트 generate 등

## 시작하기 (참가자)

1. KYRO 앱 설치 + 가입 (행사장 진행)
2. 마이페이지 → 공개 범위 기본값을 **`전체`** 로 변경 (안 하면 본인 데이터를 다른 참가자가 못 봄)
3. 행사 참가자끼리 서로 follow 추가
4. 워밍업 러닝 1번 (10분)
5. **운영자에게 토큰 회신 받기** — 등록한 email 로 이미 일괄 발급됨. 카톡/메일 확인.
6. 받은 토큰을 README 의 예제 코드 또는 Claude Desktop config 에 넣고 시작

## 가드 / 안전

- 전부 **read-only**. KYRO 데이터 수정·삭제 불가
- 토큰 만료: 행사 종료 +24h 후 자동 무효
- HR / 케이던스 / 사진 / raw GPS sample 파일은 제공되지 않음 (Garmin Developer Program 컴플라이언스 + 프라이버시)
- 익명 trace dataset 은 모두 식별 불가 형태로 처리
- per-token rate limit: 60 req/min, 5000 req/day

## Endpoint

| Method & Path | 설명 |
|---|---|
| `GET /api/v1/runs?limit=50&cursor=...` | 본인 러닝 목록 |
| `GET /api/v1/runs/:id` | 러닝 상세 (GPS trace + splits) |
| `GET /api/v1/friends/runs?limit=50&cursor=...` | 친구 러닝 목록 |
| `GET /api/v1/aggregates` | KYRO 전체 익명 집계 |
| `GET /api/v1/anon-traces?limit=100&cursor=...&region=서울` | KYRO 전체 익명 trace |
| `GET /api/v1/demographics` | KYRO active 사용자 성별·연령대 분포 (share only, k≥5) |
| `POST /api/mcp` | MCP transport (Claude Desktop 등) |

전부 Bearer 인증 (`Authorization: Bearer kyro_pat_...`).

## cURL 예제

```bash
TOKEN=kyro_pat_xxxxxxxxxxxxxxxx
BASE=https://kyro-hackathon-mcp.vercel.app

curl -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/runs?limit=10"
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/runs/01HX..."
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/friends/runs?limit=20"
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/aggregates"
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/anon-traces?limit=50&region=서울"

# 6. KYRO 사용자 demographics (성별/연령대 share, total 노출 X)
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/demographics"
```

전체 endpoint 검증: `examples/curl-smoke.sh`

## Python — Claude agent (anthropic SDK)

`examples/python-claude-agent.py` 참고.

## Python — 인기 코스 분석 시작점

`examples/python-popular-routes.py` — 익명 trace dataset 으로 인기 출발점 grid 추출.

## JavaScript / Next 대시보드

`examples/js-fetch-demo.mjs` — fetch + 시간대 분포를 ASCII 막대로 출력.

## Claude Desktop / Cursor — 자연어로 호출

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

설정 후 Claude Desktop 재시작 → "내 KYRO 러닝 페이스 트렌드 분석해줘" 같이 자연어로. Claude 가 적절한 tool (`list_my_runs`, `get_run_detail`, `list_friend_runs`, `get_aggregate_stats`, `list_anon_traces`, `get_demographics`) 호출.

## 응답 shape (요약)

자세한 schema 는 `lib/auth.ts` + `app/api/v1/*/route.ts` + supabase migration (`20260510000000_hackathon_mcp.sql`) 참고.

## Error codes

| Code | 의미 |
|---|---|
| 400 `invalid_input` | request params 오류 |
| 401 `missing_bearer_token` / `invalid_token_format` / `token_invalid_or_expired` | 인증 실패 |
| 404 `not_found_or_no_permission` | run 없음 또는 audience 룰 미통과 |
| 429 `rate_limited_per_minute` (60/min) / `rate_limited_per_day` (5000/day) | 레이트 제한 |
| 500 `rpc_failed` | Supabase RPC 오류 |

## 행사 종료 후 (운영자)

- 모든 토큰 일괄 무효: `UPDATE public.mcp_personal_access_tokens SET revoked_at = now()`
- Vercel 프로젝트 remove
- 필요 시 readonly DB role + RPC + 테이블 모두 drop

## Privacy

KYRO 개인정보처리방침 (특히 섹션 10 외부 AI 처리 제한) 의 정신에 부합하도록:
- 본인이 받은 데이터로만 작품 만들기
- 다른 사용자 식별 시도 금지
- 행사 종료 후 본인 보관 데이터 삭제 권장
