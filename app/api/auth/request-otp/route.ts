import { NextRequest } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase';
import { redis, rateLimit } from '@/lib/redis';
import { generateOtp, hashOtp } from '@/lib/pat';
import { sendOtpEmail } from '@/lib/email';
import { jsonOk, jsonError, corsPreflight } from '@/lib/response';

const Body = z.object({
  email: z.string().email().max(200),
  consent: z.literal(true),
});

export async function OPTIONS() {
  return corsPreflight();
}

export async function POST(req: NextRequest) {
  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return jsonError(400, 'invalid_input');
  }

  const email = parsed.email.trim().toLowerCase();

  // Per-email cooldown: 1 OTP every 5 minutes.
  const cooldown = await rateLimit(`otp:email:${email}`, 1, 300);
  if (!cooldown.ok) {
    return jsonError(429, 'cooldown_active', `try again in ${cooldown.resetSec}s`);
  }

  // Per-IP burst guard: 10 OTP requests per hour.
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const ipBurst = await rateLimit(`otp:ip:${ip}`, 10, 3600);
  if (!ipBurst.ok) {
    return jsonError(429, 'too_many_requests');
  }

  // Lookup. Use a generic response regardless of existence to avoid email
  // enumeration. We still send only to actually-registered emails.
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (user) {
    const otp = generateOtp();
    const otpHash = hashOtp(otp, email);
    await redis.setex(`otp:${email}`, 600, otpHash);
    try {
      await sendOtpEmail(email, otp);
    } catch (err) {
      // Roll back so user can retry without waiting cooldown.
      await redis.del(`otp:${email}`);
      await redis.del(`rl:otp:email:${email}`);
      return jsonError(500, 'email_send_failed');
    }
  }

  return jsonOk({ message: 'sent_if_registered' });
}
