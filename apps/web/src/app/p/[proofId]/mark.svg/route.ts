import { parseProofId } from "@authoro/core";
import { after } from "next/server";
import { db } from "@/db";
import type { MarkStyle, MarkTheme } from "@/lib/embed";
import { renderMarkSvg } from "@/lib/mark-svg";
import { getProofStatus, incrementMetric, isLikelyBot } from "@/lib/proof";

const SVG_HEADERS = {
  "Content-Type": "image/svg+xml; charset=utf-8",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
  "X-Content-Type-Options": "nosniff",
  // Short-lived so impression counts stay meaningful and withdrawals propagate.
  "Cache-Control": "public, max-age=300, s-maxage=300",
  "Access-Control-Allow-Origin": "*",
};

export async function GET(request: Request, { params }: RouteContext<"/p/[proofId]/mark.svg">) {
  const proofId = parseProofId((await params).proofId);
  const record = proofId ? await getProofStatus(db, proofId) : null;
  if (!proofId || !record || record.status === "pending_attestation" || record.visibility === "private") {
    return new Response("Not found", { status: 404, headers: { "Cache-Control": "public, max-age=60" } });
  }

  const search = new URL(request.url).searchParams;
  const style: MarkStyle = search.get("style") === "icon" ? "icon" : "badge";
  const theme: MarkTheme = search.get("theme") === "dark" ? "dark" : "light";

  if (!isLikelyBot(request.headers.get("user-agent"))) {
    after(() => incrementMetric(db, record.id, "markImpressions").catch(() => {}));
  }
  const status = record.status === "withdrawn" ? "withdrawn" : "registered";
  return new Response(renderMarkSvg(proofId, style, theme, status), { headers: SVG_HEADERS });
}
