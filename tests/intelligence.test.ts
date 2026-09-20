import assert from "node:assert/strict";
import { test } from "node:test";
import { newProject, sampleFiles } from "../lib/demo";
import {
  demoAnswer,
  demoArtifact,
  demoTasks,
  generateArtifact,
  validateCitations,
} from "../lib/intelligence";
import { chunkFiles, retrieve } from "../lib/repository";
import type { Session } from "../lib/types";

test("artifacts reject dangling parent references", async () => {
  const session: Session = {
    id: "test",
    user: { id: "test", name: "Test", login: "test", avatar: null },
    demo: true,
    expiresAt: Date.now() + 10000,
  };
  await assert.rejects(
    generateArtifact(session, newProject("Test", ""), "review", "Review code", "missing-parent"),
    /parent|specification/i,
  );
});

test("citation IDs can only resolve to provided repository chunks", () => {
  const chunks = chunkFiles(sampleFiles);
  assert.equal(validateCitations([1, 1, 999, -1, 1.5], chunks).length, 1);
  assert.equal(validateCitations([1], chunks)[0].path, chunks[0].path);
  assert.deepEqual(validateCitations([0, 999], chunks), []);
});
test("demo answer explicitly discloses non-AI behavior and cites matched source", () => {
  const chunks = retrieve(chunkFiles(sampleFiles), "authenticate session");
  const result = demoAnswer("authenticate session", chunks);
  assert.match(result.content, /demo|sample/i);
  assert.match(result.content, /not.*AI|no.*AI/i);
  assert.ok(result.citations.some((item) => item.path === "src/auth.ts"));
  assert.match(demoAnswer("xyz", []).content, /no.*match/i);
});
test("demo planning is labeled and tasks have actionable acceptance criteria", () => {
  const artifact = demoArtifact("specification", "Add labels", []);
  assert.match(artifact.content, /sample|demo/i);
  assert.match(artifact.content, /Add labels/);
  assert.ok(
    demoTasks("plan-id").every(
      (task) => task.planId === "plan-id" && task.description.includes("Acceptance"),
    ),
  );
});
