import { expect, test, type Page } from "@playwright/test";

const counter = (page: Page) => page.getByTestId("step-counter");
const activeLines = (page: Page) => page.locator("[data-testid=code-panel] li[data-active]").evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-line"))));
const stateVar = (page: Page, name: string) => page.locator(`[data-testid=state] dd[data-var="${name}"]`).innerText();

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("lesson-title")).toHaveText("Binary search for 34");
});

test("starts with a verified binary search lesson in demo mode", async ({ page }) => {
  await expect(page.getByTestId("fidelity-badge")).toHaveText("Verified simulation");
  await expect(page.getByTestId("mode-badge")).toContainText("Demo mode");
  await expect(counter(page)).toHaveText(/^1 \/ \d+$/);
  expect(await activeLines(page)).toEqual([2]);
});

test("code, pointers, state and narration stay in sync on every step", async ({ page }) => {
  const total = Number((await counter(page).innerText()).split("/")[1]);
  for (let i = 0; i < total; i++) {
    await expect(counter(page)).toHaveText(`${i + 1} / ${total}`);
    const lines = await activeLines(page);
    expect(lines.length).toBeGreaterThan(0);
    const low = Number(await stateVar(page, "low"));
    const high = Number(await stateVar(page, "high"));
    const lowPtr = page.getByTestId("pointer-low");
    if (low < 10) await expect(lowPtr).toHaveAttribute("data-index", String(low));
    if (high >= 0) await expect(page.getByTestId("pointer-high")).toHaveAttribute("data-index", String(high));
    const midText = await stateVar(page, "mid");
    if ((await page.getByTestId("pointer-mid").count()) > 0) await expect(page.getByTestId("pointer-mid")).toHaveAttribute("data-index", midText);
    if (lines.includes(4)) await expect(page.getByTestId("narration")).toContainText(`mid = (${low} + ${high}) // 2 = ${midText}`);
    if (i < total - 1) await page.getByRole("button", { name: "Next step" }).click();
  }
  await expect(page.getByTestId("narration")).toContainText("return index 7");
  await expect(page.getByRole("button", { name: "Next step" })).toBeDisabled();
  await page.getByRole("button", { name: "Replay from start" }).click();
  await expect(counter(page)).toHaveText(`1 / ${total}`);
});

test("autoplay pauses at a question; answering gives feedback", async ({ page }) => {
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(counter(page)).toHaveText(/^2 \//, { timeout: 4000 });
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible(); // paused
  const cp = page.getByTestId("checkpoint");
  await cp.getByRole("button", { name: "Search right: low = mid + 1" }).click();
  await expect(cp.getByRole("status")).toContainText("Correct.");
});

test("keyboard navigation works, but not while typing", async ({ page }) => {
  await page.locator("body").press("ArrowRight");
  await expect(counter(page)).toHaveText(/^2 \//);
  await page.locator("body").press("ArrowLeft");
  await expect(counter(page)).toHaveText(/^1 \//);
  await page.getByLabel("What do you want to learn?").focus();
  await page.keyboard.press("ArrowRight");
  await expect(counter(page)).toHaveText(/^1 \//);
});

test("custom input is validated before visualizing", async ({ page }) => {
  await page.getByText("Try your own binary search input").click();
  await page.getByLabel("Sorted values").fill("5, 1, 3");
  await page.getByRole("button", { name: "Visualize" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "sorted" })).toBeVisible();
  await page.getByLabel("Sorted values").fill("");
  await page.getByRole("textbox", { name: "Target" }).fill("4");
  await page.getByRole("button", { name: "Visualize" }).click();
  await expect(page.getByTestId("lesson-title")).toHaveText("Binary search for 4");
  await expect(counter(page)).toHaveText("1 / 2");
  await expect(page.getByTestId("scene")).toContainText("empty array");
});

test("SQL JOIN and Spark shuffle lessons render with their own visuals", async ({ page }) => {
  await page.getByRole("button", { name: "LEFT JOIN" }).click();
  await expect(page.getByTestId("lesson-title")).toHaveText("SQL LEFT JOIN");
  await page.getByRole("slider").fill("12");
  await expect(page.getByTestId("scene")).toContainText("NULL");
  await page.getByRole("button", { name: "Spark shuffle" }).click();
  await expect(page.getByTestId("lesson-title")).toHaveText("Spark shuffle: reduceByKey");
  await page.getByRole("slider").fill("4");
  await expect(page.getByTestId("scene")).toContainText("Reduce task 1");
  await expect(page.getByTestId("scene").locator("svg path[d]")).not.toHaveCount(0); // flow arrows
  await page.getByText("Assumptions & limits").click();
  await expect(page.getByText(/not a Spark execution engine/)).toBeVisible();
});

test("asking the tutor in demo mode is labeled as a fixture; unknown topics are illustrative", async ({ page }) => {
  await page.getByLabel("What do you want to learn?").fill("binary search for 9 in [1, 9, 4]");
  await page.getByRole("button", { name: "Teach me" }).click();
  await expect(page.getByTestId("lesson-title")).toHaveText("Binary search for 9");
  await expect(page.getByText("Demo fixture (no live AI)")).toBeVisible();
  await expect(page.getByText(/were sorted first/)).toBeVisible();
  await page.getByLabel("What do you want to learn?").fill("explain TCP handshakes");
  await page.getByRole("button", { name: "Teach me" }).click();
  await expect(page.getByTestId("fidelity-badge")).toHaveText("Illustrative sketch");
});

test("respects reduced motion", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.getByRole("button", { name: "Next step" }).click();
  await page.getByRole("button", { name: "Next step" }).click();
  const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running" && (a.effect?.getComputedTiming().duration as number) > 50).length);
  expect(running).toBe(0);
  await ctx.close();
});
