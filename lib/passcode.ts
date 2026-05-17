import { timingSafeEqual } from 'crypto';
import { env } from './env';

// Constant-time compare to avoid theoretical timing-attack leaks on the event
// passcode. The passcode length itself is public knowledge (6 chars, advertised
// to participants), so leaking length mismatch is acceptable.
export function passcodeMatches(input: string): boolean {
  const expected = env.eventPasscode().toUpperCase();
  const inputNorm = (input || '').trim().toUpperCase();
  if (inputNorm.length !== expected.length) return false;
  return timingSafeEqual(
    Buffer.from(inputNorm, 'utf8'),
    Buffer.from(expected, 'utf8'),
  );
}
