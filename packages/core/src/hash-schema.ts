import { z } from "zod";

/** A hash written `sha256:<64 lowercase hex characters>`. */
export const hashStringSchema = z
  .string()
  .regex(/^sha256:[0-9a-f]{64}$/, "Expected a hash of the form sha256:<64 lowercase hex characters>");
