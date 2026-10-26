import { test, expect } from "@playwright/test";

test("questionnaire, asset flow, persistence, and print packet", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start a household review" }).click();
  await page.getByLabel("Household name").fill("Interface check");
  await page.getByLabel("Questionnaire completed by").fill("Reviewer");
  await page.getByLabel("Marital status").selectOption("Single");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Add a person" }).first().click();
  await page.getByLabel("Full name").fill("A");
  await page.getByRole("radio", { name: "Other" }).check();
  await page.getByLabel("Describe the relationship").fill("Role");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Add an asset" }).first().click();
  await page.getByLabel("Asset name").fill("Interface asset");
  await page.getByLabel("Estimated value").fill("100");
  await page.getByLabel("Intended beneficiary", { exact: true }).fill("A");
  await page
    .getByLabel("How the client believes it passes")
    .selectOption("Will / probate");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("In their words").fill("User-entered interface check.");
  await page.getByLabel("Intended executor").fill("A");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("checkbox").check();
  await expect(page.getByText("5 of 5 complete")).toBeVisible();
  await page.reload();
  await page.getByRole("link", { name: "Estate flow" }).click();
  await expect(
    page.getByRole("button", { name: "Inspect Interface asset" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Inspect Interface asset" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "No verified source quotes",
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("link", { name: "Review packet" }).click();
  await expect(page.locator(".report-sheet")).toContainText("Interface check");
  await expect(page.locator(".report-sheet")).toContainText(
    "Incomplete review",
  );
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export data" }).click();
  expect((await download).suggestedFilename()).toBe(
    "estate-review-workspace.json",
  );
});

test("rejects invalid review data without inventing findings", async ({
  page,
}) => {
  await page.goto("/#documents");
  await page.getByLabel("Import review JSON").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"documents":[]}'),
  });
  await expect(page.getByRole("alert")).toContainText(
    "does not match the review format",
  );
  await page.getByRole("link", { name: "Review queue" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Good questions start with good evidence",
    }),
  ).toBeVisible();
});

test("import verifies protocol tokens and exposes comparison evidence", async ({
  page,
}) => {
  // Abstract protocol tokens, not estate documents or evaluation fixtures.
  await page.goto("/#questionnaire");
  await page.getByRole("button", { name: "Wishes & roles" }).click();
  await page.getByLabel("Intended executor").fill("A");
  await page.getByRole("link", { name: "Documents", exact: true }).click();
  const packet = {
    schemaVersion: 1,
    verifiedBy: "verify_quotes.py",
    documents: [
      {
        id: "d",
        title: "Protocol token",
        kind: "Other",
        date: "",
        source: "synthetic",
        pages: [{ page: 1, text: "B" }],
      },
    ],
    facts: [
      {
        id: "f",
        documentId: "d",
        subjectId: "household",
        field: "executor",
        value: "B",
        quote: "B",
        page: 1,
        verification: "verified",
      },
    ],
  };
  await page.getByLabel("Import review JSON").setInputFiles({
    name: "protocol.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(packet)),
  });
  await page.getByRole("button", { name: /Protocol token/ }).click();
  await expect(page.getByRole("dialog")).toContainText("Quote verified");
  await page.getByText("Page 1", { exact: true }).click();
  await expect(page.locator(".source-page pre")).toHaveText("B");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("link", { name: "Review queue" }).click();
  await expect(
    page.getByRole("heading", { name: "Executor differs from questionnaire" }),
  ).toBeVisible();
  await expect(page.locator(".finding-card")).toContainText(
    "Protocol token · Page 1",
  );
  await page.getByLabel("Follow-up status").selectOption("attorney");
  await page.getByLabel("Advisor notes").fill("Confirm the source.");
  await page.reload();
  await expect(page.getByLabel("Advisor notes")).toHaveValue(
    "Confirm the source.",
  );
  await page.getByRole("link", { name: "Review packet" }).click();
  await expect(page.locator(".report-sheet")).toContainText(
    "Attorney follow-up",
  );
  await expect(page.locator(".report-sheet")).toContainText(
    "Confirm the source.",
  );
});

test("mobile navigation and layout fit the screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "A clearer picture. A better conversation.",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("link", { name: "Questionnaire" }).click();
  await expect(page.getByLabel("Household name")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("button", { name: "Workspace guide", exact: true })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("actual Python extraction export imports with verified and rejected facts", async ({
  page,
}) => {
  const { execFileSync } = await import("node:child_process");
  const buffer = execFileSync(
    process.env.PYTHON_EXECUTABLE || ".venv/bin/python",
    ["tests/build_backend_packet.py"],
  );
  await page.goto("/#questionnaire");
  await page.getByRole("button", { name: "Wishes & roles" }).click();
  await page.getByLabel("Intended executor").fill("Client intention");
  await page.getByRole("link", { name: "Documents", exact: true }).click();
  await page.getByLabel("Import review JSON").setInputFiles({
    name: "backend.json",
    mimeType: "application/json",
    buffer,
  });
  await page.locator(".document-row").first().click();
  await expect(page.getByRole("dialog")).toContainText(
    "Backend verifier: verified",
  );
  await expect(page.getByRole("dialog")).toContainText(
    "Backend verifier: unverified",
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("link", { name: "Review queue" }).click();
  await expect(
    page.getByRole("heading", { name: "Executor differs from questionnaire" }),
  ).toBeVisible();
  await expect(page.locator(".finding-card")).toContainText("Person Gamma");
  await expect(page.locator(".finding-card")).not.toContainText("Person Omega");
});
