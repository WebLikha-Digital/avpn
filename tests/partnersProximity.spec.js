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

async function partnerSnapshot(section) {
  return section.evaluate((root) => {
    const pills = [...root.querySelectorAll("[data-partners-pill]")];
    const visuals = pills.map((pill) => {
      const transform = getComputedStyle(pill).transform;
      const values = transform.match(/matrix(3d)?\(([^)]+)\)/)?.[2].split(",").map(Number);
      const cssRotate = Number.parseFloat(getComputedStyle(pill).rotate) || 0;
      return {
        rotation: (values ? Math.atan2(values[1], values[0]) * 180 / Math.PI : 0) + cssRotate,
        scale: values ? Math.hypot(values[0], values[1]) : 1,
      };
    });
    return {
      visuals,
      activeIndices: pills.reduce((indices, pill, pillIndex) => {
        if (pill.dataset.partnersIdle) indices.push(pillIndex);
        return indices;
      }, []),
      authoredTilts: pills.map((pill) => Number(pill.dataset.partnersTilt)),
    };
  });
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

test("pointer movement over pills does not change their scale", async ({ page }) => {
  const section = await showPartners(page);
  const boxes = await section.locator("[data-partners-pill]").evaluateAll((pills) => (
    pills.map((pill) => {
      const rect = pill.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    })
  ));
  for (const box of boxes) await page.mouse.move(box.x, box.y);
  await page.waitForTimeout(500);
  const visuals = await pillVisuals(section);
  expect(visuals.every(({ scale }) => Math.abs(scale - 1) < 0.01)).toBe(true);
  await expect(section.locator("[data-partners-lift]")).toHaveCount(0);
});

test("animates a fresh group of two or three idle pills per round", async ({ page }) => {
  const section = await showPartners(page);
  await enableFastIdle(section, page);

  const rounds = await section.evaluate((root) => {
    const pills = [...root.querySelectorAll("[data-partners-pill]")];
    return new Promise((resolve) => {
      const captured = [];
      let activeRound = null;
      const tick = () => {
        const active = pills
          .map((pill, index) => pill.dataset.partnersIdle ? index : null)
          .filter((index) => index !== null);
        if (!activeRound && active.length) activeRound = active;
        if (activeRound && !active.length) {
          const settled = pills.map((pill) => {
            const transform = getComputedStyle(pill).transform;
            const values = transform.match(/matrix(3d)?\(([^)]+)\)/)?.[2].split(",").map(Number);
            const cssRotate = Number.parseFloat(getComputedStyle(pill).rotate) || 0;
            return {
              rotation: (values ? Math.atan2(values[1], values[0]) * 180 / Math.PI : 0) + cssRotate,
              scale: values ? Math.hypot(values[0], values[1]) : 1,
              authoredTilt: Number(pill.dataset.partnersTilt),
            };
          });
          captured.push({ active: activeRound, settled });
          activeRound = null;
          if (captured.length >= 4) {
            resolve(captured);
            return;
          }
        }
        requestAnimationFrame(tick);
      };
      tick();
    });
  });

  expect(rounds).toHaveLength(4);
  expect(rounds.every(({ active }) => active.length >= 2 && active.length <= 3)).toBe(true);
  expect(rounds.every(({ active }) => new Set(active).size === active.length)).toBe(true);
  for (let index = 1; index < rounds.length; index += 1) {
    expect(rounds[index].active.some((pill) => rounds[index - 1].active.includes(pill))).toBe(false);
  }
  expect(rounds.every(({ settled }) => settled.every(({ rotation, scale, authoredTilt }) => (
    Math.abs(rotation - authoredTilt) < 0.1 && Math.abs(scale - 1) < 0.01
  )))).toBe(true);
});

test("idle uses the default three-second interval", async ({ page }) => {
  const section = await showPartners(page);
  const interval = await section.evaluate(async (root) => {
    document.adoptedStyleSheets = document.adoptedStyleSheets.filter((sheet) => (
      ![...sheet.cssRules].some((rule) => rule.cssText.includes("--partners-idle-min: 999"))
    ));
    const { initPartnersProximity } = await import("/src/animations/partnersProximity.js");
    initPartnersProximity();
    return new Promise((resolve) => {
      let endedAt = null;
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.attributeName !== "data-partners-idle") continue;
          if (mutation.target.dataset.partnersIdle) {
            if (endedAt !== null) {
              observer.disconnect();
              resolve(performance.now() - endedAt);
            }
          } else {
            endedAt = performance.now();
          }
        }
      });
      observer.observe(root, { subtree: true, attributes: true, attributeFilter: ["data-partners-idle"] });
    });
  });
  expect(interval).toBeGreaterThan(2900);
  expect(interval).toBeLessThan(3100);
});

test("idle keeps running while the pointer is over the section", async ({ page }) => {
  const section = await showPartners(page);
  await enableFastIdle(section, page);
  const box = await section.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForFunction((root) => root.querySelector("[data-partners-idle]"), await section.elementHandle());
  await section.evaluate((root) => root.dispatchEvent(new Event("pointerenter")));
  await page.waitForFunction((root) => (
    root._partnersProximity.idle.activePill === null && !root._partnersProximity.idle.paused
  ), await section.elementHandle());
  await page.waitForFunction((root) => root.querySelector("[data-partners-idle]"), await section.elementHandle());
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
  expect(await scaleOf(pill)).toBeCloseTo(1, 2);
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
  const afterRound = await partnerSnapshot(section);
  if (!afterRound.activeIndices.includes(index)) {
    expect(Math.abs(afterRound.visuals[index].rotation - authoredTilt)).toBeLessThan(0.1);
  }

  await page.waitForTimeout(700);
  const settled = await partnerSnapshot(section);
  expect(settled.activeIndices.length).toBeLessThanOrEqual(3);
  expect(settled.visuals.every(({ rotation, scale }, pillIndex) => (
    settled.activeIndices.includes(pillIndex) ||
    Math.abs(rotation - settled.authoredTilts[pillIndex]) < 0.1 && Math.abs(scale - 1) < 0.01
  ))).toBe(true);
});

test("idle zoom-out returns every pill to scale 1", async ({ page }) => {
  const section = await showPartners(page);
  const { index, samples } = await sampleIdle(section, "zoom-out");

  expect(Math.min(...samples.map(({ scale }) => scale))).toBeLessThan(0.95);
  expect(samples.at(-1).scale).toBeCloseTo(1, 2);
  const afterRound = await partnerSnapshot(section);
  if (!afterRound.activeIndices.includes(index)) {
    expect(afterRound.visuals[index].scale).toBeCloseTo(1, 2);
  }
  const { activeIndices, visuals } = await section.locator("[data-partners-pill]").evaluateAll((pills) => ({
    activeIndices: pills.reduce((indices, pill, pillIndex) => {
      if (pill.dataset.partnersIdle) indices.push(pillIndex);
      return indices;
    }, []),
    visuals: pills.map((pill) => {
      const transform = getComputedStyle(pill).transform;
      const values = transform.match(/matrix(3d)?\(([^)]+)\)/)?.[2].split(",").map(Number);
      return values ? Math.hypot(values[0], values[1]) : 1;
    }),
  }));
  expect(activeIndices.length).toBeLessThanOrEqual(3);
  expect(visuals.every((scale, pillIndex) => activeIndices.includes(pillIndex) || Math.abs(scale - 1) < 0.01)).toBe(true);
});
