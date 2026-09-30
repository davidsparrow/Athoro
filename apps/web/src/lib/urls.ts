/** Public origin, inlined at build time so server and client agree. */
export function appOrigin(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

export function proofPath(proofId: string): `/p/${string}` {
  return `/p/${proofId}`;
}

export function proofUrl(proofId: string, origin = appOrigin()): string {
  return `${origin}${proofPath(proofId)}`;
}

/** Host and path without the scheme, for display: "authoro.net/p/AU-7K3F92". */
export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}
