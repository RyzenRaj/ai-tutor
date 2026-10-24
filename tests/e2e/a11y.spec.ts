import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/** F9 and ongoing: no serious/critical axe violations on the main views, in both colour schemes. */
for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`accessibility (${colorScheme})`, () => {
    test.use({ colorScheme });

    test("Canvas and Editor have no serious or critical violations", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByTestId("lesson-title")).toBeVisible();
      await page.getByRole("button", { name: "Next step" }).click(); // a step with a question on the board
      await page.waitForTimeout(1200);
      const views: Record<string, string[]> = {};
      const scan = async (name: string) => {
        const r = await new AxeBuilder({ page }).analyze();
        views[name] = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`);
      };
      await scan("canvas");
      await page.getByRole("tab", { name: /Editor/ }).click();
      await scan("editor");
      expect(views).toEqual({ canvas: [], editor: [] });
    });
  });
}
