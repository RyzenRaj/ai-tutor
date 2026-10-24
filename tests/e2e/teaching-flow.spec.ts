import { expect, test } from "@playwright/test";

/** P4 — intuition before mechanics: definition → why → analogy → preview → walkthrough → check → summary. */
const phase = (page: import("@playwright/test").Page) => page.getByTestId("phase");
const next = (page: import("@playwright/test").Page) => page.getByRole("button", { name: "Next step" }).click();

test("binary search opens with a definition and an analogy before the walkthrough", async ({ page }) => {
  await page.goto("/");
  await expect(phase(page)).toHaveAttribute("data-phase", "definition");
  await expect(page.getByTestId("narration")).toContainText("halving");
  await next(page);
  await expect(phase(page)).toHaveAttribute("data-phase", "why");
  await next(page);
  await expect(phase(page)).toHaveAttribute("data-phase", "analogy");
  await expect(page.getByTestId("narration")).toContainText("dictionary");
  await expect(page.getByTestId("narration")).toContainText("Where the analogy stops");
  await expect(page.getByText("explanatory sketch — not a simulation")).toBeVisible();
  await next(page);
  await expect(phase(page)).toHaveAttribute("data-phase", "preview");
  await next(page);
  await expect(phase(page)).toHaveAttribute("data-phase", "walkthrough");
  await expect(page.getByTestId("code-line")).toHaveAttribute("data-lines", "2");
  await expect(page.getByText("verified simulation — every step computed by code")).toBeVisible();
});

test("the lesson ends with a check question and a summary", async ({ page }) => {
  await page.goto("/");
  const total = Number((await page.getByTestId("step-counter").innerText()).split("/")[1]);
  await page.getByRole("slider").fill(String(total - 1));
  await expect(phase(page)).toHaveAttribute("data-phase", "check");
  await expect(page.getByTestId("checkpoint")).toContainText("most comparisons");
  await page.getByTestId("checkpoint").getByRole("button", { name: "4", exact: true }).click();
  await expect(page.getByTestId("checkpoint").getByRole("status")).toContainText("Correct.");
  await next(page);
  await expect(phase(page)).toHaveAttribute("data-phase", "summary");
  for (const part of ["Key insight", "When to use it", "Common mistake"]) await expect(page.getByTestId("narration")).toContainText(part);
});

test("a learner can skip the introduction", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Skip to the walkthrough →" }).click();
  await expect(phase(page)).toHaveAttribute("data-phase", "walkthrough");
  await expect(page.getByRole("button", { name: "Skip to the walkthrough →" })).toHaveCount(0);
});

test("a quick request goes straight to the walkthrough", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("What do you want to learn?").fill("quick binary search for 7 in [1, 3, 5, 7, 9]");
  await page.getByRole("button", { name: "Teach me" }).click();
  await expect(page.getByTestId("lesson-title")).toHaveText("Binary search for 7");
  await expect(phase(page)).toHaveAttribute("data-phase", "walkthrough");
});

for (const pick of ["INNER JOIN", "Spark shuffle"]) {
  test(`${pick} follows the same teaching sequence`, async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: pick, exact: true }).click();
    const seen: string[] = [];
    const total = Number((await page.getByTestId("step-counter").innerText()).split("/")[1]);
    for (let i = 0; i < total; i++) {
      seen.push((await phase(page).getAttribute("data-phase"))!);
      if (i < total - 1) await next(page);
    }
    const order = ["definition", "why", "analogy", "preview", "walkthrough", "check", "summary"];
    expect([...new Set(seen)]).toEqual(order);
  });
}
