import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { demoSessions, newProject } from "../lib/demo";
import {
  consumeQuota,
  createProject,
  getProject,
  mutateProject,
  withProjectOperation,
} from "../lib/store";
import type { Session } from "../lib/types";

function session(): Session {
  const value: Session = {
    id: randomUUID(),
    user: { id: randomUUID(), name: "Test", login: "test", avatar: null },
    demo: true,
    expiresAt: Date.now() + 60_000,
  };
  demoSessions.set(value.id, { session: value, projects: new Map(), requests: [] });
  return value;
}
test("projects are isolated by session and reads cannot mutate stored data", async () => {
  const alice = session();
  const bob = session();
  const project = await createProject(alice, "Alpha", "");
  await assert.rejects(getProject(bob, project.id), /not found/i);
  const read = await getProject(alice, project.id);
  read.name = "Changed";
  assert.equal((await getProject(alice, project.id)).name, "Alpha");
});
test("failed mutations preserve data and concurrent updates do not get lost", async () => {
  const owner = session();
  const project = await createProject(owner, "Alpha", "");
  await assert.rejects(
    mutateProject(owner, project.id, async (draft) => {
      draft.name = "Broken";
      throw new Error("fail");
    }),
  );
  assert.equal((await getProject(owner, project.id)).name, "Alpha");
  await Promise.all(
    [1, 2, 3].map((n) =>
      mutateProject(owner, project.id, async (draft) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        draft.description += String(n);
      }),
    ),
  );
  assert.equal((await getProject(owner, project.id)).description.length, 3);
});
test("operation reservations reject competing work and release after failure", async () => {
  const owner = session();
  const project = await createProject(owner, "Alpha", "");
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  let claimed!: () => void;
  const ready = new Promise<void>((resolve) => {
    claimed = resolve;
  });
  const first = withProjectOperation(owner, project.id, async () => {
    claimed();
    await wait;
  });
  await ready;
  await assert.rejects(
    withProjectOperation(owner, project.id, async () => assert.fail("competing work ran")),
    /in progress/i,
  );
  release();
  await first;
  await assert.rejects(
    withProjectOperation(owner, project.id, async () => {
      throw new Error("provider failed");
    }),
    /provider failed/,
  );
  await assert.doesNotReject(withProjectOperation(owner, project.id, async () => {}));
});

test("demo budgets are independent across operation kinds", async () => {
  const owner = session();
  for (let i = 0; i < 6; i++) await consumeQuota(owner, "mutation");
  await assert.doesNotReject(consumeQuota(owner, "import"));
  for (let i = 0; i < 30; i++) await consumeQuota(owner, "ai");
  await assert.rejects(consumeQuota(owner, "ai"), /limit/i);
  await assert.doesNotReject(consumeQuota(owner, "mutation"));
});

test("demo capacity and mutation budgets are enforced", async () => {
  const owner = session();
  for (let i = 0; i < 8; i++) await createProject(owner, `Project ${i}`, "");
  await assert.rejects(createProject(owner, "Too many", ""), /limit/i);
  for (let i = 0; i < 30; i++) await consumeQuota(owner, "ai");
  await assert.rejects(consumeQuota(owner, "ai"), /limit/i);
  assert.equal(newProject("X", "").repository, null);
});
