'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import { getSupabaseBrowser } from '@/lib/supabase-browser';

type Step =
  | 'choose'
  | 'emailSent'
  | 'gate'
  | 'issuing'
  | 'reveal'
  | 'closed'
  | 'nickname';
type Provider = 'apple' | 'google' | 'kakao' | 'email';

interface TokenInfo {
  token: string;
  expires_at: string;
  rest_url: string;
  mcp_url: string;
  mcp_config_snippet: object;
}

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          callback: (token: string) => void;
          'error-callback'?: () => void;
          'expired-callback'?: () => void;
          theme?: 'light' | 'dark' | 'auto';
        },
      ) => string;
      reset: (widgetId?: string) => void;
    };
  }
}

interface RegisterPageProps {
  turnstileSiteKey: string;
  enabledProviders: Provider[];
  registrationOpen: boolean;
}

export function RegisterPageClient({
  turnstileSiteKey,
  enabledProviders,
  registrationOpen,
}: RegisterPageProps) {
  const [step, setStep] = useState<Step>(registrationOpen ? 'choose' : 'closed');
  const [email, setEmail] = useState('');
  const [passcode, setPasscode] = useState('');
  const [consent, setConsent] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [token, setToken] = useState<TokenInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [nickname, setNickname] = useState('');
  const turnstileRef = useRef<HTMLDivElement | null>(null);
  const turnstileWidgetId = useRef<string | null>(null);
  const turnstileEnabled = !!turnstileSiteKey;

  // Detect a returning session from OAuth/email callback.
  useEffect(() => {
    if (!registrationOpen) return;
    const url = new URL(window.location.href);
    const hash = window.location.hash;
    const code = url.searchParams.get('code');
    const errInUrl =
      url.searchParams.get('error') ||
      (hash.includes('error=')
        ? new URLSearchParams(hash.slice(1)).get('error')
        : null);

    if (errInUrl) {
      setError(`Sign-in failed: ${errInUrl}`);
      history.replaceState(null, '', window.location.pathname);
      return;
    }

    const hasOAuthReturn = !!code || hash.includes('access_token=');
    if (!hasOAuthReturn) return;

    (async () => {
      try {
        const supabase = getSupabaseBrowser();
        if (code) {
          const { error: exchErr } = await supabase.auth.exchangeCodeForSession(code);
          if (exchErr) throw exchErr;
        }
        const { data: sess } = await supabase.auth.getSession();
        if (!sess.session) throw new Error('no session after sign-in');
        setHasSession(true);
        setStep('gate');
        history.replaceState(null, '', window.location.pathname);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'sign-in failed');
        setStep('choose');
      }
    })();
  }, [registrationOpen]);

  // Mount the Turnstile widget when the gate step appears.
  const mountTurnstile = useCallback(() => {
    if (!turnstileRef.current || !window.turnstile || turnstileWidgetId.current) return;
    turnstileWidgetId.current = window.turnstile.render(turnstileRef.current, {
      sitekey: turnstileSiteKey,
      theme: 'dark',
      callback: (token) => setTurnstileToken(token),
      'error-callback': () => setTurnstileToken(null),
      'expired-callback': () => setTurnstileToken(null),
    });
  }, [turnstileSiteKey]);

  useEffect(() => {
    if ((step === 'gate' || step === 'nickname') && turnstileEnabled) {
      // Reset previous widget — we re-mount per step entry so the widget appears
      // in whichever form (gate / nickname) is currently shown.
      turnstileWidgetId.current = null;
      const t = setInterval(() => {
        if (window.turnstile) {
          mountTurnstile();
          clearInterval(t);
        }
      }, 100);
      return () => clearInterval(t);
    }
  }, [step, mountTurnstile, turnstileEnabled]);

  async function signIn(provider: Provider) {
    setError(null);
    setBusy(true);
    try {
      const supabase = getSupabaseBrowser();
      const redirectTo = `${window.location.origin}/register`;

      if (provider === 'email') {
        const trimmed = email.trim().toLowerCase();
        if (!trimmed || !trimmed.includes('@')) {
          throw new Error('Enter a valid email address.');
        }
        const { error: otpErr } = await supabase.auth.signInWithOtp({
          email: trimmed,
          options: { shouldCreateUser: false, emailRedirectTo: redirectTo },
        });
        if (otpErr) throw otpErr;
        setStep('emailSent');
      } else {
        const { error: oauthErr } = await supabase.auth.signInWithOAuth({
          provider,
          options: { redirectTo },
        });
        if (oauthErr) throw oauthErr;
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'sign-in failed');
    } finally {
      setBusy(false);
    }
  }

  async function issueToken() {
    setError(null);
    if (!consent) {
      setError('Please confirm consent to continue.');
      return;
    }
    if (!passcode.trim()) {
      setError('Enter the event passcode from the organizer.');
      return;
    }
    if (turnstileEnabled && !turnstileToken) {
      setError('Complete the bot-check first.');
      return;
    }
    setBusy(true);
    setStep('issuing');
    try {
      const supabase = getSupabaseBrowser();
      const { data: sess } = await supabase.auth.getSession();
      const accessToken = sess.session?.access_token;
      if (!accessToken) throw new Error('Session expired. Please sign in again.');

      const headers: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`,
        'x-event-passcode': passcode.trim(),
      };
      if (turnstileEnabled && turnstileToken) {
        headers['x-turnstile-token'] = turnstileToken;
      }
      const res = await fetch('/api/auth/issue-pat', {
        method: 'POST',
        credentials: 'same-origin',
        headers,
      });
      const payload = await res.json();
      if (!res.ok) {
        // Backend returns generic codes — show a user-friendly mapping.
        const msg =
          payload.error === 'registration_closed'
            ? 'Registration is closed.'
            : payload.error === 'no_kyro_profile'
              ? 'No KYRO account found for this sign-in. Make sure you signed in with the same provider as in the KYRO app.'
              : payload.error === 'event_already_ended'
                ? 'The event window has ended.'
                : 'Could not issue token. Verify the passcode + bot-check and try again.';
        throw new Error(msg);
      }
      setToken(payload as TokenInfo);
      setStep('reveal');
      await supabase.auth.signOut();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Issue failed');
      if (window.turnstile && turnstileWidgetId.current) {
        window.turnstile.reset(turnstileWidgetId.current);
        setTurnstileToken(null);
      }
      setStep('gate');
    } finally {
      setBusy(false);
    }
  }

  async function issueByNickname() {
    setError(null);
    if (!nickname.trim()) {
      setError('Enter your KYRO nickname.');
      return;
    }
    if (!passcode.trim()) {
      setError('Enter the event passcode from the organizer.');
      return;
    }
    if (!consent) {
      setError('Please confirm consent to continue.');
      return;
    }
    if (turnstileEnabled && !turnstileToken) {
      setError('Complete the bot-check first.');
      return;
    }
    setBusy(true);
    setStep('issuing');
    try {
      const res = await fetch('/api/auth/issue-by-nickname', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nickname: nickname.trim(),
          passcode: passcode.trim(),
          consent,
          turnstileToken: turnstileEnabled ? turnstileToken : null,
        }),
      });
      const payload = await res.json();
      if (!res.ok) {
        const msg =
          payload.error === 'nickname_not_found'
            ? 'No KYRO user with that nickname. Check spelling — it must be your current nickname (case-sensitive).'
            : payload.error === 'nickname_not_unique'
              ? 'Multiple KYRO users share this nickname (it looks auto-generated). Open the KYRO app, change to a unique nickname, then retry.'
              : payload.error === 'token_already_issued'
                ? 'A token is already active for this KYRO user. Ask the organizer to revoke it before retrying.'
                : payload.error === 'invalid_passcode'
                  ? 'Wrong event passcode. Ask the organizer.'
                  : payload.error === 'turnstile_failed'
                    ? 'Bot-check failed. Refresh and retry.'
                    : payload.error === 'registration_closed'
                      ? 'Registration is closed.'
                      : payload.error === 'event_already_ended'
                        ? 'The event window has ended.'
                        : 'Could not issue token by nickname. Verify your details and retry.';
        throw new Error(msg);
      }
      setToken(payload as TokenInfo);
      setStep('reveal');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Issue failed');
      if (window.turnstile && turnstileWidgetId.current) {
        window.turnstile.reset(turnstileWidgetId.current);
        setTurnstileToken(null);
      }
      setStep('nickname');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {turnstileEnabled && (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js"
          async
          defer
        />
      )}
      <main style={mainStyle}>
        <h1 style={{ fontSize: 28, marginBottom: 8 }}>KYRO Hackathon — Token</h1>
        <p style={{ color: '#a1a1aa', marginBottom: 24, fontSize: 14 }}>
          Sign in with the same provider you use on the KYRO app to receive a
          read-only API token. Tokens auto-expire after the event.
        </p>

        {error && <div style={errorBoxStyle}>{error}</div>}

        {step === 'closed' && (
          <div style={infoBoxStyle}>
            Registration is currently closed. If you believe this is wrong,
            contact the event organizer.
          </div>
        )}

        {step === 'choose' && (
          <>
            <h2 style={sectionHeaderStyle}>Choose your sign-in method</h2>
            <p style={hintStyle}>
              Pick the same method you used to register on the KYRO mobile app.
            </p>

            {enabledProviders.includes('apple') && (
              <ProviderButton
                label="Continue with Apple"
                onClick={() => signIn('apple')}
                disabled={busy}
                color="#000000"
                textColor="#ffffff"
              />
            )}
            {enabledProviders.includes('google') && (
              <ProviderButton
                label="Continue with Google"
                onClick={() => signIn('google')}
                disabled={busy}
                color="#ffffff"
                textColor="#1f1f1f"
              />
            )}
            {enabledProviders.includes('kakao') && (
              <ProviderButton
                label="Continue with Kakao"
                onClick={() => signIn('kakao')}
                disabled={busy}
                color="#FEE500"
                textColor="#000000"
              />
            )}

            {enabledProviders.includes('email') && (
              <>
                <div style={dividerStyle}>or with email</div>
                <label style={labelStyle}>Email used on KYRO</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  style={inputStyle}
                />
                <button
                  onClick={() => signIn('email')}
                  disabled={busy || !email}
                  style={primaryBtnStyle(busy || !email)}
                >
                  {busy ? 'Sending…' : 'Send magic-link email'}
                </button>
              </>
            )}

            <div style={dividerStyle}>trouble signing in?</div>
            <p style={{ ...hintStyle, marginTop: 0 }}>
              <strong style={{ color: '#e4e4e7' }}>
                Apple Hide-My-Email users
              </strong>{' '}
              or anyone whose magic-link email never arrives: use your KYRO
              nickname instead. You&apos;ll need the event passcode from the
              organizer.
            </p>
            <button
              onClick={() => {
                setError(null);
                setStep('nickname');
              }}
              disabled={busy}
              style={{
                ...ghostBtnStyle,
                marginTop: 8,
              }}
            >
              Use my KYRO nickname →
            </button>
          </>
        )}

        {step === 'emailSent' && (
          <>
            <p style={{ color: '#e4e4e7', fontSize: 15 }}>
              We sent a sign-in link to{' '}
              <strong style={{ color: '#f5f5f5' }}>{email}</strong>. Click the
              link in the email to return here and finish issuing your token.
            </p>
            <p style={{ ...hintStyle, marginTop: 16 }}>
              No email? Check spam. The link expires in one hour.
            </p>
            <button
              onClick={() => setStep('choose')}
              style={ghostBtnStyle}
            >
              ← Use a different method
            </button>
          </>
        )}

        {step === 'gate' && (
          <>
            {!hasSession && (
              <div style={infoBoxStyle}>
                Sign-in not detected. Please start from the sign-in step.
              </div>
            )}
            <h2 style={sectionHeaderStyle}>One more step</h2>
            <p style={hintStyle}>Verify the event passcode and bot-check.</p>

            <label style={labelStyle}>Event passcode (from organizer)</label>
            <input
              type="text"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value.toUpperCase())}
              placeholder="e.g. AB23CD"
              maxLength={12}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              style={{ ...inputStyle, letterSpacing: 2, fontFamily: 'monospace' }}
            />

            {turnstileEnabled && (
              <div style={{ marginTop: 20 }} ref={turnstileRef} />
            )}

            <label style={consentLabelStyle}>
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                style={{ marginTop: 4 }}
              />
              <span>
                I agree that, during the event, this token grants read-only
                access to my KYRO data and the public runs of users I follow.
                Tokens auto-expire after the event ends. KYRO-wide anonymized
                datasets (k-anonymity preserved) are also accessible. Data is
                handled per KYRO&apos;s privacy policy and Singapore PDPA
                principles for participant data.
              </span>
            </label>

            <button
              onClick={issueToken}
              disabled={
                busy ||
                !consent ||
                !passcode ||
                (turnstileEnabled && !turnstileToken)
              }
              style={primaryBtnStyle(
                busy ||
                  !consent ||
                  !passcode ||
                  (turnstileEnabled && !turnstileToken),
              )}
            >
              {busy ? 'Issuing…' : 'Issue my token'}
            </button>
          </>
        )}

        {step === 'nickname' && (
          <>
            <h2 style={sectionHeaderStyle}>Issue by KYRO nickname</h2>
            <p style={hintStyle}>
              For Apple Hide-My-Email users and anyone whose magic-link email
              didn&apos;t arrive. Token will be issued directly — make sure
              you&apos;re entering your <em>own</em> current KYRO nickname.
            </p>

            <label style={labelStyle}>Your KYRO nickname</label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="exact current nickname from KYRO app"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              style={inputStyle}
            />
            <p style={{ ...hintStyle, marginTop: 6 }}>
              If your nickname is auto-generated (e.g.{' '}
              <em>날렵한 독수리</em>) and shared with many users, the request
              will be refused. Open the KYRO app and customize it first.
            </p>

            <label style={{ ...labelStyle, marginTop: 16 }}>
              Event passcode (from organizer)
            </label>
            <input
              type="text"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value.toUpperCase())}
              placeholder="e.g. AB23CD"
              maxLength={12}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              style={{ ...inputStyle, letterSpacing: 2, fontFamily: 'monospace' }}
            />

            {turnstileEnabled && (
              <div style={{ marginTop: 20 }} ref={turnstileRef} />
            )}

            <label style={consentLabelStyle}>
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                style={{ marginTop: 4 }}
              />
              <span>
                I confirm this is my own KYRO nickname. I agree that, during the
                event, this token grants read-only access to my KYRO data and
                the public runs of users I follow. Tokens auto-expire after the
                event ends. KYRO-wide anonymized datasets are also accessible.
              </span>
            </label>

            <button
              onClick={issueByNickname}
              disabled={
                busy ||
                !nickname.trim() ||
                !passcode ||
                !consent ||
                (turnstileEnabled && !turnstileToken)
              }
              style={primaryBtnStyle(
                busy ||
                  !nickname.trim() ||
                  !passcode ||
                  !consent ||
                  (turnstileEnabled && !turnstileToken),
              )}
            >
              {busy ? 'Issuing…' : 'Issue my token'}
            </button>

            <button
              onClick={() => {
                setError(null);
                setStep('choose');
              }}
              style={ghostBtnStyle}
            >
              ← Back to sign-in options
            </button>
          </>
        )}

        {step === 'issuing' && <p style={{ color: '#a1a1aa' }}>Issuing your token…</p>}

        {step === 'reveal' && token && (
          <div>
            <div style={successBoxStyle}>
              ✓ Token issued. This is the only time you&apos;ll see the full
              token — copy it now.
            </div>

            <label style={labelStyle}>Token</label>
            <code style={codeStyle}>{token.token}</code>
            <CopyBtn text={token.token} />

            <label style={{ ...labelStyle, marginTop: 24 }}>Expires</label>
            <div style={{ fontSize: 14, color: '#a1a1aa' }}>{token.expires_at}</div>

            <label style={{ ...labelStyle, marginTop: 24 }}>REST endpoint</label>
            <code style={codeStyle}>{token.rest_url}</code>

            <label style={{ ...labelStyle, marginTop: 16 }}>MCP endpoint</label>
            <code style={codeStyle}>{token.mcp_url}</code>

            <label style={{ ...labelStyle, marginTop: 24 }}>
              Claude Desktop config
            </label>
            <pre style={preStyle}>
              {JSON.stringify(token.mcp_config_snippet, null, 2)}
            </pre>
            <CopyBtn
              text={JSON.stringify(token.mcp_config_snippet, null, 2)}
              label="Copy config"
            />

            <label style={{ ...labelStyle, marginTop: 24 }}>cURL example</label>
            <pre style={preStyle}>
              {`curl -H "Authorization: Bearer ${token.token}" \\\n  ${token.rest_url}/runs?limit=10`}
            </pre>

            <p style={{ marginTop: 32, color: '#a1a1aa', fontSize: 13 }}>
              Guide + sample code:{' '}
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
    </>
  );
}

function ProviderButton({
  label,
  onClick,
  disabled,
  color,
  textColor,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  color: string;
  textColor: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%',
        padding: '12px 16px',
        background: color,
        color: textColor,
        border: '1px solid #27272a',
        borderRadius: 8,
        fontWeight: 600,
        fontSize: 15,
        cursor: disabled ? 'not-allowed' : 'pointer',
        marginTop: 8,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {label}
    </button>
  );
}

function CopyBtn({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      style={{
        ...primaryBtnStyle(false),
        marginTop: 8,
        background: copied ? '#16a34a' : '#27272a',
        color: '#f5f5f5',
      }}
    >
      {copied ? '✓ Copied' : label}
    </button>
  );
}

const mainStyle: React.CSSProperties = {
  maxWidth: 520,
  margin: '0 auto',
  padding: '64px 24px',
  lineHeight: 1.6,
};

const sectionHeaderStyle: React.CSSProperties = {
  fontSize: 16,
  marginTop: 24,
  marginBottom: 4,
  color: '#f5f5f5',
};

const hintStyle: React.CSSProperties = {
  color: '#a1a1aa',
  fontSize: 13,
  marginBottom: 12,
};

const dividerStyle: React.CSSProperties = {
  textAlign: 'center',
  color: '#52525b',
  fontSize: 12,
  margin: '20px 0 8px',
  textTransform: 'uppercase',
  letterSpacing: 1,
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  color: '#a1a1aa',
  marginBottom: 6,
  marginTop: 12,
  textTransform: 'uppercase',
  letterSpacing: 1,
};

const consentLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  margin: '20px 0',
  fontSize: 13,
  color: '#a1a1aa',
  lineHeight: 1.5,
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

const inlineCode: React.CSSProperties = {
  background: '#27272a',
  color: '#86efac',
  padding: '1px 6px',
  borderRadius: 4,
  fontSize: 12,
  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
};

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

const primaryBtnStyle = (disabled: boolean): React.CSSProperties => ({
  width: '100%',
  padding: '12px 16px',
  background: disabled ? '#27272a' : '#22c55e',
  color: disabled ? '#71717a' : '#0a0a0a',
  border: 'none',
  borderRadius: 8,
  fontWeight: 600,
  fontSize: 15,
  cursor: disabled ? 'not-allowed' : 'pointer',
  marginTop: 16,
});

const ghostBtnStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 16px',
  background: 'transparent',
  color: '#a1a1aa',
  border: '1px solid #27272a',
  borderRadius: 8,
  fontWeight: 500,
  fontSize: 14,
  cursor: 'pointer',
  marginTop: 24,
};

const errorBoxStyle: React.CSSProperties = {
  background: '#7f1d1d',
  color: '#fecaca',
  padding: '10px 14px',
  borderRadius: 6,
  marginBottom: 16,
  fontSize: 14,
  wordBreak: 'break-word',
};

const infoBoxStyle: React.CSSProperties = {
  background: '#1e3a8a',
  color: '#bfdbfe',
  padding: '10px 14px',
  borderRadius: 6,
  marginBottom: 16,
  fontSize: 14,
};

const successBoxStyle: React.CSSProperties = {
  background: '#052e16',
  color: '#86efac',
  padding: '12px 16px',
  borderRadius: 8,
  marginBottom: 24,
  fontSize: 14,
};
