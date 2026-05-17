import { env } from '@/lib/env';
import { RegisterPageClient } from './RegisterPageClient';

// Server Component — reads server-only env (REGISTRATION_OPEN, OAUTH_PROVIDERS)
// and the public Turnstile site key, then passes them to the client component.
export const dynamic = 'force-dynamic';

export default function RegisterPage() {
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '';
  const enabledProviders = env.oauthProviders();
  const registrationOpen = env.registrationOpen();

  return (
    <RegisterPageClient
      turnstileSiteKey={turnstileSiteKey}
      enabledProviders={enabledProviders}
      registrationOpen={registrationOpen}
    />
  );
}
