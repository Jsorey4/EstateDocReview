import { test, expect } from "@playwright/test";
test("theme persists, covers pages, and print remains light", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/#overview");
  await page.getByRole("button", { name: "Dark mode", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  for (const route of [
    "overview",
    "questionnaire",
    "documents",
    "flow",
    "review",
    "report",
    "replay",
  ]) {
    await page.goto("/#" + route);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  }
  await page.goto("/#report");
  await expect(page.locator(".report-metrics")).not.toContainText(
    "Verified quotes",
  );
  await expect(page.locator(".report-metrics > div")).toHaveCount(3);
  await page.screenshot({
    path: "/private/tmp/estate-dark-report.png",
    fullPage: true,
  });
  await page.emulateMedia({ media: "print" });
  expect(
    await page
      .locator("body")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe("rgb(255, 255, 255)");
});
test("judges can load each prefilled PDF scenario", async ({ page }) => {
  await page.goto("/");
  for (const [i, name] of [
    [0, "Pendelton"],
    [1, "Montgomery"],
    [2, "Thorne"],
  ] as const) {
    await page.locator(".household-switch").click();
    const choice = page.locator(".example-choice").nth(i);
    await expect(choice).toBeEnabled();
    await choice.click();
    await expect(page.locator(".household-switch")).toContainText(name);
    await expect(page).toHaveURL(/#questionnaire$/);
    await page.goto("/#documents");
    await expect(page.locator(".document-row")).toHaveCount(i === 2 ? 6 : 5);
  }
  await page.getByRole("button", { name: "Dark mode", exact: true }).click();
  await expect
    .poll(async () => {
      const rowBackground = await page
        .locator(".document-row")
        .first()
        .evaluate((el) => getComputedStyle(el).backgroundColor);
      return Math.max(...rowBackground.match(/\d+/g)!.slice(0, 3).map(Number));
    })
    .toBeLessThan(48);
  await page.screenshot({
    path: "/private/tmp/estate-dark-documents.png",
    fullPage: true,
    animations: "disabled",
  });
});
