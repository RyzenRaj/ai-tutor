// Repeatable browser evidence for a quality review (docs/quality/review-checklist.md).
// Usage: start the app (npm run build && npm start), then
//   REVIEW_URL=http://localhost:3000 npm run review:browser
// Prints a JSON report: console errors, failed requests, long tasks, zoom stability,
// per-frame motion speed for normal / interrupted / rapid navigation, and axe violations.
// It gathers evidence only; the reviewer still judges it and writes findings.
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const BASE = process.env.REVIEW_URL ?? "http://localhost:3000";
const report = { url: BASE, at: new Date().toISOString(), console: [], failedRequests: [], longTasksMs: [], lessons: {}, motion: {}, axe: {} };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on("console", (m) => ["error", "warning"].includes(m.type()) && report.console.push(`${m.type()}: ${m.text()}`));
page.on("pageerror", (e) => report.console.push(`pageerror: ${e}`));
page.on("requestfailed", (r) => report.failedRequests.push(`${r.url()} ${r.failure()?.errorText}`));
page.on("response", (r) => r.status() >= 400 && report.failedRequests.push(`${r.status()} ${r.url()}`));
await page.addInitScript(() => {
  window.__long = [];
  try {
    new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push(Math.round(e.duration)))).observe({ type: "longtask", buffered: true });
  } catch {}
});
await page.goto(BASE);
await page.getByTestId("lesson-title").waitFor();

const next = () => page.getByRole("button", { name: "Next step" }).click();
const prev = () => page.getByRole("button", { name: "Previous step" }).click();
const walkStep = async (k) => {
  const start = Number(await page.locator("[data-walkthrough-start]").getAttribute("data-walkthrough-start"));
  await page.getByRole("slider").fill(String(start + k)); // k-th walkthrough step (after the intro)
};
const total = async () => Number((await page.getByTestId("step-counter").innerText()).split("/")[1]);

async function maxSpeed(selector, act, ms = 1300) {
  await page.evaluate(([sel, dur]) => {
    window.__s = [];
    const t0 = performance.now();
    const loop = (t) => {
      const el = document.querySelector(sel);
      if (el) { const r = el.getBoundingClientRect(); window.__s.push([t, r.left, r.top]); }
      if (t - t0 < dur) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }, [selector, ms]);
  await act();
  await page.waitForTimeout(ms + 100);
  return page.evaluate(() => {
    let m = 0;
    for (let i = 1; i < window.__s.length; i++) {
      const dt = Math.max(1, window.__s[i][0] - window.__s[i - 1][0]);
      m = Math.max(m, Math.hypot(window.__s[i][1] - window.__s[i - 1][1], window.__s[i][2] - window.__s[i - 1][2]) / dt);
    }
    return Number(m.toFixed(2));
  });
}

for (const pick of ["Binary search", "INNER JOIN", "LEFT JOIN", "Spark shuffle"]) {
  await page.getByRole("button", { name: pick, exact: true }).click();
  const n = await total();
  const zooms = [];
  const missingFocus = [];
  for (let i = 0; i < n; i++) {
    await page.waitForTimeout(200);
    zooms.push(Number(await page.getByTestId("canvas").getAttribute("data-zoom")));
    if ((await page.getByTestId("focus-ring").count()) === 0) missingFocus.push(i + 1);
    if (i < n - 1) await next();
  }
  report.lessons[pick] = { steps: n, zooms, missingFocusOnSteps: missingFocus };
}

await page.getByRole("button", { name: "Binary search", exact: true }).click();
await walkStep(3);
await page.waitForTimeout(800);
report.motion["pointer, normal step (px/ms)"] = await maxSpeed("[data-testid=pointer-low]", next);
await walkStep(3);
await page.waitForTimeout(800);
report.motion["pointer, reversed mid-move (px/ms)"] = await maxSpeed("[data-testid=pointer-low]", async () => { await next(); await page.waitForTimeout(150); await prev(); });
await walkStep(1);
await page.waitForTimeout(800);
report.motion["pointer, 6 rapid nexts (px/ms)"] = await maxSpeed("[data-testid=pointer-low]", async () => { for (let i = 0; i < 6; i++) await next(); });
report.motion.note = "Smooth moves stay below ~3 px/ms; > 4 px/ms in one frame is a teleport.";

report.axe.canvas = (await new AxeBuilder({ page }).analyze()).violations.map((v) => `${v.impact} ${v.id} ×${v.nodes.length}`);
await page.getByRole("tab", { name: /Editor/ }).click();
report.axe.editor = (await new AxeBuilder({ page }).analyze()).violations.map((v) => `${v.impact} ${v.id} ×${v.nodes.length}`);
report.longTasksMs = await page.evaluate(() => window.__long);

await browser.close();
console.log(JSON.stringify(report, null, 2));
