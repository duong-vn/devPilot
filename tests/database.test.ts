import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import postgres from "postgres";

// This check requires an explicitly supplied disposable test database, never DATABASE_URL.
const testDatabase = process.env.TEST_DATABASE_URL;
test("PostgreSQL migration, ownership constraints, atomic rollback and pgvector search", {
  skip: !testDatabase,
}, async () => {
  assert.ok(testDatabase);
  const client = postgres(testDatabase, { max: 1, connect_timeout: 10 });
  const user = randomUUID();
  const project = randomUUID();
  try {
    await client
      .begin(async (tx) => {
        for (const name of ["0000_initial", "0001_operations"]) {
          const migration = await readFile(
            new URL(`../drizzle/${name}.sql`, import.meta.url),
            "utf8",
          );
          await tx.unsafe(migration);
        }
        await tx`INSERT INTO users (id, profile) VALUES (${user}, ${tx.json({ name: "test" })})`;
        await tx`INSERT INTO projects (id, owner_id, data) VALUES (${project}, ${user}, ${tx.json({ name: "Original" })})`;
        const vector = `[${Array.from({ length: 1536 }, (_, i) => (i === 0 ? 1 : 0)).join(",")}]`;
        await tx`INSERT INTO chunks (id, project_id, path, start_line, end_line, content, embedding) VALUES (${randomUUID()}, ${project}, 'src/main.ts', 1, 1, 'export const main = 1;', ${vector}::vector)`;
        const [result] =
          await tx`SELECT path, embedding <=> ${vector}::vector AS distance FROM chunks WHERE project_id = ${project} ORDER BY embedding <=> ${vector}::vector LIMIT 1`;
        assert.equal(result.path, "src/main.ts");
        assert.equal(Number(result.distance), 0);
        const otherUser =
          await tx`SELECT id FROM projects WHERE id = ${project} AND owner_id = ${randomUUID()}`;
        assert.equal(otherUser.length, 0);
        await assert.rejects(
          tx.savepoint(async (savepoint) => {
            await savepoint`UPDATE projects SET data = ${savepoint.json({ name: "Failed" })} WHERE id = ${project}`;
            throw new Error("Rollback check");
          }),
          /Rollback check/,
        );
        const [preserved] = await tx`SELECT data FROM projects WHERE id = ${project}`;
        assert.equal(preserved.data.name, "Original");
        await assert.rejects(
          tx.savepoint(async (savepoint) => {
            await savepoint`INSERT INTO projects (id, owner_id, data) VALUES (${randomUUID()}, ${randomUUID()}, '{}'::jsonb)`;
          }),
        );
        // Roll back all test writes, including a schema created for this transaction.
        throw new Error("EXPECTED_TEST_ROLLBACK");
      })
      .catch((error: unknown) => {
        if (!(error instanceof Error) || error.message !== "EXPECTED_TEST_ROLLBACK") throw error;
      });
  } finally {
    await client.end();
  }
});
