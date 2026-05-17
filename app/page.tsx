import Link from 'next/link';

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
        Read-only data API for KYRO hackathon participants. Build with your own
        KYRO runs, the public runs of users you follow, and a fully anonymized
        KYRO-wide dataset (k-anonymity preserved).
      </p>

      <Link
        href="/register"
        style={{
          display: 'inline-block',
          padding: '12px 24px',
          background: '#22c55e',
          color: '#0a0a0a',
          fontWeight: 600,
          borderRadius: 8,
          textDecoration: 'none',
          marginBottom: 32,
        }}
      >
        Get my token →
      </Link>

      <h2 style={{ fontSize: 20, marginTop: 32 }}>Endpoints</h2>
      <ul style={{ paddingLeft: 20 }}>
        <li>
          <code>GET /api/v1/runs</code> — your own runs
        </li>
        <li>
          <code>GET /api/v1/runs/:id</code> — run detail (GPS trace + splits)
        </li>
        <li>
          <code>GET /api/v1/friends/runs</code> — runs from people you follow
        </li>
        <li>
          <code>GET /api/v1/aggregates</code> — KYRO-wide anonymous aggregates
        </li>
        <li>
          <code>GET /api/v1/anon-traces</code> — KYRO-wide anonymous trace dataset
        </li>
        <li>
          <code>GET /api/v1/demographics</code> — anonymous user demographics
        </li>
        <li>
          <code>POST /api/mcp</code> — MCP transport (Claude Desktop, Cursor, …)
        </li>
      </ul>

      <p style={{ marginTop: 32, color: '#a1a1aa', fontSize: 14 }}>
        All endpoints are Bearer authenticated. Tokens auto-expire after the
        event.{' '}
        <a
          href="https://github.com/Project-KYRO/kyro-hackathon-mcp"
          style={{ color: '#22c55e' }}
        >
          Full guide + sample code
        </a>
      </p>
    </main>
  );
}
