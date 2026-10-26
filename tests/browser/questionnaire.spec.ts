import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("empty-state plus adds a person and relationships are standardized", async ({
  page,
}) => {
  await page.goto("/#questionnaire");
  await page.getByRole("button", { name: /People/ }).click();
  await page.locator(".empty-icon-button").click();
  await expect(page.getByLabel("Full name")).toHaveCount(1);
  await page.getByRole("radio", { name: "Spouse" }).check();
  await expect(page.getByLabel("Describe the relationship")).toHaveCount(0);
  await page.getByRole("radio", { name: "Other" }).check();
  await page.getByLabel("Describe the relationship").fill("wife");
  await page.getByRole("button", { name: "Use Spouse" }).click();
  await expect(page.getByRole("radio", { name: "Spouse" })).toBeChecked();
  await page.getByLabel("Notes or comments").fill("Second marriage.");
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(result.violations.map((v) => v.id)).toEqual([]);
});

test("unfinished steps say what is missing", async ({ page }) => {
  await page.goto("/#questionnaire");
  await expect(page.locator(".step-checklist")).toContainText("Household name");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const household = page.getByRole("button", { name: /Household/ });
  await expect(household).toContainText("3 still needed");
  await household.click();
  await expect(page.getByLabel("Household name")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await page.getByLabel("Household name").fill("Check");
  await expect(
    page.getByText("2 still needed · saved as you go"),
  ).toBeVisible();
});

test("beneficiary shares are percentages and add up visibly", async ({
  page,
}) => {
  await page.goto("/#questionnaire");
  await page.getByRole("button", { name: /Wishes & roles/ }).click();
  await page.getByRole("button", { name: "Add intended beneficiary" }).click();
  await page.getByLabel("Beneficiary 1: share (%)").fill("75");
  await expect(page.getByText("Shares entered: 75% of 100%")).toBeVisible();
  await expect(page.locator(".step-checklist")).toContainText(
    "Shares add up to 75%, not 100%",
  );
  await page.getByRole("button", { name: "Add intended beneficiary" }).click();
  await page.getByLabel("Beneficiary 2: share (%)").fill("25");
  await expect(page.getByText("Shares entered: 100%")).toBeVisible();
});
