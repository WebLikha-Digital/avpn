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
    const bar = root.querySelectorAll("[data-markets-bar]")[6];
    return {
      top: root.getBoundingClientRect().top + window.scrollY,
      barLeft: bar.getBoundingClientRect().left - track.getBoundingClientRect().left,
      viewportWidth: scroller.clientWidth,
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

test("grows a desktop bar continuously and reverses on scroll back", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.locator(`${section}[data-hscroll-active]`)).toHaveCount(1);

  const chart = await geometry(page);
  const start = chart.barLeft - chart.viewportWidth;
  const end = chart.barLeft - chart.viewportWidth * 0.55;

  await page.evaluate((target) => window.scrollTo({ top: target, behavior: "instant" }), chart.top + start - 2);
  await settle(page);
  const before = await page.locator(bars).nth(6).evaluate(clipTopOf);

  const samples = await page.locator(section).evaluate(async (root) => {
    const values = [];
    const top = root.getBoundingClientRect().top + window.scrollY;
    const bar = root.querySelectorAll("[data-markets-bar]")[6];
    const track = root.querySelector("[data-hscroll-track]");
    const scroller = root.querySelector("[data-markets-viewport]");
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
  expect(await page.locator(bars).nth(6).evaluate(clipTopOf)).toBeGreaterThan(95);
});

test("grows from native mobile viewport scrollLeft", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 844 });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.locator(`${section}[data-hscroll-active]`)).toHaveCount(0);

  const positions = await page.locator(section).evaluate((root) => {
    const scroller = root.querySelector("[data-markets-viewport]");
    const bar = root.querySelectorAll("[data-markets-bar]")[6];
    const left = bar.getBoundingClientRect().left - scroller.getBoundingClientRect().left + scroller.scrollLeft;
    return { start: left - scroller.clientWidth, end: left - scroller.clientWidth * 0.55 };
  });
  const bar = page.locator(bars).nth(6);

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
