import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
});

async function findSectionPoint(page, section) {
  return section.evaluate((root) => {
    const rect = root.getBoundingClientRect();
    const left = Math.max(1, Math.floor(rect.left));
    const right = Math.min(window.innerWidth - 1, Math.ceil(rect.right));
    const top = Math.max(1, Math.floor(rect.top));
    const bottom = Math.min(window.innerHeight - 1, Math.ceil(rect.bottom));
    for (let y = top; y <= bottom; y += 12) {
      for (let x = left; x <= right; x += 12) {
        const hit = document.elementFromPoint(x, y);
        if (hit?.closest("[data-cursor-marquee-init]") === root
          && !hit.closest("[data-cursor-marquee-text]")) {
          return { x, y };
        }
      }
    }
    return null;
  }).then((point) => {
    expect(point, "expected a visible point inside the ecosystem section").not.toBeNull();
    return point;
  });
}

test("follows the pointer and transitions through cursor marquee states", async ({ page }) => {
  const section = page.locator("[data-cursor-marquee-init]");
  const cursor = section.locator("[data-cursor-marquee-status]");
  const card = section.locator(
    '[data-tabs-panel]:not([hidden]) [data-radial-slider-item-status="active"]',
  ).first();
  await section.locator("[data-radial-slider-list]").first().scrollIntoViewIfNeeded();
  await expect(cursor).toHaveAttribute("data-cursor-marquee-status", "idle");

  const insidePoint = await findSectionPoint(page, section);
  await page.mouse.move(insidePoint.x, insidePoint.y);
  await expect(cursor).toHaveAttribute("data-cursor-marquee-status", "not-active");

  const cardBox = await card.boundingBox();
  const cardPoint = {
    x: cardBox.x + cardBox.width / 2,
    y: cardBox.y + cardBox.height / 2,
  };
  const hitsCard = await page.evaluate(({ point, card: cardNode }) => (
    document.elementFromPoint(point.x, point.y)?.closest("[data-cursor-marquee-text]") === cardNode
  ), { point: cardPoint, card: await card.elementHandle() });
  expect(hitsCard, "expected the active card centre to hit the card").toBe(true);
  await page.mouse.move(cardPoint.x, cardPoint.y, { steps: 8 });
  await expect(cursor).toHaveAttribute("data-cursor-marquee-status", "active");
  await expect(cursor.locator("[data-cursor-marquee-text-target]")).toHaveCount(2);
  await expect(cursor.locator("[data-cursor-marquee-text-target]").first()).toHaveText("Read more");
  await expect(cursor.locator("[data-cursor-marquee-text-target]").last()).toHaveText("Read more");

  const positions = [];
  for (const x of [
    cardPoint.x - cardBox.width * 0.25,
    cardPoint.x,
    cardPoint.x + cardBox.width * 0.25,
  ]) {
    await page.mouse.move(x, cardPoint.y, { steps: 4 });
    positions.push(await cursor.evaluate((node) => {
      const matrix = new DOMMatrix(getComputedStyle(node).transform);
      return { x: matrix.e, y: matrix.f };
    }));
  }
  expect(new Set(positions.map(({ x }) => x)).size).toBeGreaterThan(1);

  await page.mouse.move(insidePoint.x, insidePoint.y);
  await expect(cursor).toHaveAttribute("data-cursor-marquee-status", "not-active");

  await page.locator(".sandbox-hero").scrollIntoViewIfNeeded();
  const outsidePoint = await page.locator(".sandbox-hero").evaluate((hero, root) => {
    const rect = hero.getBoundingClientRect();
    const x = Math.max(1, Math.min(window.innerWidth - 1, rect.left + rect.width / 2));
    const y = Math.max(1, Math.min(window.innerHeight - 1, rect.top + rect.height / 2));
    return {
      x, y,
      isOutside: document.elementFromPoint(x, y)?.closest("[data-cursor-marquee-init]") !== root,
    };
  }, await section.elementHandle());
  expect(outsidePoint.isOutside).toBe(true);
  await page.mouse.move(outsidePoint.x, outsidePoint.y);
  await expect(cursor).toHaveAttribute("data-cursor-marquee-status", "idle");
});

test("does not initialize on a coarse pointer", async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await page.goto("/");
  const cursor = page.locator("[data-cursor-marquee-status]");
  await expect(cursor).toHaveAttribute("data-cursor-marquee-status", "idle");
  await context.close();
});
