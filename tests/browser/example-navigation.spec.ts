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
  await page.locator(".household-dropdown .household-option").nth(1).click();
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
  // The sidebar list mirrors the switch: three cases plus a new household, same size.
  const options = page.locator(".household-dropdown .household-option");
  await expect(options).toHaveCount(4);
  await expect(options.first()).toContainText("A. Pendelton");
  await expect(options.first().locator(".household-avatar")).toHaveText("AP");
  await expect(options.nth(1)).toContainText("R. Montgomery");
  await expect(options.nth(2)).toContainText("V. Thorne");
  const switchBox = await page.locator(".household-switch").boundingBox();
  for (const box of await Promise.all(
    (await options.all()).map((o) => o.boundingBox()),
  )) {
    expect(box!.width).toBeCloseTo(switchBox!.width, 0);
    expect(box!.height).toBeCloseTo(switchBox!.height, 0);
  }
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

test("advisor topics, source PDF button, and locked Texas field", async ({
  page,
}) => {
  await page.goto("/#overview");
  await page
    .getByRole("button", { name: "Explore an example household" })
    .click();
  await page.locator(".example-choice").first().click();
  await expect(page.getByLabel("State of residence")).toBeDisabled();
  await page.goto("/#documents");
  await page.locator(".document-row").first().click();
  await expect(
    page.getByRole("link", { name: "Open source PDF" }),
  ).toHaveAttribute("href", /examples\/pdfs\/.+\.pdf$/);
  await expect(page.locator(".source-page")).toHaveCount(0);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.goto("/#review");
  await page.getByRole("button", { name: "Add a topic" }).click();
  await page.getByLabel("New topic").fill("Did you follow up on topic X?");
  await page.getByRole("button", { name: "Add topic", exact: true }).click();
  await expect(page.locator(".advisor-topics")).toContainText("1 open");
  await page.getByLabel("Resolved", { exact: true }).check();
  await page
    .getByLabel("How was it resolved? (optional)")
    .fill("Confirmed by phone.");
  await page.reload();
  await expect(page.getByLabel("Resolved", { exact: true })).toBeChecked();
  await page.goto("/#report");
  await expect(page.locator(".report-topics")).toContainText(
    "Resolution: Confirmed by phone.",
  );
});
