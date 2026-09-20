import { expect, test } from "@playwright/test";

const origin = process.env.TEST_BASE_URL ?? "http://localhost:3000";

test("invalid artifact relationships and task updates leave the project unchanged", async ({
  request,
}) => {
  const headers = { origin };
  await request.post("/api/auth/demo", { headers });
  const bootstrap = await (await request.get("/api/bootstrap")).json();
  const id: string = bootstrap.projects[0].id;
  const initial = await (await request.get(`/api/projects/${id}`)).json();
  expect(
    (
      await request.post(`/api/projects/${id}/artifacts`, {
        headers,
        data: { kind: "plan", prompt: "Build it" },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post(`/api/projects/${id}/artifacts`, {
        headers,
        data: { kind: "shell", prompt: "Execute" },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post(`/api/projects/${id}/tasks`, {
        headers,
        data: { planId: "11111111-1111-4111-8111-111111111111" },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.patch(`/api/projects/${id}/tasks`, {
        headers,
        data: { taskId: "11111111-1111-4111-8111-111111111111", status: "done" },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await request.post(`/api/projects/${id}/chat`, {
        headers,
        data: { message: " ", extra: true },
      })
    ).status(),
  ).toBe(400);
  const after = await (await request.get(`/api/projects/${id}`)).json();
  expect(after).toEqual(initial);
});

test("logout expires the session and responses are never cacheable", async ({ request }) => {
  const headers = { origin };
  const login = await request.post("/api/auth/demo", { headers });
  expect(login.headers()["set-cookie"]).toContain("HttpOnly");
  expect(login.headers()["set-cookie"]).toContain("SameSite=lax");
  const response = await request.get("/api/bootstrap");
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["x-frame-options"]).toBe("DENY");
  await request.post("/api/auth/logout", { headers });
  expect((await (await request.get("/api/bootstrap")).json()).session).toBeNull();
  expect(
    (await request.post("/api/projects", { headers, data: { name: "Denied" } })).status(),
  ).toBe(401);
});

test("OAuth callback rejects invalid state without signing in", async ({ request }) => {
  const response = await request.get("/api/auth/github/callback?code=invalid&state=invalid", {
    maxRedirects: 0,
  });
  expect(response.status()).toBe(307);
  expect(response.headers().location).toContain("authError=");
  expect(response.headers()["set-cookie"]).toContain("devpilot_oauth=");
  expect((await (await request.get("/api/bootstrap")).json()).session).toBeNull();
});
