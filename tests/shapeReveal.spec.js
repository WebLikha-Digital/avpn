import { test, expect } from "@playwright/test";

const block = '[data-testid="shape-reveal"]';
const shapes = `${block} [data-shape-reveal]`;
const triggerBlock = '[data-testid="shape-reveal-trigger"]';
const triggerShapes = `${triggerBlock} [data-shape-reveal]`;
const fadeOriginShape = '[data-testid="shape-reveal-fade-origin"] [data-shape-reveal]';

async function scrollToBlock(page) {
  const top = await page.locator(block).evaluate(
    (element) => element.getBoundingClientRect().top + window.scrollY,
  );
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), top);
}

async function seekShapes(page, position) {
  return page.locator(shapes).evaluateAll((elements, target) =>
    elements.map((element) => {
      const tween = element._shapeRevealTween;
      tween.pause();
      tween.seek(target === "end" ? tween.duration() : 0);

      const styles = getComputedStyle(element);
      const matrix = new DOMMatrixReadOnly(styles.transform);
      return {
        preset: element.getAttribute("data-shape-reveal"),
        pair: element.getAttribute("data-shape-pair"),
        visibility: styles.visibility,
        clipPath: styles.clipPath,
        matrix: [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f],
      };
    }), position);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
});

test("all shape presets initialize hidden before their heading line enters", async ({ page }) => {
  const targets = page.locator(shapes);
  await expect(targets).toHaveCount(6);
  await expect.poll(() => targets.evaluateAll((elements) =>
    elements.map((element) => getComputedStyle(element).visibility),
  )).toEqual(["hidden", "hidden", "hidden", "hidden", "hidden", "hidden"]);
});

test("shape presets seek from their authored entry state to visible rest", async ({ page }) => {
  await scrollToBlock(page);

  const from = await seekShapes(page, "start");
  const quarter = from.find((item) => item.preset === "quarter");
  const photo = from.find((item) => item.preset === "photo");
  const circle = from.find((item) => item.preset === "circle");
  const left = from.find((item) => item.pair === "left");
  const right = from.find((item) => item.pair === "right");
  const singleHalf = from.find(
    (item) => item.preset === "half" && item.pair === null,
  );

  expect(Math.abs(quarter.matrix[1])).toBeGreaterThan(0.1);
  expect(Math.hypot(quarter.matrix[0], quarter.matrix[1])).toBeCloseTo(0.65, 2);
  expect(left.matrix[4]).toBeLessThan(0);
  expect(right.matrix[4]).toBeGreaterThan(0);
  expect(singleHalf.matrix[4]).toBeLessThan(0);
  expect(circle.matrix[0]).toBeCloseTo(0.4, 2);
  expect(photo.matrix[0]).toBeCloseTo(1.1, 2);
  expect(photo.clipPath).toMatch(/^circle\(0% at 50% 50%\)$/);
  expect(from.every((item) => item.visibility === "hidden")).toBe(true);

  const rest = await seekShapes(page, "end");
  rest.forEach((item) => {
    expect(item.visibility).toBe("visible");
    expect(item.matrix[0]).toBeCloseTo(1, 5);
    expect(item.matrix[1]).toBeCloseTo(0, 5);
    expect(item.matrix[2]).toBeCloseTo(0, 5);
    expect(item.matrix[3]).toBeCloseTo(1, 5);
    expect(item.matrix[4]).toBeCloseTo(0, 5);
    expect(item.matrix[5]).toBeCloseTo(0, 5);
  });
  expect(rest.find((item) => item.preset === "photo").clipPath).toMatch(
    /^circle\(50% at 50% 50%\)$/,
  );
});

test("data-split-delay offsets the stored heading line tween", async ({ page }) => {
  const delay = await page.locator(`${block} [data-split-delay="0.1"]`).evaluate(
    (heading) => heading._splitTween.delay(),
  );
  expect(delay).toBeCloseTo(0.1, 5);
});

test("explicit shape triggers and disc/fade presets use the wrapper as one unit", async ({ page }) => {
  const targets = page.locator(triggerShapes);
  await expect(targets).toHaveCount(2);

  const state = await targets.evaluateAll((elements) =>
    elements.map((element) => {
      const tween = element._shapeRevealTween;
      tween.pause();
      tween.seek(0);
      const styles = getComputedStyle(element);
      const matrix = new DOMMatrixReadOnly(styles.transform);
      return {
        preset: element.getAttribute("data-shape-reveal"),
        triggerIsWrapper: tween.scrollTrigger.trigger === element.closest("[data-testid=\"shape-reveal-trigger\"]"),
        start: tween.scrollTrigger.vars.start,
        delay: tween.delay(),
        startVisibility: styles.visibility,
        startScale: Math.hypot(matrix.a, matrix.b),
        startTransform: element.style.transform,
        startTransformOrigin: element.style.transformOrigin,
      };
    }),
  );

  expect(state.every((item) => item.triggerIsWrapper)).toBe(true);
  expect(state.every((item) => item.start === "clamp(top 20%)")).toBe(true);
  expect(state.find((item) => item.preset === "fade").delay).toBeCloseTo(0.15, 5);
  expect(state.find((item) => item.preset === "disc")).toMatchObject({
    startVisibility: "hidden",
  });
  expect(state.find((item) => item.preset === "disc").startScale).toBeCloseTo(0.9, 2);
  expect(state.find((item) => item.preset === "fade")).toMatchObject({
    startVisibility: "hidden",
    startScale: 1,
    startTransform: "",
    startTransformOrigin: "",
  });

  const rest = await targets.evaluateAll((elements) =>
    elements.map((element) => {
      const tween = element._shapeRevealTween;
      tween.pause();
      tween.seek(tween.duration());
      const styles = getComputedStyle(element);
      const matrix = new DOMMatrixReadOnly(styles.transform);
      return {
        preset: element.getAttribute("data-shape-reveal"),
        visibility: styles.visibility,
        scale: Math.hypot(matrix.a, matrix.b),
        transform: element.style.transform,
        transformOrigin: element.style.transformOrigin,
      };
    }),
  );

  expect(rest.every((item) => item.visibility === "visible")).toBe(true);
  expect(rest.find((item) => item.preset === "disc").scale).toBeCloseTo(1, 5);
  expect(rest.find((item) => item.preset === "fade")).toMatchObject({
    scale: 1,
    transform: "",
    transformOrigin: "",
  });
});

test("fade preserves an authored transform origin", async ({ page }) => {
  const target = page.locator(fadeOriginShape);
  await expect(target).toHaveCount(1);

  const origins = await target.evaluate((element) => {
    const tween = element._shapeRevealTween;
    tween.pause();
    tween.seek(0);
    const start = element.style.transformOrigin;
    tween.seek(tween.duration());
    return { start, end: element.style.transformOrigin };
  });

  expect(origins).toEqual({ start: "12px 34px", end: "12px 34px" });
});

test("reduced motion leaves shapes visible and without reveal tweens", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await page.waitForLoadState("networkidle");

  const state = await page.locator(shapes).evaluateAll((elements) =>
    elements.map((element) => ({
      visibility: getComputedStyle(element).visibility,
      tween: element._shapeRevealTween ?? null,
    })),
  );

  expect(state.every(({ visibility, tween }) =>
    visibility === "visible" && tween === null
  )).toBe(true);
});
