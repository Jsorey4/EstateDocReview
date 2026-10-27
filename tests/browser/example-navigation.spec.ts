import { test, expect } from "@playwright/test";

test("empty estate flow opens the Assets questionnaire step", async ({
  page,
}) => {
  await page.goto("/#flow");
  await page.getByRole("button", { name: "Add household assets" }).click();
  await expect(page).toHaveURL(/#questionnaire$/);
  await expect(page.locator(".form-step.selected")).toContainText("Assets");
});

test("settings and documents use example selection without file inputs", async ({
  page,
}) => {
  await page.goto("/#documents");
  await expect(
    page.getByText("Every observation starts with a source"),
  ).toBeVisible();
  await expect(page.locator("input[type=file]")).toHaveCount(0);
  await page.getByRole("button", { name: "Choose example documents" }).click();
  await expect(
    page.getByRole("dialog", { name: "Choose a household" }),
  ).toBeVisible();
  await expect(page.locator(".example-choice")).toHaveCount(3);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page
    .getByRole("button", { name: "Workspace settings", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Download workspace backup" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Start new household", exact: true })
    .click();
  // Nothing would be lost, so no confirmation is needed.
  await page.getByRole("button", { name: "Start an empty household" }).click();
  await expect(page).toHaveURL(/#questionnaire$/);
});

test("choosing a scenario opens its completed questionnaire, and edits are protected", async ({
  page,
}) => {
  await page.goto("/#overview");
  await page
    .getByRole("button", { name: "Explore an example household" })
    .click();
  await page.locator(".example-choice").first().click();
  await expect(page).toHaveURL(/#questionnaire$/);
  await expect(page.getByText("5 of 5 complete")).toBeVisible();
  await expect(page.getByLabel("Household name *")).toHaveValue(
    "Pendelton household",
  );
  await expect(page.locator(".toast")).toContainText("1 item needs discussion");
  await page
    .getByLabel("Household name *")
    .fill("Pendelton household (edited)");
  await page.locator(".household-switch").click();
  await page.locator(".household-dropdown .example-choice").nth(1).click();
  await expect(
    page.getByRole("dialog", { name: "Start this household?" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Start household", exact: true })
    .click();
  await expect(page.locator(".household-switch")).toContainText("Montgomery");
});

test("household dropdown lists three examples and report numbers exceed heading size", async ({
  page,
}) => {
  await page.goto("/#report");
  await page.locator(".household-switch").click();
  await expect(page.locator(".household-dropdown .example-choice")).toHaveCount(
    3,
  );
  const sizes = await page
    .locator(".report-section > h3")
    .first()
    .evaluate((el) => [
      parseFloat(getComputedStyle(el).fontSize),
      parseFloat(getComputedStyle(el.querySelector("span")!).fontSize),
    ]);
  expect(sizes[1]).toBeGreaterThan(sizes[0]);
  await expect(page.locator("body")).not.toContainText(/synthetic/i);
});
