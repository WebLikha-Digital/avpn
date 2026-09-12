import { test, expect } from "@playwright/test";

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
      // A wrap is exactly +10 cells minus the forward travel of the same frame
      // (at most 2 cells during the 0.35s roll); a genuine backward roll would
      // produce a smaller increase.
      expect(delta).toBeGreaterThan(8 * result.cellPx);
      expect(delta).toBeLessThanOrEqual(10 * result.cellPx + 1);
    });
  }
});

test("years step at counter thresholds and stay on their edges", async ({ page }) => {
  await page.goto("/?preloader=1");
  const samples = await page.evaluate(async () => {
    const container = document.querySelector("[data-preloader-init]");
    const values = [];
    while (document.documentElement.classList.contains("is-preloading")) {
      values.push({
        value: container._preloaderInstance.counterValue,
        left: document.querySelector('[data-preloader-year="2025"]').dataset.preloaderSlot,
        right: document.querySelector('[data-preloader-year="2026"]').dataset.preloaderSlot,
      });
      await new Promise(requestAnimationFrame);
    }
    return values;
  });
  samples.forEach(({ value, left, right }) => {
    if (value < 70) expect(left).toBe("bottom");
    else if (value < 85) expect(left).toBe("middle");
    else expect(left).toBe("top");
    if (value < 70) expect(right).toBe("top");
    else if (value < 85) expect(right).toBe("middle");
    else expect(right).toBe("bottom");
  });
});

test("shape cycles through circle and leaf states, then stops at exit", async ({ page }) => {
  await page.goto("/?preloader=1");
  const result = await page.evaluate(async () => {
    const container = document.querySelector("[data-preloader-init]");
    const shape = document.querySelector("[data-preloader-shape]");
    await new Promise((resolve) => {
      const waitForEntrance = () => {
        if (container._preloaderInstance?.shapeCycle && !container._preloaderInstance.entrance.isActive()) resolve();
        else requestAnimationFrame(waitForEntrance);
      };
      waitForEntrance();
    });
    const cycle = container._preloaderInstance.shapeCycle;
    cycle.pause();
    cycle.seek(0.8);
    const circle = ["borderTopLeftRadius", "borderTopRightRadius", "borderBottomRightRadius", "borderBottomLeftRadius"]
      .map((corner) => getComputedStyle(shape)[corner]);
    cycle.seek(2);
    const leaf = ["borderTopLeftRadius", "borderTopRightRadius", "borderBottomRightRadius", "borderBottomLeftRadius"]
      .map((corner) => getComputedStyle(shape)[corner]);
    const exit = new Promise((resolve) => {
      window.addEventListener("preloader:exit", () => resolve({ active: cycle.isActive() }), { once: true });
    });
    return { circle, leaf, exit: await exit };
  });
  const circleValues = result.circle.map((value) => Number.parseFloat(value));
  expect(circleValues.every((value) => value > 0 && value === circleValues[0])).toBe(true);
  const leafValues = result.leaf.map((value) => Number.parseFloat(value));
  expect(leafValues[0]).toBe(leafValues[2]);
  expect(leafValues[1]).toBe(0);
  expect(result.exit.active).toBe(false);
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

for (const viewport of [{ width: 1440, height: 900 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
  test(`FLIP lands year copies on targets at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
      window.addEventListener("preloader:exit", (event) => {
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
        const copy = element.getBoundingClientRect();
        const target = document.querySelector(`[data-preloader-target="${year}"]`).getBoundingClientRect();
        return {
          difference: Math.max(Math.abs(copy.left - target.left), Math.abs(copy.top - target.top), Math.abs(copy.width - target.width), Math.abs(copy.height - target.height)),
          slot: element.dataset.preloaderSlot,
        };
      });
    });
    expect(result[0].slot).toBe("top");
    expect(result[1].slot).toBe("bottom");
    result.forEach(({ difference }) => expect(difference).toBeLessThanOrEqual(1));
    const transforms = await page.evaluate(() => window.__preloaderYearTransforms);
    transforms.forEach((transform) => {
      if (transform === "none") return;
      const translateY = Number.parseFloat(transform.match(/matrix\([^,]+,[^,]+,[^,]+,[^,]+,[^,]+,([^\)]+)\)/)?.[1] ?? "NaN");
      expect(Math.abs(translateY)).toBeLessThanOrEqual(0.5);
    });
  });
}

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
