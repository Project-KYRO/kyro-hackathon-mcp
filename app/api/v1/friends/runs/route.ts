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

  const url = new URL(req.url);
  const limit = clamp(Number(url.searchParams.get('limit') ?? 50), 1, 200);
  const cursor = url.searchParams.get('cursor');

  const { data, error } = await supabaseAdmin.rpc('mcp_list_friend_runs', {
    p_viewer_user_id: auth.userId,
    p_limit: limit,
    p_cursor: cursor || null,
  });

  if (error) return jsonError(500, 'rpc_failed', error.message);
  return jsonOk(data);
}

function clamp(n: number, min: number, max: number) {
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}
