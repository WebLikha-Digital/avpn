import { test, expect } from "@playwright/test";

// The radial slider and tab markup are commented out of the sandbox while the
// folder-deck demo (feat/ecosystem-folders) is evaluated. Re-enable or delete
// with that decision.
test.skip(true, "ecosystem tabs/slider markup is disabled in the sandbox during the folder-deck demo");

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

test("reveals the default intro on scroll and replays each tab intro", async ({ page }) => {
  const learn = page.locator('[data-tabs-panel="learn"] .ecosystem_intro');
  const voice = page.locator('[data-tabs-panel="voice"] .ecosystem_intro');

  await expect.poll(() => learn.locator(".line").count()).toBeGreaterThan(0);
  await expect(voice.locator(".line")).toHaveCount(0);
  await expect.poll(() => learn.evaluate((element) => Boolean(element._splitTween?.scrollTrigger))).toBe(true);

  await learn.scrollIntoViewIfNeeded();
  await expect.poll(() => learn.evaluate((element) => element._splitTween?.progress())).toBe(1);

  const lineOffsets = (intro) => intro.evaluate((element) => [...element.querySelectorAll(".line")].map((line) => {
    const transform = getComputedStyle(line).transform;
    if (transform === "none") return 0;
    const values = transform.startsWith("matrix3d(")
      ? transform.slice(9, -1).split(",")
      : transform.slice(7, -1).split(",");
    return Math.abs(Number.parseFloat(values[transform.startsWith("matrix3d(") ? 13 : 5]));
  }));

  await page.locator('[data-tabs-tab="voice"]').click();
  await expect.poll(() => voice.locator(".line").count()).toBeGreaterThan(0);
  await expect.poll(async () => Math.max(...await lineOffsets(voice))).toBeGreaterThan(0);
  await expect.poll(async () => Math.max(...await lineOffsets(voice))).toBeLessThan(1, { timeout: 2_000 });

  await page.locator('[data-tabs-tab="learn"]').click();
  await expect.poll(async () => Math.max(...await lineOffsets(learn))).toBeGreaterThan(0);
  await expect.poll(async () => Math.max(...await lineOffsets(learn))).toBeLessThan(1, { timeout: 2_000 });
});
