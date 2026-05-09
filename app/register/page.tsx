'use client';

import { useState } from 'react';

type Step = 'email' | 'otp' | 'reveal' | 'sent';

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
  const [otp, setOtp] = useState('');
  const [token, setToken] = useState<TokenInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function requestOtp() {
    if (!consent) {
      setError('약관에 동의해야 발급 가능합니다.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, consent: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'request_failed');
      setStep('otp');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'verify_failed');
      setToken(json);
      setStep('reveal');
    } catch (e: any) {
      setError(e.message);
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
        KYRO 가입 email 로 OTP 인증 후 1회 발급. 토큰은 다시 볼 수 없으니 발급 직후 복사하세요.
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
              행사 기간 동안 본인 KYRO 데이터 + 본인이 follow 한 사용자의 공개 러닝 데이터를
              read API 로 access 함에 동의합니다. 토큰은 행사 종료 +24h 에 자동 만료되며,
              KYRO 전체 익명 데이터셋(식별 불가 처리)에도 access 합니다.
            </span>
          </label>

          <button
            onClick={requestOtp}
            disabled={busy || !email || !consent}
            style={btnStyle(busy || !email || !consent)}
          >
            {busy ? '발송 중...' : '인증 코드 메일 받기'}
          </button>
        </>
      )}

      {step === 'otp' && (
        <>
          <p style={{ color: '#a1a1aa', fontSize: 14 }}>
            <strong style={{ color: '#f5f5f5' }}>{email}</strong> 으로 6자리 코드 발송 (10분 만료).
          </p>
          <label style={labelStyle}>6자리 코드</label>
          <input
            type="text"
            inputMode="numeric"
            pattern="\d{6}"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            style={{ ...inputStyle, letterSpacing: 8, textAlign: 'center', fontSize: 24 }}
          />
          <button
            onClick={verifyOtp}
            disabled={busy || otp.length !== 6}
            style={btnStyle(busy || otp.length !== 6)}
          >
            {busy ? '인증 중...' : '인증'}
          </button>
          <button
            onClick={() => setStep('email')}
            style={{
              ...btnStyle(false),
              background: 'transparent',
              color: '#a1a1aa',
              border: '1px solid #27272a',
              marginTop: 8,
            }}
          >
            ← email 다시 입력
          </button>
        </>
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
            Claude Desktop 설정 (~/Library/Application Support/Claude/claude_desktop_config.json)
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
