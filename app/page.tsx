export default function Home() {
  return (
    <main
      style={{
        maxWidth: 720,
        margin: '0 auto',
        padding: '64px 24px',
        lineHeight: 1.6,
      }}
    >
      <h1 style={{ fontSize: 32, marginBottom: 8 }}>KYRO Hackathon API</h1>
      <p style={{ color: '#a1a1aa', marginBottom: 32 }}>
        2026-05-10 캐주얼 해커톤용 read-only 데이터 API. 본인의 KYRO 러닝 + 친구
        러닝 + KYRO 전체 익명 통계·trace 데이터를 가져갈 수 있습니다.
      </p>

      <h2 style={{ fontSize: 20, marginTop: 32 }}>토큰 발급</h2>
      <p style={{ color: '#a1a1aa' }}>
        토큰은 행사장에서 운영자가 직접 카톡/이메일로 회신해 드립니다. 등록한 email 의
        KYRO 가입을 미리 완료해 두세요.
      </p>

      <h2 style={{ fontSize: 20, marginTop: 32 }}>Endpoint</h2>
      <ul style={{ paddingLeft: 20 }}>
        <li>
          <code>GET /api/v1/runs</code> — 본인 러닝 목록
        </li>
        <li>
          <code>GET /api/v1/runs/:id</code> — 러닝 상세 (GPS trace + splits)
        </li>
        <li>
          <code>GET /api/v1/friends/runs</code> — 친구 러닝 목록
        </li>
        <li>
          <code>GET /api/v1/aggregates</code> — KYRO 전체 익명 집계
        </li>
        <li>
          <code>GET /api/v1/anon-traces</code> — KYRO 전체 익명 trace
        </li>
        <li>
          <code>POST /api/mcp</code> — MCP transport (Claude Desktop 등)
        </li>
      </ul>

      <p style={{ marginTop: 32, color: '#a1a1aa', fontSize: 14 }}>
        모든 endpoint Bearer 인증. 토큰 만료: 행사 종료 +24h. 가이드 + 예제:{' '}
        <a
          href="https://github.com/Project-KYRO/kyro-hackathon-mcp"
          style={{ color: '#22c55e' }}
        >
          GitHub README
        </a>
      </p>
    </main>
  );
}
