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
      tween.seek(target === "end" ? tween.duration() : 0, false);

      const styles = getComputedStyle(element);
      const matrix = new DOMMatrixReadOnly(styles.transform);
      return {
        preset: element.getAttribute("data-shape-reveal"),
        pair: element.getAttribute("data-shape-pair"),
        visibility: styles.visibility,
        clipPath: styles.clipPath,
        maskImage: element.style.maskImage,
        webkitMaskImage: element.style.webkitMaskImage,
        sweep: element.style.getPropertyValue("--shape-sweep"),
        matrix: [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f],
      };
    }), position);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
});

test("sweep shapes initialize masked before their heading line enters", async ({ page }) => {
  const targets = page.locator(shapes);
  await expect(targets).toHaveCount(8);
  await expect.poll(() => targets.evaluateAll((elements) =>
    elements.filter((element) => ["quarter", "half", "circle"].includes(
      element.getAttribute("data-shape-reveal"),
    )).map((element) => ({
      mask: element.style.maskImage,
      sweep: element.style.getPropertyValue("--shape-sweep"),
    })),
  )).toEqual([
    ...Array.from({ length: 7 }, () => expect.objectContaining({
      mask: expect.stringContaining("conic-gradient"),
      sweep: "0deg",
    })),
  ]);
});

test("shape sweeps derive pivots, honor overrides, and clean up on completion", async ({ page }) => {
  await scrollToBlock(page);

  const from = await seekShapes(page, "start");
  const quarters = from.filter((item) => item.preset === "quarter");
  const photo = from.find((item) => item.preset === "photo");
  const circles = from.filter((item) => item.preset === "circle");
  const left = from.find((item) => item.pair === "left");
  const right = from.find((item) => item.pair === "right");
  const singleHalf = from.find(
    (item) => item.preset === "half" && item.pair === null,
  );

  expect(quarters[0].maskImage).toContain("from 270deg at 100% 100%");
  expect(quarters[1].maskImage).toContain("from 0deg at 0% 100%");
  expect(left.maskImage).toContain("from 0deg at 0% 50%");
  expect(right.maskImage).toContain("from 0deg at 0% 50%");
  expect(singleHalf.maskImage).toContain("from 0deg at 0% 50%");
  expect(circles[0].maskImage).toContain("from 0deg at 50% 50%");
  expect(circles[1].maskImage).toContain("from 45deg at 25% 75%");
  expect(photo.matrix[0]).toBeCloseTo(1.1, 2);
  expect(photo.clipPath).toMatch(/^circle\(0% at 50% 50%\)$/);

  const mid = await page.locator(shapes).evaluateAll((elements) =>
    elements.filter((element) => ["quarter", "half", "circle"].includes(
      element.getAttribute("data-shape-reveal"),
    )).map((element) => {
      const tween = element._shapeRevealTween;
      tween.pause();
      tween.seek(tween.duration() / 2, false);
      return {
        preset: element.getAttribute("data-shape-reveal"),
        mask: element.style.maskImage,
        sweep: element.style.getPropertyValue("--shape-sweep"),
        transform: element.style.transform,
        opacity: getComputedStyle(element).opacity,
      };
    }),
  );
  mid.forEach((item) => {
    expect(item.mask).toContain("conic-gradient");
    const sweep = Number.parseFloat(item.sweep);
    const arc = item.preset === "quarter" ? 90 : item.preset === "half" ? 180 : 360;
    expect(sweep).toBeGreaterThan(0);
    expect(sweep).toBeLessThan(arc);
    expect(item.transform).toBe("");
    expect(item.opacity).toBe("1");
  });

  const rest = await seekShapes(page, "end");
  rest.filter((item) => ["quarter", "half", "circle"].includes(item.preset)).forEach((item) => {
    expect(item.maskImage).toBe("");
    expect(item.webkitMaskImage).toBe("");
    expect(item.sweep).not.toBe("");
    expect(item.matrix).toEqual([1, 0, 0, 1, 0, 0]);
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
      tween.seek(0, false);
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
      tween.seek(tween.duration(), false);
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
    tween.seek(0, false);
    const start = element.style.transformOrigin;
    tween.seek(tween.duration(), false);
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
      mask: element.style.maskImage,
      sweep: element.style.getPropertyValue("--shape-sweep"),
    })),
  );

  expect(state.every(({ visibility, tween }) =>
    visibility === "visible" && tween === null
  )).toBe(true);
  expect(state.every(({ mask, sweep }) => mask === "" && sweep === "")).toBe(true);
});

test("re-init leaves one sweep tween per shape and no stale mask", async ({ page }) => {
  await page.locator(shapes).evaluateAll((elements) => {
    elements.filter((element) => ["quarter", "half", "circle"].includes(
      element.getAttribute("data-shape-reveal"),
    )).forEach((element) => {
      element._shapeRevealTween.pause();
      element._shapeRevealTween.seek(element._shapeRevealTween.duration() / 2, false);
    });
  });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("hscroll:rebuilt")));
  const state = await page.locator(shapes).evaluateAll((elements) =>
    elements.filter((element) => ["quarter", "half", "circle"].includes(
      element.getAttribute("data-shape-reveal"),
    )).map((element) => ({
      tween: Boolean(element._shapeRevealTween),
      mask: element.style.maskImage,
      sweep: element.style.getPropertyValue("--shape-sweep"),
    })),
  );
  expect(state.every((item) => item.tween && item.mask && item.sweep === "0deg")).toBe(true);
});
