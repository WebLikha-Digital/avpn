import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
});

test("initialises the tabs contract and changes panels with keyboard input", async ({ page }) => {
  const tabs = page.locator("[data-tabs-init]");
  await expect(tabs.locator("[role=tab]")).toHaveCount(2);
  await expect(tabs.locator("[data-tabs-panel]:not([hidden])")).toHaveCount(1);
  await expect(tabs.locator("[data-tabs-tab=learn]")).toHaveAttribute("aria-selected", "true");

  const changes = [];
  await page.exposeFunction("recordEcosystemTabChange", (id) => changes.push(id));
  await tabs.evaluate((root) => root.addEventListener("ecosystemtabs:change", (event) => window.recordEcosystemTabChange(event.detail.id)));
  await tabs.locator("[data-tabs-tab=learn]").press("ArrowRight");
  await expect(tabs.locator("[data-tabs-tab=voice]")).toBeFocused();
  await expect(tabs.locator("[data-tabs-panel=voice]")).not.toBeHidden();
  await page.waitForTimeout(50);
  const voiceCard = tabs.locator("[data-tabs-panel=voice] [data-deck-card]").last();
  const voiceViewport = tabs.locator("[data-tabs-panel=voice] [data-deck-viewport]");
  const voiceGeometry = await voiceCard.evaluate((card, viewport) => {
    const cardBox = card.getBoundingClientRect();
    const viewportBox = viewport.getBoundingClientRect();
    return {
      cardCenter: [cardBox.left + cardBox.width / 2, cardBox.top + cardBox.height / 2],
      viewportCenter: [viewportBox.left + viewportBox.width / 2, viewportBox.top + viewportBox.height / 2],
    };
  }, await voiceViewport.elementHandle());
  expect(Math.abs(voiceGeometry.cardCenter[0] - voiceGeometry.viewportCenter[0])).toBeLessThan(40);
  expect(Math.abs(voiceGeometry.cardCenter[1] - voiceGeometry.viewportCenter[1])).toBeLessThan(40);
  await expect(tabs.locator("[data-tabs-panel=learn]")).toBeHidden();
  await expect.poll(() => changes).toEqual(["voice"]);
  await expect(tabs.locator("[data-tabs-panel=voice]")).toHaveAttribute("aria-labelledby", /.+/);
});

test("switching away collapses an expanded deck and remeasures the shown deck", async ({ page }) => {
  const deck = page.locator("[data-tabs-panel=learn] [data-deck-init]");
  await deck.click();
  await expect(deck).toHaveAttribute("data-deck-state", "expanded");
  await page.locator("[data-tabs-tab=voice]").click();
  await expect(deck).toHaveAttribute("data-deck-state", "stacked");
  await expect(page.locator("[data-tabs-panel=voice] [data-deck-init]")).toHaveAttribute("data-deck-state", "stacked");
});
