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
      "List the authenticated user's own KYRO runs (most recent first). GPS traces are not included here — use get_run_detail for the full track and splits.",
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
      "Get a single run's detail including GPS trace (GeoJSON LineString) and per-km splits (pace, elevation). Only works for the caller's own runs or for follows whose audience rule allows the caller.",
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
      'List runs from users the caller follows, filtered by each run\'s audience rule (public / follower / mutual_friend).',
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
      'KYRO-wide anonymous aggregate stats over the last 90 days — hourly + day-of-week distribution, distance + pace histograms, region activity. No PII, no per-user data.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_anon_traces',
    description:
      'KYRO-wide anonymized GPS trace dataset. One row = one run. Unlinkable to users (endpoint 5%-95% clip, 50m grid round, hour bucket, daily run_id randomization, k>=3 anonymity by hour+region). Includes per-km splits with pace, elevation, and interpolated coarse-grid lat/lng.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', default: 100, minimum: 1, maximum: 500 },
        cursor: { type: 'string' },
        region: {
          type: 'string',
          description:
            'Optional region filter (place_region_label, e.g. "Singapore" / "서울"). Matches exact label.',
        },
      },
    },
  },
  {
    name: 'get_demographics',
    description:
      'KYRO active-user demographics — share-only distributions of gender and age band (and their cross). No totals or counts exposed. k>=5 anonymity.',
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
