import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Strip the sslmode param from the connection string so pg doesn't get confused,
// and instead pass ssl explicitly — required for Neon and other hosted Postgres.
const connString = (process.env.DATABASE_URL ?? "").replace(/[?&]sslmode=[^&]*/g, "");
export const pool = new Pool({
  connectionString: connString,
  ssl: { rejectUnauthorized: false },
});
export const db = drizzle(pool, { schema });

export * from "./schema";
