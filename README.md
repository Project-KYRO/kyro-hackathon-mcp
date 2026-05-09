# KYRO Hackathon API

KYRO 의 러닝 데이터로 하루 동안 뭐든 만들어볼 수 있어요. AI 에이전트, 대시보드, 시각화, 게임, 작품 — 상상대로.

> 2026-05-10 캐주얼 해커톤용 read-only 인프라. 행사 종료 후 sunset.

## 쓸 수 있는 데이터 3종

### 1. 본인 + 친구의 러닝 데이터 (full detail)

- 본인의 모든 러닝 — GPS trace / km 별 split (페이스·고도) / 거리·시간·페이스 / 영토·뺏은영토 / 위치 메타 (도시·지역) / 본인이 적은 제목·메모
- 본인이 follow 한 사람들의 공개 러닝 — KYRO 앱과 동일한 권한 (`audience` 가 `전체` / `팔로워` / `친구만` 인 러닝이 audience 룰 통과 시 노출)
- 행사장에서 서로 follow 추가하면 그 사람 러닝이 본인 토큰으로 들어옵니다

### 2. KYRO 전체 익명 통계

- 시간대별 러닝 분포 (24시간)
- 거리·페이스·영토 분포 히스토그램
- 도시·지역별 활성도
- 90일 window

### 3. KYRO 전체 익명 trace 데이터셋

- 한 row = 한 러닝의 GPS trace + km 별 split (페이스·고도)
- user 와 unlinkable — 출발/도착 5%-95% clip + 좌표 50m grid round + 시간 hour 단위 + run_id 매일 randomize + k≥3 anonymity (같은 시간·지역에 3명 이상 활동했을 때만)
- 사람들의 러닝 패턴 분석 / 코스 시각화 / 군집 분석 가능

## 만들어볼 수 있는 것 (영감)

- **AI 코치** — Claude/GPT 가 본인 데이터 보고 트렌드 분석
- **인기 코스 분석** — 사람들이 자주 뛰는 경로 시각화
- **시간대 분석** — 주중/주말, 아침/저녁 패턴
- **초보자 코스 추천** — 짧고 평탄하고 반복 많은 코스
- **고도 난이도 지도** — 오르막 많은 구간 표시 (km 별)
- **페이스 변동 지도** — 사람들이 자주 느려지는 구간
- **trace 패턴 분류 (ML)** — 인터벌 / steady / 회복
- **영토 전략** — 비어있는 grid 추천
- **Storytelling** — 러닝 → 일기 / 음악 / 추상 아트 generate

## 가드 / 안전

- 전부 **read-only**. KYRO 데이터 수정·삭제 불가.
- 토큰 만료: 행사 종료 +24h 후 자동 무효
- HR / 케이던스 / 사진 / raw GPS sample 파일은 제공되지 않음 (Garmin Developer Program 컴플라이언스 + 프라이버시)
- 익명 trace dataset 은 모두 식별 불가 형태로 처리
- per-token rate limit: 60 req/min, 5000 req/day

## 시작하기

1. KYRO 앱 설치 + 가입 (행사장 진행)
2. 마이페이지 → 공개 범위 기본값을 **`전체`** 로 변경
3. 행사 참가자끼리 서로 follow 추가
4. 워밍업 러닝 1번
5. [등록 페이지](/register) 에서 KYRO 가입 email 입력 → OTP → 토큰 발급 (1회만 표시)

## Endpoint

| Method & Path | 설명 |
|---|---|
| `GET /api/v1/runs?limit=50&cursor=...` | 본인 러닝 목록 |
| `GET /api/v1/runs/:id` | 러닝 상세 (GPS trace + splits) |
| `GET /api/v1/friends/runs?limit=50&cursor=...` | 친구 러닝 목록 |
| `GET /api/v1/aggregates` | KYRO 전체 익명 집계 |
| `GET /api/v1/anon-traces?limit=100&cursor=...&region=서울` | KYRO 전체 익명 trace |
| `POST /api/mcp` | MCP transport (Claude Desktop 등) |

전부 Bearer 인증 (`Authorization: Bearer kyro_pat_...`).

## cURL 예제

```bash
TOKEN=kyro_pat_xxxxxxxxxxxxxxxx
BASE=https://kyro-hackathon-mcp.vercel.app

# 1. 본인 러닝 목록
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/runs?limit=10"

# 2. 러닝 상세
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/runs/01HX..."

# 3. 친구 러닝
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/friends/runs?limit=20"

# 4. 전체 익명 집계
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/aggregates"

# 5. 익명 trace (서울만)
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/anon-traces?limit=50&region=서울"
```

## Python 예제 — Claude agent (anthropic SDK)

```python
import os, httpx, anthropic

TOKEN = os.environ["KYRO_PAT"]
BASE  = "https://kyro-hackathon-mcp.vercel.app"

client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

# Tool: fetch own runs from KYRO
def list_my_runs(limit: int = 20):
    r = httpx.get(f"{BASE}/api/v1/runs",
                  headers={"Authorization": f"Bearer {TOKEN}"},
                  params={"limit": limit})
    r.raise_for_status()
    return r.json()

runs = list_my_runs(20)
prompt = f"""다음은 내 KYRO 러닝 기록 {len(runs['runs'])}건이야.
페이스·거리·시간 트렌드를 분석해줘. JSON: {runs}"""

msg = client.messages.create(
    model="claude-opus-4-7",
    max_tokens=2000,
    messages=[{"role": "user", "content": prompt}],
)
print(msg.content[0].text)
```

## Claude Desktop 의 MCP 설정

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

설정 후 Claude Desktop 재시작 → "내 KYRO 러닝 페이스 트렌드 분석해줘" 같이 자연어로 호출 가능. Claude 가 알아서 적절한 tool (`list_my_runs`, `get_run_detail`, etc) 호출.

## JavaScript / Next.js 예제 — 익명 trace heatmap

```js
const res = await fetch(`${BASE}/api/v1/anon-traces?limit=200&region=서울`, {
  headers: { Authorization: `Bearer ${TOKEN}` },
});
const { traces } = await res.json();

// 각 trace 의 simplified_line_clipped_grid 를 mapbox / deck.gl / leaflet 으로 렌더
traces.forEach((t) => {
  const coords = t.simplified_line_clipped_grid?.coordinates ?? [];
  // [lng, lat] pair list — LineString 그리기
});
```

## 응답 shape

### `GET /api/v1/runs`

```json
{
  "runs": [
    {
      "id": "01HX...",
      "title": "당산동 한바퀴",
      "description": "오늘 컨디션 좋았다",
      "started_at": "2026-05-09T07:30:00+09:00",
      "ended_at":   "2026-05-09T08:02:00+09:00",
      "created_at": "...",
      "distance_m": 5200,
      "duration_s": 1920,
      "avg_pace_s_km": 369,
      "calories": 320,
      "area_m2": 12345.6,
      "stolen_area_m2": 800.5,
      "stolen_territory_count": 2,
      "net_territory_gain_m2": 11500,
      "place_country_code": "KR",
      "place_region_label": "서울",
      "place_display_label": "당산동",
      "audience": "public",
      "elevation_gain_m": 45,
      "elevation_loss_m": 42,
      "start_lat": 37.5326,
      "start_lng": 126.9025
    }
  ],
  "next_cursor": "2026-05-08T..."
}
```

### `GET /api/v1/runs/:id`

위 + `track_geojson` (GeoJSON LineString) + `splits` (km 별 페이스·고도).

### `GET /api/v1/aggregates`

```json
{
  "as_of": "...",
  "window_days": 90,
  "hourly_distribution": [{ "hour": 7, "n": 1240 }, ...],
  "day_of_week_distribution": [{ "dow": 1, "n": ... }, ...],
  "distance_histogram_km": [{ "km": 5, "n": ... }, ...],
  "pace_histogram_s_per_km": [{ "pace_s_km": 360, "n": ... }, ...],
  "region_distribution": [{ "country": "KR", "region": "서울", "n": ... }, ...]
}
```

### `GET /api/v1/anon-traces`

```json
{
  "traces": [
    {
      "anonymized_run_id": "abcd...md5",
      "hour_bucket": 7,
      "day_of_week": 2,
      "distance_m_binned": 5200,
      "duration_s_binned": 1920,
      "avg_pace_s_km_binned": 360,
      "elevation_gain_m": 45,
      "elevation_loss_m": 42,
      "place_country_code": "KR",
      "place_region_label": "서울",
      "simplified_line_clipped_grid": {
        "type": "LineString",
        "coordinates": [[126.945, 37.532], ...]
      },
      "splits": [
        {
          "split_index": 0,
          "distance_m": 1000,
          "avg_pace_s_km": 320,
          "elevation_gain_m": 12,
          "elevation_loss_m": 8,
          "interp_lng": 126.945,
          "interp_lat": 37.532
        }
      ]
    }
  ],
  "next_cursor": "..."
}
```

## Error codes

| Code | 의미 |
|---|---|
| 400 `invalid_input` | request body / params 형식 오류 |
| 401 `missing_bearer_token` / `invalid_token_format` / `token_invalid_or_expired` | 인증 실패 |
| 404 `not_found_or_no_permission` | run 이 없거나 audience 룰 미통과 |
| 429 `rate_limited_per_minute` (60/min) / `rate_limited_per_day` (5000/day) / `cooldown_active` (OTP) | 레이트 제한 |
| 500 `rpc_failed` | Supabase RPC 오류 |

## 행사 종료 후

- 모든 토큰 일괄 무효 (`UPDATE mcp_personal_access_tokens SET revoked_at = now()`)
- Vercel 프로젝트 remove
- 필요 시 readonly DB role + RPC + 테이블 모두 drop

## License / Privacy

행사 데이터 사용 시 KYRO 개인정보처리방침 (특히 섹션 10 외부 AI 처리 제한) 의 정신에 부합하도록:
- 본인이 받은 데이터로만 작품 만들기
- 다른 사용자 식별 시도 금지
- 행사 종료 후 본인 보관 데이터도 삭제 권장
