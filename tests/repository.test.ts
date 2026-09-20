import assert from "node:assert/strict";
import { test } from "node:test";
import { chunkFiles, isIndexable, parseRepository, retrieve } from "../lib/repository";

test("repository input accepts only canonical GitHub repositories", () => {
  assert.deepEqual(parseRepository("https://github.com/acme/workspace.git"), {
    owner: "acme",
    name: "workspace",
  });
  assert.deepEqual(parseRepository("acme/workspace"), { owner: "acme", name: "workspace" });
  assert.deepEqual(parseRepository("octocat/.github"), { owner: "octocat", name: ".github" });
  for (const input of [
    "https://evil.test/a/b",
    "https://github.com@evil.test/a/b",
    "a/b/tree/main",
    "a/..",
    "a/b?x=1",
    "file:///etc/passwd",
    "a/%2e%2e",
  ])
    assert.throws(() => parseRepository(input));
});

test("source filter excludes sensitive, generated, binary and traversal paths", () => {
  for (const path of [
    ".env",
    ".env.example",
    "src/secret.ts",
    "src/tokenizer.ts",
    "credentials.json",
    "node_modules/a.ts",
    ".git/config",
    "../a.ts",
    "x\\a.ts",
    "image.png",
    "package-lock.json",
    "private.pem",
    "src/a\u0000.ts",
  ])
    assert.equal(isIndexable(path, 10), false, path);
  assert.equal(isIndexable("src/auth.ts", 100), true);
  assert.equal(isIndexable("README.md", 100), true);
  assert.equal(isIndexable("src/huge.ts", 100_001), false);
});

test("chunks retain exact original line ranges and terminate", () => {
  const lines = Array.from({ length: 150 }, (_, i) => `line ${i + 1}`);
  const chunks = chunkFiles([
    { path: "src/a.ts", content: lines.join("\n"), language: "typescript" },
  ]);
  assert.ok(chunks.length > 1 && chunks.length < 10);
  for (const chunk of chunks)
    assert.equal(chunk.content, lines.slice(chunk.startLine - 1, chunk.endLine).join("\n"));
  assert.equal(chunks.at(-1)?.endLine, 150);
  assert.deepEqual(chunkFiles([{ path: "empty.ts", content: "", language: "typescript" }]), []);
});

test("retrieval ranks matching code and returns no fabricated context", () => {
  const chunks = chunkFiles([
    {
      path: "src/auth.ts",
      content: "export function authenticateUser(session) { return verifySession(session); }",
      language: "typescript",
    },
    {
      path: "src/cart.ts",
      content: "export function calculatePrice(cart) { return cart.total; }",
      language: "typescript",
    },
  ]);
  assert.equal(retrieve(chunks, "authenticate user session")[0]?.path, "src/auth.ts");
  assert.deepEqual(retrieve(chunks, "xyzzynonexistent"), []);
  assert.deepEqual(retrieve(chunks, ""), []);
});
