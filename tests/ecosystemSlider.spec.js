import { test, expect } from "@playwright/test";

const slider = "[data-tabs-panel=learn] [data-radial-slider-init]";
const active = '[data-radial-slider-item-status="active"]';

async function settle(root) {
  await expect.poll(async () => {
    const before = await root.evaluate((node) => getComputedStyle(
      node.querySelector("[data-radial-slider-proxy]"),
    ).transform);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const after = await root.evaluate((node) => ({
      transform: getComputedStyle(node.querySelector("[data-radial-slider-proxy]")).transform,
      dragStatus: node.getAttribute("data-radial-slider-drag-status"),
    }));
    return {
      rotationStable: before === after.transform,
      dragStatus: after.dragStatus,
    };
  }, { timeout: 5000 }).toEqual({ rotationStable: true, dragStatus: "grab" });
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

test("dragging rotates cards and snaps to the new active index", async ({ page }) => {
  const root = page.locator(slider);
  await root.scrollIntoViewIfNeeded();
  await expect(root.locator(active)).toHaveCSS("opacity", "1");
  const box = await root.locator("[data-radial-slider-list]").boundingBox();
  const before = await root.evaluate((node) => {
    const proxy = node.querySelector("[data-radial-slider-proxy]");
    const angle = (element) => {
      const matrix = new DOMMatrix(getComputedStyle(element).transform);
      return Math.atan2(matrix.b, matrix.a);
    };
    const proxyMatrix = new DOMMatrix(getComputedStyle(proxy).transform);
    return {
      proxy: Math.atan2(proxyMatrix.b, proxyMatrix.a),
      cards: [...node.querySelectorAll(
        '[data-radial-slider-item]:not([data-radial-slider-clone])',
      )].map(angle),
      index: node.querySelector("[data-radial-slider-index]").textContent,
    };
  });
  const dragDistance = await root.evaluate((node) => {
    const rotateStep = Math.abs(parseFloat(
      getComputedStyle(node).getPropertyValue("--slider-rotate"),
    )) || 18;
    const firstCard = node.querySelector(
      '[data-radial-slider-item]:not([data-radial-slider-clone])',
    );
    const cardHeight = firstCard.getBoundingClientRect().height;
    const originY = parseFloat(getComputedStyle(firstCard).transformOrigin.split(" ")[1])
      || cardHeight * 3.75;
    const wheelRadius = Math.max(0, originY - cardHeight / 2);
    return Math.ceil(Math.tan(rotateStep * 0.75 * Math.PI / 180) * wheelRadius);
  });
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - dragDistance, box.y + box.height / 2, { steps: 12 });
  await expect(root).toHaveAttribute("data-radial-slider-drag-status", "grabbing");
  const duringDrag = await root.evaluate((node) => {
    const proxy = node.querySelector("[data-radial-slider-proxy]");
    const angle = (element) => {
      const matrix = new DOMMatrix(getComputedStyle(element).transform);
      return Math.atan2(matrix.b, matrix.a);
    };
    const proxyMatrix = new DOMMatrix(getComputedStyle(proxy).transform);
    return {
      proxy: Math.atan2(proxyMatrix.b, proxyMatrix.a),
      cards: [...node.querySelectorAll(
        '[data-radial-slider-item]:not([data-radial-slider-clone])',
      )].map(angle),
    };
  });
  expect(duringDrag.proxy).not.toBeCloseTo(before.proxy, 5);
  expect(duringDrag.cards.some((rotation, index) => (
    !Object.is(rotation, before.cards[index]) && Math.abs(rotation - before.cards[index]) > 0.001
  ))).toBe(true);
  await page.mouse.up();
  await settle(root);
  const after = await root.evaluate((node) => {
    const activeItem = node.querySelector('[data-radial-slider-item-status="active"]');
    const originals = [...node.querySelectorAll(
      '[data-radial-slider-item]:not([data-radial-slider-clone])',
    )];
    const originalIndex = originals.findIndex((item) => item.textContent === activeItem.textContent);
    return {
      activeCount: node.querySelectorAll('[data-radial-slider-item-status="active"]').length,
      index: node.querySelector("[data-radial-slider-index]").textContent,
      originalIndex,
    };
  });
  expect(after.activeCount).toBe(1);
  expect(after.index).not.toBe(before.index);
  expect(after.index).toBe(`${String(after.originalIndex + 1).padStart(2, "0")}/19`);
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

test("updates the original-card index through navigation wraps", async ({ page }) => {
  const root = page.locator(slider);
  await root.scrollIntoViewIfNeeded();
  const index = root.locator("[data-radial-slider-index]");
  const prev = root.locator('[data-radial-slider-control="prev"]');
  const next = root.locator('[data-radial-slider-control="next"]');

  await expect(index).toHaveText("01/19");
  await next.click();
  await settle(root);
  await expect(index).toHaveText("02/19");
  await prev.click();
  await settle(root);
  await prev.click();
  await settle(root);
  await expect(index).toHaveText("19/19");
  await next.click();
  await settle(root);
  await expect(index).toHaveText("01/19");
});

test("autoplay advances and pauses while hovered", async ({ page }) => {
  const root = page.locator(slider);
  await root.scrollIntoViewIfNeeded();
  const index = root.locator("[data-radial-slider-index]");
  await expect(root).toHaveAttribute("data-radial-slider-autoplay", "playing");
  await page.waitForTimeout(4000);
  await expect(index).toHaveText("02/19", { timeout: 2000 });

  await root.hover();
  await expect(root).toHaveAttribute("data-radial-slider-autoplay", "paused");
  await page.waitForTimeout(4100);
  await expect(index).toHaveText("02/19");
  await page.mouse.move(0, 0);
  await expect(root).toHaveAttribute("data-radial-slider-autoplay", "playing");
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
