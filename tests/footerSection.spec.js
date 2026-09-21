import { test, expect } from "@playwright/test";

const reveal = "[data-footer-reveal]";
const inner = `${reveal} [data-footer-reveal-inner]`;
const fountain = "[data-footer-fountain]";
const items = `${fountain} [data-footer-fountain-item]`;

async function loadFooter(page, width = 1440, height = 900, reducedMotion = "no-preference") {
  await page.setViewportSize({ width, height });
  await page.emulateMedia({ reducedMotion });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect.poll(() => page.locator(reveal).evaluate((element) => Boolean(element._footerReveal))).toBe(true);
}

function translateY(transform) {
  if (!transform || transform === "none") return 0;
  const match = transform.match(/^matrix\(([^)]+)\)$/);
  return match ? Number(match[1].split(",")[5]) : 0;
}

test("reveals the wordmark monotonically through a continuous scroll", async ({ page }) => {
  await loadFooter(page);

  const samples = await page.evaluate(() => new Promise((resolve) => {
    const values = [];
    const footer = document.querySelector('[data-footer-reveal]');
    const maxScroll = document.documentElement.scrollHeight - innerHeight;
    let index = 0;

    const sample = () => {
      values.push(getComputedStyle(footer.querySelector('[data-footer-reveal-inner]')).transform);
      index += 1;
      if (index === 36) return resolve(values);
      window.scrollTo({ top: maxScroll * (index / 35), behavior: "instant" });
      requestAnimationFrame(sample);
    };

    window.scrollTo({ top: 0, behavior: "instant" });
    requestAnimationFrame(sample);
  }));

  const yValues = samples.map(translateY);
  expect(yValues.at(0)).toBeLessThan(-1);
  expect(yValues.at(-1)).toBeGreaterThan(yValues.at(0));
  for (let index = 1; index < yValues.length; index += 1) {
    expect(yValues[index]).toBeGreaterThanOrEqual(yValues[index - 1] - 1);
  }
});

test("runs the fountain while the wordmark is visible and freezes it outside", async ({ page }) => {
  await loadFooter(page);
  await page.locator(reveal).scrollIntoViewIfNeeded();

  await expect
    .poll(
      () => page.locator(items).evaluateAll((elements) =>
        elements.filter((element) => Number.parseFloat(getComputedStyle(element).opacity) > 0).length,
      ),
      { timeout: 3000 },
    )
    .toBeGreaterThanOrEqual(3);

  const moving = await page.locator(items).evaluateAll((elements) => elements.map((element) => element.style.transform));
  await page.waitForTimeout(100);
  const movingLater = await page.locator(items).evaluateAll((elements) => elements.map((element) => element.style.transform));
  expect(movingLater).not.toEqual(moving);

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.waitForTimeout(400);
  const frozen = await page.locator(items).evaluateAll((elements) => elements.map((element) => element.style.transform));
  await page.waitForTimeout(300);
  const frozenLater = await page.locator(items).evaluateAll((elements) => elements.map((element) => element.style.transform));
  expect(frozenLater).toEqual(frozen);
});

test("uses the mobile preset without exceeding its apex", async ({ page }) => {
  await loadFooter(page, 390, 844);
  await page.locator(reveal).scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);

  const translations = await page.locator(items).evaluateAll((elements) =>
    elements.map((element) => {
      const transform = getComputedStyle(element).transform;
      const match = transform.match(/^matrix\(([^)]+)\)$/);
      return match ? Number(match[1].split(",")[5]) : 0;
    }),
  );
  expect(Math.min(...translations)).toBeGreaterThan(-844 * 0.2 - 2);
});

test("settles both footer effects for reduced motion", async ({ page }) => {
  await loadFooter(page, 1440, 900, "reduce");
  await page.locator(reveal).scrollIntoViewIfNeeded();

  const state = await page.locator(reveal).evaluate((element) => ({
    transform: getComputedStyle(element.querySelector('[data-footer-reveal-inner]')).transform,
    hasTrigger: Boolean(element._footerReveal.trigger),
  }));
  expect(["none", "matrix(1, 0, 0, 1, 0, 0)"]).toContain(state.transform);
  expect(state.hasTrigger).toBe(false);

  await expect
    .poll(
      () => page.locator(items).evaluateAll((elements) =>
        elements.every((element) => getComputedStyle(element).opacity === "1"),
      ),
      { timeout: 3000 },
    )
    .toBe(true);
  const before = await page.locator(items).evaluateAll((elements) => elements.map((element) => ({
    opacity: getComputedStyle(element).opacity,
    transform: getComputedStyle(element).transform,
  })));
  await page.waitForTimeout(500);
  const after = await page.locator(items).evaluateAll((elements) => elements.map((element) => getComputedStyle(element).transform));
  expect(after).toEqual(before.map(({ transform }) => transform));
});
