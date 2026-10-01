import { test, expect } from "@playwright/test";

const SECTION = "#partners";

async function showPartners(page) {
  const section = page.locator(SECTION);
  await section.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1800);
  await page.waitForFunction((root) => !root.querySelector("[data-partners-idle]"), await section.elementHandle());
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
    // Untouched pills keep their tilt in the CSS `rotate` property; GSAP bakes
    // it into `transform` (and writes `rotate: none`) once it tweens the pill.
    const cssRotate = Number.parseFloat(getComputedStyle(pill).rotate) || 0;
    const rotation = (values ? Math.atan2(values[1], values[0]) * 180 / Math.PI : 0) + cssRotate;
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

async function enableFastIdle(section, page) {
  await section.evaluate(async (root) => {
    root.style.setProperty("--partners-idle-min", "0.05s");
    root.style.setProperty("--partners-idle-max", "0.05s");
    const { initPartnersProximity } = await import("/src/animations/partnersProximity.js");
    initPartnersProximity();
  });
  await page.waitForFunction((root) => root._partnersProximity?.idle, await section.elementHandle());
}

async function idlePillCount(section) {
  return section.locator("[data-partners-idle]").count();
}

test.beforeEach(async ({ page }) => {
  // Park the idle loop so it cannot move pills under the non-idle specs;
  // enableFastIdle and sampleIdle override these with inline values and re-initializes.
  await page.addInitScript(() => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync("[data-partners-init]{--partners-idle-min:999;--partners-idle-max:999}");
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  });
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

test("animates only one idle pill at a time", async ({ page }) => {
  const section = await showPartners(page);
  await enableFastIdle(section, page);

  await page.waitForFunction((root) => root.querySelector("[data-partners-idle]"), await section.elementHandle());
  const samples = [];
  for (let index = 0; index < 8; index += 1) {
    samples.push(await idlePillCount(section));
    await page.waitForTimeout(100);
  }
  expect(samples.some((count) => count === 1)).toBe(true);
  expect(samples.every((count) => count <= 1)).toBe(true);
});

test("pauses the idle loop when the pointer enters the section", async ({ page }) => {
  const section = await showPartners(page);
  await enableFastIdle(section, page);
  await page.waitForFunction((root) => root.querySelector("[data-partners-idle]"), await section.elementHandle());

  await section.evaluate((root) => root.dispatchEvent(new Event("pointerenter")));
  await page.waitForTimeout(250);
  expect(await idlePillCount(section)).toBe(0);
  expect(await section.evaluate((root) => root._partnersProximity.idle.paused)).toBe(true);
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
  expect(await section.evaluate((root) => root._partnersProximity?.idle.running)).toBe(false);
  expect(await idlePillCount(section)).toBe(0);
  const visuals = await pillVisuals(section);
  expect(visuals.every(({ opacity, scale, y }) => (
    Math.abs(opacity - 1) < 0.01 && Math.abs(scale - 1) < 0.01 && Math.abs(y) < 0.5
  ))).toBe(true);
});

// Re-initializes with a fast, forced idle mode and samples the animated pill
// every frame in the page, so a slow test runner cannot miss the motion.
async function sampleIdle(section, mode) {
  return section.evaluate(async (root, forcedMode) => {
    root.style.setProperty("--partners-idle-min", "0.05s");
    root.style.setProperty("--partners-idle-max", "0.05s");
    const { initPartnersProximity } = await import("/src/animations/partnersProximity.js");
    initPartnersProximity();
    root._partnersProximity.idle.forceMode = forcedMode;
    const pills = [...root.querySelectorAll("[data-partners-pill]")];
    const read = (pill) => {
      const transform = getComputedStyle(pill).transform;
      const values = transform.match(/matrix(3d)?\(([^)]+)\)/)?.[2].split(",").map(Number);
      const cssRotate = Number.parseFloat(getComputedStyle(pill).rotate) || 0;
      return {
        rotation: (values ? Math.atan2(values[1], values[0]) * 180 / Math.PI : 0) + cssRotate,
        scale: values ? Math.hypot(values[0], values[1]) : 1,
      };
    };
    return new Promise((resolve) => {
      let index = -1;
      const samples = [];
      const tick = () => {
        if (index < 0) index = pills.findIndex((pill) => pill.dataset.partnersIdle === forcedMode);
        if (index >= 0) {
          samples.push(read(pills[index]));
          if (pills[index].dataset.partnersIdle !== forcedMode) {
            resolve({ index, authoredTilt: Number(pills[index].dataset.partnersTilt), samples });
            return;
          }
        }
        requestAnimationFrame(tick);
      };
      tick();
    });
  }, mode);
}

test("idle wiggle follows and returns to the active pill's authored tilt", async ({ page }) => {
  const section = await showPartners(page);
  const { index, authoredTilt, samples } = await sampleIdle(section, "wiggle");

  expect(samples.length).toBeGreaterThan(3);
  const rotations = samples.map(({ rotation }) => rotation);
  expect(Math.max(...rotations) - Math.min(...rotations)).toBeGreaterThan(2);
  expect(rotations.every((rotation) => Math.abs(rotation - authoredTilt) <= 3.5)).toBe(true);
  expect(Math.abs(samples.at(-1).rotation - authoredTilt)).toBeLessThan(0.1);
  expect(Math.abs((await pillVisuals(section))[index].rotation - authoredTilt)).toBeLessThan(0.1);

  await page.waitForTimeout(700);
  await section.evaluate((root) => root.dispatchEvent(new Event("pointerenter")));
  const allSettled = await pillVisuals(section);
  const authoredTilts = await section.locator("[data-partners-pill]").evaluateAll((pills) => (
    pills.map((pill) => Number(pill.dataset.partnersTilt))
  ));
  expect(allSettled.every(({ rotation, scale }, pillIndex) => (
    Math.abs(rotation - authoredTilts[pillIndex]) < 0.1 && Math.abs(scale - 1) < 0.01
  ))).toBe(true);
});

test("idle zoom-out returns every pill to scale 1", async ({ page }) => {
  const section = await showPartners(page);
  const { index, samples } = await sampleIdle(section, "zoom-out");

  expect(Math.min(...samples.map(({ scale }) => scale))).toBeLessThan(0.95);
  expect(samples.at(-1).scale).toBeCloseTo(1, 2);
  expect(await scaleOf(section.locator("[data-partners-pill]").nth(index))).toBeCloseTo(1, 2);
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
