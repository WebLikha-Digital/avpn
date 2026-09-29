import { test, expect } from "@playwright/test";

const ROOT = "[data-forward-init]";

async function loadForward(page, reducedMotion, viewport = { width: 1440, height: 900 }) {
  await page.setViewportSize(viewport);
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

test("scrolls phone panel copy through the body's content box", async ({ page }) => {
  await loadForward(page, false, { width: 390, height: 844 });

  await page.locator(ROOT).evaluate((section) => {
    const scroll = section.querySelector("[data-forward-panel] [data-forward-scroll]");
    const extraCopy = document.createElement("p");
    extraCopy.className = "forward_panel-copy";
    extraCopy.textContent = "Additional engagement pathway detail added after initialization. ".repeat(12);
    scroll.append(extraCopy);
    section._forwardInstance.timeline.scrollTrigger.refresh();
  });

  const triggerEnd = await page.locator(ROOT).evaluate((section) => section._forwardInstance.timeline.scrollTrigger.end);
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), triggerEnd);
  await page.waitForTimeout(100);

  const panels = await page.locator(ROOT).evaluate((section) => [...section.querySelectorAll("[data-forward-panel]")].map((panel) => {
    const body = panel.querySelector("[data-forward-body]");
    const scroll = panel.querySelector("[data-forward-scroll]");
    const lastChild = scroll.lastElementChild;
    const bodyStyle = getComputedStyle(body);
    const bodyRect = body.getBoundingClientRect();
    const lastChildRect = lastChild.getBoundingClientRect();
    return {
      lastChildBottom: lastChildRect.bottom,
      contentBoxBottom: bodyRect.bottom - Number.parseFloat(bodyStyle.paddingBottom),
    };
  }));

  for (const panel of panels) {
    expect(panel.lastChildBottom).toBeLessThanOrEqual(panel.contentBoxBottom + 1);
  }
});

test("clears the intro copy from the zoomed tablet tiles", async ({ page }) => {
  for (const viewport of [
    { width: 768, height: 1024 },
    { width: 820, height: 1180 },
    { width: 991, height: 1200 },
  ]) {
    await test.step(`${viewport.width}x${viewport.height}`, async () => {
      await loadForward(page, false, viewport);

      const triggerRange = await page.locator(ROOT).evaluate((section) => {
        const trigger = section._forwardInstance.timeline.scrollTrigger;
        return { start: trigger.start, end: trigger.end };
      });
      const phasePosition = triggerRange.start + (triggerRange.end - triggerRange.start) * 0.45;
      await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), phasePosition);
      await page.waitForTimeout(100);

      const layout = await page.locator(ROOT).evaluate((section) => {
        const title = section.querySelector("[data-forward-title]").getBoundingClientRect();
        const copy = section.querySelector("[data-forward-copy]").getBoundingClientRect();
        const columns = [...section.querySelectorAll("[data-forward-col]")];
        const tileRects = columns.map((column) => [...column.querySelectorAll("[data-forward-tile]")]
          .map((tile) => tile.getBoundingClientRect()));
        const overlaps = (tile, band) => tile.bottom > band.top && tile.top < band.bottom;
        const relevantSideTiles = (columnIndex) => tileRects[columnIndex]
          .map((tile, index) => ({ tile, index }))
          .filter(({ tile }) => overlaps(tile, title) || overlaps(tile, copy));

        return {
          title: { top: title.top, bottom: title.bottom },
          copy: { left: copy.left, right: copy.right, top: copy.top, bottom: copy.bottom },
          copyOpacity: Number.parseFloat(getComputedStyle(section.querySelector("[data-forward-copy]")).opacity),
          firstColumn: relevantSideTiles(0).map(({ tile, index }) => ({
            index,
            right: tile.right,
            top: tile.top,
            bottom: tile.bottom,
          })),
          thirdColumn: relevantSideTiles(2).map(({ tile, index }) => ({
            index,
            left: tile.left,
            top: tile.top,
            bottom: tile.bottom,
          })),
          middleSecond: { bottom: tileRects[1][1].bottom },
          middleLast: { top: tileRects[1].at(-1).top },
        };
      });

      expect(layout.copyOpacity).toBeGreaterThan(0.99);
      expect(layout.firstColumn.length).toBeGreaterThan(0);
      expect(layout.thirdColumn.length).toBeGreaterThan(0);

      const maxFirstRight = Math.max(...layout.firstColumn.map((tile) => tile.right));
      const minThirdLeft = Math.min(...layout.thirdColumn.map((tile) => tile.left));
      expect(layout.copy.left - maxFirstRight).toBeGreaterThanOrEqual(24);
      expect(minThirdLeft - layout.copy.right).toBeGreaterThanOrEqual(24);
      expect(layout.copy.bottom).toBeLessThan(layout.middleLast.top);
      expect(layout.title.top).toBeGreaterThan(layout.middleSecond.bottom);
    });
  }
});
