import { test, expect } from "@playwright/test";

const SECTION = "#partners";

async function showPartners(page) {
  const section = page.locator(SECTION);
  await section.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1800);
  return section;
}

async function scaleOf(pill) {
  return pill.evaluate((element) => {
    const transform = getComputedStyle(element).transform;
    if (transform === "none") return 1;
    const values = transform.match(/matrix(3d)?\(([^)]+)\)/)?.[2]
      .split(",")
      .map(Number);
    if (!values) return 1;
    return transform.startsWith("matrix3d")
      ? Math.hypot(values[0], values[1], values[2])
      : Math.hypot(values[0], values[1]);
  });
}

async function pillVisuals(section) {
  return section.locator("[data-partners-pill]").evaluateAll((pills) => pills.map((pill) => {
    const transform = getComputedStyle(pill).transform;
    const values = transform.match(/matrix(3d)?\(([^)]+)\)/)?.[2].split(",").map(Number);
    const scale = !values
      ? 1
      : transform.startsWith("matrix3d")
        ? Math.hypot(values[0], values[1], values[2])
        : Math.hypot(values[0], values[1]);
    const rotation = values ? Math.atan2(values[1], values[0]) * 180 / Math.PI : 0;
    return {
      opacity: Number.parseFloat(getComputedStyle(pill).opacity),
      scale,
      y: values
        ? transform.startsWith("matrix3d") ? values[13] : values[5]
        : 0,
      rotation,
    };
  }));
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
});

test("reveals pills once on scroll and preserves authored tilt", async ({ page }) => {
  const section = page.locator(SECTION);
  const before = await section.locator("[data-partners-pill]").evaluateAll((pills) => pills.map((pill) => ({
    opacity: Number.parseFloat(getComputedStyle(pill).opacity),
    visibility: getComputedStyle(pill).visibility,
  })));
  expect(before.every(({ opacity, visibility }) => opacity === 0 && visibility === "hidden")).toBe(true);

  await showPartners(page);
  const visuals = await pillVisuals(section);
  expect(visuals.every(({ opacity, scale, y }) => (
    Math.abs(opacity - 1) < 0.01 && Math.abs(scale - 1) < 0.01 && Math.abs(y) < 0.5
  ))).toBe(true);
  expect(Math.abs(visuals[0].rotation - 4)).toBeLessThan(0.1);

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(150);
  await section.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  const afterReturn = await pillVisuals(section);
  expect(afterReturn.every(({ opacity, scale, y }) => (
    Math.abs(opacity - 1) < 0.01 && Math.abs(scale - 1) < 0.01 && Math.abs(y) < 0.5
  ))).toBe(true);
});

test("hovering and leaving during the reveal cannot interrupt its final state", async ({ page }) => {
  const section = page.locator(SECTION);
  await section.scrollIntoViewIfNeeded();
  const pill = section.locator("[data-partners-pill]").first();
  const box = await pill.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await section.evaluate((element) => element.dispatchEvent(new MouseEvent("mouseleave")));
  await page.waitForTimeout(2200);

  const visuals = await pillVisuals(section);
  expect(visuals.every(({ opacity, scale, y }) => (
    Math.abs(opacity - 1) < 0.01 && Math.abs(scale - 1) < 0.01 && Math.abs(y) < 0.5
  ))).toBe(true);
  expect(Math.abs(visuals[0].rotation - 4)).toBeLessThan(0.1);
});

test("scales by proximity, preserves tilt, and lifts only active pills", async ({ page }) => {
  const section = await showPartners(page);
  const firstPill = section.locator("[data-partners-pill]").first();
  const geometry = await section.locator("[data-partners-pill]").evaluateAll((pills) => {
    const rects = pills.map((pill) => pill.getBoundingClientRect());
    const first = rects[0];
    const farIndex = rects.findIndex((rect) => Math.hypot(
      rect.left + rect.width / 2 - (first.left + first.width / 2),
      rect.top + rect.height / 2 - (first.top + first.height / 2),
    ) > 180);
    const far = rects[farIndex];
    const firstCenter = {
      x: first.left + first.width / 2,
      y: first.top + first.height / 2,
    };
    const farCenter = {
      x: far.left + far.width / 2,
      y: far.top + far.height / 2,
    };
    return {
      firstCenter,
      farCenter,
      intermediate: {
        x: firstCenter.x + (farCenter.x - firstCenter.x) * 0.5,
        y: firstCenter.y + (farCenter.y - firstCenter.y) * 0.5,
      },
    };
  });

  await page.mouse.move(geometry.firstCenter.x, geometry.firstCenter.y);
  await page.waitForTimeout(500);
  expect(await scaleOf(firstPill)).toBeCloseTo(1.3, 1);
  await expect(firstPill).toHaveAttribute("data-partners-lift", "");
  const rotation = await firstPill.evaluate((pill) => {
    const values = getComputedStyle(pill).transform.match(/matrix(3d)?\(([^)]+)\)/)?.[2]
      .split(",")
      .map(Number);
    return Math.atan2(values[1], values[0]) * 180 / Math.PI;
  });
  expect(Math.abs(rotation - 4)).toBeLessThan(0.1);

  await page.mouse.move(geometry.intermediate.x, geometry.intermediate.y);
  await page.waitForTimeout(500);
  const intermediateScale = await scaleOf(firstPill);
  expect(intermediateScale).toBeGreaterThan(1.01);
  expect(intermediateScale).toBeLessThan(1.3);

  await page.mouse.move(geometry.farCenter.x, geometry.farCenter.y);
  await page.waitForTimeout(500);
  expect(await scaleOf(firstPill)).toBeCloseTo(1, 2);
  await expect(firstPill).not.toHaveAttribute("data-partners-lift");

  await page.mouse.move(geometry.firstCenter.x, geometry.firstCenter.y);
  await page.waitForTimeout(250);
  await section.evaluate((element) => element.dispatchEvent(new MouseEvent("mouseleave")));
  await page.waitForTimeout(800);
  const scales = await section.locator("[data-partners-pill]").evaluateAll((pills) => pills.map((pill) => {
    const transform = getComputedStyle(pill).transform;
    if (transform === "none") return 1;
    const values = transform.match(/matrix(3d)?\(([^)]+)\)/)?.[2].split(",").map(Number);
    return transform.startsWith("matrix3d")
      ? Math.hypot(values[0], values[1], values[2])
      : Math.hypot(values[0], values[1]);
  }));
  expect(scales.every((scale) => Math.abs(scale - 1) < 0.01)).toBe(true);
  await expect(section.locator("[data-partners-lift]")).toHaveCount(0);

  await page.mouse.move(0, 0);
  await page.mouse.move(geometry.firstCenter.x, geometry.firstCenter.y);
  await page.waitForTimeout(500);
  expect(await scaleOf(firstPill)).toBeCloseTo(1.3, 1);
});

test("re-initializing replaces the prior instance without stacking handlers", async ({ page }) => {
  const section = await showPartners(page);
  const replaced = await section.evaluate(async (root) => {
    const { initPartnersProximity } = await import("/src/animations/partnersProximity.js");
    const previous = root._partnersProximity;
    initPartnersProximity();
    return {
      replaced: root._partnersProximity !== previous,
      previousDestroyed: previous?.destroyed,
    };
  });
  expect(replaced).toEqual({ replaced: true, previousDestroyed: true });

  const pill = section.locator("[data-partners-pill]").first();
  expect(await pill.evaluate((element) => getComputedStyle(element).rotate)).toBe("4deg");
  const box = await pill.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(500);
  expect(await scaleOf(pill)).toBeCloseTo(1.3, 1);
});

test("skips the interaction for reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await page.waitForLoadState("networkidle");
  const section = await showPartners(page);
  const pill = section.locator("[data-partners-pill]").first();
  const box = await pill.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(500);
  expect(await section.evaluate((root) => root._partnersProximity?.revealTrigger)).toBeFalsy();
  const visuals = await pillVisuals(section);
  expect(visuals.every(({ opacity, scale, y }) => (
    Math.abs(opacity - 1) < 0.01 && Math.abs(scale - 1) < 0.01 && Math.abs(y) < 0.5
  ))).toBe(true);
});

test("skips the interaction when hover is unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    const nativeMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query) => {
      if (query === "(hover: none)") {
        return {
          matches: true,
          media: query,
          onchange: null,
          addListener() {},
          removeListener() {},
          addEventListener() {},
          removeEventListener() {},
          dispatchEvent() { return false; },
        };
      }
      return nativeMatchMedia(query);
    };
  });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  expect(await page.evaluate(() => matchMedia("(hover: none)").matches)).toBe(true);
  const section = await showPartners(page);
  const pill = section.locator("[data-partners-pill]").first();
  const box = await pill.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(500);
  expect(await section.evaluate((root) => Boolean(root._partnersProximity?.revealTrigger))).toBe(true);
  const visuals = await pillVisuals(section);
  const authoredTilts = await section.locator("[data-partners-pill]").evaluateAll((pills) => (
    pills.map((pill) => Number.parseFloat(pill.dataset.partnersTilt))
  ));
  expect(visuals.every(({ opacity, scale, y, rotation }, index) => (
    Math.abs(opacity - 1) < 0.01 &&
    Math.abs(scale - 1) < 0.01 &&
    Math.abs(y) < 0.5 &&
    Math.abs(rotation - authoredTilts[index]) < 0.1
  ))).toBe(true);
});
