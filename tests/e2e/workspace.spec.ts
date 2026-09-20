import { expect, test } from "@playwright/test";

test.describe("DevPilot Workspace Browser UI", () => {
  test("full browser journey: landing, demo workspace, cited chat, planning and settings", async ({
    page,
  }) => {
    // 1. Landing page
    await page.goto("/");
    await expect(page).toHaveTitle(/DevPilot/);
    await expect(page.locator("h1")).toContainText("Know your code");
    await expect(page.getByRole("button", { name: /Explore the demo/i })).toBeVisible();

    // 2. Start demo
    await page.getByRole("button", { name: /Explore the demo/i }).click();
    await expect(page.locator(".demo-banner")).toContainText("Demo mode");
    await expect(page.locator(".page-heading h1")).toContainText("Your projects");

    // Pre-seeded Orbit project card should be present
    const orbitCard = page.locator(".project-card").filter({ hasText: "Orbit" });
    await expect(orbitCard).toBeVisible();

    // 3. Open project & explore Codebase chat
    await orbitCard.click();
    await expect(page.locator(".repository-strip")).toContainText("sample/orbit");
    await expect(page.getByRole("heading", { name: "Codebase chat" })).toBeVisible();

    // Suggestions should be visible when chat has existing or new conversation
    // Send a question in chat
    const textarea = page.locator("#chat-message");
    await textarea.fill("How does session authentication work in Orbit?");
    await page.locator(".send-button").click();

    // Wait for assistant response
    const assistantMessage = page.locator(".message.message-assistant").last();
    await expect(assistantMessage).toBeVisible({ timeout: 10_000 });
    await expect(assistantMessage).toContainText("auth.ts");

    // 4. Citation and Source viewer dialog
    const citation = assistantMessage.locator(".citation").first();
    await expect(citation).toBeVisible();
    await citation.click();

    // Source viewer dialog opens
    const dialog = page.locator("dialog[open]");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("h2")).toContainText("Source viewer");
    await expect(dialog.locator(".cited-line").first()).toBeVisible();

    // Close source viewer
    await dialog.getByRole("button", { name: "Close source", exact: true }).click();
    await expect(page.locator("dialog[open]")).not.toBeVisible();

    // 5. Specs & plans navigation: generate spec -> generate plan -> create tasks
    await page.getByRole("button", { name: /Specs & plans/i }).click();
    await expect(page.locator(".artifact-sidebar h2")).toContainText("Shape the work");

    // Generate a specification
    await page
      .locator("#artifact-prompt")
      .fill("Add role-based access control with admin and member roles.");
    await page.getByRole("button", { name: /Generate specification/i }).click();

    // Specification appears in document viewer
    await expect(page.locator(".artifact-document h2")).toContainText("Specification", {
      timeout: 10_000,
    });

    // Generate an implementation plan linked to the specification
    await page.locator("#artifact-kind").selectOption("plan");
    await page.locator("#artifact-parent").selectOption({ index: 1 });
    await page
      .locator("#artifact-prompt")
      .fill("Plan the migration, auth checks and route guards.");
    await page.getByRole("button", { name: /Generate plan/i }).click();

    // Plan document appears with "Create tasks" button
    const createTasksButton = page.getByRole("button", { name: /Create tasks/i });
    await expect(createTasksButton).toBeVisible({ timeout: 10_000 });
    await createTasksButton.click();

    // Implementation tasks section displays generated tasks
    await expect(page.locator(".task-section")).toBeVisible();
    const firstTask = page.locator(".task-row").first();
    await expect(firstTask).toBeVisible({ timeout: 10_000 });

    // Update task status to "Done"
    const statusSelect = firstTask.locator("select");
    await statusSelect.selectOption("done");
    await expect(firstTask.locator(".task-done")).toBeVisible({ timeout: 5_000 });

    // 6. Settings & Sign out
    await page.getByRole("button", { name: /Settings/i }).click();
    await expect(page.locator(".settings-layout")).toBeVisible();
    await expect(page.locator(".settings-section h2").first()).toContainText("Account & session");

    // Click Sign out
    await page.getByRole("button", { name: /Sign out/i }).click();
    await expect(page.locator(".landing-copy h1")).toContainText("Know your code", {
      timeout: 8_000,
    });
  });

  test("dialog accessibility and keyboard controls", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Explore the demo/i }).click();
    await expect(page.locator(".page-heading h1")).toContainText("Your projects");

    // Open "New project" modal
    await page.getByRole("button", { name: /New project/i }).click();
    const modal = page.locator("dialog[open]");
    await expect(modal).toBeVisible();
    await expect(modal.locator("#project-name")).toBeFocused();

    // Press Escape to close modal
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog[open]")).not.toBeVisible();
  });
});
