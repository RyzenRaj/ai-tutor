import { expect, test } from "@playwright/test";

/** F10 — "Teach me" failure, loading and recovery states, with the API mocked deterministically. */
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("lesson-title")).toHaveText("Binary search for 34");
});

const ask = async (page: import("@playwright/test").Page, text = "explain a left join") => {
  await page.getByLabel("What do you want to learn?").fill(text);
  await page.getByRole("button", { name: "Teach me" }).click();
};

const cases: [string, Parameters<import("@playwright/test").Route["fulfill"]>[0] | "abort", RegExp][] = [
  ["rate limited (429)", { status: 429, contentType: "application/json", body: JSON.stringify({ error: "The AI tutor is busy (rate limited). Try again shortly.", code: "rate_limited" }) }, /rate limited/i],
  ["provider down (502)", { status: 502, contentType: "application/json", body: JSON.stringify({ error: "The AI model is unavailable right now. Try again shortly." }) }, /unavailable/i],
  ["non-JSON error page (500)", { status: 500, contentType: "text/html", body: "<h1>oops</h1>" }, /failed \(500\)/i],
  ["malformed lesson (200)", { status: 200, contentType: "application/json", body: JSON.stringify({ lesson: { steps: "nope" }, meta: { mode: "live", intro: "x", notices: [] } }) }, /failed validation/i],
  ["network failure", "abort", /.+/],
];

for (const [name, reply, message] of cases) {
  test(`${name}: shows an error, keeps the current lesson, and recovers`, async ({ page }) => {
    await page.route("**/api/lesson", (r) => (reply === "abort" ? r.abort() : r.fulfill(reply)));
    await ask(page);
    await expect(page.getByRole("alert").filter({ hasText: message })).toBeVisible();
    await expect(page.getByTestId("lesson-title")).toHaveText("Binary search for 34");
    await expect(page.getByRole("button", { name: "Teach me" })).toBeEnabled();
    // Recovery: the next request succeeds and the error clears.
    await page.unroute("**/api/lesson");
    await ask(page);
    await expect(page.getByTestId("lesson-title")).toHaveText("SQL LEFT JOIN");
    await expect(page.getByRole("alert").filter({ hasText: message })).toHaveCount(0);
  });
}

test("shows a loading state while the tutor is planning", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await page.route("**/api/lesson", async (r) => {
    await gate;
    await r.continue();
  });
  await ask(page);
  await expect(page.getByRole("button", { name: "Planning…" })).toBeDisabled();
  release();
  await expect(page.getByTestId("lesson-title")).toHaveText("SQL LEFT JOIN");
});
