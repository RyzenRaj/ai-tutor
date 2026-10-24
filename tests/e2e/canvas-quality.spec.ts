import { expect, test, type Page } from "@playwright/test";
import { gotoWalkthroughStep } from "./helpers";

/**
 * Regression tests from docs/quality/findings-2026-10-24.md.
 * Each test names the finding it guards.
 */

const counter = (page: Page) => page.getByTestId("step-counter");
const stepCount = async (page: Page) => Number((await counter(page).innerText()).split("/")[1]);

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("lesson-title")).toBeVisible();
});

// F2 — the tutor must point at something on every step of every verified lesson.
for (const pick of ["Binary search", "Binary search (absent)", "INNER JOIN", "LEFT JOIN", "Spark shuffle"]) {
  test(`F2: every step of "${pick}" has a focus ring and a teacher arrow`, async ({ page }) => {
    await page.getByRole("button", { name: pick, exact: true }).click();
    const total = await stepCount(page);
    for (let i = 0; i < total; i++) {
      await expect(counter(page)).toHaveText(`${i + 1} / ${total}`);
      await expect(page.getByTestId("focus-ring"), `step ${i + 1} ring`).toHaveCount(1);
      await expect(page.getByTestId("callout"), `step ${i + 1} arrow`).toHaveCount(1);
      if (i < total - 1) await page.getByRole("button", { name: "Next step" }).click();
    }
  });
}

// F1 — stepping must not make the board jump scale. Acceptance: the zoom never increases while
// stepping, and it only decreases on a step whose board is taller than anything shown before
// (content that would otherwise not fit). Oscillation like 1.00 → 1.18 → 1.03 fails.
for (const vp of [{ width: 1280, height: 720 }, { width: 1440, height: 900 }]) test(`F1: zoom only shrinks, and only when the board grows (${vp.width}×${vp.height})`, async ({ page }) => {
  await page.setViewportSize(vp);
  await page.goto("/");
  for (const pick of ["Binary search", "LEFT JOIN", "Spark shuffle"]) {
    await page.getByRole("button", { name: pick, exact: true }).click();
    const total = await stepCount(page);
    const zooms: number[] = [];
    const heights: number[] = [];
    for (let i = 0; i < total; i++) {
      await expect(counter(page)).toHaveText(`${i + 1} / ${total}`);
      await page.waitForTimeout(150);
      zooms.push(Number(await page.getByTestId("canvas").getAttribute("data-zoom")));
      heights.push(await page.getByTestId("canvas").locator(":scope > div").first().evaluate((el) => (el as HTMLElement).offsetHeight));
      if (i < total - 1) await page.getByRole("button", { name: "Next step" }).click();
    }
    const trace = `${pick}: zoom ${zooms.join(" ")} | height ${heights.join(" ")}`;
    for (let i = 1; i < zooms.length; i++) {
      expect(zooms[i], trace).toBeLessThanOrEqual(zooms[i - 1]);
      if (zooms[i] < zooms[i - 1]) expect(heights[i], trace).toBeGreaterThan(Math.max(...heights.slice(0, i)));
    }
  }
});

// F3 — transitions must be continuous, including when interrupted.
/** Samples an element's on-screen position every frame; returns the fastest frame-to-frame speed (px/ms). */
async function sampleMaxSpeed(page: Page, selector: string, act: () => Promise<void>, ms = 1300) {
  await page.evaluate(
    ([sel, dur]) => {
      const w = window as unknown as { __samples: [number, number, number][] };
      w.__samples = [];
      const t0 = performance.now();
      const loop = (t: number) => {
        const el = document.querySelector(sel as string);
        if (el) {
          const r = el.getBoundingClientRect();
          w.__samples.push([t, r.left, r.top]);
        }
        if (t - t0 < (dur as number)) requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    },
    [selector, ms] as const,
  );
  await act();
  await page.waitForTimeout(ms + 100);
  return page.evaluate(() => {
    const s = (window as unknown as { __samples: [number, number, number][] }).__samples;
    let max = 0;
    for (let i = 1; i < s.length; i++) {
      const dt = Math.max(1, s[i][0] - s[i - 1][0]);
      max = Math.max(max, Math.hypot(s[i][1] - s[i - 1][1], s[i][2] - s[i - 1][2]) / dt);
    }
    return { maxSpeed: max, frames: s.length };
  });
}
/** Teleports show up as > 4 px/ms (≈ 65 px in one 60 fps frame); smooth moves here peak well below that. */
const TELEPORT_PX_PER_MS = 4;

test.describe("F3: smooth and interruptible transitions", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
  });

  test("a pointer glides when stepping", async ({ page }) => {
    await gotoWalkthroughStep(page, 3);
    await page.waitForTimeout(800);
    const r = await sampleMaxSpeed(page, "[data-testid=pointer-low]", () => page.getByRole("button", { name: "Next step" }).click());
    expect(r.frames).toBeGreaterThan(20);
    expect(r.maxSpeed).toBeLessThan(TELEPORT_PX_PER_MS);
  });

  test("reversing mid-move continues from where the pointer is", async ({ page }) => {
    await gotoWalkthroughStep(page, 3);
    await page.waitForTimeout(800);
    const r = await sampleMaxSpeed(page, "[data-testid=pointer-low]", async () => {
      await page.getByRole("button", { name: "Next step" }).click();
      await page.waitForTimeout(150);
      await page.getByRole("button", { name: "Previous step" }).click();
    });
    expect(r.maxSpeed).toBeLessThan(TELEPORT_PX_PER_MS);
    await expect(page.getByTestId("pointer-low")).toHaveAttribute("data-index", "0");
  });

  test("Spark records reverse smoothly across the shuffle", async ({ page }) => {
    await page.getByRole("button", { name: "Spark shuffle", exact: true }).click();
    await gotoWalkthroughStep(page, 3);
    await page.waitForTimeout(800);
    const r = await sampleMaxSpeed(page, "[data-scene-id='rec-0-0']", async () => {
      await page.getByRole("button", { name: "Next step" }).click();
      await page.waitForTimeout(200);
      await page.getByRole("button", { name: "Previous step" }).click();
    });
    expect(r.maxSpeed).toBeLessThan(TELEPORT_PX_PER_MS);
  });

  test("rapid navigation settles on the correct, untransformed state", async ({ page }) => {
    await gotoWalkthroughStep(page, 1);
    await page.waitForTimeout(600);
    for (let i = 0; i < 6; i++) await page.getByRole("button", { name: "Next step" }).click({ delay: 0 });
    await page.waitForTimeout(1200);
    await expect(page.getByTestId("narration")).toContainText("return index 7");
    for (const name of ["low", "high", "mid"]) {
      const v = await page.locator(`[data-testid=state] dd[data-var="${name}"]`).innerText();
      await expect(page.getByTestId(`pointer-${name}`)).toHaveAttribute("data-index", v);
    }
    // No leftover or stacked movement animations, and pointers rest exactly at their layout position.
    const leftovers = await page.evaluate(() => document.getAnimations().filter((a) => a.id === "scene-flip" || a.id === "scene-enter").length);
    expect(leftovers).toBe(0);
    const transforms = await page.evaluate(() => [...document.querySelectorAll("[data-testid^=pointer-]")].map((el) => getComputedStyle(el).transform));
    expect(transforms.every((t) => t === "none")).toBe(true);
  });
});

// F4 — the tutor's ring and arrow are drawn after the focused element has arrived.
test("F4: focus marker waits for the move to finish", async ({ page }) => {
  await gotoWalkthroughStep(page, 3);
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: "Next step" }).click(); // low pointer moves 0 → 5
  const offset = () =>
    page.evaluate(() => Number(getComputedStyle(document.querySelector("[data-testid=focus-ring]")!).strokeDashoffset.replace("px", "")));
  await page.waitForTimeout(250);
  expect(await offset()).toBeGreaterThan(0.99); // still undrawn while the pointer glides
  await page.waitForTimeout(1300);
  expect(await offset()).toBeLessThan(0.01); // fully drawn once settled
});
