import { expect, test } from "@playwright/test";

test("smoke: renders and steps without horizontal page scroll", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("lesson-title")).toBeVisible();
  await page.getByRole("button", { name: "Next step" }).click();
  await expect(page.getByTestId("step-counter")).toHaveText(/^2 \//);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
