import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
for (const view of [
  "overview",
  "questionnaire",
  "documents",
  "flow",
  "review",
  "report",
]) {
  test(`${view} has no detected WCAG A/AA violations`, async ({ page }) => {
    await page.goto(`/#${view}`);
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(
      result.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          summary: n.failureSummary,
        })),
      })),
    ).toEqual([]);
  });
}
