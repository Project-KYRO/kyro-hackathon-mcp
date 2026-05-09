'use client';

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

export function getSupabaseBrowser(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }
  // Implicit flow — magic link redirects with #access_token in fragment.
  // PKCE requires same-tab storage of the code_verifier, which breaks when
  // the user opens the magic link in a different tab/browser/device.
  _client = createClient(url, anon, {
    auth: {
      flowType: 'implicit',
      detectSessionInUrl: true,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return _client;
}
