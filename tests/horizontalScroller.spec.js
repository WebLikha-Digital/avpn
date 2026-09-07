import { test, expect } from "@playwright/test";

// The preview page has two bands. These tests are about the wheel band, so
// every locator is scoped to it rather than matching the Signature Events one.
const band = ".hband[data-hscroll-init]";
const viewport = `${band} [data-hscroll-viewport]`;

async function scrollTo(page, y) {
  // Locomotive eases window.scrollY, so drive it the way a user would and let
  // the lerp settle before reading anything back.
  await page.evaluate((target) => window.scrollTo({ top: target, behavior: "instant" }), y);
  await page.waitForTimeout(400);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.locator(`${band}[data-hscroll-active]`)).toHaveCount(1);
});

test("sizes the band to its own horizontal overflow", async ({ page }) => {
  const geometry = await page.locator(band).evaluate((wrap) => {
    const viewport = wrap.querySelector("[data-hscroll-viewport]");
    const track = wrap.querySelector("[data-hscroll-track]");
    return {
      height: wrap.getBoundingClientRect().height,
      distance: track.scrollWidth - viewport.clientWidth,
      viewportHeight: viewport.offsetHeight,
    };
  });

  expect(geometry.distance).toBeGreaterThan(0);
  expect(geometry.height).toBeCloseTo(geometry.distance + geometry.viewportHeight, 0);
});

test("maps page position onto the track 1:1", async ({ page }) => {
  const top = await page.locator(band).evaluate((wrap) => wrap.getBoundingClientRect().top + window.scrollY);

  for (const offset of [0, 600, 1800]) {
    await scrollTo(page, top + offset);
    const left = await page.locator(viewport).evaluate((el) => el.scrollLeft);
    expect(Math.abs(left - offset)).toBeLessThanOrEqual(2);
  }
});

test("clamps the track at both ends of the band", async ({ page }) => {
  const { top, distance } = await page.locator(band).evaluate((wrap) => ({
    top: wrap.getBoundingClientRect().top + window.scrollY,
    distance: wrap.querySelector("[data-hscroll-track]").scrollWidth -
      wrap.querySelector("[data-hscroll-viewport]").clientWidth,
  }));

  await scrollTo(page, Math.max(0, top - 400));
  expect(await page.locator(viewport).evaluate((el) => el.scrollLeft)).toBe(0);

  await scrollTo(page, top + distance + 2000);
  expect(await page.locator(viewport).evaluate((el) => el.scrollLeft)).toBe(distance);
});

test("pins the wheel panel inside the band and turns it", async ({ page }) => {
  const panel = page.locator("[data-rotary-wheel-init]");
  await expect(panel).toHaveCount(1);

  const { top, panelLeft, pinDistance, step, itemCount } = await panel.evaluate((el) => {
    const authored = getComputedStyle(el).getPropertyValue("--rotary-wheel-step");
    const wrap = el.closest("[data-hscroll-init]");
    const stage = el.querySelector("[data-rotary-wheel-stage]");
    const track = wrap.querySelector("[data-hscroll-track]");
    return {
      top: wrap.getBoundingClientRect().top + window.scrollY,
      panelLeft: el.getBoundingClientRect().left - track.getBoundingClientRect().left,
      pinDistance: el.offsetWidth - stage.offsetWidth,
      step: Number.parseFloat(authored) || 14,
      itemCount: el.querySelectorAll("[data-rotary-wheel-item]").length,
    };
  });

  const hubAngle = () =>
    page.locator("[data-rotary-wheel-hub]").evaluate((hub) => {
      const m = new DOMMatrix(getComputedStyle(hub).transform);
      return (Math.atan2(m.b, m.a) * 180) / Math.PI;
    });

  await scrollTo(page, top + panelLeft);
  expect(Math.abs(await hubAngle())).toBeLessThan(1);

  await scrollTo(page, top + panelLeft + pinDistance / 2);
  const mid = await hubAngle();
  expect(mid).toBeGreaterThan(5);

  await scrollTo(page, top + panelLeft + pinDistance);
  const end = await hubAngle();
  expect(end).toBeCloseTo((itemCount - 1) * step, 0);
});

test("holds the stage still while the wheel turns", async ({ page }) => {
  const { top, panelLeft, pinDistance } = await page.locator("[data-rotary-wheel-init]").evaluate((el) => {
    const wrap = el.closest("[data-hscroll-init]");
    const track = wrap.querySelector("[data-hscroll-track]");
    return {
      top: wrap.getBoundingClientRect().top + window.scrollY,
      panelLeft: el.getBoundingClientRect().left - track.getBoundingClientRect().left,
      pinDistance: el.offsetWidth - el.querySelector("[data-rotary-wheel-stage]").offsetWidth,
    };
  });

  const stageLeft = () =>
    page.locator("[data-rotary-wheel-stage]").evaluate((el) => Math.round(el.getBoundingClientRect().left));

  await scrollTo(page, top + panelLeft + 50);
  const parked = await stageLeft();
  await scrollTo(page, top + panelLeft + pinDistance - 50);
  expect(Math.abs((await stageLeft()) - parked)).toBeLessThanOrEqual(2);
});

test("leaves the track's total width unchanged by the pin", async ({ page }) => {
  const slack = await page.locator(band).evaluate((wrap) => {
    const track = wrap.querySelector("[data-hscroll-track]");
    const panels = [...track.children];
    const sum = panels.reduce((total, panel) => total + panel.getBoundingClientRect().width, 0);
    return Math.abs(track.scrollWidth - sum);
  });

  expect(slack).toBeLessThanOrEqual(2);
});

test("scales each card down per step away from the slot", async ({ page }) => {
  const { top, panelLeft } = await page.locator("[data-rotary-wheel-init]").evaluate((el) => {
    const wrap = el.closest("[data-hscroll-init]");
    const track = wrap.querySelector("[data-hscroll-track]");
    return {
      top: wrap.getBoundingClientRect().top + window.scrollY,
      panelLeft: el.getBoundingClientRect().left - track.getBoundingClientRect().left,
    };
  });

  // Parked on the first card, so distance from the slot is just the index.
  await scrollTo(page, top + panelLeft);

  const scales = await page.locator("[data-rotary-wheel-item]").evaluateAll((items) =>
    items.map((item) => {
      const m = new DOMMatrix(getComputedStyle(item).transform);
      return Math.hypot(m.a, m.b);
    }),
  );

  const falloff = 0.85;
  scales.forEach((scale, index) => expect(scale).toBeCloseTo(falloff ** index, 2));
});

test("redirects nested draw-path connectors onto the band's scroller", async ({ page }) => {
  const inBand = await page.locator("[data-hscroll-track] [data-draw-scroll-wrap]").evaluate((wrap) => {
    const trigger = wrap._drawTl?.scrollTrigger;
    const viewport = wrap.closest("[data-hscroll-init]")
      .querySelector("[data-hscroll-viewport]");
    return {
      exists: Boolean(trigger),
      horizontal: trigger?.vars.horizontal === true,
      onBand: trigger?.scroller === viewport,
    };
  });

  expect(inBand).toEqual({ exists: true, horizontal: true, onBand: true });
});
