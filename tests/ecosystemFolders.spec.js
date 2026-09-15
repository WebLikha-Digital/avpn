import { test, expect } from "@playwright/test";

const folders = "[data-folders-init]";
const learn = "[data-deck-init=learn]";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.locator("[data-testid=ecosystem]").scrollIntoViewIfNeeded();
});

test("renders two stacked cream folders and fans on hover", async ({ page }) => {
  const root = page.locator(folders);
  await expect(root.locator("[data-deck-init]")).toHaveCount(2);
  await expect(root.locator("[data-deck-init=learn] [data-deck-count]")).toHaveText("19");
  await expect(root.locator("[data-deck-init=voice] [data-deck-count]")).toHaveText("11");
  await expect(root.locator("[data-deck-track] [data-deck-clone]")).toHaveCount(0);
  const card = root.locator(`${learn} [data-deck-card]`).first();
  const before = await card.evaluate((node) => getComputedStyle(node).transform);
  await root.locator(`${learn} [data-deck-folder]`).hover();
  await page.waitForTimeout(180);
  expect(await card.evaluate((node) => getComputedStyle(node).transform)).not.toBe(before);
});

test("expands, pauses marquee, collapses, and supports Esc", async ({ page }) => {
  const root = page.locator(folders);
  const deck = root.locator(learn);
  const jumpPromise = page.evaluate(() => new Promise((resolve) => {
    const root = document.querySelector("[data-folders-init]");
    // Only the first cards: the far ones legitimately cover thousands of px in
    // the 0.75s Flip, so a per-frame delta there is speed, not a layout jump.
    const cards = [...root.querySelectorAll("[data-deck-init=learn] [data-deck-card]")].slice(0, 3);
    let started = null;
    let previous = null;
    let previousTime = 0;
    let maxJump = 0;
    const sample = () => {
      if (root.dataset.foldersState === "expanding") {
        started ??= performance.now();
        const now = performance.now();
        const lefts = cards.map((card) => card.getBoundingClientRect().left);
        if (previous && now - started > 100) {
          // Normalise to a 60fps frame so dropped frames under parallel test
          // load read as speed, not as a layout jump.
          const frames = Math.max(1, (now - previousTime) / (1000 / 60));
          maxJump = Math.max(maxJump, ...lefts.map((left, index) => Math.abs(left - previous[index]) / frames));
        }
        previous = lefts;
        previousTime = now;
        if (performance.now() - started > 900) return resolve(maxJump);
      }
      if (root.dataset.foldersState === "expanded") return resolve(maxJump);
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }));
  await deck.locator("[data-deck-folder]").click();
  expect(await jumpPromise).toBeLessThan(60);
  await expect(root).toHaveAttribute("data-folders-state", "expanded");
  await expect(deck).toHaveAttribute("data-deck-state", "expanded");
  await expect(root.locator("[data-deck-init=voice]")).toBeHidden();
  await expect(deck.locator("[data-deck-collapse]")).toBeVisible();
  expect(await deck.locator("[data-deck-collapse]").evaluate((button) => {
    const box = button.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return hit === button || button.contains(hit);
  })).toBe(true);
  await expect(deck.locator("[data-deck-card]").first()).not.toHaveAttribute("tabindex", /.+/);
  await page.mouse.move(0, 0);
  const before = await deck.locator("[data-deck-track]").evaluate((node) => node.getBoundingClientRect().left);
  await page.waitForTimeout(150);
  expect(await deck.locator("[data-deck-track]").evaluate((node) => node.getBoundingClientRect().left)).toBeLessThan(before);
  await deck.locator("[data-deck-viewport]").hover();
  const paused = await deck.locator("[data-deck-track]").evaluate((node) => node.getBoundingClientRect().left);
  await page.waitForTimeout(120);
  expect(await deck.locator("[data-deck-track]").evaluate((node) => node.getBoundingClientRect().left)).toBeCloseTo(paused, 0);
  await deck.locator("[data-deck-collapse]").click();
  await expect(root).toHaveAttribute("data-folders-state", "stacked");
  await expect(root.locator("[data-deck-init=voice]")).not.toBeHidden();
  await deck.locator("[data-deck-folder]").press("Enter");
  await expect(deck).toHaveAttribute("data-deck-state", "expanded");
  await page.keyboard.press("Escape");
  await expect(root).toHaveAttribute("data-folders-state", "stacked");
  await expect(root.locator("[data-deck-init=voice]")).not.toBeHidden();
  await expect(deck.locator("[data-deck-folder]")).toBeFocused();
});

test("reduced motion uses a native row and supports another cycle", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await page.locator("[data-testid=ecosystem]").scrollIntoViewIfNeeded();
  const deck = page.locator(learn);
  await deck.locator("[data-deck-folder]").click();
  await expect(deck).toHaveAttribute("data-deck-state", "expanded");
  await expect(deck.locator("[data-deck-clone]")).toHaveCount(0);
  await expect(deck.locator("[data-deck-viewport]")).toHaveCSS("overflow-x", "auto");
  await deck.locator("[data-deck-collapse]").click();
  await expect(deck).toHaveAttribute("data-deck-state", "stacked");
  await deck.locator("[data-deck-folder]").press("Enter");
  await expect(deck).toHaveAttribute("data-deck-state", "expanded");
});

test("folders stack on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  const root = page.locator(folders);
  await expect(root.locator(".ecosystem_deck")).toHaveCount(2);
  await expect(root).toHaveCSS("flex-direction", "column");
  await expect(root.locator(".ecosystem_deck").first()).toHaveCSS("max-width", "380px");
});
