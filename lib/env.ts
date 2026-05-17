// Centralized env access with descriptive errors.
//
// Two reasons this file exists:
//   1. Each call site doesn't repeat the `Missing X — set in Doppler` boilerplate.
//   2. A misconfigured deploy fails loud on the first request, not silently later.
//
// Public-prefixed values are inlined at build time by Next so they must literally
// reference `process.env.NEXT_PUBLIC_*` (no dynamic key indirection).

function need(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing required env: ${name}. Configure in Doppler (kyro-hackathon-mcp/prd) or .env.local.`,
    );
  }
  return value;
}

export const env = {
  supabaseUrl: () => need('SUPABASE_URL', process.env.SUPABASE_URL),
  supabaseServiceRoleKey: () =>
    need('SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY),
  patHashPepper: () => need('PAT_HASH_PEPPER', process.env.PAT_HASH_PEPPER),
  expiresAt: () =>
    need('HACKATHON_PAT_EXPIRES_AT', process.env.HACKATHON_PAT_EXPIRES_AT),
  baseUrl: () => process.env.NEXT_PUBLIC_BASE_URL || '',
  // Optional — if unset, Turnstile verification is skipped (set when the operator
  // has provisioned Cloudflare Turnstile, otherwise null disables that gate).
  turnstileSecret: (): string | null => process.env.TURNSTILE_SECRET_KEY || null,
  eventPasscode: () => need('EVENT_PASSCODE', process.env.EVENT_PASSCODE),
  cronSecret: () => need('CRON_SECRET', process.env.CRON_SECRET),
  registrationOpen: () =>
    (process.env.REGISTRATION_OPEN ?? 'true').toLowerCase() === 'true',
  oauthProviders: (): Array<'apple' | 'google' | 'kakao' | 'email'> => {
    const raw = process.env.OAUTH_PROVIDERS ?? 'apple,google,kakao,email';
    return raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s): s is 'apple' | 'google' | 'kakao' | 'email' =>
        s === 'apple' || s === 'google' || s === 'kakao' || s === 'email',
      );
  },
};
