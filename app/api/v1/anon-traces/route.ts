import { NextRequest } from 'next/server';
import { authenticate } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { jsonOk, jsonError, corsPreflight, respondAuthError } from '@/lib/response';

export async function OPTIONS() {
  return corsPreflight();
}

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth.ok) return respondAuthError(auth);

  const url = new URL(req.url);
  const limit = clamp(Number(url.searchParams.get('limit') ?? 100), 1, 500);
  const cursor = url.searchParams.get('cursor');
  const region = url.searchParams.get('region');

  const { data, error } = await supabaseAdmin.rpc('mcp_list_anon_traces', {
    p_limit: limit,
    p_cursor: cursor || null,
    p_region_label: region || null,
  });

  if (error) return jsonError(500, 'rpc_failed', error.message);
  return jsonOk(data);
}

function clamp(n: number, min: number, max: number) {
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;
