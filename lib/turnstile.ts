import { env } from './env';

// Cloudflare Turnstile server-side verification.
// https://developers.cloudflare.com/turnstile/get-started/server-side-validation/

interface TurnstileResponse {
  success: boolean;
  'error-codes'?: string[];
  challenge_ts?: string;
  hostname?: string;
  action?: string;
}

export async function verifyTurnstile(
  token: string | null,
  remoteIp: string | null,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!token) return { ok: false, reason: 'missing_turnstile_token' };

  const body = new URLSearchParams({
    secret: env.turnstileSecret(),
    response: token,
  });
  if (remoteIp) body.append('remoteip', remoteIp);

  let res: Response;
  try {
    res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      cache: 'no-store',
    });
  } catch (e) {
    console.error('[turnstile] verify fetch failed:', e);
    return { ok: false, reason: 'turnstile_verify_unreachable' };
  }

  if (!res.ok) return { ok: false, reason: 'turnstile_verify_http_error' };

  const payload = (await res.json()) as TurnstileResponse;
  if (!payload.success) {
    return {
      ok: false,
      reason: `turnstile_failed:${(payload['error-codes'] || []).join(',') || 'unknown'}`,
    };
  }
  return { ok: true };
}

export function clientIpFrom(req: Request): string | null {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]?.trim() || null;
  return req.headers.get('x-real-ip');
}
