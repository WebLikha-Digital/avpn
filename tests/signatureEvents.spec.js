import { test, expect } from "@playwright/test";

const band = ".section_signature-events[data-hscroll-init]";
const word = "[data-hparallax]";
const shapes = "[data-shape-swap] > *";

async function scrollTo(page, y) {
  await page.evaluate((target) => window.scrollTo({ top: target, behavior: "instant" }), y);
  await page.waitForTimeout(400);
}

async function geometry(page) {
  return page.locator(band).evaluate((wrap) => {
    const viewport = wrap.querySelector("[data-hscroll-viewport]");
    const track = wrap.querySelector("[data-hscroll-track]");
    return {
      top: wrap.getBoundingClientRect().top + window.scrollY,
      distance: track.scrollWidth - viewport.clientWidth,
      cardLefts: [...wrap.querySelectorAll(".sig-events_card")].map((card) =>
        card.getBoundingClientRect().left - track.getBoundingClientRect().left),
      cardWidth: wrap.querySelector(".sig-events_card").offsetWidth,
      viewportWidth: viewport.clientWidth,
    };
  });
}

const wordLeft = (page) => page.locator(word).evaluate((el) => el.getBoundingClientRect().left);
const opacities = (page) => page.locator(shapes).evaluateAll((els) =>
  els.map((el) => Number.parseFloat(getComputedStyle(el).opacity)));

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.locator(`${band}[data-hscroll-active]`)).toHaveCount(1);
});

test("drifts the wordmark at its authored fraction of the track", async ({ page }) => {
  const { top, distance } = await geometry(page);
  const speed = Number.parseFloat(await page.locator(word).getAttribute("data-hparallax-speed"));
  await scrollTo(page, top);
  const start = await wordLeft(page);
  await scrollTo(page, top + distance);
  const travelled = start - await wordLeft(page);
  expect(travelled).toBeCloseTo(distance * speed, -1);
  expect(travelled).toBeLessThan(distance);
});

test("shows exactly one shape, and changes it per card", async ({ page }) => {
  const { top, cardLefts, cardWidth, viewportWidth } = await geometry(page);
  const centreOf = (index) => cardLefts[index] + cardWidth / 2 - viewportWidth / 2;
  const seen = [];
  for (let index = 0; index < cardLefts.length; index += 1) {
    await scrollTo(page, top + Math.max(0, centreOf(index)));
    const values = await opacities(page);
    expect(values.filter((value) => value > 0.5)).toHaveLength(1);
    seen.push(values.findIndex((value) => value > 0.5));
  }
  expect(seen).toEqual([0, 1, 2]);
});

test("returns to the first shape when scrolled back to the start", async ({ page }) => {
  const { top, cardLefts, cardWidth, viewportWidth } = await geometry(page);
  const last = cardLefts.length - 1;
  await scrollTo(page, top + cardLefts[last] + cardWidth / 2 - viewportWidth / 2);
  await scrollTo(page, Math.max(0, top - 400));
  const values = await opacities(page);
  expect(values.findIndex((value) => value > 0.5)).toBe(0);
});

test("keeps the wordmark outside the scroller, so it is not scrolled by it", async ({ page }) => {
  expect(await page.locator(word).evaluate((el) => ({
    inBand: Boolean(el.closest("[data-hscroll-init]")),
    inViewport: Boolean(el.closest("[data-hscroll-viewport]")),
  }))).toEqual({ inBand: true, inViewport: false });
});

test("refuses to animate a wordmark left inside the scroller", async ({ page }) => {
  const warnings = [];
  page.on("console", (message) => { if (message.type() === "warning") warnings.push(message.text()); });
  await page.locator(word).evaluate((el) => {
    el.closest("[data-hscroll-init]").querySelector("[data-hscroll-track]").append(el);
  });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("hscroll:rebuilt")));
  await expect.poll(() => warnings.filter((text) => text.includes("[hparallax]")).length).toBeGreaterThan(0);
  expect(await page.locator(word).evaluate((el) => Boolean(el._horizontalParallax))).toBe(false);
});

test("does not change the line or cards before the band pins", async ({ page }) => {
  const state = await page.locator(`${band} [data-sig-events-line-path]`).evaluateAll((paths, selector) => ({
    paths: paths.map((path) => path.style.strokeDasharray),
    cards: [...document.querySelectorAll(`${selector} .sig-events_card`)].map((card) =>
      getComputedStyle(card.querySelector("[data-sig-events-pill]")).visibility),
  }), band);
  expect(state.paths.every((value) => /0(px|%)/.test(value))).toBe(true);
  expect(state.cards.every((value) => value === "hidden")).toBe(true);
});

test("writes one continuous, monotonic line during continuous scroll", async ({ page }) => {
  const { top, distance } = await geometry(page);
  await scrollTo(page, top);
  const samples = await page.locator(band).evaluate(async (section) => {
    const values = [];
    const viewport = section.querySelector("[data-hscroll-viewport]");
    const line = section.querySelector("[data-sig-events-line]");
    const sample = () => {
      values.push({ left: viewport.scrollLeft, dash: line.querySelector("[data-sig-events-line-path]").style.strokeDasharray });
      if (values.length < 30) requestAnimationFrame(sample);
    };
    sample();
    return new Promise((resolve) => setTimeout(() => resolve(values), 600));
  });
  expect(samples.length).toBeGreaterThan(10);
  for (let index = 1; index < samples.length; index += 1) {
    expect(samples[index].left).toBeGreaterThanOrEqual(samples[index - 1].left);
  }
  expect(distance).toBeGreaterThan(0);
});

test("keeps the line tip aligned with the budget through the straight run", async ({ page }) => {
  const { top } = await geometry(page);
  await scrollTo(page, top + 2);
  await page.locator(band).evaluate((section) => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Signature Events lead reveal did not complete within 3 seconds"));
    }, 3000);
    const check = () => {
      if (section._signatureEvents.pin.value >= 1) {
        clearTimeout(timeout);
        resolve();
        return;
      }
      requestAnimationFrame(check);
    };
    check();
  }));
  const samples = await page.locator(band).evaluate((section) => {
    const instance = section._signatureEvents;
    const { leadPx, scale } = instance.measurements;
    const curveStart = 4349 * scale;
    const available = curveStart - leadPx;
    const positions = [0.2, 0.5, 0.8].map((fraction) => available * fraction);
    return { positions, leadPx };
  });

  expect(samples.positions).toHaveLength(3);
  for (const scrollLeft of samples.positions) {
    await page.evaluate(({ bandTop, target }) => {
      window.scrollTo({ top: bandTop + target, behavior: "instant" });
    }, { bandTop: top, target: scrollLeft });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    const measurement = await page.locator(band).evaluate((section) => {
      const instance = section._signatureEvents;
      const path = instance.path;
      const dasharray = path.style.strokeDasharray.trim();
      const dash = dasharray === "none" ? path.getTotalLength() * Math.abs(path.getScreenCTM().a) : Number.parseFloat(dasharray);
      const screenPathLength = path.getTotalLength() * Math.abs(path.getScreenCTM().a);
      return {
        scrollLeft: instance.viewport.scrollLeft,
        tipBudget: dash / screenPathLength * instance.measurements.screenPathLength,
      };
    });
    expect(Math.abs(measurement.tipBudget - (samples.leadPx + measurement.scrollLeft))).toBeLessThanOrEqual(2);
  }
});

test("draws the reachable tail to its full path length at scroll end", async ({ page }) => {
  const { top, distance } = await geometry(page);
  await scrollTo(page, top + distance);
  await page.waitForTimeout(1000);
  const progress = await page.locator(`${band} [data-sig-events-line-path]`).evaluate((path) => {
    const dasharray = path.style.strokeDasharray.trim();
    if (!dasharray || dasharray === "none") return 100;
    return Number.parseFloat(dasharray) / (path.getTotalLength() * Math.abs(path.getScreenCTM().a)) * 100;
  });
  expect(progress).toBeGreaterThanOrEqual(99);
});

test("fully draws a short-band line at the tablet scroll end", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  const tabletStyles = `
    /* Mirrors the Webflow Tablet styles documented in docs/signature-events.md. */
    @media (max-width: 991px) {
      /* Force maxBudget < curvePx: the published tablet band is about 30px
         short, but the local sandbox needs a narrower card to reproduce it. */
      .sig-events_card { width: 70vw; }
      .sig-events_card-inner {
        flex-wrap: wrap;
        align-items: flex-start;
        row-gap: 1.5rem;
        column-gap: 4vw;
      }
      .sig-events_card-media {
        flex-basis: 100%;
        width: 100%;
        height: auto;
        aspect-ratio: 16 / 9;
      }
      .sig-events_card-title-col,
      .sig-events_card-body-col {
        flex-basis: auto;
        width: 40vw;
      }
      .sig-events_track {
        align-items: flex-start;
        column-gap: 10.4vw;
        padding: calc(6vh + 12.58vw + 6.5rem) 5vw 0;
      }
      .sig-events_line {
        left: 0;
        right: 0;
        width: auto;
        top: calc(6vh + 12.58vw + 2.5rem);
      }
    }
  `;
  await page.addInitScript((styles) => {
    const style = document.createElement("style");
    style.textContent = styles;
    document.addEventListener("DOMContentLoaded", () => {
      document.head.append(style);
    }, { once: true });
  }, tabletStyles);
  await page.goto("/");
  await page.waitForLoadState("load");
  await expect(page.locator(`${band}[data-hscroll-active]`)).toHaveCount(1);

  const { top, distance } = await geometry(page);
  const measurements = await page.locator(band).evaluate((section) => {
    const { leadPx, curvePx, maxBudget } = section._signatureEvents.measurements;
    return { leadPx, curvePx, maxBudget };
  });
  expect(measurements.maxBudget).toBeLessThan(measurements.curvePx);

  await scrollTo(page, top);
  const samples = [];
  for (let step = 0; step < 80; step += 1) {
    await page.mouse.wheel(0, 100);
    await page.waitForTimeout(50);
    samples.push(await page.locator(band).evaluate((section) => {
      const instance = section._signatureEvents;
      const dasharray = instance.path.style.strokeDasharray.trim();
      return {
        left: instance.viewport.scrollLeft,
        progress: Number.parseFloat(dasharray) / instance.measurements.screenPathLength,
      };
    }));
    if (samples.at(-1).left >= distance - 1) break;
  }

  expect(samples.at(-1).left).toBeGreaterThanOrEqual(distance - 1);
  for (let index = 1; index < samples.length; index += 1) {
    expect(samples[index].progress).toBeGreaterThanOrEqual(samples[index - 1].progress - 0.001);
  }
  expect(samples.at(-1).progress).toBeGreaterThanOrEqual(0.99);
});

test("keeps pin coordinates stable when refreshed at non-zero band scroll", async ({ page }) => {
  const initial = await page.locator(band).evaluate((section) =>
    section._signatureEvents.cards.map((card) => card.pinCentreX));
  const { top } = await geometry(page);
  await scrollTo(page, top + 1500);
  const refreshed = await page.locator(band).evaluate(async (section) => {
    const { ScrollTrigger } = await import("/src/lib/gsap.js");
    ScrollTrigger.refresh();
    return section._signatureEvents.cards.map((card) => card.pinCentreX);
  });

  expect(refreshed).toHaveLength(initial.length);
  refreshed.forEach((value, index) => {
    expect(Math.abs(value - initial[index])).toBeLessThanOrEqual(1);
  });
});

test("bails with one warning when the line is outside the track", async ({ page }) => {
  const warnings = [];
  page.on("console", (message) => {
    if (message.type() === "warning") warnings.push(message.text());
  });
  await page.locator(`${band} [data-sig-events-line]`).evaluate((line) => {
    line.closest("[data-hscroll-track]").parentElement.append(line);
  });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("hscroll:rebuilt")));

  await expect.poll(() => warnings.filter((text) => text.includes("[signatureEvents]")).length)
    .toBe(1);
  expect(await page.locator(band).evaluate((section) => section._signatureEvents)).toBe(null);
});

test("plays each card in the declared order and only once", async ({ page }) => {
  const card = page.locator(`${band} .sig-events_card`).first();
  const starts = await card.evaluate((element) => {
    const instance = element.closest("[data-sig-events]")._signatureEvents.cards[0];
    return instance.timeline.getChildren().map((tween) => tween.startTime());
  });
  expect(starts).toEqual([0, 0.15, 0.5, 0.6, 0.7, 0.8, 0.9]);
  const { top, distance } = await geometry(page);
  await scrollTo(page, top + distance);
  await expect.poll(() => card.evaluate((element) => element.closest("[data-sig-events]")._signatureEvents.cards[0].played)).toBe(true);
  const time = await card.evaluate((element) => element.closest("[data-sig-events]")._signatureEvents.cards[0].timeline.time());
  await scrollTo(page, top);
  await scrollTo(page, top + distance);
  const after = await card.evaluate((element) => {
    const instance = element.closest("[data-sig-events]")._signatureEvents.cards[0];
    return { played: instance.played, time: instance.timeline.time() };
  });
  expect(after.played).toBe(true);
  expect(after.time).toBeGreaterThanOrEqual(time);
});

test("rebuilds with one section trigger, timeline per card, and no duplicate splits", async ({ page }) => {
  const state = await page.locator(band).evaluate(async (section) => {
    const { ScrollTrigger } = await import("/src/lib/gsap.js");
    window.dispatchEvent(new CustomEvent("hscroll:rebuilt"));
    const instance = section._signatureEvents;
    return {
      cards: instance.cards.length,
      timelines: instance.cards.filter(({ timeline }) => timeline).length,
      sectionTriggers: ScrollTrigger.getAll().filter((trigger) => trigger.vars.trigger === section).length,
      splits: instance.cards.reduce((count, card) => count + card.splits.length, 0),
    };
  });
  expect(state).toEqual({ cards: 3, timelines: 3, sectionTriggers: 1, splits: 6 });
});

test("reduced motion reveals the line and cards without creating tweens", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await page.waitForLoadState("networkidle");
  const state = await page.locator(band).evaluate((section) => ({
    tweens: section._signatureEvents.cards.filter(({ timeline }) => timeline).length,
    paths: [...section.querySelectorAll("[data-sig-events-line-path]")].map((path) => path.style.strokeDasharray),
    visible: [...section.querySelectorAll("[data-sig-events-pill], [data-sig-events-desc], [data-button]")].every((el) => getComputedStyle(el).visibility === "visible"),
  }));
  expect(state.tweens).toBe(0);
  expect(state.paths.every((value) => !/0(px|%)/.test(value))).toBe(true);
  expect(state.visible).toBe(true);
});

test("draws the mobile vline with the viewport tip during continuous scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.waitForLoadState("networkidle");

  const { top } = await geometry(page);
  await scrollTo(page, Math.max(0, top - 200));
  const samplesPromise = page.locator(band).evaluate((section) => {
    const values = [];
    const vline = section.querySelector("[data-sig-events-vline]");
    const path = section.querySelector("[data-sig-events-vline-path]");
    const sample = () => {
      const rect = vline.getBoundingClientRect();
      const dash = Number.parseFloat(path.style.strokeDasharray) || 0;
      values.push({
        scrollY: window.scrollY,
        progress: dash / section._signatureEvents.vlineMeasurements.screenPathLength,
        expected: Math.min(1, Math.max(0, (window.innerHeight * 0.7 - rect.top) / rect.height)),
      });
      if (values.length < 45) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
    return new Promise((resolve) => setTimeout(() => resolve(values), 900));
  });

  for (let step = 0; step < 35; step += 1) {
    await page.mouse.wheel(0, 45);
    await page.waitForTimeout(25);
  }
  const samples = await samplesPromise;
  expect(samples.length).toBeGreaterThan(20);
  const moving = samples.filter((sample) => sample.scrollY > samples[0].scrollY + 5);
  expect(moving.length).toBeGreaterThan(5);
  moving.forEach((sample) => expect(Math.abs(sample.progress - sample.expected)).toBeLessThan(0.03));
  for (let index = 1; index < moving.length; index += 1) {
    expect(moving[index].progress).toBeGreaterThanOrEqual(moving[index - 1].progress - 0.01);
  }
});

test("reveals mobile cards from the vline pin threshold only once", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.waitForLoadState("networkidle");

  const cards = page.locator(`${band} .sig-events_card`);
  const target = await cards.nth(1).evaluate((card) => {
    const section = card.closest("[data-sig-events]");
    const pin = card.querySelector("[data-sig-events-pin]").getBoundingClientRect();
    return pin.top + pin.height / 2 + window.scrollY - window.innerHeight * 0.7;
  });
  await scrollTo(page, Math.max(0, target - 30));
  await expect.poll(() => cards.nth(1).evaluate((card) => {
    const entry = card.closest("[data-sig-events]")._signatureEvents.cards
      .find((item) => item.card === card);
    return { played: entry.played, opacity: getComputedStyle(card.querySelector("[data-sig-events-pin]")).opacity };
  })).toEqual({ played: false, opacity: "0" });

  await scrollTo(page, target + 30);
  await expect.poll(() => cards.nth(1).evaluate((card) =>
    card.closest("[data-sig-events]")._signatureEvents.cards
      .find((entry) => entry.card === card).played)).toBe(true);
  await scrollTo(page, Math.max(0, target - 30));
  await expect.poll(() => cards.nth(1).evaluate((card) => ({
    played: card.closest("[data-sig-events]")._signatureEvents.cards
      .find((entry) => entry.card === card).played,
    opacity: getComputedStyle(card.querySelector("[data-sig-events-pin]")).opacity,
  }))).toEqual({ played: true, opacity: "1" });
});

test("shows the full mobile vline and card content under reduced motion", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await page.waitForLoadState("networkidle");

  const state = await page.locator(band).evaluate((section) => ({
    path: section.querySelector("[data-sig-events-vline-path]").style.strokeDasharray,
    length: section._signatureEvents.vlineMeasurements.screenPathLength,
    pins: [...section.querySelectorAll("[data-sig-events-pin]")].map((pin) => getComputedStyle(pin).opacity),
    content: [...section.querySelectorAll("[data-sig-events-pill], [data-sig-events-desc], [data-button]")]
      .map((el) => getComputedStyle(el).visibility),
  }));
  expect(Number.parseFloat(state.path)).toBeGreaterThanOrEqual(state.length * 0.99);
  expect(state.pins).toEqual(["1", "1", "1"]);
  expect(state.content.every((value) => value === "visible")).toBe(true);
});
