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

test("builds ticks, wraps controls, updates palette, drum, and nav", async ({ page }) => {
  const root = await showSection(page);
  await expect(root.locator(".engagements_tick")).toHaveCount(20);
  await expect(root.locator("[data-engagements-tick]")).toHaveCount(6);
  await expect(root.locator("[data-engagements-tick-status=active]")).toHaveCount(1);
  const tickDistances = await root.locator(".engagements_tick").evaluateAll((ticks) => ticks.map((tick) => Number(tick.style.getPropertyValue("--distance"))));
  [
    -2 / 3, -1 / 3, 0, 1 / 3, 2 / 3, 1, 4 / 3, 5 / 3, 2, 7 / 3,
    8 / 3, 3, 10 / 3, 11 / 3, 4, 13 / 3, 14 / 3, 5, 16 / 3, 17 / 3,
  ].forEach((expected, index) => expect(tickDistances[index]).toBeCloseTo(expected, 3));
  await expect(root.locator("[data-engagements-tooltip-item]")).toHaveCount(6);
  await expect(root.locator('[data-engagements-tooltip-status="active"]')).toHaveCount(1);
  await expect(root.locator('[data-engagements-tooltip-status="active"]')).toHaveText("14 November 2025");
  expect(await root.locator("[data-engagements-tick]").evaluateAll((markers) => markers.map((marker) => marker.tagName))).toEqual([
    "BUTTON", "BUTTON", "BUTTON", "BUTTON", "BUTTON", "BUTTON",
  ]);

  const before = await root.evaluate((node) => ({
    nav: parseFloat(getComputedStyle(node.querySelector("[data-engagements-nav]")).getPropertyValue("--eng-nav-x")),
    radius: getComputedStyle(node.querySelector("[data-engagements-media]")).borderTopLeftRadius,
  }));
  const samples = await root.evaluate((node) => {
    node.querySelector("[data-engagements-next]").click();
    const master = node._engagementsTimelineInstance.master;
    const duration = master.duration();
    const media = node.querySelector("[data-engagements-media]");
    const incomingLine = node.querySelector('[data-engagements-slide-status="active"] .text-line');
    const frames = [];
    return new Promise((resolve) => {
      const sample = () => {
        frames.push({
          nav: parseFloat(getComputedStyle(node.querySelector("[data-engagements-nav]")).getPropertyValue("--eng-nav-x")),
          radius: getComputedStyle(media).borderTopLeftRadius,
          incomingY: incomingLine?._gsap?.yPercent,
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
  expect(samples.frames.some((sample) => sample.incomingY > 0)).toBe(true);
  await settle(root);
  await expect(root).toHaveAttribute("data-engagements-active", "2");
  await expect(root).not.toHaveAttribute("data-engagements-active", "3");
  expect(await root.locator('[data-engagements-bg-status="active"]').evaluate((layer) => getComputedStyle(layer).getPropertyValue("--eng-c1").trim())).toBe("#f27c38");
  await expect(root.locator("[data-engagements-media]")).toHaveAttribute("data-engagements-shape", "circle");
  await expect(root.locator('[data-engagements-tooltip-status="active"]')).toHaveText("28 November 2025");
  expect(await root.locator('[data-engagements-tooltip-item]').evaluateAll((items) => items.map((item) => ({
    text: item.textContent,
    distance: Number(item.style.getPropertyValue("--distance")),
    status: item.dataset.engagementsTooltipStatus,
  })))).toEqual([
    { text: "14 November 2025", distance: -1, status: "not-active" },
    { text: "28 November 2025", distance: 0, status: "active" },
    { text: "10–12 March 2026", distance: 1, status: "not-active" },
    { text: "7–8 April 2026", distance: 2, status: "not-active" },
    { text: "5 June 2026", distance: 3, status: "not-active" },
    { text: "11 June 2026", distance: 4, status: "not-active" },
  ]);
  expect(parseFloat(await root.locator("[data-engagements-nav]").evaluate((node) => getComputedStyle(node).getPropertyValue("--eng-nav-x")))).toBeGreaterThan(before.nav);

  const activeTip = await root.locator(".engagements_nav-wrap").evaluate((node) => parseFloat(getComputedStyle(node).getPropertyValue("--eng-tip-x")));
  const marker = root.locator('[data-engagements-tick-index="3"]');
  await marker.hover();
  await expect(root.locator('[data-engagements-tooltip-status="active"]')).toHaveText("7–8 April 2026");
  await expect(root.locator('[data-engagements-tooltip-item]').nth(3)).toHaveCSS("--distance", "0");
  await expect(root.locator('[data-engagements-tooltip-item]').nth(1)).toHaveCSS("--distance", "-2");
  await expect.poll(() => root.locator(".engagements_nav-wrap").evaluate((node) => parseFloat(getComputedStyle(node).getPropertyValue("--eng-tip-x")))).not.toBe(activeTip);
  await root.locator("[data-engagements-nav]").hover();
  await expect(root.locator('[data-engagements-tooltip-status="active"]')).toHaveText("28 November 2025");
  await expect(root.locator('[data-engagements-tooltip-item]').nth(1)).toHaveCSS("--distance", "0");
  await expect.poll(() => root.locator(".engagements_nav-wrap").evaluate((node) => parseFloat(getComputedStyle(node).getPropertyValue("--eng-tip-x")))).toBe(activeTip);

  const prevSamples = await root.evaluate((node) => {
    node.querySelector("[data-engagements-prev]").click();
    const incomingLine = node.querySelector('[data-engagements-slide-status="active"] .text-line');
    const frames = [];
    return new Promise((resolve) => {
      const sample = () => {
        frames.push(incomingLine?._gsap?.yPercent);
        if (!node._engagementsTimelineInstance?.isAnimating) resolve(frames);
        else requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
  });
  expect(prevSamples.some((yPercent) => yPercent < 0)).toBe(true);
  await expect(root).toHaveAttribute("data-engagements-active", "1");
  await expect(root).toHaveAttribute("data-engagements-direction", "prev");
  await root.locator("[data-engagements-prev]").click();
  await settle(root);
  await expect(root).toHaveAttribute("data-engagements-active", "6");
  await expect(root).toHaveAttribute("data-engagements-direction", "prev");
  await root.locator("[data-engagements-next]").click();
  await settle(root);
  await expect(root).toHaveAttribute("data-engagements-active", "1");
  await expect(root).toHaveAttribute("data-engagements-direction", "next");
});

test("jumps by marker and responds to arrows only while visible", async ({ page }) => {
  const root = await showSection(page);
  await root.locator('[data-engagements-tick-index="2"]').click();
  await settle(root);
  await expect(root).toHaveAttribute("data-engagements-active", "3");
  await expect(root.locator('[data-engagements-tick-index="2"]')).toHaveCSS("--distance", "0");
  await expect(root.locator('[data-engagements-tick-index="0"]')).toHaveCSS("--distance", "-2");
  await expect(root).toHaveAttribute("data-engagements-direction", "next");
  await root.locator('[data-engagements-tick-index="4"]').click();
  await settle(root);
  await expect(root).toHaveAttribute("data-engagements-active", "5");
  await expect(root).toHaveAttribute("data-engagements-direction", "next");
  await root.locator('[data-engagements-tick-index="1"]').click();
  await settle(root);
  await expect(root).toHaveAttribute("data-engagements-active", "2");
  await expect(root).toHaveAttribute("data-engagements-direction", "prev");
  await page.keyboard.press("ArrowRight");
  await settle(root);
  await expect(root).toHaveAttribute("data-engagements-active", "3");
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
