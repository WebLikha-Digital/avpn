import { test, expect } from "@playwright/test";

const slider = "[data-tabs-panel=learn] [data-radial-slider-init]";
const active = '[data-radial-slider-item-status="active"]';

async function settle(root) {
  await expect.poll(async () => {
    const before = await root.evaluate((node) => getComputedStyle(
      node.querySelector("[data-radial-slider-proxy]"),
    ).transform);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const after = await root.evaluate((node) => getComputedStyle(
      node.querySelector("[data-radial-slider-proxy]"),
    ).transform);
    return {
      rotationStable: before === after,
      dragStatus: await root.getAttribute("data-radial-slider-drag-status"),
    };
  }, { timeout: 5000 }).toEqual({ rotationStable: true, dragStatus: null });
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
});

test("centres the active card and places neighbours on the wheel", async ({ page }) => {
  const root = page.locator(slider);
  await root.scrollIntoViewIfNeeded();
  await expect(root.locator(active)).toHaveCount(1);
  const geometry = await root.evaluate((node) => {
    const collection = node.querySelector("[data-radial-slider-collection]").getBoundingClientRect();
    const cards = [...node.querySelectorAll("[data-radial-slider-item]")].slice(0, 3);
    return cards.map((card) => {
      const box = card.getBoundingClientRect();
      const matrix = new DOMMatrix(getComputedStyle(card).transform);
      return { centre: box.left + box.width / 2, top: box.top, rotation: Math.atan2(matrix.b, matrix.a) };
    }).concat({ viewportCentre: collection.left + collection.width / 2 });
  });
  expect(Math.abs(geometry[0].centre - geometry.at(-1).viewportCentre)).toBeLessThan(2);
  expect(geometry[0].rotation).toBeCloseTo(0, 5);
  expect(geometry[1].rotation).not.toBeCloseTo(0, 3);
  expect(geometry[2].rotation).not.toBeCloseTo(0, 3);
  expect(geometry[1].top).toBeGreaterThan(geometry[0].top);
  expect(geometry[2].top).toBeGreaterThan(geometry[0].top);
});

test("dragging does not change proxy or card rotations while drag is disabled", async ({ page }) => {
  const root = page.locator(slider);
  await root.scrollIntoViewIfNeeded();
  await expect(root.locator(active)).toHaveCSS("opacity", "1");
  const box = await root.locator("[data-radial-slider-list]").boundingBox();
  const before = await root.evaluate((node) => {
    const proxy = node.querySelector("[data-radial-slider-proxy]");
    const card = node.querySelector('[data-radial-slider-item-status="inview"]');
    const angle = (element) => {
      const matrix = new DOMMatrix(getComputedStyle(element).transform);
      return Math.atan2(matrix.b, matrix.a);
    };
    const proxyMatrix = new DOMMatrix(getComputedStyle(proxy).transform);
    return { proxy: Math.atan2(proxyMatrix.b, proxyMatrix.a), card: angle(card) };
  });
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 160, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  const after = await root.evaluate((node) => {
    const proxy = node.querySelector("[data-radial-slider-proxy]");
    const card = node.querySelector('[data-radial-slider-item-status="inview"]');
    const angle = (element) => {
      const matrix = new DOMMatrix(getComputedStyle(element).transform);
      return Math.atan2(matrix.b, matrix.a);
    };
    const proxyMatrix = new DOMMatrix(getComputedStyle(proxy).transform);
    return {
      proxy: Math.atan2(proxyMatrix.b, proxyMatrix.a),
      card: angle(card),
      dragStatus: node.getAttribute("data-radial-slider-drag-status"),
    };
  });
  expect(after.proxy).toBeCloseTo(before.proxy, 5);
  expect(after.card).toBeCloseTo(before.card, 5);
  expect(after.dragStatus).toBeNull();
});

test("controls wrap and side-card clicks centre without navigating", async ({ page }) => {
  const root = page.locator(slider);
  await root.scrollIntoViewIfNeeded();
  await expect(root.locator(active)).toHaveCSS("opacity", "1");
  const prev = root.locator('[data-radial-slider-control="prev"]');
  const next = root.locator('[data-radial-slider-control="next"]');
  await prev.click();
  await settle(root);
  await expect.poll(() => root.locator(active).evaluate((item) => {
    const lastOriginal = [...item.closest("[data-radial-slider-init]").querySelectorAll(
      '[data-radial-slider-item]:not([data-radial-slider-clone])',
    )].at(-1);
    return item.getAttribute("aria-label") === "Slide 19 of 19"
      || (item.hasAttribute("data-radial-slider-clone") && item.textContent === lastOriginal.textContent);
  })).toBe(true);
  await next.click();
  await settle(root);
  await expect(root.locator(active)).toHaveAttribute("aria-label", "Slide 1 of 19");
  await root.locator('[data-radial-slider-item]').nth(1).evaluate((card) => { card.href = "#side-card"; });
  await root.locator('[data-radial-slider-item]').nth(1).click();
  await settle(root);
  expect(await page.evaluate(() => location.hash)).not.toBe("#side-card");
  await expect(root.locator('[data-radial-slider-item]').nth(1)).toHaveAttribute(
    "data-radial-slider-item-status", "active",
  );
});

test("keyboard, drag suppression, tab order, and active-link navigation work", async ({ page }) => {
  const root = page.locator(slider);
  await root.scrollIntoViewIfNeeded();
  await expect(root.locator(active)).toHaveCSS("opacity", "1");
  const first = root.locator('[data-radial-slider-item]').first();
  await first.focus();
  await first.press("ArrowRight");
  await settle(root);
  await expect(root.locator(active)).toHaveAttribute("aria-label", "Slide 2 of 19");
  await expect(root.locator('[data-radial-slider-item]').first()).toHaveAttribute("tabindex", "-1");
  await expect(root.locator(active)).toHaveAttribute("tabindex", "0");

  await first.evaluate((card) => { card.href = "#dragged-card"; });
  const box = await root.locator("[data-radial-slider-list]").boundingBox();
  await page.mouse.move(box.x + 100, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 94, box.y + 100, { steps: 3 });
  await page.mouse.up();
  expect(await page.evaluate(() => location.hash)).not.toBe("#dragged-card");
  await settle(root);

  await root.locator(active).evaluate((card) => { card.href = "#active-card"; });
  await root.locator(active).click();
  expect(await page.evaluate(() => location.hash)).toBe("#active-card");
  const clones = root.locator('[data-radial-slider-clone]');
  if (await clones.count()) await expect(clones.first()).toHaveAttribute("aria-hidden", "true");
});
