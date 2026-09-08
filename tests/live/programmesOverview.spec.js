import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";

const BUNDLE_PATH = fileURLToPath(new URL("../../dist/animations.min.js", import.meta.url));

// The published Webflow page, driven with a real wheel through Locomotive's
// lerp rather than window.scrollTo — the same shape as the other live specs.
const section = ".section_programmes-overview";
const intro = "[data-prog-overview-intro]";
const list = "[data-prog-overview-list]";
const rows = "[data-hover-row]";
const reveals = "[data-prog-overview-row]";

const SETTLE_TOLERANCE = 8;

async function settledScrollY(page) {
  let previous = Number.NaN;

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const current = await page.evaluate(() => window.scrollY);
    if (Math.abs(current - previous) < 0.5) return current;
    previous = current;
    await page.waitForTimeout(80);
  }

  return page.evaluate(() => window.scrollY);
}

async function scrollTo(page, target) {
  const viewport = page.viewportSize();
  await page.mouse.move(viewport.width / 2, viewport.height / 2);

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const current = await settledScrollY(page);
    const remaining = target - current;
    if (Math.abs(remaining) <= SETTLE_TOLERANCE) return current;
    await page.mouse.wheel(0, Math.sign(remaining) * Math.min(Math.abs(remaining), 900));
  }

  throw new Error(`could not settle the page at scrollY ${target}`);
}

async function geometry(page) {
  return page.locator(section).evaluate((el) => ({
    top: el.getBoundingClientRect().top + window.scrollY,
    distance: el.offsetHeight - window.innerHeight,
  }));
}

const topOf = (page, selector) =>
  page.locator(selector).evaluate((el) => el.getBoundingClientRect().top);

const opacities = (page) =>
  page
    .locator(reveals)
    .evaluateAll((els) =>
      els.map((el) => Number.parseFloat(getComputedStyle(el).opacity)),
    );

test.beforeEach(async ({ page }) => {
  // Chrome's Local Network Access check blocks the published HTTPS page from
  // loading http://localhost:4173, so the footer's dev script tag never runs
  // ("Permission was denied for this request to access the `loopback` address
  // space"). Serve the same dist/ file through a route instead — the markup
  // under test is still the published page's, and the bundle is still the one
  // that ships.
  await page.route("http://localhost:4173/animations.min.js", (route) =>
    route.fulfill({ path: BUNDLE_PATH, contentType: "application/javascript" }),
  );

  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.locator(`${section}[data-prog-overview-init]`)).toHaveCount(1);
  await expect(page.locator(rows)).toHaveCount(7);
});

// The whole point of the sticky arrangement: the section holds the screen for
// its scrub distance instead of scrolling past. A broken sticky (overflow on
// the section, say) shows up here as the sticky child riding off the top.
test("holds the sticky child on screen for the whole scrub", async ({ page }) => {
  const { top, distance } = await geometry(page);

  await scrollTo(page, top);
  expect(await topOf(page, "[data-prog-overview-sticky]")).toBeCloseTo(0, -1);

  await scrollTo(page, top + distance / 2);
  expect(await topOf(page, "[data-prog-overview-sticky]")).toBeCloseTo(0, -1);

  await scrollTo(page, top + distance);
  expect(await topOf(page, "[data-prog-overview-sticky]")).toBeCloseTo(0, -1);
});

test("carries the intro out and brings every row in", async ({ page }) => {
  const { top, distance } = await geometry(page);
  const viewportHeight = await page.evaluate(() => window.innerHeight);

  await scrollTo(page, top);
  const introStart = await topOf(page, intro);
  const listStart = await topOf(page, list);
  for (const value of await opacities(page)) expect(value).toBeLessThan(0.05);

  await scrollTo(page, top + distance);
  expect(introStart - (await topOf(page, intro))).toBeGreaterThan(viewportHeight * 0.8);
  expect(listStart - (await topOf(page, list))).toBeGreaterThan(viewportHeight * 0.4);
  for (const value of await opacities(page)) expect(value).toBeCloseTo(1, 1);
});

test("fills one row on hover and dims the rest", async ({ page }) => {
  const { top, distance } = await geometry(page);
  await scrollTo(page, top + distance);

  const row = page.locator(rows).nth(1);
  await row.hover();
  await page.waitForTimeout(700);

  await expect(row).toHaveAttribute("data-hover-state", "active");
  await expect(page.locator(list)).toHaveAttribute("data-hover-state", "active");

  const scaleY = await row
    .locator("[data-hover-bg]")
    .evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).d);
  expect(scaleY).toBeCloseTo(1, 1);

  const dimmed = await page
    .locator(rows)
    .nth(0)
    .evaluate((el) => Number.parseFloat(getComputedStyle(el).opacity));
  expect(dimmed).toBeLessThan(0.5);
});
