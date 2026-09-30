import { serverEnv } from "@/env";
import { createDatabase, type Database } from "./client";

export type { Database } from "./client";

// Reuse one connection pool across hot reloads in development.
const globalForDb = globalThis as unknown as { authoroDb?: Database };

export const db: Database = globalForDb.authoroDb ?? createDatabase(serverEnv().DATABASE_URL);

if (process.env.NODE_ENV !== "production") globalForDb.authoroDb = db;
