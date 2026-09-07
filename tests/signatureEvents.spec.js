import { test, expect } from "@playwright/test";

const band = ".section_signature-events[data-hscroll-init]";
const word = "[data-hparallax]";
const shapes = "[data-shape-swap] > *";

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
