import { describe, expect, it } from "vitest";
import { generateBackupCodes, normalizeBackupCode } from "@/lib/backup-codes";

describe("backup codes", () => {
  it("are ten distinct, unambiguous codes", () => {
    const codes = generateBackupCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/);
  });

  it("forgive how people type them", () => {
    expect(normalizeBackupCode("7k3f9-2mxq4")).toBe("7K3F9-2MXQ4");
    expect(normalizeBackupCode(" 7K3F9 2MXQ4 ")).toBe("7K3F9-2MXQ4");
    expect(normalizeBackupCode("7K3F92MXQ4")).toBe("7K3F9-2MXQ4");
    expect(normalizeBackupCode("7k3f9-2mxqo")).toBe("7K3F9-2MXQ0");
    expect(normalizeBackupCode("ilIL0-OOOOO")).toBe("11110-00000");
    // Anything else is passed through for the server to reject.
    expect(normalizeBackupCode("short")).toBe("short");
  });
});
