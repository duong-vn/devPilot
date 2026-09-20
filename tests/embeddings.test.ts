import assert from "node:assert/strict";
import { test } from "node:test";
import { embedChunks } from "../lib/intelligence";

const chunk = {
  path: "src/main.ts",
  startLine: 1,
  endLine: 1,
  content: "export const answer = 42;",
};

test("embedding adapter sends bounded source input and validates dimensions", async (t) => {
  const oldKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "unit-test-not-real";
  t.after(() => {
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldKey;
  });
  let requests = 0;
  t.mock.method(
    globalThis,
    "fetch",
    async (input: string | URL | Request, options?: RequestInit) => {
      assert.equal(String(input), "https://api.openai.com/v1/embeddings");
      const body = JSON.parse(String(options?.body));
      assert.equal(body.model, "text-embedding-3-small");
      assert.ok(body.input[0].includes("src/main.ts"));
      assert.ok(body.input[0].includes("export const answer"));
      requests++;
      return Response.json({
        object: "list",
        data: [
          { object: "embedding", index: 0, embedding: Array.from({ length: 1536 }, () => 0.1) },
        ],
        model: "text-embedding-3-small",
        usage: { prompt_tokens: 12, total_tokens: 12 },
      });
    },
  );
  const result = await embedChunks([chunk]);
  assert.equal(result.length, 1);
  assert.equal(result[0].length, 1536);
  assert.equal(requests, 1);
});

test("embedding adapter rejects unexpected vector dimensions instead of storing corrupt index", async (t) => {
  const oldKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "unit-test-not-real";
  t.after(() => {
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldKey;
  });
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({
      object: "list",
      data: [{ object: "embedding", index: 0, embedding: [0.1, 0.2] }],
      model: "text-embedding-3-small",
      usage: { prompt_tokens: 12, total_tokens: 12 },
    }),
  );
  await assert.rejects(embedChunks([chunk]), /Invalid embedding response/);
});

test("missing AI configuration fails explicitly without contacting a provider", async (t) => {
  const oldKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  t.after(() => {
    if (oldKey !== undefined) process.env.OPENAI_API_KEY = oldKey;
  });
  t.mock.method(globalThis, "fetch", async () => {
    assert.fail("Provider must not be called without configuration");
  });
  await assert.rejects(embedChunks([chunk]), /AI is not configured/);
});
