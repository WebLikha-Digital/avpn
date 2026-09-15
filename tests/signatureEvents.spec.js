import { test, expect } from "@playwright/test";

const band = ".section_signature-events[data-hscroll-init]";
const word = "[data-hparallax]";
const shapes = "[data-shape-swap] > *";
const leadPath = ".sig-events_line-lead [data-draw-scroll-path]";
const signaturePin = ".section_signature-events [data-shape-reveal]";

async function scrollTo(page, y) {
  // Locomotive eases window.scrollY, so drive it the way a user would and let
  // the lerp settle before reading anything back.
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
      cardLefts: [...wrap.querySelectorAll(".sig-events_card")].map(
        (card) => card.getBoundingClientRect().left - track.getBoundingClientRect().left,
      ),
      cardWidth: wrap.querySelector(".sig-events_card").offsetWidth,
      viewportWidth: viewport.clientWidth,
    };
  });
}

// Where the word actually is on screen, not what its transform says. The bug
// this guards against put the element inside the scroll container, where
// scrollLeft moved it as well as the tween — a transform-only check passed
// while the word travelled 1.35x the track.
const wordLeft = (page) =>
  page.locator(word).evaluate((el) => el.getBoundingClientRect().left);

const opacities = (page) =>
  page.locator(shapes).evaluateAll((els) =>
    els.map((el) => Number.parseFloat(getComputedStyle(el).opacity)),
  );

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.locator(`${band}[data-hscroll-active]`)).toHaveCount(1);
});

test("drifts the wordmark at its authored fraction of the track", async ({ page }) => {
  const { top, distance } = await geometry(page);
  const speed = Number.parseFloat(
    await page.locator(word).getAttribute("data-hparallax-speed"),
  );

  await scrollTo(page, top);
  const start = await wordLeft(page);

  await scrollTo(page, top + distance);
  const travelled = start - (await wordLeft(page));

  expect(travelled).toBeCloseTo(distance * speed, -1);
  // The point of the parallax: the word covers less ground than the cards do.
  expect(travelled).toBeLessThan(distance);
});

test("shows exactly one shape, and changes it per card", async ({ page }) => {
  const { top, cardLefts, cardWidth, viewportWidth } = await geometry(page);

  // Half a viewport past a card's leading edge is the point its own trigger
  // takes over, which is what the component keys the swap off.
  const centreOf = (index) => cardLefts[index] + cardWidth / 2 - viewportWidth / 2;

  const seen = [];
  for (let index = 0; index < cardLefts.length; index += 1) {
    await scrollTo(page, top + Math.max(0, centreOf(index)));

    const values = await opacities(page);
    const visible = values.filter((value) => value > 0.5);
    expect(visible, `card ${index} should light exactly one shape`).toHaveLength(1);

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
  const parent = await page.locator(word).evaluate((el) => ({
    inBand: Boolean(el.closest("[data-hscroll-init]")),
    // The whole point: scrollLeft moves every descendant of the scroller,
    // absolutely positioned ones included, so the word has to sit beside it.
    inViewport: Boolean(el.closest("[data-hscroll-viewport]")),
  }));

  expect(parent).toEqual({ inBand: true, inViewport: false });
});

test("refuses to animate a wordmark left inside the scroller", async ({ page }) => {
  const warnings = [];
  page.on("console", (message) => {
    if (message.type() === "warning") warnings.push(message.text());
  });

  await page.locator(word).evaluate((el) => {
    el.closest("[data-hscroll-init]").querySelector("[data-hscroll-track]").append(el);
  });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("hscroll:rebuilt")));

  await expect
    .poll(() => warnings.filter((text) => text.includes("[hparallax]")).length)
    .toBeGreaterThan(0);
  expect(await page.locator(word).evaluate((el) => Boolean(el._horizontalParallax))).toBe(false);
});

test("reveals the lead line from the window while the main line stays scrubbed", async ({ page }) => {
  const state = await page.locator(`${band} .sig-events_line-lead`).evaluate((wrap) => ({
    hasTrigger: Boolean(wrap._drawTl?.scrollTrigger),
    start: wrap._drawTl?.scrollTrigger?.vars.start,
    horizontal: wrap._drawTl?.scrollTrigger?.vars.horizontal === true,
    scrollerIsWindow: wrap._drawTl?.scrollTrigger?.scroller === window,
  }));

  expect(state).toEqual({
    hasTrigger: true,
    start: "top 60%",
    horizontal: false,
    scrollerIsWindow: true,
  });
  expect(await page.locator(`${band} .sig-events_line-main`).evaluate((wrap) => ({
    horizontal: wrap._drawTl.scrollTrigger.vars.horizontal === true,
    scrollerIsBand: wrap._drawTl.scrollTrigger.scroller ===
      wrap.closest("[data-hscroll-init]").querySelector("[data-hscroll-viewport]"),
  }))).toEqual({ horizontal: true, scrollerIsBand: true });

  const triggerY = await page.locator(band).evaluate((section) => {
    const rect = section.getBoundingClientRect();
    return rect.top + window.scrollY - window.innerHeight * 0.6;
  });

  await scrollTo(page, Math.max(0, triggerY - 100));
  const initialDash = await page.locator(leadPath).evaluate((path) => path.style.strokeDasharray);
  expect(initialDash).toMatch(/(^|[, ]+)0(px|%)/);

  const leadWrap = page.locator(`${band} .sig-events_line-lead`);
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), triggerY + 100);
  await expect.poll(() => leadWrap.evaluate((wrap) => wrap._drawTl.progress())).toBeGreaterThan(0);
  const midState = await leadWrap.evaluate((wrap) => ({
    progress: wrap._drawTl.progress(),
    dasharray: wrap.querySelector("[data-draw-scroll-path]").style.strokeDasharray,
  }));
  expect(midState.progress).toBeLessThan(1);
  expect(midState.dasharray).not.toBe(initialDash);

  await expect
    .poll(() => leadWrap.evaluate((wrap) => wrap._drawTl.progress()), { timeout: 2_000 })
    .toBe(1);
  // DrawSVG's fully drawn state is "<length>px, 0.1px" — the gap never reaches 0.
  const finalDash = await page.locator(leadPath).evaluate((path) => path.style.strokeDasharray);
  const [drawn, gap] = finalDash.split(",").map(Number.parseFloat);
  expect(drawn).toBeGreaterThanOrEqual(999);
  expect(gap).toBeLessThanOrEqual(0.1);
});

test("reveals the first signature pin from the vertical section trigger", async ({ page }) => {
  const pin = page.locator(signaturePin).first();
  await expect(pin).toHaveAttribute("data-shape-scroller", "window");

  const state = await pin.evaluate((shape) => ({
    hasTrigger: Boolean(shape._shapeRevealTween?.scrollTrigger),
    horizontal: shape._shapeRevealTween?.scrollTrigger?.vars.horizontal === true,
    scrollerIsWindow: shape._shapeRevealTween?.scrollTrigger?.scroller === window,
    start: shape._shapeRevealTween?.scrollTrigger?.vars.start,
    delay: shape._shapeRevealTween?.delay(),
  }));
  expect(state).toMatchObject({
    hasTrigger: true,
    horizontal: false,
    scrollerIsWindow: true,
    start: "top 60%",
  });
  expect(state.delay).toBeCloseTo(0.8, 5);

  const triggerY = await page.locator(band).evaluate((section) =>
    section.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.6,
  );
  await scrollTo(page, Math.max(0, triggerY - 100));
  expect(await pin.evaluate((shape) => getComputedStyle(shape).visibility)).toBe("hidden");

  await scrollTo(page, triggerY + 100);
  await page.waitForTimeout(1100);
  await expect.poll(() => pin.evaluate((shape) => getComputedStyle(shape).visibility)).toBe("visible");
});

test("reveals a later card button as its active band scrolls horizontally", async ({ page }) => {
  const button = page.locator(`${band} .sig-events_card-link`).nth(1);
  const state = await button.evaluate((link) => {
    const group = link.closest("[data-reveal-group]");
    const trigger = group._contentRevealInstance.trigger;
    const viewport = group.closest("[data-hscroll-init]").querySelector("[data-hscroll-viewport]");
    return {
      autoAlpha: Number.parseFloat(getComputedStyle(link).opacity),
      visibility: getComputedStyle(link).visibility,
      horizontal: trigger.vars.horizontal === true,
      scrollerIsBand: trigger.scroller === viewport,
      start: trigger.vars.start,
      triggerStart: trigger.start,
      bandTop: group.closest("[data-hscroll-init]").getBoundingClientRect().top + window.scrollY,
    };
  });

  expect(state).toMatchObject({
    autoAlpha: 0,
    visibility: "hidden",
    horizontal: true,
    scrollerIsBand: true,
    start: "clamp(left 80%)",
  });

  await scrollTo(page, state.bandTop + state.triggerStart - 100);
  await expect.poll(() => button.evaluate((link) => getComputedStyle(link).visibility)).toBe("hidden");

  await scrollTo(page, state.bandTop + state.triggerStart + 100);
  await expect.poll(() => button.evaluate((link) => getComputedStyle(link).visibility)).toBe("visible");
  await expect.poll(() => button.evaluate((link) => Number.parseFloat(getComputedStyle(link).opacity))).toBe(1);

  await scrollTo(page, state.bandTop + state.triggerStart + 400);
  await expect(button).toBeVisible();
});

test("rebuilds signature reveal state without stacking on hscroll rebuild", async ({ page }) => {
  const state = await page.locator(`${band} .sig-events_line-lead`).evaluate(async (wrap, bandSelector) => {
    const { ScrollTrigger } = await import("/src/lib/gsap.js");
    const oldTween = wrap._drawTl;
    const group = document.querySelector(`${bandSelector} .sig-events_card-body-col`);
    const oldContentReveal = group._contentRevealInstance;
    window.dispatchEvent(new CustomEvent("hscroll:rebuilt"));
    return {
      oldScrollTriggerCleared: oldTween.scrollTrigger === null,
      oldInactive: oldTween.isActive() === false,
      hasNewTween: Boolean(wrap._drawTl && wrap._drawTl !== oldTween),
      hasOneTrigger: Boolean(wrap._drawTl?.scrollTrigger),
      hasNewContentReveal: Boolean(
        group._contentRevealInstance && group._contentRevealInstance !== oldContentReveal,
      ),
      contentRevealTriggers: ScrollTrigger.getAll().filter(
        (trigger) => trigger.vars.trigger === group,
      ).length,
    };
  }, band);

  expect(state).toEqual({
    oldScrollTriggerCleared: true,
    oldInactive: true,
    hasNewTween: true,
    hasOneTrigger: true,
    hasNewContentReveal: true,
    contentRevealTriggers: 1,
  });
});
