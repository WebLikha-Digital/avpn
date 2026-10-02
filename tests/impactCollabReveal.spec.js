import { test, expect } from "@playwright/test";

const grid = "[data-impact-reveal]";
const tiles = `${grid} > *`;

async function waitForInit(page) {
  await page.waitForFunction((selector) => document.querySelector(selector)?._impactCollabReveal, grid);
}

async function rangeForGrid(page) {
  return page.locator(grid).evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const top = rect.top + window.scrollY;
    const mobile = window.innerWidth <= 991;
    return {
      start: top - window.innerHeight * (mobile ? 0.9 : 0.85),
      end: mobile
        ? top + rect.height - window.innerHeight * 0.85
        : top + rect.height / 2 - window.innerHeight * 0.55,
    };
  });
}

// The reveal's live trigger range: the fixed grid range at <=767, the line's
// range (plus the trailing span) where the line leads the tiles.
async function triggerRange(page) {
  return page.locator(grid).evaluate((node) => {
    const trigger = node._impactCollabReveal.timeline.scrollTrigger;
    return { start: trigger.start, end: trigger.end };
  });
}

async function sampleRange(page, range, steps = 18) {
  return page.evaluate(async ({ start, end, steps }) => {
    const targets = [...document.querySelectorAll("[data-impact-reveal] > *")];
    const samples = [];
    for (let index = 0; index <= steps; index += 1) {
      const y = start + ((end - start) * index) / steps;
      window.scrollTo({ top: y, behavior: "instant" });
      await new Promise((resolve) => requestAnimationFrame(resolve));
      samples.push(targets.map((target) => {
        const matrix = new DOMMatrixReadOnly(getComputedStyle(target).transform);
        return { scale: Math.hypot(matrix.a, matrix.b), opacity: Number(getComputedStyle(target).opacity) };
      }));
    }
    return samples;
  }, { ...range, steps });
}

async function waitForTiles(page, expected) {
  await expect.poll(() => page.locator(tiles).evaluateAll((elements, state) =>
    elements.every((element) => {
      const styles = getComputedStyle(element);
      const matrix = new DOMMatrixReadOnly(styles.transform);
      const scale = Math.hypot(matrix.a, matrix.b);
      return state === "visible"
        ? scale > 0.99 && Number(styles.opacity) > 0.99
        : scale < 0.01 && Number(styles.opacity) < 0.01;
    }),
    expected,
  ), { timeout: 1500 }).toBe(true);
}

async function lineRevealRange(page) {
  return page.locator(grid).evaluate((node) => {
    const instance = node._impactCollabReveal;
    const trigger = instance.line?._drawScrubState?.trigger;
    return {
      start: trigger.start,
      lineEnd: trigger.end,
      end: instance.timeline.scrollTrigger.end,
      positions: instance.lineRevealPositions,
    };
  });
}

async function sampleAt(page, y, settle = false) {
  return page.evaluate(async ({ scrollTop, settle }) => {
    window.scrollTo({ top: scrollTop, behavior: "instant" });
    // Sample after real frames so ScrollTrigger's scrub catches up instead of
    // asserting only a settled DOM state. `settle` waits out the 0.5s scrub.
    for (let frame = 0; frame < 5; frame += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    if (settle) await new Promise((resolve) => setTimeout(resolve, 900));
    return [...document.querySelectorAll("[data-impact-reveal] > *")].map((element) => ({
      opacity: Number(getComputedStyle(element).opacity),
      scale: Math.hypot(...(() => {
        const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
        return [matrix.a, matrix.b];
      })()),
    }));
  }, { scrollTop: y, settle });
}

// The fixed-range reveal only runs where the line is hidden (<=767).
test("scrubs tiles in DOM order and reverses on scroll-up", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/");
  await waitForInit(page);

  const range = await rangeForGrid(page);
  const before = await page.locator(tiles).evaluateAll((elements) => elements.map((element) => {
    const style = getComputedStyle(element);
    const matrix = new DOMMatrixReadOnly(style.transform);
    return { opacity: Number(style.opacity), scale: Math.hypot(matrix.a, matrix.b) };
  }));
  expect(before.every(({ opacity }) => opacity === 0)).toBe(true);
  expect(before.every(({ scale }) => scale === 0)).toBe(true);

  const samples = await sampleRange(page, range);
  const firstVisible = [0, 1, 2].map((tileIndex) =>
    samples.findIndex((sample) => sample[tileIndex].opacity > 0.05),
  );
  expect(firstVisible.every((sampleIndex) => sampleIndex >= 0)).toBe(true);
  expect(firstVisible[0]).toBeLessThan(firstVisible[1]);
  expect(firstVisible[1]).toBeLessThan(firstVisible[2]);

  await waitForTiles(page, "visible");
  const end = await page.locator(tiles).evaluateAll((elements) => elements.map((element) => {
    const styles = getComputedStyle(element);
    const matrix = new DOMMatrixReadOnly(styles.transform);
    return { scale: Math.hypot(matrix.a, matrix.b), opacity: Number(styles.opacity) };
  }));
  end.forEach(({ scale, opacity }) => {
    expect(scale).toBeCloseTo(1, 1);
    expect(opacity).toBeCloseTo(1, 1);
  });

  const reversed = await sampleRange(page, { start: range.end, end: range.start });
  await waitForTiles(page, "hidden");
  const reverseEnd = await page.locator(tiles).evaluateAll((elements) => elements.map((element) => {
    const styles = getComputedStyle(element);
    const matrix = new DOMMatrixReadOnly(styles.transform);
    return { scale: Math.hypot(matrix.a, matrix.b), opacity: Number(styles.opacity) };
  }));
  reverseEnd.forEach(({ scale, opacity }) => {
    expect(scale).toBeCloseTo(0, 1);
    expect(opacity).toBeCloseTo(0, 1);
  });
});

test("line tip gates the first tile and later tiles follow path entry order", async ({ page }) => {
  await page.goto("/");
  await waitForInit(page);

  const range = await lineRevealRange(page);
  expect(range.positions).toHaveLength(3);
  const scrollFor = (progress) => range.start + (range.lineEnd - range.start) * progress;

  const beforeFirst = await sampleAt(page, scrollFor(Math.max(0, range.positions[0] - 0.015)), true);
  expect(beforeFirst[0].opacity).toBeLessThan(0.05);
  expect(beforeFirst[0].scale).toBeLessThan(0.05);

  const afterFirst = await sampleAt(page, scrollFor(range.positions[0] + 0.08), true);
  expect(afterFirst[0].opacity).toBeGreaterThan(0.5);
  expect(afterFirst[0].scale).toBeGreaterThan(0.5);

  const samples = [];
  const start = Math.max(0, range.positions[0] - 0.02);
  const end = Math.min(1, range.positions[2] + 0.08);
  for (let step = 0; step <= 24; step += 1) {
    samples.push(await sampleAt(page, scrollFor(start + ((end - start) * step) / 24)));
  }
  const firstVisible = [0, 1, 2].map((index) =>
    samples.findIndex((sample) => sample[index].opacity > 0.05),
  );
  expect(firstVisible[0]).toBeGreaterThanOrEqual(0);
  expect(firstVisible[1]).toBeGreaterThan(firstVisible[0]);
  expect(firstVisible[2]).toBeGreaterThan(firstVisible[1]);
});

// Reads the drawn tip from the line itself (screen-px dash length walked along
// the path), not from the reveal module, so it checks that the tile timing
// matches where the line actually is.
async function tipAndTiles(page, scrollTop) {
  return page.evaluate(async (top) => {
    window.scrollTo({ top, behavior: "instant" });
    // Both the line and the tiles scrub; wait until they settle at this scroll.
    await new Promise((resolve) => setTimeout(resolve, 900));
    const path = document.querySelector(".impact-collab_line [data-draw-scroll-path]");
    const drawn = parseFloat(getComputedStyle(path).strokeDasharray.split(",")[0]) || 0;
    const matrix = path.getScreenCTM();
    const total = path.getTotalLength();
    let walked = 0;
    let previous = null;
    let tip = null;
    for (let index = 0; index <= 2000 && !tip; index += 1) {
      const local = path.getPointAtLength((total * index) / 2000);
      const point = new DOMPoint(local.x, local.y).matrixTransform(matrix);
      if (previous) walked += Math.hypot(point.x - previous.x, point.y - previous.y);
      if (walked >= drawn) tip = { x: point.x, y: point.y };
      previous = point;
    }
    tip ??= { x: previous.x, y: previous.y };
    const tiles = [...document.querySelectorAll("[data-impact-reveal] > *")].map((tile) => {
      const saved = tile.style.transform;
      tile.style.transform = "none";
      const rect = tile.getBoundingClientRect();
      tile.style.transform = saved;
      const distance = Math.hypot(
        Math.max(rect.left - tip.x, 0, tip.x - rect.right),
        Math.max(rect.top - tip.y, 0, tip.y - rect.bottom),
      );
      return { distance, opacity: Number(getComputedStyle(tile).opacity) };
    });
    return { drawn, tiles };
  }, scrollTop);
}

test("each tile starts revealing only when the drawn line tip reaches it", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await waitForInit(page);
  // Let load-time refreshes (fonts, lazy images) finish before measuring.
  await page.waitForTimeout(1500);

  const range = await lineRevealRange(page);
  const scrollFor = (progress) => range.start + (range.lineEnd - range.start) * progress;

  for (const index of [0, 1, 2]) {
    const at = scrollFor(range.positions[index]);
    const before = await tipAndTiles(page, at - 24);
    expect(before.drawn).toBeGreaterThan(0);
    expect(before.tiles[index].opacity).toBeLessThan(0.02);
    expect(before.tiles[index].distance).toBeGreaterThan(0);

    const after = await tipAndTiles(page, at + 24);
    expect(after.tiles[index].opacity).toBeGreaterThan(0.02);
    expect(after.tiles[index].distance).toBeLessThan(1);
  }
});

test("mobile range fully reveals the last tile before the grid leaves", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/");
  await waitForInit(page);

  const range = await rangeForGrid(page);
  const samples = await sampleRange(page, range);
  await waitForTiles(page, "visible");
  const end = await page.locator(tiles).evaluateAll((elements) => elements.map((element) => {
    const styles = getComputedStyle(element);
    const matrix = new DOMMatrixReadOnly(styles.transform);
    return { scale: Math.hypot(matrix.a, matrix.b), opacity: Number(styles.opacity) };
  }));
  end.forEach(({ scale, opacity }) => {
    expect(scale).toBeCloseTo(1, 1);
    expect(opacity).toBeCloseTo(1, 1);
  });
});

test("reduced motion keeps tiles visible and does not create a reveal", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await waitForInit(page);

  await expect.poll(() => page.locator(tiles).evaluateAll((elements) => elements.map((element) => ({
    opacity: getComputedStyle(element).opacity,
    scale: getComputedStyle(element).transform,
  })))).toEqual([
    { opacity: "1", scale: "none" },
    { opacity: "1", scale: "none" },
    { opacity: "1", scale: "none" },
  ]);
});

test("hover still morphs border-radius after the reveal", async ({ page }) => {
  await page.goto("/");
  await waitForInit(page);
  const range = await triggerRange(page);
  await page.evaluate((y) => window.scrollTo({ top: y + 50, behavior: "instant" }), range.end);
  await expect.poll(() => page.locator(grid).getAttribute("data-impact-reveal-complete"))
    .not.toBeNull();
  const tile = page.locator(tiles).first();
  const before = await tile.evaluate((element) => getComputedStyle(element).borderRadius);
  await tile.hover();
  await expect.poll(() => tile.evaluate((element) => getComputedStyle(element).borderRadius))
    .not.toBe(before);
});

test("resizing across 768 switches between line-led and fixed-range reveals", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 900 });
  await page.goto("/");
  await waitForInit(page);
  const mode = () => page.locator(grid).evaluate((node) => Boolean(node._impactCollabReveal?.line));
  await expect.poll(mode).toBe(true);

  await page.setViewportSize({ width: 700, height: 900 });
  await expect.poll(mode).toBe(false);

  await page.setViewportSize({ width: 800, height: 900 });
  await expect.poll(mode).toBe(true);
});
