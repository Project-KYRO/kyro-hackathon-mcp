import { NextResponse } from 'next/server';

// REST/MCP endpoints are bearer-authenticated and intentionally CORS-open so
// participants can fetch from a hackathon project on any origin (notebook,
// local dev server, Vercel sandbox, etc.).
const PUBLIC_CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '86400',
};

// /api/auth/issue-pat must only be called from the deployed register page —
// reflect the origin only if it matches.
function originLockedCors(origin: string | null): Record<string, string> {
  const allowed = (process.env.NEXT_PUBLIC_BASE_URL || '').replace(/\/$/, '');
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (origin && allowed && origin === allowed) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

export function jsonOk(data: unknown, init?: { status?: number }) {
  return NextResponse.json(data, {
    status: init?.status ?? 200,
    headers: PUBLIC_CORS,
  });
}

export function jsonError(status: number, error: string, detail?: string) {
  return NextResponse.json(
    { error, ...(detail ? { detail } : {}) },
    { status, headers: PUBLIC_CORS },
  );
}

export function corsPreflight() {
  return new NextResponse(null, { status: 204, headers: PUBLIC_CORS });
}

export function jsonAuthOk(req: Request, data: unknown, init?: { status?: number }) {
  return NextResponse.json(data, {
    status: init?.status ?? 200,
    headers: originLockedCors(req.headers.get('origin')),
  });
}

export function jsonAuthError(
  req: Request,
  status: number,
  error: string,
  detail?: string,
) {
  return NextResponse.json(
    { error, ...(detail ? { detail } : {}) },
    { status, headers: originLockedCors(req.headers.get('origin')) },
  );
}

export function corsAuthPreflight(req: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: originLockedCors(req.headers.get('origin')),
  });
}

export function respondAuthError(auth: {
  status: number;
  error: string;
  retryAfterSec?: number;
}) {
  const res = jsonError(auth.status, auth.error);
  if (auth.retryAfterSec) res.headers.set('Retry-After', String(auth.retryAfterSec));
  return res;
}
