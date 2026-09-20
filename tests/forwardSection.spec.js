import { test, expect } from "@playwright/test";

const ROOT = "[data-forward-init]";

async function loadForward(page, reducedMotion) {
  await page.setViewportSize({ width: 1440, height: 900 });
  if (reducedMotion) await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect.poll(() => page.locator(ROOT).evaluate((section) => Boolean(section._forwardInstance))).toBe(true);
}

async function sampleTimeline(page) {
  return page.locator(ROOT).evaluate((section) => new Promise((resolve) => {
    const instance = section._forwardInstance;
    const trigger = instance.timeline?.scrollTrigger;
    const grid = section.querySelector("[data-forward-grid]");
    const stage = section.querySelector("[data-forward-stage]");
    const columns = [...section.querySelectorAll("[data-forward-col]")];
    const copy = section.querySelector("[data-forward-copy]");
    const panels = [...section.querySelectorAll("[data-forward-panel]")];
    const readY = (element) => element.getBoundingClientRect().top;
    const readScale = (element) => {
      const transform = getComputedStyle(element).transform;
      return transform === "none" ? 1 : new DOMMatrixReadOnly(transform).a;
    };
    const frames = [];
    let count = 0;
    const sample = () => {
      frames.push({
        scrollY: window.scrollY,
        column0: readY(columns[0]),
        column1: readY(columns[1]),
        column2: readY(columns[2]),
        gridScale: readScale(grid),
        copyOpacity: Number.parseFloat(getComputedStyle(copy).opacity),
        panel0: readY(panels[0]) - stage.getBoundingClientRect().top,
        panel1: readY(panels[1]) - stage.getBoundingClientRect().top,
      });
      count += 1;
      if (count >= 32) return resolve({ frames, start: trigger.start, end: trigger.end, viewportHeight: window.innerHeight });
      window.scrollTo({ top: trigger.start + (trigger.end - trigger.start) * count / 31, behavior: "instant" });
      requestAnimationFrame(sample);
    };
    window.scrollTo({ top: trigger.start - 20, behavior: "instant" });
    requestAnimationFrame(sample);
  }));
}

test("scrubs grid entrance, copy reveal, and panels in order", async ({ page }) => {
  await loadForward(page);
  const { frames, start, end, viewportHeight } = await sampleTimeline(page);
  const middle = frames[Math.floor(frames.length / 3)];
  const early = frames[Math.floor(frames.length * 0.25)];
  const late = frames[Math.floor(frames.length * 0.65)];
  const finish = frames.at(-1);

  expect(frames.length).toBeGreaterThan(20);
  // Columns 0 and 2 enter from above (top rises toward the stage), column 1
  // from below (top falls toward it).
  expect(frames[0].column0).toBeLessThan(middle.column0);
  expect(frames[0].column2).toBeLessThan(middle.column2);
  expect(frames[0].column1).toBeGreaterThan(middle.column1);
  expect(Math.max(...frames.map((frame) => frame.gridScale))).toBeGreaterThan(1.3);
  expect(late.copyOpacity).toBeGreaterThan(0.8);
  expect(early.panel0).toBeGreaterThanOrEqual(viewportHeight - 1);
  expect(early.panel1).toBeGreaterThanOrEqual(viewportHeight - 1);
  expect(frames.some((frame) => frame.panel0 < 10 && frame.panel1 > 10)).toBe(true);
  expect(finish.panel0).toBeLessThan(10);
  expect(finish.panel1).toBeLessThan(10);
  expect(end).toBeGreaterThan(start);

  await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), start - 20);
  await page.waitForTimeout(100);
  const reversed = await page.locator(ROOT).evaluate((section) => ({
    copyOpacity: Number.parseFloat(getComputedStyle(section.querySelector("[data-forward-copy]")).opacity),
    panel: section.querySelector("[data-forward-panel]").getBoundingClientRect().top
      - section.querySelector("[data-forward-stage]").getBoundingClientRect().top,
  }));
  expect(reversed.copyOpacity).toBeLessThan(0.1);
  expect(reversed.panel).toBeGreaterThan(0);
});

test("keeps the section static under reduced motion", async ({ page }) => {
  await loadForward(page, true);
  const state = await page.locator(ROOT).evaluate((section) => ({
    timeline: section._forwardInstance.timeline,
    copyOpacity: getComputedStyle(section.querySelector("[data-forward-copy]")).opacity,
    panelTransforms: [...section.querySelectorAll("[data-forward-panel]")].map((panel) => getComputedStyle(panel).transform),
    columnTransforms: [...section.querySelectorAll("[data-forward-col]")].map((column) => getComputedStyle(column).transform),
  }));

  expect(state.timeline).toBeNull();
  expect(state.copyOpacity).toBe("1");
  expect(state.panelTransforms).toEqual(["none", "none"]);
  expect(state.columnTransforms).toEqual(["none", "none", "none"]);
});
