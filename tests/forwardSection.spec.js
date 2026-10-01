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

test("stacks tablet and phone panels and slides the cream body over the media", async ({ page }) => {
  for (const viewport of [
    { width: 768, height: 1024 },
    { width: 820, height: 1180 },
    { width: 991, height: 800 },
    { width: 390, height: 844 },
    { width: 375, height: 667 },
  ]) {
    await test.step(`${viewport.width}x${viewport.height}`, async () => {
      await loadForward(page, false, viewport);
      // Reusing the page reloads the same URL, and the site restores the deep
      // scroll position from the previous viewport; start each size at the top.
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await expect.poll(() => page.locator(ROOT).evaluate((section) => [...section.querySelectorAll("[data-forward-body]")]
        .every((body) => getComputedStyle(body).transform === "none" || new DOMMatrix(getComputedStyle(body).transform).m42 === 0))).toBe(true);

      const state = await page.locator(ROOT).evaluate((section) => {
        const panels = [...section.querySelectorAll("[data-forward-panel]")].slice(0, 2);
        const stage = section.querySelector("[data-forward-stage]");
        return panels.map((panel) => {
          const media = panel.querySelector("[data-forward-media]").getBoundingClientRect();
          const body = panel.querySelector("[data-forward-body]").getBoundingClientRect();
          const panelRect = panel.getBoundingClientRect();
          const configuredGap = getComputedStyle(section).getPropertyValue("--forward-panel-top-gap").trim();
          const rootFontSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
          const configuredGapPx = configuredGap.endsWith("rem")
            ? Number.parseFloat(configuredGap) * rootFontSize
            : Number.parseFloat(configuredGap);
          return {
            mediaWidth: media.width,
            mediaHeight: media.height,
            stageWidth: stage.getBoundingClientRect().width,
            mediaBottom: media.bottom,
            bodyTop: body.top,
            bodyBottom: body.bottom,
            panelTop: panelRect.top,
            panelHeight: panelRect.height,
            bodyHeight: body.height,
            topGap: configuredGapPx,
            lastChildBottom: panel.querySelector("[data-forward-scroll]").lastElementChild.getBoundingClientRect().bottom,
          };
        });
      });

      for (const panel of state) {
        expect(panel.mediaWidth).toBeCloseTo(panel.stageWidth, 0);
        expect(panel.mediaHeight / panel.mediaWidth).toBeCloseTo(9 / 16, 2);
        expect(panel.bodyTop).toBeGreaterThanOrEqual(panel.mediaBottom - 1);
      }

      const triggerRange = await page.locator(ROOT).evaluate((section) => {
        const { timeline } = section._forwardInstance;
        const trigger = timeline.scrollTrigger;
        const panels = [...section.querySelectorAll("[data-forward-panel]")].slice(0, 2);
        return {
          start: trigger.start,
          end: trigger.end,
          duration: timeline.duration(),
          slidePhases: panels.map((panel) => {
            const body = panel.querySelector("[data-forward-body]");
            const tween = timeline.getTweensOf(body).find((candidate) => candidate.vars.y !== undefined);
            return { start: tween.startTime(), end: tween.endTime() };
          }),
        };
      });
      const frames = await page.evaluate(({ start, end, duration, slidePhases }) => new Promise((resolve) => {
        const section = document.querySelector("[data-forward-init]");
        const panels = [...section.querySelectorAll("[data-forward-panel]")].slice(0, 2);
        const scrollForTime = (time) => start + (end - start) * time / duration;
        const samples = [];
        const framesPerPhase = 24;
        let phaseIndex = 0;
        let frameIndex = 0;

        const readFrame = () => panels.map((panel) => {
          const media = panel.querySelector("[data-forward-media]").getBoundingClientRect();
          const bodyElement = panel.querySelector("[data-forward-body]");
          const body = bodyElement.getBoundingClientRect();
          return {
            bodyTop: body.top,
            bodyBottom: body.bottom,
            panelTop: panel.getBoundingClientRect().top,
            panelBottom: panel.getBoundingClientRect().bottom,
            mediaBottom: media.bottom,
            bodyZIndex: Number.parseInt(getComputedStyle(bodyElement).zIndex, 10),
            mediaZIndex: Number.parseInt(getComputedStyle(panel.querySelector("[data-forward-media]")).zIndex, 10) || 0,
            lastChildBottom: panel.querySelector("[data-forward-scroll]").lastElementChild.getBoundingClientRect().bottom,
          };
        });

        const next = () => {
          if (phaseIndex >= slidePhases.length) return resolve(samples);
          const phase = slidePhases[phaseIndex];
          const phaseProgress = frameIndex / (framesPerPhase - 1);
          window.scrollTo({ top: scrollForTime(phase.start + (phase.end - phase.start) * phaseProgress), behavior: "instant" });
          requestAnimationFrame(() => {
            samples.push({ phaseIndex, frameIndex, panels: readFrame() });
            frameIndex += 1;
            if (frameIndex >= framesPerPhase) {
              phaseIndex += 1;
              frameIndex = 0;
            }
            requestAnimationFrame(next);
          });
        };

        requestAnimationFrame(next);
      }), triggerRange);

      for (let phaseIndex = 0; phaseIndex < triggerRange.slidePhases.length; phaseIndex += 1) {
        const phaseFrames = frames.filter((frame) => frame.phaseIndex === phaseIndex);
        expect(phaseFrames.length).toBeGreaterThan(20);
        // Each slide phase moves only its own panel's body.
        const panelIndex = phaseIndex;
        expect(phaseFrames.some((frame) => {
          const panel = frame.panels[panelIndex];
          return panel.bodyTop < panel.mediaBottom;
        })).toBe(true);
        expect(phaseFrames.every((frame) => frame.panels.every((panel) => panel.bodyZIndex > panel.mediaZIndex))).toBe(true);

        const panel = phaseFrames.at(-1).panels[panelIndex];
        const initial = state[panelIndex];
        // Travel = max(0, media − gap, media + body − panel): a body that fits below the
        // gap ends with its top at the gap; a taller one ends bottom flush.
        const bodyFits = initial.bodyHeight <= initial.panelHeight - initial.topGap + 1;
        if (bodyFits) {
          expect(panel.bodyTop).toBeCloseTo(panel.panelTop + initial.topGap, 0);
        } else {
          expect(panel.bodyBottom).toBeCloseTo(panel.panelBottom, 0);
        }
        expect(panel.lastChildBottom).toBeLessThanOrEqual(viewport.height + 1);
      }
    });
  }
});

test("scrolls overflowing desktop panel copy through the body", async ({ page }) => {
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const scroll = document.querySelector("[data-forward-panel] [data-forward-scroll]");
      const extraCopy = document.createElement("p");
      extraCopy.className = "forward_panel-copy";
      extraCopy.textContent = "Additional desktop overflow detail added for regression coverage. ".repeat(24);
      scroll.append(extraCopy);
    }, { once: true });
  });
  await loadForward(page, false, { width: 1280, height: 600 });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await expect.poll(() => page.locator(ROOT).evaluate((section) => [...section.querySelectorAll("[data-forward-body]")]
    .every((body) => getComputedStyle(body).transform === "none" || new DOMMatrix(getComputedStyle(body).transform).m42 === 0))).toBe(true);

  const phase = await page.locator(ROOT).evaluate((section) => {
    const { timeline } = section._forwardInstance;
    const trigger = timeline.scrollTrigger;
    const scroll = section.querySelector("[data-forward-panel] [data-forward-scroll]");
    const tween = timeline.getTweensOf(scroll).find((candidate) => candidate.vars.y !== undefined);
    return {
      start: trigger.start,
      end: trigger.end,
      duration: timeline.duration(),
      tweenStart: tween.startTime(),
      tweenEnd: tween.endTime(),
    };
  });
  const scrollPosition = phase.start + (phase.end - phase.start) * phase.tweenEnd / phase.duration;
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), scrollPosition);
  await page.waitForTimeout(100);

  const state = await page.locator(ROOT).evaluate((section) => {
    const panel = section.querySelector("[data-forward-panel]");
    const body = panel.querySelector("[data-forward-body]").getBoundingClientRect();
    const scroll = panel.querySelector("[data-forward-scroll]");
    const lastChild = scroll.lastElementChild.getBoundingClientRect();
    const transform = getComputedStyle(scroll).transform;
    return {
      lastChildBottom: lastChild.bottom,
      bodyBottom: body.bottom,
      scrollTransform: transform === "none" ? 0 : new DOMMatrix(transform).m42,
    };
  });
  expect(state.scrollTransform).toBeLessThan(0);
  expect(state.lastChildBottom).toBeLessThanOrEqual(state.bodyBottom + 1);
});
