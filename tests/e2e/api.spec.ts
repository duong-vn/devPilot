import { expect, test } from "@playwright/test";
import type { Artifact, Project } from "../../lib/types";

const origin = process.env.TEST_BASE_URL ?? "http://localhost:3000";
test("demo journey persists chat, linked plans, tasks, reviews and test suggestions", async ({
  request,
}) => {
  const headers = { origin };
  expect((await request.post("/api/auth/demo", { headers })).ok()).toBeTruthy();
  const bootstrap = await (await request.get("/api/bootstrap")).json();
  expect(bootstrap.session.demo).toBe(true);
  const id = bootstrap.projects[0].id;
  let response = await request.post(`/api/projects/${id}/chat`, {
    headers,
    data: { message: "How does session authentication work?" },
  });
  expect(response.status()).toBe(200);
  let project: Project = await response.json();
  expect(project.messages).toHaveLength(2);
  expect(project.messages[1].content).toContain("not an AI");
  expect(
    project.messages[1].citations.some((citation) => citation.path === "src/auth.ts"),
  ).toBeTruthy();
  response = await request.post(`/api/projects/${id}/artifacts`, {
    headers,
    data: { kind: "specification", prompt: "Add task labels" },
  });
  expect(response.status()).toBe(200);
  project = await response.json();
  const spec = project.artifacts.at(-1) as Artifact;
  response = await request.post(`/api/projects/${id}/artifacts`, {
    headers,
    data: { kind: "plan", prompt: "Implement task labels", parentId: spec.id },
  });
  expect(response.status()).toBe(200);
  project = await response.json();
  const plan = project.artifacts.at(-1) as Artifact;
  expect(plan.parentId).toBe(spec.id);
  response = await request.post(`/api/projects/${id}/tasks`, {
    headers,
    data: { planId: plan.id },
  });
  expect(response.status()).toBe(200);
  project = await response.json();
  expect(project.tasks.length).toBeGreaterThan(0);
  response = await request.patch(`/api/projects/${id}/tasks`, {
    headers,
    data: { taskId: project.tasks[0].id, status: "done" },
  });
  expect(response.status()).toBe(200);
  expect((await response.json()).tasks[0].status).toBe("done");
  expect(
    (
      await request.post(`/api/projects/${id}/tasks`, { headers, data: { planId: plan.id } })
    ).status(),
  ).toBe(409);
  for (const kind of ["review", "tests"]) {
    response = await request.post(`/api/projects/${id}/artifacts`, {
      headers,
      data: { kind, prompt: "Check task ownership" },
    });
    expect(response.status()).toBe(200);
    expect((await response.json()).artifacts.at(-1).kind).toBe(kind);
  }
  const stored: Project = await (await request.get(`/api/projects/${id}`)).json();
  expect(stored.artifacts).toHaveLength(4);
  expect(stored.tasks[0].status).toBe("done");
  expect((await request.post("/api/auth/logout", { headers })).ok()).toBeTruthy();
  expect((await request.get(`/api/projects/${id}`)).status()).toBe(401);
});

test("API rejects cross-origin writes, unauthenticated reads and cross-session access", async ({
  request,
  playwright,
}) => {
  expect(
    (await request.post("/api/auth/demo", { headers: { origin: "https://evil.test" } })).status(),
  ).toBe(403);
  expect((await request.post("/api/auth/demo")).status()).toBe(403);
  expect((await request.get("/api/projects/nonexistent")).status()).toBe(401);
  await request.post("/api/auth/demo", { headers: { origin } });
  const bootstrap = await (await request.get("/api/bootstrap")).json();
  const other = await playwright.request.newContext({ baseURL: origin });
  try {
    await other.post("/api/auth/demo", { headers: { origin } });
    expect((await other.get(`/api/projects/${bootstrap.projects[0].id}`)).status()).toBe(404);
    expect(
      (
        await other.post(`/api/projects/${bootstrap.projects[0].id}/chat`, {
          headers: { origin },
          data: { message: "Read private source" },
        })
      ).status(),
    ).toBe(404);
  } finally {
    await other.dispose();
  }
  expect(
    (await request.post("/api/projects", { headers: { origin }, data: { name: " " } })).status(),
  ).toBe(400);
  expect(
    (
      await request.post("/api/projects", {
        headers: { origin },
        data: { name: "x".repeat(20_000) },
      })
    ).status(),
  ).toBe(413);
});

test("new projects have meaningful empty states and explicitly import sample source", async ({
  request,
}) => {
  const headers = { origin };
  await request.post("/api/auth/demo", { headers });
  let response = await request.post("/api/projects", {
    headers,
    data: { name: "New workspace", description: "Regression" },
  });
  expect(response.status()).toBe(201);
  const project: Project = await response.json();
  expect(project.repository).toBeNull();
  expect(
    (
      await request.post(`/api/projects/${project.id}/chat`, {
        headers,
        data: { message: "hello" },
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await request.post(`/api/projects/${project.id}/repository`, {
        headers,
        data: { repository: "https://evil.test/x/y" },
      })
    ).status(),
  ).toBe(400);
  response = await request.post(`/api/projects/${project.id}/repository`, {
    headers,
    data: { repository: "sample/orbit" },
  });
  expect(response.status()).toBe(200);
  expect((await response.json()).repository.commit).toBe("demo-snapshot");
  expect(
    (
      await request.post(`/api/projects/${project.id}/repository`, {
        headers,
        data: { repository: "sample/orbit" },
      })
    ).status(),
  ).toBe(409);
});
