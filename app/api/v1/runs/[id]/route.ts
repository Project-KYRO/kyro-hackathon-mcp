import { NextRequest } from 'next/server';
import { authenticate } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { jsonOk, jsonError, corsPreflight, respondAuthError } from '@/lib/response';

export async function OPTIONS() {
  return corsPreflight();
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await authenticate(req);
  if (!auth.ok) return respondAuthError(auth);

  const { id } = await ctx.params;
  if (!id) return jsonError(400, 'missing_run_id');

  const { data, error } = await supabaseAdmin.rpc('mcp_get_run_detail', {
    p_viewer_user_id: auth.userId,
    p_run_id: id,
  });

  if (error) return jsonError(500, 'rpc_failed', error.message);
  if (data === null) return jsonError(404, 'not_found_or_no_permission');
  return jsonOk(data);
}
