import { db } from "@/db";
import { serverEnv } from "@/env";
import { clientIp, hashIp } from "@/lib/request-ip";
import { authenticateApiKey } from "./keys";
import { consumeRateLimit, type RateLimitResult, type RateLimitRule } from "./rate-limit";

/** Public endpoints may be called from any website. Keyed endpoints are server-to-server only. */
export const PUBLIC_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
} as const;

export const PUBLIC_RATE_LIMIT: RateLimitRule = { limit: 120, windowSeconds: 60 };
export const KEYED_RATE_LIMIT: RateLimitRule = { limit: 30, windowSeconds: 60 };
const MAX_BODY_BYTES = 128 * 1024;

export type ApiErrorCode =
  | "invalid_json"
  | "invalid_request"
  | "invalid_id"
  | "not_found"
  | "unauthorized"
  | "rate_limited"
  | "profile_required"
  | "plan_required"
  | "draft_exists"
  | "unchanged"
  | "not_registered"
  | "duplicate_evidence"
  | "pending_limit"
  | "evidence_limit"
  | "payload_too_large";

export function json(data: unknown, init: { status?: number; headers?: HeadersInit } = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data, null, 2), { status: init.status ?? 200, headers });
}

export function apiError(
  status: number,
  code: ApiErrorCode,
  message: string,
  /** `proofId` names the record behind a conflict, `evidenceId` the evidence. */
  extra: { details?: string[]; proofId?: string; evidenceId?: string; headers?: HeadersInit } = {},
): Response {
  return json(
    {
      error: {
        code,
        message,
        ...(extra.details?.length ? { details: extra.details } : {}),
        ...(extra.proofId ? { proofId: extra.proofId } : {}),
        ...(extra.evidenceId ? { evidenceId: extra.evidenceId } : {}),
      },
    },
    { status, headers: extra.headers },
  );
}

export function preflight(): Response {
  return new Response(null, { status: 204, headers: PUBLIC_CORS_HEADERS });
}

export class ApiRequestError extends Error {
  constructor(readonly response: Response) {
    super("API request error");
  }
}

/** Parses a JSON body, rejecting oversized or malformed input. */
export async function readJson(request: Request, headers?: HeadersInit): Promise<unknown> {
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw new ApiRequestError(
      apiError(413, "payload_too_large", `Request bodies can be at most ${MAX_BODY_BYTES / 1024} KB.`, {
        headers,
      }),
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiRequestError(
      apiError(400, "invalid_json", "The request body must be valid JSON.", { headers }),
    );
  }
}

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "RateLimit-Limit": String(result.limit),
    "RateLimit-Remaining": String(result.remaining),
    "RateLimit-Reset": String(result.resetSeconds),
  };
}

function tooManyRequests(result: RateLimitResult, headers?: HeadersInit): Response {
  return apiError(429, "rate_limited", "Too many requests. Try again shortly.", {
    headers: {
      ...Object.fromEntries(new Headers(headers)),
      ...rateLimitHeaders(result),
      "Retry-After": String(result.resetSeconds),
    },
  });
}

/** Rate limits anonymous callers by a keyed hash of their IP. */
export async function limitPublicRequest(request: Request): Promise<{ headers: Record<string, string> }> {
  const ip = clientIp(request.headers) ?? "unknown";
  const key = `ip:${await hashIp(ip, serverEnv().BETTER_AUTH_SECRET)}`;
  const result = await consumeRateLimit(db, key, PUBLIC_RATE_LIMIT);
  const headers = { ...PUBLIC_CORS_HEADERS, ...rateLimitHeaders(result) };
  if (!result.allowed) throw new ApiRequestError(tooManyRequests(result, headers));
  return { headers };
}

/** Authenticates `Authorization: Bearer au_…` and applies the per-key rate limit. */
export async function requireApiKey(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  const key = token ? await authenticateApiKey(db, token) : null;
  if (!key) {
    throw new ApiRequestError(
      apiError(
        401,
        "unauthorized",
        "Send a valid API key as `Authorization: Bearer au_…`. Create keys in Settings.",
        {
          headers: { "WWW-Authenticate": 'Bearer realm="authoro"' },
        },
      ),
    );
  }
  const result = await consumeRateLimit(db, `key:${key.id}`, KEYED_RATE_LIMIT);
  const headers = rateLimitHeaders(result);
  if (!result.allowed) throw new ApiRequestError(tooManyRequests(result));
  return { key, headers };
}

/** Runs a handler, turning ApiRequestErrors into their responses. */
export async function handle(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ApiRequestError) return error.response;
    throw error;
  }
}
