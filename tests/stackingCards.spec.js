import { test, expect } from "@playwright/test";

const ROOT = "#faq";
const CARD = `${ROOT} [data-stacking-card]`;
const TARGET = `${CARD} [data-stacking-card-target]`;

async function loadFaq(page, width = 1440) {
  await page.setViewportSize({ width, height: 800 });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.locator(ROOT)).toBeVisible();
  await expect.poll(() => page.locator(TARGET).evaluateAll((targets) =>
    targets.every((target) => target.closest("#faq")._stackingCardsInstance),
  )).toBe(true);
}

async function triggerState(page) {
  return page.locator(ROOT).evaluate((root) => {
    const instance = root._stackingCardsInstance;
    return {
      tweens: instance?.tweens.length || 0,
      triggers: instance?.triggers.length || 0,
      scrollTriggers: instance?.tweens.map((tween) => tween.scrollTrigger?.id || null) || [],
      stickyTop: parseFloat(getComputedStyle(root.querySelector("[data-stacking-card]")).top),
    };
  });
}

test("does nothing when the stacking-cards section is absent", async ({ page }) => {
  await loadFaq(page);
  const result = await page.evaluate(async () => {
    const root = document.querySelector("#faq");
    root.remove();
    const { initStackingCards } = await import("/src/animations/stackingCards.js");
    initStackingCards();
    return document.querySelectorAll("[data-stacking-cards-init]").length;
  });
  expect(result).toBe(0);
});

test("cards lock at the sticky top and scrub card rotations during continuous scroll", async ({ page }) => {
  await loadFaq(page);
  const result = await page.evaluate(() => new Promise((resolve) => {
    const root = document.querySelector("#faq");
    const cards = [...root.querySelectorAll("[data-stacking-card]")];
    const targets = [...root.querySelectorAll("[data-stacking-card-target]")];
    const stickyTop = parseFloat(getComputedStyle(cards[0]).top);
    const lastLock = root._stackingCardsInstance.triggers.at(-1).start;
    const start = Math.max(0, root.getBoundingClientRect().top + window.scrollY - window.innerHeight / 2);
    const end = Math.min(
      document.documentElement.scrollHeight - window.innerHeight,
      lastLock + window.innerHeight,
    );
    const frames = [];
    let count = 0;

    const sample = () => {
      frames.push({
        scrollY: window.scrollY,
        listBottom: root.querySelector("[data-stacking-card-stack]").getBoundingClientRect().bottom,
        cards: cards.map((card, index) => {
          const rect = card.getBoundingClientRect();
          const target = targets[index];
          return {
            top: rect.top,
            bottom: rect.bottom,
            rotation: new DOMMatrixReadOnly(getComputedStyle(target).transform).b,
          };
        }),
      });
      count += 1;
      if (count >= 180) return resolve({ stickyTop, frames });
      window.scrollTo({ top: start + (end - start) * count / 179, behavior: "instant" });
      requestAnimationFrame(sample);
    };

    window.scrollTo({ top: start, behavior: "instant" });
    requestAnimationFrame(sample);
  }));

  expect(result.frames.length).toBeGreaterThan(100);
  for (let index = 0; index < result.frames[0].cards.length; index += 1) {
    if (index === result.frames[0].cards.length - 1) {
      const beforeLockIndex = result.frames.findIndex(({ cards }) =>
        cards[index].top >= result.stickyTop - 2,
      );
      const firstAtOrBelowLock = result.frames.findIndex(({ cards }, frameIndex) =>
        frameIndex > beforeLockIndex && cards[index].top <= result.stickyTop + 2,
      );
      expect(beforeLockIndex, "the last card should approach its sticky lock").toBeGreaterThanOrEqual(0);
      expect(firstAtOrBelowLock, "the last card should cross its sticky lock").toBeGreaterThan(beforeLockIndex);
      expect(
        Math.max(...result.frames.slice(firstAtOrBelowLock).map(({ cards }) => Math.abs(cards[index].rotation))),
        "the last card should reach its fallback rotation by its lock",
      ).toBeGreaterThan(0.01);
      continue;
    }

    const lockIndex = result.frames.findIndex(({ cards }) =>
      cards[index].top <= result.stickyTop + 2 && cards[index].top >= result.stickyTop - 2,
    );
    expect(lockIndex, `card ${index + 1} should reach its sticky lock`).toBeGreaterThanOrEqual(0);

    const lockedFrames = [];
    for (let frameIndex = lockIndex; frameIndex < result.frames.length; frameIndex += 1) {
      const frame = result.frames[frameIndex];
      const card = frame.cards[index];
      const stillStuck = card.top >= result.stickyTop - 2
        && card.top <= result.stickyTop + 2
        && frame.listBottom >= card.bottom - 2;
      if (!stillStuck) break;
      lockedFrames.push(frame);
    }

    expect(lockedFrames.length, `card ${index + 1} should remain locked while its list permits`).toBeGreaterThan(5);
    expect(lockedFrames.every(({ cards }) =>
      Math.abs(cards[index].top - result.stickyTop) <= 2,
    )).toBe(true);

    if (index > 0) {
      expect(
        Math.max(...lockedFrames.map(({ cards }) => Math.abs(cards[index].rotation))),
        `card ${index + 1} should scrub to its fallback rotation`,
      ).toBeGreaterThan(0.01);
    }
  }

  expect(Math.max(...result.frames.map(({ cards }) => Math.abs(cards[0].rotation)))).toBeLessThan(0.001);
});

test("bounces on a down-scroll lock and not on an up-scroll lock", async ({ page }) => {
  await loadFaq(page);
  const range = await page.locator(CARD).nth(0).evaluate((card) => {
    const trigger = card.closest("#faq")._stackingCardsInstance.triggers[0];
    return { start: trigger.start, end: trigger.end };
  });
  await page.evaluate((start) => window.scrollTo({ top: start - 80, behavior: "instant" }), range.start);
  await page.waitForTimeout(100);
  const down = await page.evaluate((start) => {
    window.scrollTo({ top: start + 20, behavior: "instant" });
    return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => {
      const target = document.querySelector("#faq [data-stacking-card-target]");
      resolve({ scale: new DOMMatrixReadOnly(getComputedStyle(target).transform).a });
    })));
  }, range.start);
  expect(down.scale).not.toBeCloseTo(1, 2);
  await page.waitForTimeout(1200);
  const upScales = await page.evaluate((start) => new Promise((resolve) => {
    window.scrollTo({ top: start - 80, behavior: "instant" });
    const samples = [];
    const started = performance.now();
    const sample = () => {
      const target = document.querySelector("#faq [data-stacking-card-target]");
      samples.push(new DOMMatrixReadOnly(getComputedStyle(target).transform).a);
      if (performance.now() - started >= 600) return resolve(samples);
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }), range.start);
  expect(upScales.length).toBeGreaterThan(20);
  expect(upScales.every((scale) => Math.abs(scale - 1) <= 0.005)).toBe(true);
});

test("rebuilds for tablet and mobile tiers, and honors disabled toggles", async ({ page }) => {
  await loadFaq(page, 1440);
  const desktop = await triggerState(page);
  await page.setViewportSize({ width: 991, height: 800 });
  await page.waitForTimeout(400);
  expect((await triggerState(page)).triggers).toBe(desktop.triggers);
  await page.locator(ROOT).evaluate((root) => root.setAttribute("data-stacking-cards-tablet", "false"));
  await page.evaluate(async () => {
    const { initStackingCards } = await import("/src/animations/stackingCards.js");
    initStackingCards();
  });
  expect((await triggerState(page)).triggers).toBe(0);
  await page.setViewportSize({ width: 767, height: 800 });
  await page.waitForTimeout(400);
  expect((await triggerState(page)).triggers).toBe(3);
});

test("re-init remains idempotent and copy is never clipped", async ({ page }) => {
  await loadFaq(page);
  const before = await triggerState(page);
  await page.locator(ROOT).evaluate(async () => {
    const { initStackingCards } = await import("/src/animations/stackingCards.js");
    initStackingCards();
    initStackingCards();
  });
  expect(await triggerState(page)).toMatchObject({ tweens: before.tweens, triggers: before.triggers });

  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await page.waitForTimeout(350);
    const clipped = await page.locator(TARGET).evaluateAll((targets) =>
      targets.map((target) => target.scrollHeight <= target.clientHeight),
    );
    expect(clipped, `FAQ text clipped at ${width}px`).toEqual([true, true, true]);
  }
});
