import { expect, test, type Page, type Route } from "@playwright/test";
import { gotoWalkthroughStep } from "./helpers";

/**
 * P5 voice narration, with the Kokoro server mocked at our own /api/tts boundary.
 * The browser really decodes and plays the returned WAV (headless Chromium, no speakers).
 */
function wav(seconds = 0.4, rate = 24000) {
  const n = Math.floor(seconds * rate);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 8000), 44 + i * 2);
  return buf;
}

type TtsMock = { texts: string[]; delayFor?: (text: string) => number; fail?: boolean };
async function mockKokoro(page: Page, mock: TtsMock) {
  await page.route("**/api/tts", async (route: Route) => {
    const req = route.request();
    if (req.method() === "GET") return route.fulfill({ json: { available: true, provider: "kokoro" } });
    const text = (req.postDataJSON() as { text: string }).text;
    mock.texts.push(text);
    if (mock.fail) return route.fulfill({ status: 503, json: { error: "The voice service is down." } });
    const delay = mock.delayFor?.(text) ?? 0;
    if (delay) await new Promise((r) => setTimeout(r, delay));
    try {
      await route.fulfill({ status: 200, contentType: "audio/wav", body: wav() });
    } catch {
      /* request was aborted by the app (stale step) */
    }
  });
}

const status = (page: Page) => page.getByTestId("voice-status");
const narrationText = (page: Page) => page.getByTestId("narration").innerText();

test("voice is off by default and the lesson works without it", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("voice-toggle")).toHaveText(/Voice off/);
  await page.getByRole("button", { name: "Next step" }).click();
  await expect(page.getByTestId("step-counter")).toHaveText(/^2 \//);
});

test("Kokoro narration reads the current step and finishes", async ({ page }) => {
  const mock: TtsMock = { texts: [] };
  await mockKokoro(page, mock);
  await page.goto("/");
  await page.getByTestId("voice-toggle").click();
  await expect(status(page)).toHaveAttribute("data-status", /loading|playing/);
  await expect(status(page)).toHaveAttribute("data-status", "idle", { timeout: 5000 }); // audio played to the end
  expect(mock.texts).toEqual([(await narrationText(page)).trim()]);
});

test("moving to another step stops the old narration and never plays a stale one", async ({ page }) => {
  const mock: TtsMock = { texts: [], delayFor: (t) => (t.startsWith("Binary search finds") ? 1500 : 0) };
  await mockKokoro(page, mock);
  await page.goto("/");
  await page.getByTestId("voice-toggle").click(); // requests step 1 (slow)
  await expect.poll(() => mock.texts.length).toBe(1);
  await page.getByRole("button", { name: "Next step" }).click(); // step 2 before step 1 audio arrives
  const step2 = (await narrationText(page)).trim();
  await expect(status(page)).toHaveAttribute("data-status", "idle", { timeout: 5000 });
  await page.waitForTimeout(1700); // let the stale step-1 response arrive
  expect(mock.texts.at(-1)).toBe(step2);
  await expect(status(page)).toHaveAttribute("data-status", "idle");
  await expect(status(page)).toHaveAttribute("data-step", /bs-why$/);
});

test("autoplay waits for the narration to finish before moving on", async ({ page }) => {
  const mock: TtsMock = { texts: [], delayFor: () => 2500 };
  await mockKokoro(page, mock);
  await page.goto("/");
  await gotoWalkthroughStep(page, 3);
  const counter = await page.getByTestId("step-counter").innerText();
  await page.getByTestId("voice-toggle").click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForTimeout(2200); // longer than the 1.8 s autoplay interval
  await expect(page.getByTestId("step-counter")).toHaveText(counter);
  await expect(page.getByTestId("step-counter")).not.toHaveText(counter, { timeout: 6000 });
});

test("a voice service error is shown and the lesson keeps working", async ({ page }) => {
  await mockKokoro(page, { texts: [], fail: true });
  await page.goto("/");
  await page.getByTestId("voice-toggle").click();
  await expect(status(page)).toHaveAttribute("data-status", "error");
  await expect(status(page)).toContainText("The voice service is down.");
  await expect(status(page)).toContainText("works without audio");
  await page.getByRole("button", { name: "Next step" }).click();
  await expect(page.getByTestId("step-counter")).toHaveText(/^2 \//);
});

test("without any voice available, voice is reported unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    // Simulate a browser with no Web Speech API.
    Object.defineProperty(window, "speechSynthesis", { value: undefined, configurable: true });
  });
  await page.route("**/api/tts", (r) => r.fulfill({ json: { available: false } }));
  await page.goto("/");
  await page.getByTestId("voice-toggle").click();
  await expect(status(page)).toHaveAttribute("data-status", "unavailable");
  await expect(status(page)).toContainText("works fully without audio");
});

test("F14: hiding the tab pauses playback and narration", async ({ page }) => {
  await mockKokoro(page, { texts: [], delayFor: () => 0 });
  await page.goto("/");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  const counter = await page.getByTestId("step-counter").innerText();
  await page.waitForTimeout(2500);
  await expect(page.getByTestId("step-counter")).toHaveText(counter);
});
