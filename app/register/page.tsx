'use client';

import { useEffect, useState } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase-browser';

type Step = 'email' | 'sent' | 'reveal' | 'issuing';

interface TokenInfo {
  token: string;
  expires_at: string;
  rest_url: string;
  mcp_url: string;
  mcp_config_snippet: object;
}

export default function RegisterPage() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [token, setToken] = useState<TokenInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Magic link 클릭 후 hackathon.kyro.team/register 로 redirect 됐을 때:
  //   - PKCE flow → ?code=xxx in query string (supabase-js newer default)
  //   - Implicit flow → #access_token=...&refresh_token=... in fragment
  // 둘 다 잡고 token 추출.
  useEffect(() => {
    const url = new URL(window.location.href);
    const hash = window.location.hash;
    const code = url.searchParams.get('code');
    const errInUrl =
      url.searchParams.get('error') ||
      (hash.includes('error=')
        ? new URLSearchParams(hash.slice(1)).get('error')
        : null);

    if (errInUrl) {
      setError(`auth redirect error: ${errInUrl}`);
      history.replaceState(null, '', window.location.pathname);
      return;
    }

    if (!code && !hash.includes('access_token=')) return;

    (async () => {
      setStep('issuing');
      setBusy(true);
      try {
        const supabase = getSupabaseBrowser();
        let accessToken: string | undefined;

        if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(
            code
          );
          if (error) throw error;
          accessToken = data.session?.access_token;
        } else {
          const { data: sess } = await supabase.auth.getSession();
          accessToken = sess.session?.access_token;
          if (!accessToken) {
            const params = new URLSearchParams(hash.slice(1));
            accessToken = params.get('access_token') || undefined;
          }
        }

        if (!accessToken) throw new Error('no_session_after_redirect');

        const res = await fetch('/api/auth/issue-pat', {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error || 'issue_failed');
        setToken(payload as TokenInfo);
        setStep('reveal');

        await supabase.auth.signOut();
        history.replaceState(null, '', window.location.pathname);
      } catch (e: any) {
        setError(e?.message || '인증 처리 실패');
        setStep('email');
      } finally {
        setBusy(false);
      }
    })();
  }, []);

  async function requestMagicLink() {
    if (!consent) {
      setError('약관 동의가 필요합니다.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const supabase = getSupabaseBrowser();
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: {
          shouldCreateUser: false,
          emailRedirectTo: `${window.location.origin}/register`,
        },
      });
      if (error) throw error;
      setStep('sent');
    } catch (e: any) {
      setError(e?.message || '메일 발송 실패');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      style={{
        maxWidth: 520,
        margin: '0 auto',
        padding: '64px 24px',
        lineHeight: 1.6,
      }}
    >
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>토큰 발급</h1>
      <p style={{ color: '#a1a1aa', marginBottom: 32, fontSize: 14 }}>
        KYRO 가입 email 의 인증 메일 링크를 클릭하면 자동 발급. 토큰은 한 번만
        보여요 — 발급 직후 복사해 두세요.
      </p>

      {error && (
        <div
          style={{
            background: '#7f1d1d',
            color: '#fecaca',
            padding: '8px 12px',
            borderRadius: 6,
            marginBottom: 16,
            fontSize: 14,
            wordBreak: 'break-word',
          }}
        >
          {error}
        </div>
      )}

      {step === 'email' && (
        <>
          <label style={labelStyle}>KYRO 가입 email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={inputStyle}
          />

          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              margin: '24px 0',
              fontSize: 13,
              color: '#a1a1aa',
            }}
          >
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              style={{ marginTop: 4 }}
            />
            <span>
              행사 기간 동안 본인 KYRO 데이터 + 본인이 follow 한 사용자의 공개
              러닝 데이터를 read API 로 access 함에 동의합니다. 토큰은 행사 종료
              +24h 에 자동 만료되며, KYRO 전체 익명 데이터셋 (식별 불가 처리) 에도
              access 합니다.
            </span>
          </label>

          <button
            onClick={requestMagicLink}
            disabled={busy || !email || !consent}
            style={btnStyle(busy || !email || !consent)}
          >
            {busy ? '발송 중...' : '인증 링크 메일 받기'}
          </button>
        </>
      )}

      {step === 'sent' && (
        <>
          <p style={{ color: '#a1a1aa', fontSize: 14 }}>
            <strong style={{ color: '#f5f5f5' }}>{email}</strong> 으로 인증 메일을
            보냈습니다. 메일의 <strong>"Log In"</strong> 또는{' '}
            <strong>"Confirm"</strong> 링크를 누르면 자동으로 이 페이지로 돌아와
            토큰이 발급됩니다.
          </p>
          <p style={{ color: '#71717a', fontSize: 13, marginTop: 16 }}>
            메일이 안 보이면 스팸 폴더도 확인해 주세요. 한 시간 안에 클릭하지
            않으면 만료돼요.
          </p>
          <button
            onClick={() => setStep('email')}
            style={{
              ...btnStyle(false),
              background: 'transparent',
              color: '#a1a1aa',
              border: '1px solid #27272a',
              marginTop: 24,
            }}
          >
            ← email 다시 입력
          </button>
        </>
      )}

      {step === 'issuing' && (
        <p style={{ color: '#a1a1aa' }}>인증 처리 중... 잠시만요.</p>
      )}

      {step === 'reveal' && token && (
        <div>
          <div
            style={{
              background: '#052e16',
              color: '#86efac',
              padding: '12px 16px',
              borderRadius: 8,
              marginBottom: 24,
              fontSize: 14,
            }}
          >
            ✓ 발급 완료. 이 화면 닫으면 토큰을 다시 볼 수 없습니다.
          </div>

          <label style={labelStyle}>Token</label>
          <code style={codeStyle}>{token.token}</code>
          <CopyBtn text={token.token} />

          <label style={{ ...labelStyle, marginTop: 24 }}>만료</label>
          <div style={{ fontSize: 14, color: '#a1a1aa' }}>{token.expires_at}</div>

          <label style={{ ...labelStyle, marginTop: 24 }}>REST endpoint</label>
          <code style={codeStyle}>{token.rest_url}</code>

          <label style={{ ...labelStyle, marginTop: 16 }}>MCP endpoint</label>
          <code style={codeStyle}>{token.mcp_url}</code>

          <label style={{ ...labelStyle, marginTop: 24 }}>
            Claude Desktop 설정
          </label>
          <pre style={preStyle}>
            {JSON.stringify(token.mcp_config_snippet, null, 2)}
          </pre>
          <CopyBtn
            text={JSON.stringify(token.mcp_config_snippet, null, 2)}
            label="설정 복사"
          />

          <label style={{ ...labelStyle, marginTop: 24 }}>cURL 예시</label>
          <pre style={preStyle}>
            {`curl -H "Authorization: Bearer ${token.token}" \\\n  ${token.rest_url}/runs?limit=10`}
          </pre>

          <p style={{ marginTop: 32, color: '#a1a1aa', fontSize: 13 }}>
            가이드 + 예제 코드:{' '}
            <a
              href="https://github.com/Project-KYRO/kyro-hackathon-mcp"
              style={{ color: '#22c55e' }}
            >
              GitHub README
            </a>
          </p>
        </div>
      )}
    </main>
  );
}

function CopyBtn({ text, label = '복사' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      style={{
        ...btnStyle(false),
        marginTop: 8,
        background: copied ? '#16a34a' : '#27272a',
        color: '#f5f5f5',
      }}
    >
      {copied ? '✓ 복사됨' : label}
    </button>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  color: '#a1a1aa',
  marginBottom: 6,
  marginTop: 12,
  textTransform: 'uppercase',
  letterSpacing: 1,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  background: '#18181b',
  border: '1px solid #27272a',
  borderRadius: 8,
  color: '#f5f5f5',
  fontSize: 16,
  boxSizing: 'border-box',
};

const btnStyle = (disabled: boolean): React.CSSProperties => ({
  width: '100%',
  padding: '12px 16px',
  background: disabled ? '#27272a' : '#22c55e',
  color: disabled ? '#71717a' : '#0a0a0a',
  border: 'none',
  borderRadius: 8,
  fontWeight: 600,
  fontSize: 15,
  cursor: disabled ? 'not-allowed' : 'pointer',
  marginTop: 12,
});

const codeStyle: React.CSSProperties = {
  display: 'block',
  background: '#18181b',
  border: '1px solid #27272a',
  borderRadius: 8,
  padding: 12,
  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
  fontSize: 13,
  wordBreak: 'break-all',
  color: '#22c55e',
};

const preStyle: React.CSSProperties = {
  ...codeStyle,
  whiteSpace: 'pre-wrap',
  color: '#f5f5f5',
};
