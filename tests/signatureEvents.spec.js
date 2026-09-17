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

test("reveals cards individually on the small breakpoint", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 844 });
  await page.reload();
  await page.waitForLoadState("networkidle");

  const cards = page.locator(`${band} .sig-events_card`);
  await expect.poll(() => cards.evaluateAll((elements) =>
    elements.map((card) => card.closest("[data-sig-events]")._signatureEvents.cards
      .find((entry) => entry.card === card).played))).toEqual([false, false, false]);

  for (let index = 0; index < await cards.count(); index += 1) {
    await cards.nth(index).scrollIntoViewIfNeeded();
    await expect.poll(() => cards.nth(index).evaluate((card) =>
      card.closest("[data-sig-events]")._signatureEvents.cards
        .find((entry) => entry.card === card).played)).toBe(true);
    for (let prior = 0; prior < index; prior += 1) {
      expect(await cards.nth(prior).evaluate((card) =>
        card.closest("[data-sig-events]")._signatureEvents.cards
          .find((entry) => entry.card === card).played)).toBe(true);
    }
  }
});
