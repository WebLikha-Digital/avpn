import { test, expect } from "@playwright/test";

const ROOT = "[data-arc-scroll-transition]";

async function loadFixture(page) {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect
    .poll(() => page.locator(ROOT).first().evaluate((root) => Boolean(root._arcScroll)))
    .toBe(true);
}

test("builds cover and reveal SVG shapes with the expected geometry", async ({ page }) => {
  await loadFixture(page);

  const geometry = await page.locator(ROOT).evaluateAll((wrappers) => wrappers.map((wrapper) => {
    const instance = wrapper._arcScroll;
    instance.tween.progress(0);
    const start = instance.path.getAttribute("d");
    instance.tween.progress(0.5);
    const middle = instance.path.getAttribute("d");
    instance.tween.progress(1);
    const end = instance.path.getAttribute("d");
    return {
      mode: instance.mode,
      depth: instance.depth,
      start,
      middle,
      end,
      svgCount: wrapper.querySelectorAll("[data-arc-scroll-shape]").length,
      attrs: {
        viewBox: instance.shape.getAttribute("viewBox"),
        preserveAspectRatio: instance.shape.getAttribute("preserveAspectRatio"),
        ariaHidden: instance.shape.getAttribute("aria-hidden"),
      },
    };
  }));

  expect(geometry[0]).toMatchObject({
    mode: "cover",
    start: "M0 100 L0 100 Q50 100 100 100 L100 100 Z",
    end: "M0 100 L0 0 Q50 0 100 0 L100 100 Z",
    svgCount: 1,
    attrs: { viewBox: "0 0 100 100", preserveAspectRatio: "none", ariaHidden: "true" },
  });
  const coverControl = Math.round((50 - geometry[0].depth * 2) * 100) / 100;
  expect(geometry[0].middle).toBe(
    `M0 100 L0 50 Q50 ${coverControl} 100 50 L100 100 Z`,
  );
  expect(geometry[1]).toMatchObject({
    mode: "reveal",
    start: "M0 0 L0 100 Q50 100 100 100 L100 0 Z",
    end: "M0 0 L0 0 Q50 0 100 0 L100 0 Z",
    svgCount: 1,
  });
});

test("moves the cover edge monotonically during continuous scroll", async ({ page }) => {
  await loadFixture(page);
  const range = await page.locator(ROOT).first().evaluate((root) => ({
    start: root._arcScroll.tween.scrollTrigger.start,
    end: root._arcScroll.tween.scrollTrigger.end,
  }));

  await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), range.start - 150);
  await page.waitForTimeout(300);
  await page.locator(ROOT).first().evaluate((root) => {
    window.__arcFrames = [];
    const sample = () => {
      const d = root._arcScroll.path.getAttribute("d");
      window.__arcFrames.push({ scrollY: window.scrollY, edge: Number(d.match(/L0 ([\d.-]+)/)[1]) });
      if (window.__arcFrames.length < 1200) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });

  await page.mouse.move(600, 400);
  for (let index = 0; index < Math.ceil((range.end - range.start + 300) / 70); index += 1) {
    await page.mouse.wheel(0, 70);
    await page.waitForTimeout(40);
  }

  const frames = await page.evaluate(({ start, end }) => window.__arcFrames.filter(
    (frame) => frame.scrollY > start + 2 && frame.scrollY < end - 2,
  ), range);
  expect(frames.length).toBeGreaterThan(10);
  for (let index = 1; index < frames.length; index += 1) {
    expect(frames[index].edge).toBeLessThanOrEqual(frames[index - 1].edge + 0.05);
  }
});

test("re-initializes with one generated SVG and skips reduced motion", async ({ page }) => {
  await loadFixture(page);
  const result = await page.locator(ROOT).first().evaluate(async (root) => {
    const { initArcScrollTransition } = await import("/src/animations/arcScrollTransition.js");
    initArcScrollTransition();
    return root.querySelectorAll("[data-arc-scroll-shape]").length;
  });
  expect(result).toBe(1);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(page.locator(ROOT).first()).toHaveAttribute("data-arc-scroll-transition", "");
  expect(await page.locator(ROOT).first().evaluate(async (root) => {
    const { ScrollTrigger } = await import("/src/lib/gsap.js");
    return {
      svgCount: root.querySelectorAll("svg").length,
      tween: root._arcScroll?.tween,
      triggerCount: ScrollTrigger.getAll().filter(
        (trigger) => trigger.vars.trigger === root.closest("section"),
      ).length,
    };
  })).toEqual({ svgCount: 0, tween: null, triggerCount: 0 });
});
