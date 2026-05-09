import { createHash, randomBytes } from 'crypto';

function getPepper(): string {
  const p = process.env.PAT_HASH_PEPPER;
  if (!p) {
    throw new Error('Missing PAT_HASH_PEPPER. Generate: openssl rand -base64 32');
  }
  return p;
}

export function generateRawToken(): string {
  const raw = randomBytes(32).toString('base64url');
  return `kyro_pat_${raw}`;
}

export function hashToken(rawToken: string): string {
  return createHash('sha256').update(`${getPepper()}|${rawToken}`).digest('hex');
}

export function generateOtp(): string {
  const n = randomBytes(4).readUInt32BE(0) % 1_000_000;
  return n.toString().padStart(6, '0');
}

export function hashOtp(otp: string, email: string): string {
  return createHash('sha256')
    .update(`${getPepper()}|otp|${email.toLowerCase()}|${otp}`)
    .digest('hex');
}
