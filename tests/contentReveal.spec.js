import { test, expect } from "@playwright/test";

async function scrollToGroup(page, testId) {
  const top = await page.getByTestId(testId).evaluate(
    (group) => group.getBoundingClientRect().top + window.scrollY,
  );
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), top);
}

/**
 * Reads each item's opacity at a fixed point inside the reveal, by seeking the
 * group's own timeline rather than waiting for it to play.
 *
 * Sampling a running reveal is not viable on this page. A scroll jump costs
 * roughly half a second of frame time — Locomotive, the WebGL previews and a
 * ScrollTrigger refresh all land together — so requestAnimationFrame can skip
 * the whole stagger span, and under parallel workers it skips the reveal
 * entirely. Seeking makes the reading exact and independent of machine load.
 */
async function opacitiesAt(page, testId, selector, seconds) {
  return page.evaluate(({ testId, selector, seconds }) => {
    const group = document.querySelector(`[data-testid="${testId}"]`);
    const { timeline } = group._contentRevealInstance;

    timeline.pause();
    timeline.seek(seconds);

    return [...group.querySelectorAll(selector)].map((item) =>
      Number.parseFloat(getComputedStyle(item).opacity),
    );
  }, { testId, selector, seconds });
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
});

test("reveals a flat group from a hidden state in DOM order", async ({ page }) => {
  const items = page.getByTestId("reveal-flat").locator(":scope > *");

  await expect(items).toHaveCount(4);
  await expect.poll(() => items.evaluateAll((nodes) =>
    nodes.map((node) => getComputedStyle(node).visibility),
  )).toEqual(["hidden", "hidden", "hidden", "hidden"]);

  await scrollToGroup(page, "reveal-flat");

  // Default 100ms stagger, so the four start at 0, 0.1, 0.2 and 0.3. Seeking to
  // 0.5 puts every one of them mid-tween. Strictly decreasing across the four is
  // the stagger; a simultaneous reveal would read as four equal values.
  const spread = await opacitiesAt(page, "reveal-flat", ":scope > *", 0.5);
  spread.slice(1).forEach((value, index) => {
    expect(value, `item ${index + 1} should trail item ${index}`).toBeLessThan(
      spread[index],
    );
  });
  expect(spread[0]).toBeGreaterThan(0);

  await page.evaluate(() => {
    document.querySelector('[data-testid="reveal-flat"]')._contentRevealInstance.timeline.play();
  });
  await expect.poll(() => items.evaluateAll((nodes) =>
    nodes.every((node) =>
      getComputedStyle(node).visibility === "visible" &&
      getComputedStyle(node).transform === "none"
    ),
  )).toBe(true);
});

test("data-ignore=true leaves that direct child untouched", async ({ page }) => {
  const group = page.getByTestId("reveal-ignore");
  const items = group.locator(":scope > *");

  await expect.poll(() => items.evaluateAll((nodes) =>
    nodes.map((node) => getComputedStyle(node).visibility),
  )).toEqual(["hidden", "visible", "hidden", "hidden"]);
  await expect(items.nth(1)).toHaveCSS("transform", "none");

  await scrollToGroup(page, "reveal-ignore");
  await expect.poll(() => items.evaluateAll((nodes) =>
    nodes.every((node) => getComputedStyle(node).visibility === "visible"),
  )).toBe(true);
});

test("nested children reveal in their own sequence at the parent slot", async ({ page }) => {
  const group = page.getByTestId("reveal-nested");
  const nestedParent = group.locator(":scope > *").nth(1);
  const nestedItems = group.locator("[data-reveal-group-nested] > *");

  await expect.poll(() => nestedItems.evaluateAll((nodes) =>
    nodes.map((node) => getComputedStyle(node).visibility),
  )).toEqual(["hidden", "hidden", "hidden"]);
  await expect(nestedParent).toHaveCSS("transform", "none");

  await scrollToGroup(page, "reveal-nested");

  const spread = await opacitiesAt(
    page,
    "reveal-nested",
    "[data-reveal-group-nested] > *",
    // The nested block is the group's second slot (0.1s) and staggers its own
    // children by 150ms, so they start at 0.1, 0.25 and 0.4.
    0.7,
  );
  spread.slice(1).forEach((value, index) => {
    expect(value, `nested ${index + 1} should trail nested ${index}`).toBeLessThan(
      spread[index],
    );
  });
  expect(spread[0]).toBeGreaterThan(0);
  await expect(nestedParent).toHaveCSS("transform", "none");
});

test("reduced motion leaves reveal content visible and unanimated", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await page.waitForLoadState("networkidle");

  const targets = page.locator(
    "[data-reveal-group] > *, [data-reveal-group-nested] > *",
  );
  expect(await targets.evaluateAll((nodes) => nodes.every((node) => {
    const styles = getComputedStyle(node);
    return styles.visibility === "visible" && styles.transform === "none";
  }))).toBe(true);
  expect(await page.getByTestId("reveal-flat").evaluate(
    (group) => group._contentRevealInstance ?? null,
  )).toBeNull();
});

test("re-initializing replaces triggers and hidden state instead of stacking", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { initContentReveal } = await import("/src/animations/contentReveal.js");
    const { ScrollTrigger } = await import("/src/lib/gsap.js");
    const group = document.querySelector('[data-testid="reveal-flat"]');

    initContentReveal();
    initContentReveal();

    return {
      triggers: ScrollTrigger.getAll().filter((trigger) => trigger.vars.trigger === group).length,
      hasInstance: Boolean(group._contentRevealInstance),
      hidden: [...group.children].every(
        (item) => getComputedStyle(item).visibility === "hidden",
      ),
    };
  });

  expect(result).toEqual({ triggers: 1, hasInstance: true, hidden: true });
});
