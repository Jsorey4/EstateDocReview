import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { execFileSync } from "node:child_process";

// Bundles come from bridge/build_replay_samples.py run on the placeholder unit-test fixture; nothing is written to public/.
let files: Record<string, string> = {};
test.beforeAll(() => {
  files = JSON.parse(
    execFileSync(process.env.PYTHON_EXECUTABLE || ".venv/bin/python", [
      "tests/helpers/build_sample_bundles.py",
    ]).toString(),
  ).files;
});
const serve = (page: Page, available = true) =>
  page.route("**/samples/*.json", (route) => {
    const name = new URL(route.request().url()).pathname.split("/").pop()!;
    return available && files[name]
      ? route.fulfill({ contentType: "application/json", body: files[name] })
      : route.fulfill({ status: 404, body: "" });
  });
const axe = async (page: Page) =>
  (
    await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()
  ).violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }));

test("explains how to publish samples when none exist", async ({ page }) => {
  await serve(page, false);
  await page.goto("/#replay");
  await expect(
    page.getByRole("heading", { name: "No sample runs published yet" }),
  ).toBeVisible();
  expect(await axe(page)).toEqual([]);
});

test("steps through a clean run and a mutated variant", async ({ page }) => {
  await serve(page);
  await page.goto("/#replay");
  await page.getByLabel("Household variant").selectOption("B_clean");
  await expect(
    page.getByRole("heading", { name: "Source documents" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next step" }).click();
  await expect(
    page.getByRole("heading", { name: "Structured extraction" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Advisor review/ }).click();
  await expect(
    page.getByText("Zero material findings", { exact: true }),
  ).toBeVisible();
  expect(await axe(page)).toEqual([]);

  // The step is kept when the variant changes, so the two runs can be compared.
  await page
    .getByLabel("Household variant")
    .selectOption("A01_former_spouse_designation__bd_primary");
  const card = page.locator(".replay-finding");
  await expect(card).toHaveCount(1);
  await expect(card).toContainText("Former spouse named on a designation");
  await expect(card).toContainText(
    "Not a substitute for the advice of an attorney.",
  );
  await card.getByRole("button", { name: /page 1/ }).click();
  await expect(page.getByRole("dialog").locator("mark")).toHaveText(
    "Primary Beneficiary: Person Delta, 100%",
  );
  await page.getByRole("button", { name: "Close dialog" }).click();

  await page.getByRole("button", { name: /Evaluation/ }).click();
  await expect(
    page.getByText("Planted issues caught", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Home");
  await expect(
    page.getByRole("heading", { name: "Source documents", level: 2 }),
  ).toBeVisible();
  await page.keyboard.press("End");
  await expect(
    page.getByRole("heading", { name: "Evaluation", level: 2 }),
  ).toBeVisible();
});

test("opens a sample in the workspace", async ({ page }) => {
  await serve(page);
  await page.goto("/#replay");
  await page
    .getByLabel("Household variant")
    .selectOption("A01_former_spouse_designation__bd_primary");
  await page.getByRole("button", { name: "Open in workspace" }).click();
  await expect(page.getByRole("status")).toContainText("Sample opened");
  await page.getByRole("link", { name: "Documents" }).click();
  await expect(page.locator(".document-row")).toHaveCount(5);
  await page.getByRole("link", { name: "Review queue" }).click();
  const item = page.locator(".finding-card");
  await expect(item).toHaveCount(1);
  await expect(item).toContainText("Former spouse named on a designation");
  await expect(item).toContainText("Primary Beneficiary: Person Delta, 100%");
  await expect(item).toContainText("marriages[0]");
  await item.getByLabel("Follow-up status").selectOption("attorney");
  await page.getByRole("link", { name: "Review packet" }).click();
  await expect(page.locator(".report-finding")).toContainText(
    "Former spouse named on a designation",
  );
  await expect(page.locator(".report-finding")).toContainText(
    "Attorney follow-up",
  );

  await page.getByRole("link", { name: "Sample replay" }).click();
  await page.getByLabel("Household variant").selectOption("B_clean");
  await page.getByRole("button", { name: "Open in workspace" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Replace the current workspace?",
  );
  await page.getByRole("button", { name: "Open sample" }).click();
  await page.getByRole("link", { name: "Review queue" }).click();
  await expect(
    page.getByRole("heading", { name: "No material findings" }),
  ).toBeVisible();
  expect(await axe(page)).toEqual([]);
});
