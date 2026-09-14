import { test, expect } from "@playwright/test";

const deck = "[data-tabs-panel=learn] [data-deck-init]";

function rotation(transform) {
  const values = transform.match(/matrix\(([^)]+)\)/)?.[1].split(",").map(Number);
  return Math.atan2(values?.[1] || 0, values?.[0] || 1) * 180 / Math.PI;
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
});

test("fans a deck, expands to a marquee, pauses, and collapses back", async ({ page }) => {
  const root = page.locator(deck);
  const cards = root.locator("[data-deck-card]");
  const rest = await root.locator("[data-deck-viewport]").evaluate((viewport) => {
    const viewportBox = viewport.getBoundingClientRect();
    return [...viewport.querySelectorAll("[data-deck-card]")].map((card) => {
      const box = card.getBoundingClientRect();
      return { center: [box.left + box.width / 2, box.top + box.height / 2], transform: getComputedStyle(card).transform };
    }).map((card) => ({ ...card, viewportCenter: [viewportBox.left + viewportBox.width / 2, viewportBox.top + viewportBox.height / 2] }));
  });
  // Cards behind the top card fan out by up to 6 × 6px (depth 6), so the
  // centre tolerance covers the deepest offset plus rounding.
  for (const card of rest) {
    expect(Math.abs(card.center[0] - card.viewportCenter[0])).toBeLessThan(40);
    expect(Math.abs(card.center[1] - card.viewportCenter[1])).toBeLessThan(40);
  }
  expect(rotation(rest[0].transform)).toBeCloseTo(-3, 1);
  expect(new Set(rest.slice(1, 4).map((card) => Math.round(rotation(card.transform)))).size).toBeGreaterThan(1);
  const stackedPaint = await cards.evaluateAll((cardNodes) => cardNodes.map((card) => ({ zIndex: Number(getComputedStyle(card).zIndex), boxShadow: getComputedStyle(card).boxShadow })));
  expect(stackedPaint[0].zIndex).toBe(Math.max(...stackedPaint.map((card) => card.zIndex)));
  expect(stackedPaint[0].boxShadow).not.toBe("none");
  expect(stackedPaint.at(-1).boxShadow).toBe("none");
  await expect(root).toHaveAttribute("data-deck-state", "stacked");
  await expect(root).toHaveAttribute("role", "button");
  await expect(cards.first()).toHaveAttribute("tabindex", "-1");
  const hash = await page.evaluate(() => location.hash);
  await cards.first().click();
  expect(await page.evaluate(() => location.hash)).toBe(hash);
  await expect(root).toHaveAttribute("data-deck-state", "expanded");
  const expanded = await root.locator("[data-deck-card]").evaluateAll((cardNodes) => cardNodes.map((card) => {
    const box = card.getBoundingClientRect();
    return { left: box.left, top: box.top, width: box.width, rotation: Math.atan2(new DOMMatrix(getComputedStyle(card).transform).b, new DOMMatrix(getComputedStyle(card).transform).a) * 180 / Math.PI };
  }));
  expect(Math.max(...expanded.map((card) => card.top)) - Math.min(...expanded.map((card) => card.top))).toBeLessThanOrEqual(1);
  for (let index = 0; index < expanded.length; index += 1) {
    expect(expanded[index].rotation).toBeCloseTo(0, 1);
    if (index) expect(expanded[index].left - expanded[index - 1].left).toBeCloseTo(expanded[index - 1].width + 24, 1);
  }
  await expect(root.locator("[data-deck-clone]").first()).toHaveAttribute("aria-hidden", "true");
  await expect(root.locator("[data-deck-collapse]")).toBeVisible();
  await expect(cards.first()).not.toHaveAttribute("tabindex", /.+/);
  const expandedShadows = await cards.evaluateAll((cardNodes) => cardNodes.map((card) => getComputedStyle(card).boxShadow));
  expandedShadows.forEach((shadow) => expect(shadow).not.toBe("none"));

  const before = await root.locator("[data-deck-track]").evaluate((el) => el.getBoundingClientRect().left);
  await page.mouse.move(5, 5);
  await page.waitForTimeout(100);
  const after = await root.locator("[data-deck-track]").evaluate((el) => el.getBoundingClientRect().left);
  expect(after).toBeLessThan(before);
  await root.locator("[data-deck-viewport]").hover();
  const paused = await root.locator("[data-deck-track]").evaluate((el) => el.getBoundingClientRect().left);
  await page.waitForTimeout(100);
  expect(await root.locator("[data-deck-track]").evaluate((el) => el.getBoundingClientRect().left)).toBeCloseTo(paused, 0);

  await root.locator("[data-deck-collapse]").click();
  await expect(root).toHaveAttribute("data-deck-state", "stacked");
  await expect(root.locator("[data-deck-clone]")).toHaveCount(0);
  await expect(root).toHaveAttribute("role", "button");
});

test("shows visible stagger during expansion and supports three complete cycles", async ({ page }) => {
  const root = page.locator(deck);
  const cards = root.locator("[data-deck-card]");
  const samplesPromise = page.evaluate(() => new Promise((resolve) => {
    const root = document.querySelector("[data-tabs-panel=learn] [data-deck-init]");
    const cards = [...root.querySelectorAll("[data-deck-card]")];
    const samples = [];
    // Time the transition itself, from the first "expanding" frame, so the
    // click's dispatch latency is not counted against the 1.2 s budget.
    let started = null;
    const sample = () => {
      if (root.dataset.deckState === "expanding") {
        started ??= performance.now();
        samples.push(cards.slice(0, 3).map((card) => getComputedStyle(card).transform));
      }
      if (root.dataset.deckState === "expanded") resolve({ elapsed: performance.now() - started, samples });
      else requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }));
  await cards.first().click();
  const expansion = await samplesPromise;
  expect(expansion.elapsed).toBeLessThanOrEqual(1200);
  expect(expansion.samples.some((sample) => new Set(sample).size > 1)).toBe(true);

  for (let cycle = 0; cycle < 3; cycle += 1) {
    await root.locator("[data-deck-collapse]").click();
    await expect(root).toHaveAttribute("data-deck-state", "stacked");
    if (cycle < 2) {
      await cards.first().click();
      await expect(root).toHaveAttribute("data-deck-state", "expanded");
    }
  }
});

test("keyboard activation restores the stacked button contract", async ({ page }) => {
  const root = page.locator(deck);
  await root.focus();
  await root.press("Enter");
  await expect(root).toHaveAttribute("data-deck-state", "expanded");
  await expect(root).not.toHaveAttribute("role", /.+/);
  await expect(root).not.toHaveAttribute("aria-label", /.+/);
  await root.locator("[data-deck-collapse]").click();
  await expect(root).toHaveAttribute("role", "button");
  await expect(root).toHaveAttribute("aria-label", "Reveal all cards");
});

test("keeps a clone set at the marquee seam", async ({ page }) => {
  const root = page.locator(deck);
  await root.click();
  await expect(root.locator("[data-deck-clone]")).toHaveCount(19);
  const visibleAtLeft = () => root.locator("[data-deck-viewport]").evaluate((viewport) => {
    const box = viewport.getBoundingClientRect();
    return Boolean(document.elementFromPoint(box.left + 2, box.top + box.height / 2)?.closest("[data-deck-card]"));
  });
  expect(await visibleAtLeft()).toBe(true);
  await root.evaluate((element) => { element._deckInstance.offset = -element._deckInstance.setWidth - 1; });
  await page.waitForTimeout(40);
  expect(await visibleAtLeft()).toBe(true);
});

test("reduced motion uses a native scrolling row without a marquee", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  const root = page.locator(deck);
  await root.click();
  await expect(root).toHaveAttribute("data-deck-state", "expanded");
  await expect(root.locator("[data-deck-clone]")).toHaveCount(0);
  await expect(root.locator("[data-deck-viewport]")).toHaveCSS("overflow-x", "auto");
});
