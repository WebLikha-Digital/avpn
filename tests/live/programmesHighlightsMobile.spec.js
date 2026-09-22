import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";

const BUNDLE_PATH = fileURLToPath(new URL("../../dist/animations.min.js", import.meta.url));
const BAND = ".section_programmes-highlights";

test.use({
  viewport: { width: 375, height: 812 },
  isMobile: true,
  hasTouch: true,
});

test.beforeEach(async ({ page }) => {
  expect(existsSync(BUNDLE_PATH), `no bundle at ${BUNDLE_PATH} — run \`npm run build\``).toBe(true);

  let served = 0;
  await page.route("**/animations.min.js", async (route) => {
    served += 1;
    await route.fulfill({ path: BUNDLE_PATH, contentType: "application/javascript" });
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator(BAND)).toBeVisible();
  await expect
    .poll(() => page.evaluate((selector) => document.querySelectorAll(selector).length, `${BAND} [data-rotary-wheel-hub]`))
    .toBe(3);
  expect(served, "the published page should still request animations.min.js").toBeGreaterThan(0);
});

test("stacks the band and keeps its mobile scroll animations vertical", async ({ page }) => {
  const layout = await page.evaluate((selector) => {
    const section = document.querySelector(selector);
    const viewport = section.querySelector("[data-hscroll-viewport]");
    const track = section.querySelector("[data-hscroll-track]");
    const hubs = [...section.querySelectorAll("[data-rotary-wheel-hub]")];
    const cards = hubs.map((hub) => [...hub.querySelectorAll(".prog-highlights_card")]);
    const items = hubs.map((hub) => hub.querySelectorAll("[data-rotary-wheel-item]").length);
    return {
      sticky: getComputedStyle(viewport).position === "sticky",
      active: section.hasAttribute("data-hscroll-active"),
      trackDirection: getComputedStyle(track).flexDirection,
      trackWidth: track.getBoundingClientRect().width,
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      hubs: hubs.map((hub, index) => ({
        scrollWidth: hub.scrollWidth,
        clientWidth: hub.clientWidth,
        snapType: getComputedStyle(hub).scrollSnapType,
        cardCount: cards[index].length,
        itemCount: items[index],
        cards: cards[index].map((card) => ({
          transform: getComputedStyle(card).transform,
          scrollHeight: card.scrollHeight,
          clientHeight: card.clientHeight,
        })),
      })),
    };
  }, BAND);

  expect(layout.sticky).toBe(false);
  expect(layout.active).toBe(false);
  expect(layout.trackDirection).toBe("column");
  expect(layout.trackWidth).toBe(layout.viewportWidth);
  expect(layout.documentWidth).toBe(layout.viewportWidth);
  expect(layout.hubs).toHaveLength(3);

  for (const hub of layout.hubs) {
    expect(hub.scrollWidth).toBeGreaterThan(hub.clientWidth);
    expect(hub.snapType).toContain("x");
    expect(hub.cardCount).toBe(hub.itemCount);
    for (const card of hub.cards) {
      expect(card.transform).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
      expect(card.scrollHeight).toBe(card.clientHeight);
    }
  }
});

test("draws the mobile connector and reveals stacked arcs while scrolling", async ({ page }) => {
  const line = page.locator(`${BAND} .prog-highlights_line.is-mobile`);
  await expect(line).toBeVisible();
  await expect(page.locator(`${BAND} .prog-highlights_line.is-line-1`)).toBeHidden();

  const sectionRange = await page.evaluate((selector) => {
    const section = document.querySelector(selector);
    const rect = section.getBoundingClientRect();
    return { top: rect.top + window.scrollY, bottom: rect.bottom + window.scrollY };
  }, BAND);

  await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), sectionRange.top);
  await page.waitForTimeout(100);
  await page.evaluate((selector) => {
    const path = document.querySelector(`${selector} .prog-highlights_line.is-mobile [data-draw-scroll-path]`);
    window.__mobileLineFrames = [];
    const sample = () => {
      const value = Number.parseFloat(
        getComputedStyle(path).strokeDasharray.split(",")[0],
      );
      if (Number.isFinite(value)) window.__mobileLineFrames.push(value);
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }, BAND);

  for (let i = 0; i < 90; i += 1) {
    await page.mouse.wheel(0, 60);
    await page.waitForTimeout(30);
  }

  const drawnLengths = await page.evaluate(() => window.__mobileLineFrames || []);
  expect(drawnLengths.length, "the mobile path should be sampled during motion").toBeGreaterThan(20);
  expect(
    drawnLengths.every((value, index) => index === 0 || value >= drawnLengths[index - 1] - 0.5),
    "the mobile path should draw monotonically",
  ).toBe(true);
  expect(drawnLengths.some((value, index) => index > 0 && value > drawnLengths[index - 1] + 0.5)).toBe(true);

  const arcs = page.locator(`${BAND} .prog-highlights_arc`);
  const arcCount = await arcs.count();
  expect(arcCount).toBeGreaterThan(0);
  for (let i = 0; i < arcCount; i += 1) {
    await page.evaluate((index) => {
      document
        .querySelectorAll(".section_programmes-highlights .prog-highlights_arc")
        [index].closest("[data-rotary-wheel-stage]")
        .scrollIntoView({ block: "center" });
    }, i);
    await page.waitForTimeout(100);
    await expect
      .poll(() => arcs.nth(i).evaluate((arc) => Number.parseFloat(getComputedStyle(arc).opacity)))
      .toBeGreaterThanOrEqual(0.99);
  }
});

test("keeps authored Programmes Highlights lines within their mobile parents", async ({ page }) => {
  const lines = await page.evaluate((selector) => {
    const authored = document.querySelectorAll(
      `${selector} .prog-highlights-heading_line, ${selector} .prog-highlights_copy-line`,
    );
    return [...authored].map((parent) => {
      const text = parent.querySelector('[data-split="heading"]');
      const renderedLines = text?.querySelectorAll(".line");
      const child = renderedLines?.[0] || text;
      if (!text || !child) return { valid: false };
      const parentRect = parent.getBoundingClientRect();
      const childRect = child.getBoundingClientRect();
      const fontSize = Number.parseFloat(getComputedStyle(text).fontSize);
      return {
        valid: true,
        lineCount: renderedLines.length,
        height: childRect.height,
        maxHeight: fontSize * 1.5,
        width: childRect.width,
        maxWidth: parentRect.width,
      };
    });
  }, BAND);

  expect(lines.length).toBeGreaterThan(0);
  for (const line of lines) {
    expect(line.valid).toBe(true);
    expect(line.lineCount).toBe(1);
    expect(line.height).toBeLessThanOrEqual(line.maxHeight + 1);
    expect(line.width).toBeLessThanOrEqual(line.maxWidth + 1);
  }
});
