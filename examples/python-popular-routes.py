"""
KYRO Hackathon — 인기 코스 분석 예제 (시작점).

익명 trace 데이터셋을 받아서 출발점이 가까운 trace 들을 cluster 하고
가장 자주 등장하는 시작 grid 를 출력합니다.

실행:
  pip install httpx
  export KYRO_PAT=kyro_pat_xxxxx
  python python-popular-routes.py
"""

import os
import httpx
from collections import Counter

TOKEN = os.environ["KYRO_PAT"]
BASE = os.environ.get("KYRO_BASE_URL", "https://kyro-hackathon-mcp.vercel.app")
HEADERS = {"Authorization": f"Bearer {TOKEN}"}


def fetch_traces(region: str = "서울", limit: int = 500):
    """익명 trace 를 cursor pagination 으로 다 가져옵니다 (limit 까지)."""
    out = []
    cursor = None
    while len(out) < limit:
        params = {"limit": min(500, limit - len(out)), "region": region}
        if cursor:
            params["cursor"] = cursor
        r = httpx.get(f"{BASE}/api/v1/anon-traces", headers=HEADERS, params=params)
        r.raise_for_status()
        data = r.json()
        traces = data.get("traces", [])
        if not traces:
            break
        out.extend(traces)
        cursor = data.get("next_cursor")
        if not cursor:
            break
    return out


def main():
    traces = fetch_traces(region="서울", limit=500)
    print(f"Fetched {len(traces)} anonymous traces in 서울\n")

    # 시작점 grid (50m round 이미 적용됨) 빈도
    starts = []
    for t in traces:
        line = (t.get("simplified_line_clipped_grid") or {}).get("coordinates") or []
        if line:
            lng, lat = line[0]
            starts.append((round(lng, 4), round(lat, 4)))

    top = Counter(starts).most_common(10)
    print("Top 10 popular starting grids (lng, lat) → count:")
    for (lng, lat), n in top:
        print(f"  ({lng:.4f}, {lat:.4f}) — {n} runs")

    # 거리 / 페이스 분포
    distances = [t["distance_m_binned"] for t in traces if t.get("distance_m_binned")]
    paces = [t["avg_pace_s_km_binned"] for t in traces if t.get("avg_pace_s_km_binned")]
    if distances:
        print(f"\nDistance: min {min(distances)}m, median {sorted(distances)[len(distances)//2]}m, max {max(distances)}m")
    if paces:
        print(f"Pace: min {min(paces)}s/km, median {sorted(paces)[len(paces)//2]}s/km, max {max(paces)}s/km")


if __name__ == "__main__":
    main()
