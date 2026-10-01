import { timingSafeEqual } from "node:crypto";
import { db } from "@/db";
import { sendEmail } from "@/lib/email/send";
import { embargoLiftedEmail } from "@/lib/email/templates";
import { proofUrl } from "@/lib/urls";
import { releaseDueEmbargoes } from "@/lib/visibility";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * GET /api/cron/embargoes, run daily by Vercel Cron with `CRON_SECRET`.
 * Records are already public from their scheduled time, because every read
 * releases a due embargo; this records the release and tells the author even
 * when nobody happens to look.
 */
export async function GET(request: Request) {
  if (!authorized(request)) return new Response("Not found", { status: 404 });
  const released = await releaseDueEmbargoes(db);
  await Promise.all(
    released.map(({ owner, ...record }) =>
      sendEmail(
        embargoLiftedEmail(owner.email, owner.name, { ...record, url: proofUrl(record.proofId) }),
      ).catch((error) => console.error("Failed to send release email", record.proofId, error)),
    ),
  );
  return Response.json({ released: released.map((record) => record.proofId) });
}
