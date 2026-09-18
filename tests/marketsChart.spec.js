import { test, expect } from "@playwright/test";

const section = ".section_markets[data-markets-init]";
const viewport = `${section} [data-markets-viewport]`;
const bars = `${section} [data-markets-bar]`;
const linePath = `${section} [data-markets-line-path]`;

function clipTopOf(element) {
  const match = element.style.clipPath.match(/inset\(\s*([\d.]+)%/i);
  return match ? Number.parseFloat(match[1]) : 0;
}

async function settle(page) {
  await page.waitForTimeout(400);
}

async function geometry(page) {
  return page.locator(section).evaluate((root) => {
    const scroller = root.querySelector("[data-markets-viewport]");
    const track = root.querySelector("[data-hscroll-track]");
    const barLefts = [...root.querySelectorAll("[data-markets-bar]")].map((bar) =>
      bar.getBoundingClientRect().left - track.getBoundingClientRect().left,
    );
    return {
      top: root.getBoundingClientRect().top + window.scrollY,
      viewportWidth: scroller.clientWidth,
      barLefts,
      // First bar fully off screen at band start, so its whole scrub range is reachable.
      scrubIndex: barLefts.findIndex((left) => left > scroller.clientWidth),
    };
  });
}

async function lineState(page) {
  return page.locator(linePath).evaluate((path) => {
    const total = path.getTotalLength();
    const raw = path.style.strokeDasharray.trim();
    const drawn = !raw || raw === "none" ? total : Number.parseFloat(raw);
    return {
      drawn,
      total,
      tipX: path.getPointAtLength(Math.min(total, Math.max(0, drawn))).x,
    };
  });
}

test("has the twenty authored market bars", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await expect(page.locator(bars)).toHaveCount(20);
  await expect(page.locator(bars).first()).toHaveAttribute("data-markets-value", "49.19");
});

test("reveals entry bars in sequence without scrub triggers", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.locator(`${section}[data-hscroll-active]`)).toHaveCount(1);

  const state = await page.locator(section).evaluate(async (root) => {
    const { ScrollTrigger } = await import("/src/lib/gsap.js");
    const viewport = root.querySelector("[data-markets-viewport]");
    const track = root.querySelector("[data-hscroll-track]");
    const allBars = [...root.querySelectorAll("[data-markets-bar]")];
    const trackLeft = track.getBoundingClientRect().left;
    const entryIndices = allBars.flatMap((bar, index) => (
      bar.getBoundingClientRect().left - trackLeft + viewport.scrollLeft
        < viewport.clientWidth ? [index] : []
    ));
    return {
      entryIndices,
      clips: entryIndices.map((index) => allBars[index].style.clipPath),
      hasScrub: entryIndices.map((index) => ScrollTrigger.getAll()
        .some((trigger) => trigger.vars.trigger === allBars[index])),
    };
  });
  expect(state.entryIndices.length).toBeGreaterThanOrEqual(2);
  expect(state.clips.every((clip) => clip.startsWith("inset(100%"))).toBe(true);
  expect(state.hasScrub.every((hasScrub) => !hasScrub)).toBe(true);

  const top = await page.locator(section).evaluate((root) =>
    root.getBoundingClientRect().top + window.scrollY,
  );
  // Scroll and sample in one evaluate: the stagger is 80ms, so a round trip
  // between the scroll and the first sample would miss the sequence.
  const samples = await page.locator(section).evaluate(async (root, target) => {
    const entry = root._marketsChart.entryBars.slice(0, 2);
    const values = [];
    const read = () => entry.map((bar) => Number.parseFloat(
      bar.style.clipPath.match(/inset\(\s*([\d.]+)%/i)?.[1] ?? 0,
    ));
    window.scrollTo({ top: target + 2, behavior: "instant" });
    let frame = 0;
    return new Promise((resolve) => {
      const sample = () => {
        values.push(read());
        frame += 1;
        if (frame < 70) requestAnimationFrame(sample);
        else resolve(values);
      };
      sample();
    });
  }, top);
  // Left bar leads the right one by the 80ms stagger; a long frame under load
  // can skip the window where the second bar is still fully clipped, so the
  // assertion is on the lead itself, not on catching that exact frame.
  expect(samples.some(([first, second]) => first < second - 5)).toBe(true);
  expect(samples.some(([first, second]) => first < 95 && second < 95)).toBe(true);
  await page.waitForTimeout(250);
  await expect.poll(() => page.locator(section).evaluate((root) =>
    root._marketsChart.entryBars.every((bar) => bar.style.clipPath.startsWith("inset(0%")),
  )).toBe(true);
});

test("grows a desktop bar continuously and reverses on scroll back", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.locator(`${section}[data-hscroll-active]`)).toHaveCount(1);

  const chart = await geometry(page);
  const scrubIndex = chart.scrubIndex;
  const barLeft = chart.barLefts[scrubIndex];
  const start = barLeft - chart.viewportWidth;
  const end = barLeft - chart.viewportWidth * 0.55;

  await page.evaluate((target) => window.scrollTo({ top: target, behavior: "instant" }), chart.top + start - 2);
  await settle(page);
  const before = await page.locator(bars).nth(scrubIndex).evaluate(clipTopOf);

  const samples = await page.locator(section).evaluate(async (root) => {
    const values = [];
    const top = root.getBoundingClientRect().top + window.scrollY;
    const allBars = [...root.querySelectorAll("[data-markets-bar]")];
    const track = root.querySelector("[data-hscroll-track]");
    const scroller = root.querySelector("[data-markets-viewport]");
    const bar = allBars.find((candidate) =>
      candidate.getBoundingClientRect().left - track.getBoundingClientRect().left
        > scroller.clientWidth,
    );
    const start = bar.getBoundingClientRect().left - track.getBoundingClientRect().left - scroller.clientWidth;
    const end = bar.getBoundingClientRect().left - track.getBoundingClientRect().left - scroller.clientWidth * 0.55;
    let frame = 0;
    return new Promise((resolve) => {
      const sample = () => {
        window.scrollTo({ top: top + start + (end - start) * frame / 30, behavior: "instant" });
        values.push({ left: scroller.scrollLeft, clipTop: Number.parseFloat(bar.style.clipPath.match(/inset\(\s*([\d.]+)%/i)?.[1] ?? 0) });
        frame += 1;
        if (frame <= 30) requestAnimationFrame(sample);
        // The band writes scrollLeft on the ticker, so the final read trails
        // the final scroll by a frame.
        else requestAnimationFrame(() => requestAnimationFrame(() => {
          values.push({ left: scroller.scrollLeft, clipTop: Number.parseFloat(bar.style.clipPath.match(/inset\(\s*([\d.]+)%/i)?.[1] ?? 0) });
          resolve(values);
        }));
      };
      sample();
    });
  });

  const clipTops = samples.map(({ clipTop }) => clipTop);
  expect(clipTops.some((value) => value > 5 && value < 95)).toBe(true);
  expect(clipTops.at(-1)).toBeLessThan(5);
  expect(before).toBeGreaterThan(95);

  await page.evaluate((target) => window.scrollTo({ top: target, behavior: "instant" }), chart.top + start - 2);
  await settle(page);
  expect(await page.locator(bars).nth(scrubIndex).evaluate(clipTopOf)).toBeGreaterThan(95);
});

test("grows from native mobile viewport scrollLeft", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 844 });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.locator(`${section}[data-hscroll-active]`)).toHaveCount(0);

  const positions = await page.locator(section).evaluate((root) => {
    const scroller = root.querySelector("[data-markets-viewport]");
    const allBars = [...root.querySelectorAll("[data-markets-bar]")];
    const track = root.querySelector("[data-hscroll-track]");
    // First bar fully off screen at scrollLeft 0, so its whole scrub range is reachable.
    const index = allBars.findIndex((candidate) =>
      candidate.getBoundingClientRect().left - track.getBoundingClientRect().left
        > scroller.clientWidth,
    );
    const bar = allBars[index];
    const left = bar.getBoundingClientRect().left - scroller.getBoundingClientRect().left + scroller.scrollLeft;
    return { index, start: left - scroller.clientWidth, end: left - scroller.clientWidth * 0.55 };
  });
  const bar = page.locator(bars).nth(positions.index);

  await page.locator(viewport).evaluate((element, left) => {
    element.scrollLeft = left;
  }, positions.start - 2);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  expect(await bar.evaluate(clipTopOf)).toBeGreaterThan(95);

  await page.locator(viewport).evaluate((element, left) => {
    element.scrollLeft = left;
    element.dispatchEvent(new Event("scroll"));
  }, (positions.start + positions.end) / 2);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  expect(await bar.evaluate(clipTopOf)).toBeGreaterThan(5);
  expect(await bar.evaluate(clipTopOf)).toBeLessThan(95);

  await page.locator(viewport).evaluate((element, left) => {
    element.scrollLeft = left;
    element.dispatchEvent(new Event("scroll"));
  }, positions.end + 2);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  expect(await bar.evaluate(clipTopOf)).toBeLessThan(5);

  await page.locator(viewport).evaluate((element, left) => {
    element.scrollLeft = left;
    element.dispatchEvent(new Event("scroll"));
  }, positions.start - 2);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  expect(await bar.evaluate(clipTopOf)).toBeGreaterThan(95);
});

test("reveals mobile entry bars from the window trigger", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 844 });
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const entryCount = await page.locator(section).evaluate((root) =>
    root._marketsChart.entryBars.length,
  );
  expect(entryCount).toBeGreaterThanOrEqual(1);
  expect(await page.locator(section).evaluate((root) =>
    root._marketsChart.entryBars.every((bar) => bar.style.clipPath.startsWith("inset(100%")),
  )).toBe(true);

  await page.locator(section).scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);
  expect(await page.locator(section).evaluate((root) =>
    root._marketsChart.entryBars.every((bar) => bar.style.clipPath.startsWith("inset(0%")),
  )).toBe(true);
});

test("reveals the decor line lead on desktop section entry", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.locator(`${section}[data-hscroll-active]`)).toHaveCount(1);

  const top = await page.locator(section).evaluate((root) =>
    root.getBoundingClientRect().top + window.scrollY,
  );
  // Land just inside the band: the once-trigger starts at "top top" and a
  // scroll parked exactly on it has not crossed it.
  await page.evaluate((target) => window.scrollTo({ top: target, behavior: "instant" }), top + 2);
  await expect.poll(() => lineState(page).then(({ tipX }) => tipX), { timeout: 2000 })
    .toBeGreaterThan(880);
  await expect.poll(() => lineState(page).then(({ tipX }) => tipX), { timeout: 2000 })
    .toBeLessThan(920);
});

test("advances the decor line per frame and reaches its end", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.locator(`${section}[data-hscroll-active]`)).toHaveCount(1);

  const chart = await page.locator(section).evaluate((root) => {
    const viewport = root.querySelector("[data-markets-viewport]");
    return {
      top: root.getBoundingClientRect().top + window.scrollY,
      overflow: viewport.scrollWidth - viewport.clientWidth,
    };
  });
  await page.evaluate((target) => window.scrollTo({ top: target, behavior: "instant" }), chart.top);
  await page.waitForTimeout(1000);

  const samples = await page.locator(section).evaluate(async (root) => {
    const values = [];
    const top = root.getBoundingClientRect().top + window.scrollY;
    const viewport = root.querySelector("[data-markets-viewport]");
    const path = root.querySelector("[data-markets-line-path]");
    const read = () => {
      const raw = path.style.strokeDasharray.trim();
      return {
        left: viewport.scrollLeft,
        drawn: raw ? Number.parseFloat(raw) : 0,
      };
    };
    let frame = 0;
    return new Promise((resolve) => {
      const sample = () => {
        window.scrollTo({ top: top + 300 + 1500 * frame / 30, behavior: "instant" });
        requestAnimationFrame(() => {
          values.push(read());
          frame += 1;
          if (frame <= 30) requestAnimationFrame(sample);
          else requestAnimationFrame(() => requestAnimationFrame(() => resolve(values)));
        });
      };
      sample();
    });
  });

  const drawn = samples.map(({ drawn: length }) => length);
  expect(drawn.some((length, index) => index > 0 && length > drawn[index - 1])).toBe(true);
  expect(drawn.at(-1)).toBeGreaterThan(drawn[0]);

  await page.evaluate((target) => window.scrollTo({ top: target, behavior: "instant" }), chart.top + chart.overflow);
  await page.waitForTimeout(600);
  await expect.poll(() => lineState(page).then(({ drawn, total }) => drawn / total))
    .toBeGreaterThan(0.99);
  await expect.poll(() => lineState(page).then(({ tipX }) => tipX)).toBeGreaterThan(4130);
});

test("leaves bars unrevealed when reduced motion is requested", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const state = await page.locator(section).evaluate((root) => ({
    clipPaths: [...root.querySelectorAll("[data-markets-bar]")].map((bar) => bar.style.clipPath),
    tweens: root._marketsChart?.tweens.length ?? 0,
  }));
  expect(state.clipPaths.every((value) => value === "")).toBe(true);
  expect(state.tweens).toBe(0);
});

test("draws the line fully without a trigger in reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const state = await page.locator(section).evaluate((root) => {
    const path = root.querySelector("[data-markets-line-path]");
    return {
      dash: path.style.strokeDasharray,
      trigger: Boolean(root._marketsChart?.lineTrigger),
      render: Boolean(root._marketsChart?.lineRender),
    };
  });
  expect(state.dash).not.toMatch(/^0/);
  expect(state.trigger).toBe(false);
  expect(state.render).toBe(false);
});
