import assert from "node:assert/strict";
import { test } from "node:test";
import { githubFetch, importRepository } from "../lib/repository";

const commit = "a".repeat(40);
const tree = "b".repeat(40);
const blob = "c".repeat(40);
const source = "export const answer = 42;\n";

function githubFixture(overrides: Record<string, unknown> = {}) {
  const routes: Record<string, unknown> = {
    "/repos/acme/app": { default_branch: "main", size: 1 },
    "/repos/acme/app/commits/main": { sha: commit, commit: { tree: { sha: tree } } },
    [`/repos/acme/app/git/trees/${tree}?recursive=1`]: {
      truncated: false,
      tree: [
        { path: "src/main.ts", type: "blob", sha: blob, size: source.length, mode: "100644" },
        { path: ".env", type: "blob", sha: "d".repeat(40), size: 10, mode: "100644" },
        { path: "src/link.ts", type: "blob", sha: "e".repeat(40), size: 10, mode: "120000" },
      ],
    },
    [`/repos/acme/app/git/blobs/${blob}`]: {
      encoding: "base64",
      content: Buffer.from(source).toString("base64"),
      size: source.length,
    },
    ...overrides,
  };
  const visited: string[] = [];
  return {
    visited,
    fetch: async (input: string | URL | Request, options?: RequestInit) => {
      const url = new URL(String(input));
      assert.equal(url.origin, "https://api.github.com");
      assert.equal(options?.redirect, "error");
      assert.ok(options?.signal);
      const path = url.pathname + url.search;
      visited.push(path);
      assert.ok(path in routes, `Unexpected fetch: ${path}`);
      return Response.json(routes[path]);
    },
  };
}

test("GitHub import pins source to a commit and never fetches excluded files", async (t) => {
  const fixture = githubFixture();
  t.mock.method(globalThis, "fetch", fixture.fetch);
  const result = await importRepository("acme/app", "test-access");
  assert.equal(result.repository.commit, commit);
  assert.equal(result.repository.fileCount, 1);
  assert.equal(result.repository.excludedCount, 2);
  assert.deepEqual(result.files, [{ path: "src/main.ts", content: source, language: "ts" }]);
  assert.equal(fixture.visited.length, 4);
  assert.equal(result.chunks[0].startLine, 1);
});

test("GitHub import rejects truncated trees without fetching blobs", async (t) => {
  const fixture = githubFixture({
    [`/repos/acme/app/git/trees/${tree}?recursive=1`]: { truncated: true, tree: [] },
  });
  t.mock.method(globalThis, "fetch", fixture.fetch);
  await assert.rejects(importRepository("acme/app", "test-access"), /too large/);
  assert.equal(fixture.visited.length, 3);
});

test("GitHub import rejects oversized repositories before fetching file content", async (t) => {
  const fixture = githubFixture({
    [`/repos/acme/app/git/trees/${tree}?recursive=1`]: {
      truncated: false,
      tree: Array.from({ length: 301 }, (_, i) => ({
        path: `src/${i}.ts`,
        type: "blob",
        sha: blob,
        size: 10,
        mode: "100644",
      })),
    },
  });
  t.mock.method(globalThis, "fetch", fixture.fetch);
  await assert.rejects(importRepository("acme/app", "test-access"), /300 source files/);
  assert.equal(fixture.visited.length, 3);
});

test("GitHub failures never echo provider response bodies", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response("provider diagnostic must not leak", { status: 403 }),
  );
  await assert.rejects(
    githubFetch("/user", "test-access"),
    (error: Error) => error.message.includes("rate limit") && !error.message.includes("diagnostic"),
  );
});

test("GitHub response limit is enforced while streaming", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(new Uint8Array(8_000_001)));
  await assert.rejects(githubFetch("/user", "test-access"), /exceeds the supported size/);
});
