import { NextRequest } from 'next/server';
import { authenticate } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { corsPreflight } from '@/lib/response';

// JSON-RPC over HTTP — minimal MCP server.
// Compatible with Claude Desktop's mcpServers.url config (POST /api/mcp).

const TOOLS = [
  {
    name: 'list_my_runs',
    description:
      '본인의 KYRO 러닝 목록을 가져옵니다 (최신순). GPS trace 는 list 에 포함되지 않으며, get_run_detail 로 받습니다. List the authenticated user’s own KYRO runs (most recent first).',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', default: 50, minimum: 1, maximum: 200 },
        cursor: {
          type: 'string',
          description: 'ISO timestamp. Returns runs created strictly before this time.',
        },
      },
    },
  },
  {
    name: 'get_run_detail',
    description:
      '특정 러닝의 상세를 가져옵니다 — GPS trace (GeoJSON LineString) + km 별 split (페이스, 고도) 포함. 본인 러닝 또는 follow 한 사용자의 audience 통과 러닝만. Get one run with full GPS trace and per-km splits.',
    inputSchema: {
      type: 'object',
      properties: {
        run_id: { type: 'string' },
      },
      required: ['run_id'],
    },
  },
  {
    name: 'list_friend_runs',
    description:
      '본인이 follow 한 사용자들의 audience 통과 러닝 목록 (audience public / follower / mutual_friend 룰 적용). List runs from users the authenticated user follows.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', default: 50, minimum: 1, maximum: 200 },
        cursor: { type: 'string' },
      },
    },
  },
  {
    name: 'get_aggregate_stats',
    description:
      'KYRO 전체의 익명 집계 통계 — 시간대 / 요일 / 거리 히스토그램 / 페이스 히스토그램 / 도시별 활성도 (식별 불가, 90일 window). KYRO-wide anonymous aggregate stats.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_anon_traces',
    description:
      'KYRO 전체의 익명화된 GPS trace 데이터셋 — 한 row = 한 러닝. user 와 unlinkable, 출발/도착 5%-95% clip + 50m grid + 시간 hour bucket + k≥3 anonymity (같은 시간·지역에 3명 이상 활동했을 때만). km 별 split 포함 (페이스 / 고도 / 보간 위치). KYRO-wide anonymous trace dataset.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', default: 100, minimum: 1, maximum: 500 },
        cursor: { type: 'string' },
        region: {
          type: 'string',
          description:
            'Optional region filter (place_region_label, e.g. "서울"). Matches exact label.',
        },
      },
    },
  },
  {
    name: 'get_demographics',
    description:
      'KYRO active 사용자의 성별·연령대·교차 분포 (share 비율만, total/count 미노출, k≥5 anonymity). KYRO active-user demographics — share-only, no totals exposed.',
    inputSchema: { type: 'object', properties: {} },
  },
];

export async function OPTIONS() {
  return corsPreflight();
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return rpcResponse({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'parse error' },
    });
  }

  const { method, params, id } = body || {};

  if (method === 'initialize') {
    return rpcResponse({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2025-03-26',
        capabilities: { tools: {} },
        serverInfo: { name: 'kyro-hackathon-mcp', version: '0.1.0' },
      },
    });
  }

  // Spec-required notifications — no response body needed.
  if (method === 'notifications/initialized' || method === 'notifications/cancelled') {
    return new Response(null, { status: 204 });
  }

  if (method === 'ping') {
    return rpcResponse({ jsonrpc: '2.0', id, result: {} });
  }

  if (method === 'tools/list') {
    return rpcResponse({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
  }

  if (method === 'tools/call') {
    const auth = await authenticate(req);
    if (!auth.ok) {
      return rpcResponse({
        jsonrpc: '2.0',
        id,
        error: { code: -32001, message: `auth: ${auth.error}` },
      });
    }

    const name = params?.name as string;
    const args = (params?.arguments ?? {}) as Record<string, any>;

    try {
      const data = await callTool(name, args, auth.userId);
      return rpcResponse({
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
        },
      });
    } catch (e: any) {
      return rpcResponse({
        jsonrpc: '2.0',
        id,
        error: { code: -32603, message: e?.message || 'tool_failed' },
      });
    }
  }

  return rpcResponse({
    jsonrpc: '2.0',
    id,
    error: { code: -32601, message: `method not found: ${method}` },
  });
}

async function callTool(
  name: string,
  args: Record<string, any>,
  userId: string
) {
  if (name === 'list_my_runs') {
    const { data, error } = await supabaseAdmin.rpc('mcp_list_my_runs', {
      p_viewer_user_id: userId,
      p_limit: clamp(args.limit ?? 50, 1, 200),
      p_cursor: args.cursor ?? null,
    });
    if (error) throw new Error(error.message);
    return data;
  }
  if (name === 'get_run_detail') {
    if (!args.run_id) throw new Error('run_id required');
    const { data, error } = await supabaseAdmin.rpc('mcp_get_run_detail', {
      p_viewer_user_id: userId,
      p_run_id: args.run_id,
    });
    if (error) throw new Error(error.message);
    if (data === null) throw new Error('run not found or no permission');
    return data;
  }
  if (name === 'list_friend_runs') {
    const { data, error } = await supabaseAdmin.rpc('mcp_list_friend_runs', {
      p_viewer_user_id: userId,
      p_limit: clamp(args.limit ?? 50, 1, 200),
      p_cursor: args.cursor ?? null,
    });
    if (error) throw new Error(error.message);
    return data;
  }
  if (name === 'get_aggregate_stats') {
    const { data, error } = await supabaseAdmin.rpc('mcp_get_aggregate_stats');
    if (error) throw new Error(error.message);
    return data;
  }
  if (name === 'list_anon_traces') {
    const { data, error } = await supabaseAdmin.rpc('mcp_list_anon_traces', {
      p_limit: clamp(args.limit ?? 100, 1, 500),
      p_cursor: args.cursor ?? null,
      p_region_label: args.region ?? null,
    });
    if (error) throw new Error(error.message);
    return data;
  }
  if (name === 'get_demographics') {
    const { data, error } = await supabaseAdmin.rpc('mcp_get_demographics');
    if (error) throw new Error(error.message);
    return data;
  }
  throw new Error(`unknown tool: ${name}`);
}

function clamp(n: number, min: number, max: number) {
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function rpcResponse(body: object) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, Mcp-Session-Id',
    },
  });
}
