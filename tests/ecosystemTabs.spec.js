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
  await expect(tabs.locator("[data-tabs-panel=voice] [data-radial-slider-item-status=active]")).toHaveCount(1);
  await expect.poll(() => changes).toEqual(["voice"]);
  await expect(tabs.locator("[data-tabs-panel=voice]")).toHaveAttribute("aria-labelledby", /.+/);
});

test("tab switching measures the newly visible slider before revealing it", async ({ page }) => {
  const voiceTab = page.locator("[data-tabs-tab=voice]");
  await voiceTab.click();
  const voice = page.locator("[data-tabs-panel=voice] [data-radial-slider-init]");
  await expect(voice.locator('[data-radial-slider-item-status="active"]')).toHaveCount(1);
  const centred = await voice.evaluate((root) => {
    const card = root.querySelector('[data-radial-slider-item-status="active"]').getBoundingClientRect();
    const viewport = root.querySelector("[data-radial-slider-collection]").getBoundingClientRect();
    return Math.abs(card.left + card.width / 2 - (viewport.left + viewport.width / 2));
  });
  expect(centred).toBeLessThan(2);
});
