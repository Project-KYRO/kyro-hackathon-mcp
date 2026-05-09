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
