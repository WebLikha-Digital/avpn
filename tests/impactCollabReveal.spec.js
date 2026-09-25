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

test("scrubs tiles in DOM order and reverses on scroll-up", async ({ page }) => {
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
  const range = await rangeForGrid(page);
  await page.evaluate((y) => window.scrollTo({ top: y + 50, behavior: "instant" }), range.end);
  await expect.poll(() => page.locator(grid).getAttribute("data-impact-reveal-complete"))
    .not.toBeNull();
  const tile = page.locator(tiles).first();
  const before = await tile.evaluate((element) => getComputedStyle(element).borderRadius);
  await tile.hover();
  await expect.poll(() => tile.evaluate((element) => getComputedStyle(element).borderRadius))
    .not.toBe(before);
});
