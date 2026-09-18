import { test, expect } from "@playwright/test";

const section = "[data-communities-init]";
const ball = `${section} [data-communities-ball]`;

async function scrollIntoView(page) {
  await page.locator(section).scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
}

async function snapshot(page) {
  return page.locator(section).evaluate((root) => {
    const pile = root.querySelector("[data-communities-pile]").getBoundingClientRect();
    const header = root.querySelector("[data-communities-obstacle]").getBoundingClientRect();
    const bounds = (rect) => ({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom });
    return [...root.querySelectorAll("[data-communities-ball]")].map((element) => {
      const rect = element.getBoundingClientRect();
      const radius = element.offsetWidth / 2;
      return {
        centre: { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 },
        radius,
        rotation: Number.parseFloat(element.style.transform.match(/rotate\(([-\d.]+)rad\)/)?.[1] ?? 0),
        pile: bounds(pile),
        header: bounds(header),
      };
    });
  });
}

test("does not drop until Communities Served enters the viewport", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.locator(`${section}[data-communities-state="physics"]`)).toHaveCount(1);
  const initial = await page.locator(ball).first().evaluate((element) => ({
    transform: element.style.transform,
    visibility: getComputedStyle(element).visibility,
  }));
  expect(initial.visibility).toBe("hidden");
  await scrollIntoView(page);
  await expect.poll(() => page.locator(ball).first().evaluate((element) => ({
    transform: element.style.transform,
    visibility: getComputedStyle(element).visibility,
  }))).toEqual(expect.objectContaining({ visibility: "visible" }));
  await expect.poll(() => page.locator(ball).first().evaluate((element) => element.style.transform)).not.toBe(initial.transform);
});

test("balls move on consecutive frames and settle inside the desktop pile", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await scrollIntoView(page);
  const samples = await page.locator(section).evaluate(async (root) => {
    const element = root.querySelector("[data-communities-ball]");
    const values = [];
    for (let index = 0; index < 24; index += 1) {
      values.push(element.style.transform);
      await new Promise(requestAnimationFrame);
    }
    return values;
  });
  expect(new Set(samples).size).toBeGreaterThan(3);
  await page.waitForTimeout(4200);
  const positions = await snapshot(page);
  positions.forEach(({ centre, radius, rotation, pile, header }) => {
    expect(Math.abs(rotation)).toBeLessThanOrEqual(0.3);
    expect(centre.x - radius).toBeGreaterThanOrEqual(pile.left - 1);
    expect(centre.x + radius).toBeLessThanOrEqual(pile.right + 1);
    expect(centre.y - radius).toBeGreaterThanOrEqual(pile.top - 1);
    expect(centre.y + radius).toBeLessThanOrEqual(pile.bottom + 1);
    const closestX = Math.max(header.left, Math.min(centre.x, header.right));
    const closestY = Math.max(header.top, Math.min(centre.y, header.bottom));
    expect(Math.hypot(centre.x - closestX, centre.y - closestY)).toBeGreaterThanOrEqual(radius - 1);
  });
});

test("settles inside the pile on mobile without a header obstacle", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await scrollIntoView(page);
  await page.waitForTimeout(4200);
  const positions = await snapshot(page);
  positions.forEach(({ centre, radius, rotation, pile }) => {
    expect(Math.abs(rotation)).toBeLessThanOrEqual(0.3);
    expect(centre.x - radius).toBeGreaterThanOrEqual(pile.left - 1);
    expect(centre.x + radius).toBeLessThanOrEqual(pile.right + 1);
    expect(centre.y + radius).toBeLessThanOrEqual(pile.bottom + 1);
  });
});

test("reduced motion keeps the authored static layout", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.locator(`${section}[data-communities-state]`)).toHaveCount(0);
  await expect(page.locator(ball)).toHaveCount(11);
});

test("re-init replaces one instance and teardown removes physics state", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const result = await page.locator(section).evaluate(async (root) => {
    const { initCommunitiesPile } = await import("/src/animations/communitiesPile.js");
    const first = root._communitiesPile;
    initCommunitiesPile();
    const second = root._communitiesPile;
    const triggerCount = (await import("/src/lib/gsap.js")).ScrollTrigger.getAll()
      .filter((trigger) => trigger.vars.trigger === root).length;
    second.kill();
    return { replaced: first !== second, triggerCount, state: root.dataset.communitiesState };
  });
  expect(result.replaced).toBe(true);
  expect(result.triggerCount).toBe(1);
  expect(result.state).toBeUndefined();
});
