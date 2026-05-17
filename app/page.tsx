import Link from 'next/link';

export const metadata = {
  title: 'KYRO Hackathon API — build with running data',
  description:
    'Read-only data API for KYRO hackathon participants. Build AI coaches, route visualizations, training analytics, generative art — whatever you can imagine.',
};

export default function Home() {
  return (
    <main style={pageStyle}>
      {/* Hero */}
      <section style={heroStyle}>
        <h1 style={heroTitleStyle}>KYRO Hackathon API</h1>
        <p style={heroSubtitleStyle}>
          Build whatever you want with running data — your own, your
          friends&apos;, and the entire KYRO community (fully anonymized).
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link href="/register" style={primaryCtaStyle}>
            Get my token →
          </Link>
          <a href="#quickstart" style={secondaryCtaStyle}>
            How it works
          </a>
        </div>
      </section>

      {/* What you can access */}
      <Section title="What you can access" id="data">
        <div style={cardGridStyle}>
          <Card
            emoji="🏃"
            title="Your own runs (full detail)"
            body="Every run you've recorded on KYRO — GPS track, per-km splits with pace and elevation, distance, duration, calories, territory captured/stolen, location metadata, titles and notes."
          />
          <Card
            emoji="👥"
            title="Friends' public runs"
            body={
              <>
                Runs from people you follow, filtered by each run&apos;s audience
                rule (<code style={inlineCodeStyle}>public</code> /{' '}
                <code style={inlineCodeStyle}>follower</code> /{' '}
                <code style={inlineCodeStyle}>mutual_friend</code>) — exactly
                what you&apos;d see in the KYRO app.
              </>
            }
          />
          <Card
            emoji="🌍"
            title="KYRO-wide anonymized data"
            body="90-day activity histograms (hour, day-of-week, distance, pace), region distribution, anonymous user demographics (share-only, k≥5), plus a fully k-anonymized GPS trace dataset for spatial analysis."
          />
        </div>
      </Section>

      {/* Quick start */}
      <Section title="Get started" id="quickstart">
        <ol style={stepListStyle}>
          <li>
            <strong>Install KYRO</strong> on your phone and sign up.
          </li>
          <li>
            Open the app → <strong>My Page → Settings</strong> → set your
            default run audience to <strong>Public</strong> (so other
            participants can include your runs in their friend feeds).
          </li>
          <li>
            Follow the other event participants in the KYRO app, and record at
            least one warm-up run (10 minutes is enough).
          </li>
          <li>
            Get the <strong>event passcode</strong> from the organizer (shared
            at the venue).
          </li>
          <li>
            Click <Link href="/register" style={inlineLinkStyle}>Get my token</Link>
            , pick your KYRO sign-in method, paste the passcode — done.
          </li>
        </ol>
        <p style={mutedStyle}>
          Token reveal is one-time only. Copy it immediately. If you lose it,
          ask the organizer to revoke + reissue.
        </p>
      </Section>

      {/* Endpoints */}
      <Section title="Endpoints" id="endpoints">
        <p style={mutedStyle}>
          All endpoints use{' '}
          <code style={inlineCodeStyle}>Authorization: Bearer kyro_pat_…</code>{' '}
          and return JSON.
        </p>
        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Path</th>
                <th style={thStyle}>Description</th>
              </tr>
            </thead>
            <tbody>
              <EndpointRow
                method="GET"
                path="/api/v1/runs?limit=50&cursor=…"
                desc="Your own runs (most recent first). Cursor = ISO timestamp of last seen run."
              />
              <EndpointRow
                method="GET"
                path="/api/v1/runs/:id"
                desc="Single run with full GPS track (GeoJSON LineString) and per-km splits."
              />
              <EndpointRow
                method="GET"
                path="/api/v1/friends/runs?limit=50&cursor=…"
                desc="Runs from KYRO users you follow, filtered by each run's audience rule."
              />
              <EndpointRow
                method="GET"
                path="/api/v1/aggregates"
                desc="KYRO-wide anonymous activity histograms (last 90 days). No PII."
              />
              <EndpointRow
                method="GET"
                path="/api/v1/anon-traces?limit=100&region=Singapore"
                desc="K-anonymized GPS trace dataset. Endpoints clipped, coordinates grid-rounded, k≥3 by hour+region."
              />
              <EndpointRow
                method="GET"
                path="/api/v1/demographics"
                desc="Anonymous gender + age band distribution (share only, k≥5)."
              />
              <EndpointRow
                method="POST"
                path="/api/mcp"
                desc="MCP transport — point Claude Desktop / Cursor here for natural-language access."
              />
            </tbody>
          </table>
        </div>
      </Section>

      {/* Examples */}
      <Section title="Code examples" id="examples">
        <h3 style={subHeaderStyle}>cURL</h3>
        <pre style={codeBlockStyle}>{`TOKEN=kyro_pat_xxxxxxxxxx
BASE=https://kyro-hackathon-mcp.vercel.app

# Your runs
curl -H "Authorization: Bearer $TOKEN" \\
  "$BASE/api/v1/runs?limit=10"

# A specific run (with GPS trace + splits)
curl -H "Authorization: Bearer $TOKEN" \\
  "$BASE/api/v1/runs/01HX..."

# KYRO-wide aggregates
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/aggregates"

# Anonymized trace dataset (good for ML / route discovery)
curl -H "Authorization: Bearer $TOKEN" \\
  "$BASE/api/v1/anon-traces?limit=50&region=Singapore"`}</pre>

        <h3 style={subHeaderStyle}>Python</h3>
        <pre style={codeBlockStyle}>{`import requests

TOKEN = "kyro_pat_xxxxxxxxxx"
BASE  = "https://kyro-hackathon-mcp.vercel.app"
H     = {"Authorization": f"Bearer {TOKEN}"}

# Recent runs
runs = requests.get(f"{BASE}/api/v1/runs?limit=20", headers=H).json()["runs"]
print(f"You have {len(runs)} recent runs")

# Pull pace + elevation per km for your most recent run
detail = requests.get(f"{BASE}/api/v1/runs/{runs[0]['id']}", headers=H).json()
for s in detail["splits"]:
    print(f"km {s['split_index']:>2}  "
          f"pace {s['avg_pace_s_km']:>4}s/km  "
          f"+{s['elevation_gain_m']}m / -{s['elevation_loss_m']}m")`}</pre>

        <h3 style={subHeaderStyle}>JavaScript / TypeScript</h3>
        <pre style={codeBlockStyle}>{`const TOKEN = "kyro_pat_xxxxxxxxxx";
const BASE  = "https://kyro-hackathon-mcp.vercel.app";

const headers = { Authorization: \`Bearer \${TOKEN}\` };

// Anonymized trace dataset for spatial analysis
const traces = await fetch(
  \`\${BASE}/api/v1/anon-traces?limit=100&region=Singapore\`,
  { headers },
).then(r => r.json());

for (const t of traces.traces) {
  console.log(t.place_region_label, t.distance_m_binned, t.simplified_line_clipped_grid);
}`}</pre>

        <h3 style={subHeaderStyle}>Claude Desktop / Cursor — natural language</h3>
        <p style={mutedStyle}>
          Save this to your MCP config — macOS:{' '}
          <code style={inlineCodeStyle}>
            ~/Library/Application Support/Claude/claude_desktop_config.json
          </code>
          , Windows:{' '}
          <code style={inlineCodeStyle}>
            %APPDATA%\\Claude\\claude_desktop_config.json
          </code>
          . Restart Claude Desktop after.
        </p>
        <pre style={codeBlockStyle}>{`{
  "mcpServers": {
    "kyro": {
      "url": "https://kyro-hackathon-mcp.vercel.app/api/mcp",
      "headers": {
        "Authorization": "Bearer kyro_pat_xxxxxxxxxx"
      }
    }
  }
}`}</pre>
        <p style={mutedStyle}>
          Then talk to it in plain English: <em>&quot;Analyze my pace
          trends from the last month&quot;</em>,{' '}
          <em>&quot;What time of day is most popular for KYRO runners in
          Singapore?&quot;</em>, <em>&quot;Find the most-repeated routes near
          Marina Bay.&quot;</em>
        </p>
      </Section>

      {/* Build ideas */}
      <Section title="Build something cool" id="ideas">
        <div style={ideaGridStyle}>
          <Idea title="AI running coach">
            Feed a few weeks of your runs to Claude/GPT. Ask it to find pacing
            patterns, suggest workouts, flag overreaching weeks.
          </Idea>
          <Idea title="Popular route discovery">
            Cluster the anonymized trace dataset by start-grid + bearing. Find
            the most-run loops in any region.
          </Idea>
          <Idea title="Beginner course recommender">
            Filter anonymized traces by distance &lt; 5km, low elevation,
            high repetition. Surface starter-friendly routes near you.
          </Idea>
          <Idea title="Pace-drop heatmap">
            Use per-km splits across many runs to find where runners
            consistently slow down. Hills? Traffic? Elevation? Map it.
          </Idea>
          <Idea title="Trace pattern clustering">
            Train a small ML model on simplified geometries — out-and-back vs
            loop vs grid. What archetypes exist?
          </Idea>
          <Idea title="Run-to-music generator">
            Map elevation profile to melody, pace to tempo. Turn your run into
            a song.
          </Idea>
          <Idea title="Territory strategy game">
            Use friends&apos; runs + your own to predict where to run next for
            maximum territory capture.
          </Idea>
          <Idea title="Anything else">
            Show us. The data is yours for the day.
          </Idea>
        </div>
      </Section>

      {/* Rules / privacy */}
      <Section title="Rules + privacy" id="rules">
        <ul style={ruleListStyle}>
          <li>
            Everything is <strong>read-only</strong>. KYRO data cannot be
            modified through this API.
          </li>
          <li>
            Per-token rate limit: 60 requests/minute, 5,000 requests/day (when
            provisioned).
          </li>
          <li>
            Tokens auto-expire after the event window closes. Lost tokens can
            be reissued by the organizer.
          </li>
          <li>
            HR / cadence / photos / raw GPS sample files are{' '}
            <strong>not</strong> exposed (Garmin Developer Program compliance +
            privacy).
          </li>
          <li>
            Anonymized traces are k≥3 anonymized (hour + region cohort,
            endpoint 5–95% clip, 50m grid round, daily run_id randomization).
            They&apos;re unlinkable to users.
          </li>
          <li>
            <strong>Do not attempt</strong> to re-identify users from
            anonymized data, and don&apos;t share data you received via your
            own token with third parties.
          </li>
          <li>
            Cross-border note: this API runs in Singapore (Vercel{' '}
            <code style={inlineCodeStyle}>sin1</code>) and reads from a
            Supabase project in Seoul (
            <code style={inlineCodeStyle}>ap-northeast-2</code>). Participant
            data is handled per KYRO&apos;s privacy policy and Singapore PDPA
            principles.
          </li>
        </ul>
      </Section>

      {/* Help */}
      <Section title="Need help?" id="help">
        <ul style={helpListStyle}>
          <li>
            <strong>Don&apos;t have the event passcode?</strong> Ask the
            organizer at the venue.
          </li>
          <li>
            <strong>Magic-link email never arrives?</strong> Use the{' '}
            <Link href="/register" style={inlineLinkStyle}>
              &quot;Use my KYRO nickname&quot;
            </Link>{' '}
            path on the register page. Also the recommended path for{' '}
            <strong>Apple Hide-My-Email</strong> users.
          </li>
          <li>
            <strong>Using the nickname path?</strong> You{' '}
            <strong>must</strong> first open the KYRO app and update your
            nickname there:{' '}
            <strong>
              My Activity (내 활동) → Settings (설정) → Edit My Info (내 정보
              수정)
            </strong>
            . Tap <strong>Check duplicate (중복 확인)</strong> — it must show
            the nickname is available. This applies to everyone using the
            nickname path, not only auto-generated nicknames (e.g.{' '}
            <em>날렵한 독수리</em>) which are shared by many users.
          </li>
          <li>
            <strong>Anything else broken?</strong> Ping the organizer. We can
            issue tokens manually if your account hits an edge case.
          </li>
          <li>
            <strong>Source code + extended examples:</strong>{' '}
            <a
              href="https://github.com/Project-KYRO/kyro-hackathon-mcp"
              style={inlineLinkStyle}
            >
              github.com/Project-KYRO/kyro-hackathon-mcp
            </a>
          </li>
        </ul>
      </Section>

      {/* Footer CTA */}
      <section style={{ ...heroStyle, paddingTop: 32, paddingBottom: 64 }}>
        <h2 style={{ fontSize: 24, marginBottom: 12 }}>Ready to build?</h2>
        <Link href="/register" style={primaryCtaStyle}>
          Get my token →
        </Link>
      </section>
    </main>
  );
}

function Section({
  title,
  id,
  children,
}: {
  title: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} style={sectionStyle}>
      <h2 style={sectionTitleStyle}>{title}</h2>
      {children}
    </section>
  );
}

function Card({
  emoji,
  title,
  body,
}: {
  emoji: string;
  title: string;
  body: React.ReactNode;
}) {
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>{emoji}</div>
      <h3 style={cardTitleStyle}>{title}</h3>
      <p style={cardBodyStyle}>{body}</p>
    </div>
  );
}

function Idea({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={ideaStyle}>
      <h3 style={ideaTitleStyle}>{title}</h3>
      <p style={ideaBodyStyle}>{children}</p>
    </div>
  );
}

function EndpointRow({
  method,
  path,
  desc,
}: {
  method: 'GET' | 'POST';
  path: string;
  desc: string;
}) {
  return (
    <tr>
      <td style={tdStyle}>
        <span
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            borderRadius: 4,
            background: method === 'GET' ? '#1e3a8a' : '#7c2d12',
            color: method === 'GET' ? '#bfdbfe' : '#fed7aa',
            fontSize: 11,
            fontWeight: 600,
            marginRight: 8,
            verticalAlign: 'middle',
          }}
        >
          {method}
        </span>
        <code
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular, monospace',
            fontSize: 13,
            color: '#86efac',
            wordBreak: 'break-all',
          }}
        >
          {path}
        </code>
      </td>
      <td style={{ ...tdStyle, color: '#a1a1aa', fontSize: 14 }}>{desc}</td>
    </tr>
  );
}

const pageStyle: React.CSSProperties = {
  maxWidth: 880,
  margin: '0 auto',
  padding: '48px 24px 96px',
  lineHeight: 1.65,
};

const heroStyle: React.CSSProperties = {
  padding: '48px 0 24px',
  borderBottom: '1px solid #1f1f23',
  marginBottom: 8,
};

const heroTitleStyle: React.CSSProperties = {
  fontSize: 40,
  margin: '0 0 12px',
  letterSpacing: -0.5,
};

const heroSubtitleStyle: React.CSSProperties = {
  fontSize: 18,
  color: '#a1a1aa',
  marginBottom: 28,
  maxWidth: 640,
};

const primaryCtaStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '12px 22px',
  background: '#22c55e',
  color: '#0a0a0a',
  fontWeight: 600,
  borderRadius: 8,
  textDecoration: 'none',
  fontSize: 15,
};

const secondaryCtaStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '12px 22px',
  background: 'transparent',
  color: '#e4e4e7',
  fontWeight: 500,
  borderRadius: 8,
  border: '1px solid #3f3f46',
  textDecoration: 'none',
  fontSize: 15,
};

const sectionStyle: React.CSSProperties = {
  padding: '40px 0 8px',
  borderBottom: '1px solid #1f1f23',
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 22,
  margin: '0 0 18px',
};

const subHeaderStyle: React.CSSProperties = {
  fontSize: 14,
  color: '#a1a1aa',
  marginTop: 24,
  marginBottom: 8,
  textTransform: 'uppercase',
  letterSpacing: 1.2,
};

const cardGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
  gap: 16,
};

const cardStyle: React.CSSProperties = {
  background: '#18181b',
  border: '1px solid #27272a',
  borderRadius: 12,
  padding: 20,
};

const cardTitleStyle: React.CSSProperties = {
  fontSize: 15,
  margin: '0 0 8px',
  color: '#f5f5f5',
};

const cardBodyStyle: React.CSSProperties = {
  fontSize: 13.5,
  color: '#a1a1aa',
  margin: 0,
  lineHeight: 1.55,
};

const stepListStyle: React.CSSProperties = {
  paddingLeft: 24,
  color: '#e4e4e7',
  fontSize: 15,
  margin: '0 0 12px',
};

const mutedStyle: React.CSSProperties = {
  color: '#a1a1aa',
  fontSize: 13.5,
  marginTop: 8,
};

const tableWrapStyle: React.CSSProperties = {
  border: '1px solid #27272a',
  borderRadius: 10,
  overflowX: 'auto',
  marginTop: 8,
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 14,
};

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 14px',
  background: '#18181b',
  color: '#a1a1aa',
  fontWeight: 500,
  fontSize: 12,
  textTransform: 'uppercase',
  letterSpacing: 1,
  borderBottom: '1px solid #27272a',
};

const tdStyle: React.CSSProperties = {
  padding: '10px 14px',
  borderBottom: '1px solid #1f1f23',
  verticalAlign: 'top',
};

const codeBlockStyle: React.CSSProperties = {
  background: '#0f0f12',
  border: '1px solid #27272a',
  borderRadius: 10,
  padding: 16,
  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
  fontSize: 13,
  color: '#e4e4e7',
  overflowX: 'auto',
  marginTop: 4,
  whiteSpace: 'pre',
};

const inlineCodeStyle: React.CSSProperties = {
  background: '#1f1f23',
  color: '#86efac',
  padding: '2px 6px',
  borderRadius: 4,
  fontSize: 12.5,
  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
};

const inlineLinkStyle: React.CSSProperties = {
  color: '#22c55e',
  textDecoration: 'underline',
  textDecorationColor: '#15803d',
  textUnderlineOffset: 3,
};

const ideaGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 12,
};

const ideaStyle: React.CSSProperties = {
  background: '#18181b',
  border: '1px solid #27272a',
  borderRadius: 10,
  padding: 16,
};

const ideaTitleStyle: React.CSSProperties = {
  fontSize: 14,
  margin: '0 0 6px',
  color: '#f5f5f5',
};

const ideaBodyStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#a1a1aa',
  margin: 0,
  lineHeight: 1.55,
};

const ruleListStyle: React.CSSProperties = {
  paddingLeft: 20,
  color: '#e4e4e7',
  fontSize: 14.5,
  margin: 0,
  lineHeight: 1.7,
};

const helpListStyle: React.CSSProperties = {
  paddingLeft: 20,
  color: '#e4e4e7',
  fontSize: 14.5,
  margin: 0,
  lineHeight: 1.8,
};
