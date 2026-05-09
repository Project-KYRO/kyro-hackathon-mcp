import { NextRequest } from 'next/server';
import { authenticate } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { jsonOk, jsonError, corsPreflight } from '@/lib/response';

export async function OPTIONS() {
  return corsPreflight();
}

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth.ok) return jsonError(auth.status, auth.error);

  const { data, error } = await supabaseAdmin.rpc('mcp_get_aggregate_stats');

  if (error) return jsonError(500, 'rpc_failed', error.message);
  return jsonOk(data);
}

// Edge cache 1 minute — aggregates change slowly.
export const revalidate = 60;
