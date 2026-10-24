import { expect, type Page } from "@playwright/test";

/** Index (0-based) of the first walkthrough step of the current lesson. */
export async function walkthroughStart(page: Page): Promise<number> {
  return Number(await page.locator("[data-walkthrough-start]").getAttribute("data-walkthrough-start"));
}

/** Jump to the k-th walkthrough step (1-based), past the definition/why/analogy/preview intro. */
export async function gotoWalkthroughStep(page: Page, k: number) {
  const start = await walkthroughStart(page);
  await page.getByRole("slider").fill(String(start + k));
  await expect(page.getByTestId("canvas")).toHaveAttribute("data-phase", "walkthrough");
}
