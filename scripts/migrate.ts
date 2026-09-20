import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import postgres from "postgres";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL before running migrations.");
  const client = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 10 });
  try {
    await client.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(17834620)`;
      await tx`CREATE TABLE IF NOT EXISTS devpilot_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`;
      for (const name of ["0000_initial", "0001_operations"]) {
        const migration = await readFile(
          new URL(`../drizzle/${name}.sql`, import.meta.url),
          "utf8",
        );
        const checksum = createHash("sha256").update(migration).digest("hex");
        const [existing] = await tx`SELECT checksum FROM devpilot_migrations WHERE name = ${name}`;
        if (existing) {
          if (existing.checksum !== checksum)
            throw new Error(
              "Applied migration changed. Restore the original and add a new migration.",
            );
          continue;
        }
        await tx.unsafe(migration);
        await tx`INSERT INTO devpilot_migrations (name, checksum) VALUES (${name}, ${checksum})`;
        console.info(`Applied ${name}.`);
      }
      console.info("Database schema is current.");
    });
  } finally {
    await client.end();
  }
}
main().catch(() => {
  console.error(
    "Migration failed. Check database access and pgvector support. No connection details were logged.",
  );
  process.exitCode = 1;
});
