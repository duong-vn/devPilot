import assert from "node:assert/strict";
import { test } from "node:test";
import { seal, sessionDigest, unseal } from "../lib/crypto";
import { assertSameOrigin, readJson } from "../lib/http";

test("provider access is authenticated encrypted, never plaintext", () => {
  const key = "a".repeat(64);
  const encrypted = seal("test-provider-access", key);
  assert.ok(!encrypted.includes("test-provider-access"));
  assert.equal(unseal(encrypted, key), "test-provider-access");
  assert.throws(() => unseal(`${encrypted.slice(0, -4)}AAAA`, key));
  assert.throws(() => unseal(encrypted, "b".repeat(64)));
  assert.throws(() => seal("value", "short"));
  assert.equal(sessionDigest("opaque-session").length, 64);
});

test("mutations reject missing and cross-origin browser requests", () => {
  assert.doesNotThrow(() =>
    assertSameOrigin(
      new Request("http://localhost:3000/api/projects", {
        headers: { origin: "http://localhost:3000" },
      }),
    ),
  );
  assert.throws(() =>
    assertSameOrigin(
      new Request("http://localhost:3000/api/projects", {
        headers: { origin: "https://evil.test" },
      }),
    ),
  );
  assert.throws(() => assertSameOrigin(new Request("http://localhost:3000/api/projects")));
});

test("JSON input is bounded and rejects malformed payloads", async () => {
  await assert.rejects(readJson(new Request("http://localhost", { method: "POST", body: "{" })));
  await assert.rejects(
    readJson(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ data: "a".repeat(20_000) }),
      }),
    ),
  );
  assert.deepEqual(
    await readJson(new Request("http://localhost", { method: "POST", body: '{"name":"app"}' })),
    { name: "app" },
  );
});
