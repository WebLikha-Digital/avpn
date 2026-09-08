import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";

// The Programmes Highlights band on the published site. index.html is a
// playground; this is the markup the fix has to hold up against — two bands and
// three wheels on one page, at the real section's real width.
const BUNDLE_PATH = fileURLToPath(new URL("../../dist/animations.min.js", import.meta.url));
const BAND = ".section_programmes-highlights";
// The live page is wider and heavier than the preview, and the resize lands
// mid-transition, so this is looser than the preview spec's 2px.
const DRIFT_TOLERANCE = 4;

function readBand(page) {
  return page.evaluate((sel) => {
    const band = document.querySelector(sel);
    const vp = band.querySelector("[data-hscroll-viewport]");
    const track = band.querySelector("[data-hscroll-track]");
    const stage = band.querySelector("[data-rotary-wheel-stage]");
    const hub = band.querySelector("[data-rotary-wheel-hub]");
    const m = new DOMMatrix(getComputedStyle(hub).transform);
    const start = band.getBoundingClientRect().top + window.scrollY;
    const distance = Math.max(0, track.scrollWidth - vp.clientWidth);
    return {
      actual: Math.round(vp.scrollLeft),
      // Re-derived from the live DOM rather than from anything the script
      // cached, so a stale `start` shows up here as a mismatch.
      expected: Math.round(Math.min(distance, Math.max(0, window.scrollY - start))),
      stageLeft: Math.round(stage.getBoundingClientRect().left),
      hubDeg: +((Math.atan2(m.b, m.a) * 180) / Math.PI).toFixed(2),
    };
  }, BAND);
}

test.beforeEach(async ({ page }) => {
  expect(existsSync(BUNDLE_PATH), `no bundle at ${BUNDLE_PATH} — run \`npm run build\``).toBe(true);

  // Chrome blocks the published page's http://localhost:4173 script tag as a
  // private-network request, so the bundle is fulfilled from dist/ here instead
  // of over the wire — same file the footer tag would have fetched.
  let served = 0;
  await page.route("**/animations.min.js", async (route) => {
    served += 1;
    await route.fulfill({ path: BUNDLE_PATH, contentType: "application/javascript" });
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect
    .poll(() => page.evaluate((sel) => Boolean(document.querySelector(sel)?._horizontalScroller), BAND))
    .toBe(true);

  expect(served, "the published page should still request animations.min.js").toBeGreaterThan(0);
});

test("holds the wheel steady through a width change", async ({ page }) => {
  const { top, panelLeft } = await page.evaluate((sel) => {
    const band = document.querySelector(sel);
    const panel = band.querySelector("[data-rotary-wheel-init]");
    const track = band.querySelector("[data-hscroll-track]");
    return {
      top: band.getBoundingClientRect().top + window.scrollY,
      panelLeft: panel.getBoundingClientRect().left - track.getBoundingClientRect().left,
    };
  }, BAND);

  // Park inside the wheel's pinned range, where a stale measurement shows.
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), top + panelLeft + 700);
  await page.waitForTimeout(900);

  const before = await readBand(page);
  expect(before.actual, "the band should be scrolled into before resizing").toBeGreaterThan(0);

  await page.setViewportSize({ width: 1280, height: 900 });

  // Sample across the rebuild's debounce window, not only after it settles —
  // the wobble is the transient.
  const drift = [];
  for (let i = 0; i < 6; i += 1) {
    await page.waitForTimeout(60);
    drift.push(Math.abs((await readBand(page)).stageLeft - before.stageLeft));
  }
  await page.waitForTimeout(900);
  const after = await readBand(page);
  drift.push(Math.abs(after.stageLeft - before.stageLeft));

  expect(
    Math.max(...drift),
    "the pinned stage should not drift while the band rebuilds",
  ).toBeLessThanOrEqual(DRIFT_TOLERANCE);

  expect(
    Math.abs(after.actual - after.expected),
    "the track should still map to the page position after a resize",
  ).toBeLessThanOrEqual(DRIFT_TOLERANCE);
});

test("holds the pin steady while scrolling after a width change", async ({ page }) => {
  // The bug this covers is invisible at rest. Sampling settled positions — jump,
  // wait, read — shows zero drift even when it is broken, because the ticker and
  // the pin converge as soon as motion stops. It only shows up frame by frame
  // while the page is actually moving, so this scrolls with the wheel and reads
  // the stage on every animation frame.
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect
    .poll(() => page.evaluate((s) => Boolean(document.querySelector(s)?._horizontalScroller), BAND))
    .toBe(true);
  await page.waitForTimeout(900);

  // The rebuild is what inverts the callback order, so the resize has to happen
  // before the scroll rather than during it.
  await page.setViewportSize({ width: 1358, height: 900 });
  await page.waitForTimeout(1400);

  const geo = await page.evaluate((sel) => {
    const band = document.querySelector(sel);
    const panel = band.querySelector("[data-rotary-wheel-init]");
    const track = band.querySelector("[data-hscroll-track]");
    const stage = band.querySelector("[data-rotary-wheel-stage]");
    return {
      top: band.getBoundingClientRect().top + window.scrollY,
      panelLeft: panel.getBoundingClientRect().left - track.getBoundingClientRect().left,
      pinDistance: panel.offsetWidth - stage.offsetWidth,
    };
  }, BAND);

  await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), geo.top + geo.panelLeft - 400);
  await page.waitForTimeout(700);

  await page.evaluate((sel) => {
    window.__pinFrames = [];
    const stage = document.querySelector(sel).querySelector("[data-rotary-wheel-stage]");
    const tick = () => {
      window.__pinFrames.push({ y: window.scrollY, left: stage.getBoundingClientRect().left });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, BAND);

  await page.mouse.move(600, 450);
  for (let i = 0; i < 55; i += 1) {
    await page.mouse.wheel(0, 60);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(500);

  const pinFrom = geo.top + geo.panelLeft;
  const pinTo = pinFrom + geo.pinDistance;
  const spread = await page.evaluate(([from, to]) => {
    // Only frames where the pin is engaged; the margin keeps the entry and exit
    // transitions out of the sample.
    const inPin = window.__pinFrames.filter((f) => f.y > from + 120 && f.y < to - 120);
    if (inPin.length < 50) return null;
    const lefts = inPin.map((f) => f.left);
    return +(Math.max(...lefts) - Math.min(...lefts)).toFixed(1);
  }, [pinFrom, pinTo]);

  expect(spread, "not enough frames sampled inside the pin").not.toBeNull();
  expect(spread, "the pinned stage should not move while it is pinned").toBeLessThanOrEqual(1);
});
