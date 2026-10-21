import { expect, test, type Page } from "@playwright/test";

const counter = (page: Page) => page.getByTestId("step-counter");
// The canvas shows the active code line(s); the full code lives in the Editor tab.
const activeLines = async (page: Page) => ((await page.getByTestId("code-line").getAttribute("data-lines")) ?? "").split(",").filter(Boolean).map(Number);
const editorLines = (page: Page) => page.locator("[data-testid=code-panel] li[data-active]").evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-line"))));
const stateVar = (page: Page, name: string) => page.locator(`[data-testid=state] dd[data-var="${name}"]`).innerText();

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("lesson-title")).toHaveText("Binary search for 34");
});

test("starts on the teaching canvas with a verified binary search lesson in demo mode", async ({ page }) => {
  await expect(page.getByRole("tab", { name: /Canvas/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("canvas")).toBeVisible();
  await expect(page.getByTestId("code-panel")).toHaveCount(0); // the editor is a separate view
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
  await page.getByText("Your own binary search…").click();
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
  await page.getByText("About this lesson").click();
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

test("the tutor points at what it is talking about", async ({ page }) => {
  await page.getByRole("button", { name: "Next step" }).click();
  await expect(page.getByTestId("board-title")).toHaveText("Pick the middle candidate");
  await expect(page.getByTestId("focus-ring")).toBeVisible();
  await expect(page.getByTestId("callout")).toHaveAttribute("d", /^M/);
  // The ring surrounds the mid cell named in the state.
  const mid = await stateVar(page, "mid");
  const ring = await page.getByTestId("focus-ring").boundingBox();
  const cell = await page.locator(`[data-scene-id="cell-${mid}"]`).boundingBox();
  expect(ring && cell && ring.x <= cell.x && ring.x + ring.width >= cell.x + cell.width).toBeTruthy();
});

test("Editor tab is a separate view that follows the same step", async ({ page }) => {
  await page.getByRole("button", { name: "Next step" }).click();
  await page.getByRole("button", { name: "Next step" }).click();
  const canvasLines = await activeLines(page);
  await page.getByTestId("code-line").click(); // "open in Editor"
  await expect(page.getByRole("tab", { name: /Editor/ })).toHaveAttribute("aria-selected", "true");
  expect(await editorLines(page)).toEqual(canvasLines);
  await expect(page.getByTestId("editor-step")).toContainText("Step 3 of");
  await page.getByRole("button", { name: "Next step" }).click();
  await expect(page.getByTestId("editor-step")).toContainText("Step 4 of");
  await page.getByRole("tab", { name: /Canvas/ }).click();
  await expect(counter(page)).toHaveText(/^4 \//);
});

test("learner can draw, erase and zoom on the canvas", async ({ page }) => {
  const canvas = page.getByTestId("canvas");
  const box = (await canvas.boundingBox())!;
  await page.getByRole("button", { name: "Pen", exact: true }).click();
  await page.mouse.move(box.x + 300, box.y + 400);
  await page.mouse.down();
  await page.mouse.move(box.x + 360, box.y + 430, { steps: 6 });
  await page.mouse.move(box.x + 420, box.y + 400, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator("[data-testid=ink-layer] path[data-stroke=pen]")).toHaveCount(1);
  await page.getByRole("button", { name: "Eraser" }).click();
  await page.mouse.move(box.x + 360, box.y + 430);
  await page.mouse.down();
  await page.mouse.move(box.x + 362, box.y + 431);
  await page.mouse.up();
  await expect(page.locator("[data-testid=ink-layer] path")).toHaveCount(0);

  const before = await page.getByTestId("zoom-level").innerText();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(page.getByTestId("zoom-level")).not.toHaveText(before);
  await page.getByRole("button", { name: "Fit board to screen" }).click();
  await expect(page.getByTestId("zoom-level")).toHaveText(before);

  // Hand tool pans the board.
  await page.getByRole("button", { name: "Move board" }).click();
  const title = page.getByTestId("board-title");
  const t0 = (await title.boundingBox())!;
  await page.mouse.move(box.x + 600, box.y + box.height - 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 500, box.y + box.height - 90, { steps: 5 });
  await page.mouse.up();
  const t1 = (await title.boundingBox())!;
  expect(Math.round(t0.x - t1.x)).toBe(100);
});
