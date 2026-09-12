import { test, expect } from "@playwright/test";

const MOVE = { duration: 1 };

const installPreloaderSampler = (page) => {
  page.addInitScript((moveDuration) => {
    window.__preloaderSamples = [];
    window.__preloaderExitSample = null;
    const readRadii = () => {
      const shape = document.querySelector("[data-preloader-shape]");
      if (!shape) return null;
      return ["borderTopLeftRadius", "borderTopRightRadius", "borderBottomRightRadius", "borderBottomLeftRadius"]
        .map((corner) => Number.parseFloat(getComputedStyle(shape)[corner]));
    };
    window.addEventListener("preloader:exit", (event) => {
      const before = readRadii();
      const instance = document.querySelector("[data-preloader-init]")._preloaderInstance;
      event.detail.timeline.seek(moveDuration);
      window.__preloaderExitSample = {
        before,
        quarter: readRadii(),
        stepDuration: instance.stepTimeline.duration(),
        stepProgress: instance.stepTimeline.progress(),
      };
    });
    let started = false;
    const sample = () => {
      const container = document.querySelector("[data-preloader-init]");
      const instance = container?._preloaderInstance;
      if (instance) {
        const years = ["2025", "2026"].map((year) => document.querySelector(`[data-preloader-year="${year}"]`));
        const stepActive = instance.stepTimeline?.isActive() ?? false;
        window.__preloaderSamples.push({
          counterValue: instance.counterValue,
          corners: years.map((year) => year.dataset.preloaderCorner),
          stepActive,
          stepTime: stepActive ? instance.stepTimeline.time() : null,
          rects: stepActive ? years.map((year) => {
            const rect = year.getBoundingClientRect();
            return { left: rect.left, top: rect.top };
          }) : null,
          radii: readRadii(),
          entranceActive: instance.entrance?.isActive() ?? false,
        });
      }
      if (document.documentElement.classList.contains("is-preloading")) requestAnimationFrame(sample);
    };
    const start = () => {
      if (started) return;
      started = true;
      requestAnimationFrame(sample);
    };
    document.addEventListener("DOMContentLoaded", start, { once: true });
    if (document.readyState !== "loading") start();
  }, MOVE.duration);
};

test("counter is monotonic and reaches 100", async ({ page }) => {
  await page.goto("/?preloader=1");
  const values = await page.evaluate(async () => {
    const instance = document.querySelector("[data-preloader-init]")._preloaderInstance;
    const values = [];
    while (document.documentElement.classList.contains("is-preloading")) {
      values.push(instance.counterValue);
      await new Promise(requestAnimationFrame);
    }
    values.push(instance.counterValue);
    return values;
  });
  expect(values.at(-1)).toBe(100);
  values.slice(1).forEach((value, index) => expect(value).toBeGreaterThanOrEqual(values[index]));
});

test("odometer has three visible masks and reaches 100", async ({ page }) => {
  await page.addInitScript(() => {
    window.addEventListener("preloader:exit", (event) => event.detail.timeline.pause());
  });
  await page.goto("/?preloader=1");
  await expect.poll(() => page.locator("[data-preloader-counter] [data-odometer-part=mask]").count()).toBe(3);
  await expect.poll(() => page.locator("[data-preloader-init]").evaluate((node) => node._preloaderInstance.counterValue)).toBe(100);
  const result = await page.locator("[data-preloader-counter]").evaluate((counter) => ({
    masks: counter.querySelectorAll('[data-odometer-part="mask"]').length,
    rollers: [...counter.querySelectorAll('[data-odometer-part="roller"]')].map((roller) => getComputedStyle(roller).transform),
    widths: [...counter.querySelectorAll('[data-odometer-part="mask"]')].map((mask) => mask.getBoundingClientRect().width),
  }));
  expect(result.masks).toBe(3);
  expect(result.rollers).toHaveLength(3);
  expect(result.widths.every((width) => width > 0)).toBe(true);
});

test("odometer rollers never roll backward during rapid updates", async ({ page }) => {
  await page.goto("/?preloader=1");
  const result = await page.evaluate(async () => {
    const container = document.querySelector("[data-preloader-init]");
    const rollers = [...document.querySelectorAll('[data-preloader-part="roller"], [data-odometer-part="roller"]')];
    const counter = document.querySelector("[data-preloader-counter]");
    const styles = getComputedStyle(counter);
    const step = styles.lineHeight === "normal" ? 1.2 : parseFloat(styles.lineHeight) / parseFloat(styles.fontSize);
    const cellPx = step * parseFloat(styles.fontSize);
    const readY = (transform) => {
      if (transform === "none") return 0;
      const values = transform.startsWith("matrix3d(")
        ? transform.slice(9, -1).split(",")
        : transform.slice(7, -1).split(",");
      return Number.parseFloat(values[transform.startsWith("matrix3d(") ? 13 : 5]);
    };
    const samples = [];
    while (document.documentElement.classList.contains("is-preloading")) {
      samples.push(rollers.map((roller) => readY(getComputedStyle(roller).transform)));
      await new Promise(requestAnimationFrame);
    }
    return { samples, cellPx };
  });
  for (let frame = 1; frame < result.samples.length; frame += 1) {
    result.samples[frame].forEach((value, index) => {
      const previous = result.samples[frame - 1][index];
      if (value <= previous + 0.5) return;
      const delta = value - previous;
      // A wrap is exactly +10 cells minus the forward travel of the same frame.
      // On CI a frame can run 100ms+, which is up to ~4 cells of a 0.35s roll,
      // so the floor sits at 5 cells; a genuine backward roll is bounded by the
      // wrap logic to far less than that.
      expect(delta).toBeGreaterThan(5 * result.cellPx);
      expect(delta).toBeLessThanOrEqual(10 * result.cellPx + 1);
    });
  }
});

test("years orbit corners at counter thresholds and move on one axis", async ({ page }) => {
  installPreloaderSampler(page);
  await page.goto("/?preloader=1");
  await page.waitForFunction(() => !document.documentElement.classList.contains("is-preloading"));
  const samples = await page.evaluate(() => window.__preloaderSamples);
  const cornerPairs = samples.reduce((pairs, { corners }) => {
    const key = JSON.stringify(corners);
    if (pairs.at(-1)?.key !== key) pairs.push({ key, corners });
    return pairs;
  }, []).map(({ corners }) => corners);
  expect(cornerPairs).toEqual([["br", "tl"], ["bl", "tr"], ["tl", "br"]]);

  samples.filter(({ entranceActive }) => entranceActive).forEach(({ corners }) => {
    expect(corners).toEqual(["br", "tl"]);
  });
  const cornerChanges = samples.slice(1).map((sample, index) => ({
    sample,
    previous: samples[index],
  })).filter(({ sample, previous }) => JSON.stringify(sample.corners) !== JSON.stringify(previous.corners));
  expect(cornerChanges).toHaveLength(2);
  cornerChanges.forEach(({ sample }) => {
    expect(sample.stepActive).toBe(true);
    expect(sample.entranceActive).toBe(false);
  });

  const activeSamples = samples.filter(({ stepActive, stepTime, rects }) => stepActive && stepTime !== null && rects);
  const horizontalSamples = activeSamples.filter(({ stepTime }) => stepTime < MOVE.duration);
  const verticalSamples = activeSamples.filter(({ stepTime }) => stepTime >= MOVE.duration);
  expect(horizontalSamples.length).toBeGreaterThan(1);
  expect(verticalSamples.length).toBeGreaterThan(1);
  for (let index = 0; index < 2; index += 1) {
    const horizontalRects = horizontalSamples.map(({ rects }) => rects[index]);
    expect(Math.max(...horizontalRects.map(({ left }) => left)) - Math.min(...horizontalRects.map(({ left }) => left))).toBeGreaterThan(1);
    expect(Math.max(...horizontalRects.map(({ top }) => top)) - Math.min(...horizontalRects.map(({ top }) => top))).toBeLessThanOrEqual(1);
    const verticalRects = verticalSamples.map(({ rects }) => rects[index]);
    expect(Math.max(...verticalRects.map(({ top }) => top)) - Math.min(...verticalRects.map(({ top }) => top))).toBeGreaterThan(1);
    expect(Math.max(...verticalRects.map(({ left }) => left)) - Math.min(...verticalRects.map(({ left }) => left))).toBeLessThanOrEqual(1);
  }
});

test("shape morphs with year moves and reaches the exit quarter", async ({ page }) => {
  installPreloaderSampler(page);
  await page.goto("/?preloader=1");
  await page.waitForFunction(() => !document.documentElement.classList.contains("is-preloading"));
  const result = await page.evaluate(() => ({
    samples: window.__preloaderSamples,
    exit: window.__preloaderExitSample,
  }));
  const initial = result.samples.find(({ entranceActive }) => entranceActive)?.radii;
  expect(initial).toEqual([0, 0, 0, 0]);
  const phase1 = result.samples.filter(({ stepTime }) => stepTime !== null && stepTime < MOVE.duration);
  const phase2 = result.samples.filter(({ stepTime }) => stepTime !== null && stepTime >= MOVE.duration);
  expect(phase1.length).toBeGreaterThan(1);
  expect(phase2.length).toBeGreaterThan(1);
  for (let index = 1; index < phase1.length; index += 1) {
    phase1[index].radii.forEach((value, corner) => {
      expect(value).toBeGreaterThanOrEqual(phase1[index - 1].radii[corner] - 0.5);
    });
  }
  expect(phase1.at(-1).radii.every((value) => value > 45)).toBe(true);
  for (let index = 1; index < phase2.length; index += 1) {
    expect(phase2[index].radii[1]).toBeLessThanOrEqual(phase2[index - 1].radii[1] + 0.5);
    expect(phase2[index].radii[3]).toBeLessThanOrEqual(phase2[index - 1].radii[3] + 0.5);
  }
  phase2.forEach(({ radii }) => {
    expect(radii[0]).toBeGreaterThan(45);
    expect(radii[2]).toBeGreaterThan(45);
  });
  expect(phase2.at(-1).radii[1]).toBeLessThan(5);
  expect(phase2.at(-1).radii[3]).toBeLessThan(5);
  expect(result.exit.before[0]).toBeGreaterThan(49);
  expect(result.exit.before[2]).toBeGreaterThan(49);
  expect(result.exit.before[1]).toBeLessThan(1);
  expect(result.exit.before[3]).toBeLessThan(1);
  if (result.exit.stepDuration === 0) expect(result.exit.stepProgress).toBe(0);
  else expect(result.exit.stepProgress).toBe(1);
  expect(result.exit.quarter[0]).toBeGreaterThan(49);
  expect(result.exit.quarter[1]).toBeLessThan(1);
  expect(result.exit.quarter[2]).toBeLessThan(1);
  expect(result.exit.quarter[3]).toBeLessThan(1);
});

test("preloader entrance moves the counter up from below the viewport", async ({ page }) => {
  await page.goto("/?preloader=1");
  const positions = await page.evaluate(() => {
    const container = document.querySelector("[data-preloader-init]");
    const counter = document.querySelector("[data-preloader-counter]");
    const { entrance } = container._preloaderInstance;
    entrance.pause();
    entrance.seek(0);
    const start = counter.getBoundingClientRect().top;
    entrance.seek(entrance.duration());
    const end = counter.getBoundingClientRect().top;
    return { start, end, viewport: window.innerHeight };
  });
  expect(positions.start).toBeGreaterThan(positions.viewport);
  expect(positions.end).toBeLessThan(positions.viewport);
  expect(positions.start).toBeGreaterThan(positions.end);
});

test("preloader entrance starts on the frame after its instance is created", async ({ page }) => {
  await page.addInitScript(() => {
    window.__preloaderEntranceFrames = [];
    const sample = () => {
      const instance = document.querySelector("[data-preloader-init]")?._preloaderInstance;
      if (instance) window.__preloaderEntranceFrames.push({ entrance: Boolean(instance.entrance) });
      if (document.documentElement.classList.contains("is-preloading")) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.goto("/?preloader=1");
  await page.waitForFunction(() => window.__preloaderEntranceFrames.some(({ entrance }) => entrance));
  const frames = await page.evaluate(() => window.__preloaderEntranceFrames);
  expect(frames[0]).toEqual({ entrance: false });
  expect(frames.some(({ entrance }) => entrance)).toBe(true);
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
  test(`FLIP lands year copies on targets at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
      window.__preloaderYearRatios = null;
      window.__preloaderYearScaleYs = null;
      window.addEventListener("preloader:exit", (event) => {
        window.__preloaderYearRatios = ["2025", "2026"].map((year) => {
          const copy = document.querySelector(`[data-preloader-year="${year}"] svg`).getBoundingClientRect();
          const target = document.querySelector(`[data-preloader-target="${year}"] svg`).getBoundingClientRect();
          return copy.width / target.width;
        });
        window.__preloaderYearScaleYs = ["2025", "2026"].map((year) => {
          const transform = getComputedStyle(document.querySelector(`[data-preloader-year="${year}"]`)).transform;
          if (transform === "none") return 1;
          const values = transform.startsWith("matrix3d(")
            ? transform.slice(9, -1).split(",").map(Number)
            : transform.slice(7, -1).split(",").map(Number);
          return transform.startsWith("matrix3d(")
            ? Math.hypot(values[1], values[5])
            : Math.hypot(values[1], values[3]);
        });
        event.detail.timeline.pause();
        window.__preloaderTimeline = event.detail.timeline;
        window.__preloaderYearTransforms = ["2025", "2026"].map((year) =>
          getComputedStyle(document.querySelector(`[data-preloader-year="${year}"]`)).transform);
      });
    });
    await page.goto("/?preloader=1");
    await page.waitForFunction(() => Boolean(window.__preloaderTimeline));
    const result = await page.evaluate(() => {
      window.__preloaderTimeline.seek(1);
      return ["2025", "2026"].map((year) => {
        const element = document.querySelector(`[data-preloader-year="${year}"]`);
        const copy = element.querySelector("svg").getBoundingClientRect();
        const target = document.querySelector(`[data-preloader-target="${year}"] svg`).getBoundingClientRect();
        return {
          difference: Math.max(Math.abs(copy.left - target.left), Math.abs(copy.top - target.top), Math.abs(copy.width - target.width), Math.abs(copy.height - target.height)),
          corner: element.dataset.preloaderCorner,
        };
      });
    });
    expect(result[0].corner).toBe("tl");
    expect(result[1].corner).toBe("br");
    result.forEach(({ difference }) => expect(difference).toBeLessThanOrEqual(1));
    const ratios = await page.evaluate(() => window.__preloaderYearRatios);
    ratios.forEach((ratio) => expect(Math.abs(ratio - 1)).toBeLessThanOrEqual(0.005));
    const scaleYs = await page.evaluate(() => window.__preloaderYearScaleYs);
    scaleYs.forEach((scaleY) => expect(Math.abs(scaleY - 1)).toBeLessThanOrEqual(0.005));
    const transforms = await page.evaluate(() => window.__preloaderYearTransforms);
    transforms.forEach((transform) => {
      if (transform === "none") return;
      const translateY = Number.parseFloat(transform.match(/matrix\([^,]+,[^,]+,[^,]+,[^,]+,[^,]+,([^\)]+)\)/)?.[1] ?? "NaN");
      expect(Math.abs(translateY)).toBeLessThanOrEqual(0.5);
    });
  });
}

test("re-applies year widths after a viewport resize during the count", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?preloader=1");
  await page.waitForTimeout(300);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => ["2025", "2026"].map((year) => {
    const copy = document.querySelector(`[data-preloader-year="${year}"] svg`).getBoundingClientRect();
    const target = document.querySelector(`[data-preloader-target="${year}"] svg`).getBoundingClientRect();
    return copy.width / target.width;
  }))).toEqual([1, 1]);
});

test("completes with final visibility and dispatches its event", async ({ page }) => {
  await page.goto("/?preloader=1");
  const event = page.evaluate(() => new Promise((resolve) => window.addEventListener("preloader:complete", resolve, { once: true })));
  await event;
  await expect(page.locator("[data-preloader-init]")).toHaveCSS("display", "none");
  await expect(page.locator("[data-preloader-target]").first()).toHaveCSS("opacity", "1");
  await expect(page.locator("[data-preloader-reveal]").first()).toHaveCSS("opacity", "1");
  await expect(page.locator("[data-preloader-media]").first()).toHaveCSS("opacity", "1");
  await expect(page.locator("[data-preloader-year]").first()).toHaveCSS("visibility", "hidden");
  await expect(page.locator("[data-preloader-shape]")).toHaveCSS("opacity", "0");
});

test("no gate class is a complete no-op", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(() => ({
    instance: document.querySelector("[data-preloader-init]")._preloaderInstance ?? null,
    classPresent: document.documentElement.classList.contains("is-preloading"),
  }));
  expect(result).toEqual({ instance: null, classPresent: false });
});

test("reduced motion resolves without a timeline", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?preloader=1");
  await expect(page.locator("[data-preloader-init]")).toHaveCSS("display", "none");
  await expect.poll(() => page.locator("[data-preloader-init]").evaluate((node) => Boolean(node._preloaderInstance?.timeline))).toBe(false);
});
