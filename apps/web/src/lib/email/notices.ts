import { proofUrl } from "@/lib/urls";
import type { ReleasedRecord } from "@/lib/visibility";
import { sendLater } from "./later";
import { embargoLiftedEmail } from "./templates";

/** Tells the author, after the response, that a read released their embargoed record. */
export function notifyEmbargoLifted({ owner, ...released }: ReleasedRecord) {
  sendLater(embargoLiftedEmail(owner.email, owner.name, { ...released, url: proofUrl(released.proofId) }));
}
