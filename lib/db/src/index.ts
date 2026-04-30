import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const rawUrl = process.env.DATABASE_URL ?? "";

// Determine whether SSL should be used.
// Replit's built-in Postgres (host: helium) does not support SSL.
// Hosted providers like Neon, Supabase, etc. require it.
// We use SSL only when the URL explicitly requests it (sslmode=require/verify-*)
// or when the host looks like a cloud database (contains dots, e.g. neon.tech).
const pgHost = process.env.PGHOST ?? "";
const requiresSsl =
  rawUrl.includes("sslmode=require") ||
  rawUrl.includes("sslmode=verify") ||
  (pgHost.includes(".") && !pgHost.startsWith("127.") && pgHost !== "localhost");

const connString = rawUrl.replace(/[?&]sslmode=[^&]*/g, "");

export const pool = new Pool({
  connectionString: connString,
  ...(requiresSsl ? { ssl: { rejectUnauthorized: false } } : {}),
});
export const db = drizzle(pool, { schema });

export * from "./schema";
