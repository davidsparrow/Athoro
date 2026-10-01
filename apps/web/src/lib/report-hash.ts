import { formatHash, sha256Hex } from "@authoro/core";

/** Reports are hashed whole in the browser, like documents, so the same cap applies. */
export const MAX_REPORT_BYTES = 100 * 1024 * 1024;

/** SHA-256 of a file's exact bytes, computed on the reader's or author's device. */
export async function hashReportFile(file: File): Promise<string> {
  return formatHash(await sha256Hex(new Uint8Array(await file.arrayBuffer())));
}
