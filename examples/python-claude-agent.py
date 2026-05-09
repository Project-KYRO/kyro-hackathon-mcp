"""
KYRO Hackathon — Python + Claude agent 예제.

본인의 KYRO 러닝 데이터를 가져와서 Claude 에 던지고 트렌드 분석을 받습니다.

실행:
  pip install anthropic httpx
  export KYRO_PAT=kyro_pat_xxxxx
  export ANTHROPIC_API_KEY=sk-ant-xxxxx
  python python-claude-agent.py
"""

import os
import json
import httpx
import anthropic

TOKEN = os.environ["KYRO_PAT"]
BASE = os.environ.get("KYRO_BASE_URL", "https://kyro-hackathon-mcp.vercel.app")
HEADERS = {"Authorization": f"Bearer {TOKEN}"}

client = anthropic.Anthropic()


def list_my_runs(limit: int = 30):
    r = httpx.get(f"{BASE}/api/v1/runs", headers=HEADERS, params={"limit": limit})
    r.raise_for_status()
    return r.json()


def get_aggregate_stats():
    r = httpx.get(f"{BASE}/api/v1/aggregates", headers=HEADERS)
    r.raise_for_status()
    return r.json()


def main():
    my = list_my_runs(30)
    agg = get_aggregate_stats()

    prompt = f"""너는 러닝 코치야. 다음은 한 사용자의 KYRO 러닝 기록 {len(my['runs'])}건과
KYRO 전체 사용자의 익명 집계 통계야.

사용자 데이터:
{json.dumps(my, ensure_ascii=False, indent=2)[:8000]}

전체 통계:
{json.dumps(agg, ensure_ascii=False, indent=2)[:4000]}

해줄 일:
1. 이 사용자의 페이스 / 거리 트렌드 요약
2. 전체 분포와 비교했을 때 사용자의 위치
3. 다음 1주일 추천 페이스·거리·요일·시간대 (구체적으로)

한국어로 친근하게 답해줘."""

    msg = client.messages.create(
        model="claude-opus-4-7",
        max_tokens=2000,
        messages=[{"role": "user", "content": prompt}],
    )
    print(msg.content[0].text)


if __name__ == "__main__":
    main()
