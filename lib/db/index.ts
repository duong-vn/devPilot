import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

let database: ReturnType<typeof drizzle<typeof schema>> | undefined;
export function db() {
  if (!process.env.DATABASE_URL) throw new Error("Database is not configured.");
  database ??= drizzle(
    postgres(process.env.DATABASE_URL, { max: 5, idle_timeout: 20, connect_timeout: 10 }),
    { schema },
  );
  return database;
}
