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
  await deck.locator("[data-deck-folder]").click();
  await expect(root).toHaveAttribute("data-folders-state", "expanded");
  await expect(deck).toHaveAttribute("data-deck-state", "expanded");
  await expect(root.locator("[data-deck-init=voice]")).toBeHidden();
  await expect(deck.locator("[data-deck-collapse]")).toBeVisible();
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
