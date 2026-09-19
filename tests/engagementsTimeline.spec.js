import { test, expect } from "@playwright/test";

const rootSelector = "[data-engagements-init]";

async function settle(root) {
  await expect.poll(() => root.evaluate((node) => node._engagementsTimelineInstance?.isAnimating)).toBe(false);
}

async function showSection(page) {
  const root = page.locator(rootSelector);
  await root.evaluate((node) => node.scrollIntoView({ block: "center", behavior: "instant" }));
  await expect(root.locator('[data-engagements-slide-status="active"]')).toHaveCount(1);
  return root;
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("builds ticks, wraps controls, updates palette, shape, tooltip, and nav", async ({ page }) => {
  const root = await showSection(page);
  await expect(root.locator(".engagements_tick")).toHaveCount(20);
  await expect(root.locator("[data-engagements-tick]")).toHaveCount(6);
  await expect(root.locator("[data-engagements-tick-status=active]")).toHaveCount(1);
  expect(await root.locator("[data-engagements-tick]").evaluateAll((markers) => markers.map((marker) => marker.tagName))).toEqual([
    "BUTTON", "BUTTON", "BUTTON", "BUTTON", "BUTTON", "BUTTON",
  ]);

  const before = await root.evaluate((node) => ({
    nav: parseFloat(getComputedStyle(node.querySelector("[data-engagements-nav]")).getPropertyValue("--eng-nav-x")),
    radius: getComputedStyle(node.querySelector("[data-engagements-media]")).borderTopLeftRadius,
  }));
  const samples = await root.evaluate((node) => {
    node.querySelector("[data-engagements-next]").click();
    const duration = node._engagementsTimelineInstance.master.duration();
    node.querySelector("[data-engagements-next]").click();
    const media = node.querySelector("[data-engagements-media]");
    const tooltip = node.querySelector("[data-engagements-tooltip]");
    const frames = [];
    return new Promise((resolve) => {
      const sample = () => {
        frames.push({
          nav: parseFloat(getComputedStyle(node.querySelector("[data-engagements-nav]")).getPropertyValue("--eng-nav-x")),
          radius: getComputedStyle(media).borderTopLeftRadius,
          tooltipOpacity: parseFloat(getComputedStyle(tooltip).opacity),
        });
        if (!node._engagementsTimelineInstance?.isAnimating) resolve({ duration, frames });
        else requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
  });
  expect(samples.duration).toBeLessThanOrEqual(0.9);
  expect(samples.frames.some((sample) => sample.nav > before.nav)).toBe(true);
  expect(samples.frames.some((sample) => sample.radius !== before.radius)).toBe(true);
  expect(samples.frames.some((sample) => sample.tooltipOpacity < 0.5)).toBe(true);
  await settle(root);
  // The second synchronous NEXT click is ignored while the first transition is running.
  await expect(root).toHaveAttribute("data-engagements-active", "2");
  await expect(root).not.toHaveAttribute("data-engagements-active", "3");
  expect(await root.locator('[data-engagements-bg-status="active"]').evaluate((layer) => getComputedStyle(layer).getPropertyValue("--eng-c1").trim())).toBe("#f27c38");
  await expect(root.locator("[data-engagements-media]")).toHaveAttribute("data-engagements-shape", "circle");
  await expect(root.locator("[data-engagements-tooltip]")).toHaveText("28 November 2025");
  expect(parseFloat(await root.locator("[data-engagements-nav]").evaluate((node) => getComputedStyle(node).getPropertyValue("--eng-nav-x")))).toBeGreaterThan(before.nav);

  const activeTip = await root.locator(".engagements_nav-wrap").evaluate((node) => parseFloat(getComputedStyle(node).getPropertyValue("--eng-tip-x")));
  const marker = root.locator('[data-engagements-tick-index="3"]');
  await marker.hover();
  await expect(root.locator("[data-engagements-tooltip]")).toHaveText("7–8 April 2026");
  await expect.poll(() => root.locator(".engagements_nav-wrap").evaluate((node) => parseFloat(getComputedStyle(node).getPropertyValue("--eng-tip-x")))).not.toBe(activeTip);
  await root.locator("[data-engagements-nav]").hover();
  await expect(root.locator("[data-engagements-tooltip]")).toHaveText("28 November 2025");
  await expect.poll(() => root.locator(".engagements_nav-wrap").evaluate((node) => parseFloat(getComputedStyle(node).getPropertyValue("--eng-tip-x")))).toBe(activeTip);

  await root.locator("[data-engagements-prev]").click();
  await settle(root);
  await expect(root).toHaveAttribute("data-engagements-active", "1");
  await root.locator("[data-engagements-prev]").click();
  await settle(root);
  await expect(root).toHaveAttribute("data-engagements-active", "6");
});

test("jumps by marker and responds to arrows only while visible", async ({ page }) => {
  const root = await showSection(page);
  await root.locator('[data-engagements-tick-index="3"]').click();
  await settle(root);
  await expect(root).toHaveAttribute("data-engagements-active", "4");
  await page.keyboard.press("ArrowRight");
  await settle(root);
  await expect(root).toHaveAttribute("data-engagements-active", "5");
});

test("reduced motion still changes state with crossfades", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  const root = await showSection(page);
  await expect(root.locator(".text-line")).toHaveCount(0);
  await root.locator("[data-engagements-next]").click();
  await settle(root);
  await expect(root).toHaveAttribute("data-engagements-active", "2");
  await expect(root.locator("[data-engagements-media]")).toHaveAttribute("data-engagements-shape", "circle");
});
