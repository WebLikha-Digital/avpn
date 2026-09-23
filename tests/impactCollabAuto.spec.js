import { test, expect } from "@playwright/test";

const grid = "[data-impact-auto]";
const tiles = `${grid} > *`;

// The bundle initializes before DOMContentLoaded, so the overrides have to be
// on the grid the moment it parses — a MutationObserver started at
// document_start is the only hook early enough.
async function useShortTimings(page, timings = { interval: 220, hold: 80, duration: 40 }) {
  await page.addInitScript((values) => {
    const apply = (root) => {
      if (!root) return false;
      root.setAttribute("data-impact-auto-interval", String(values.interval));
      root.setAttribute("data-impact-auto-hold", String(values.hold));
      root.setAttribute("data-impact-auto-duration", String(values.duration));
      return true;
    };

    // document, not documentElement — at document_start there is no <html> yet
    // and observe() would throw.
    const observer = new MutationObserver(() => {
      if (apply(document.querySelector("[data-impact-auto]"))) observer.disconnect();
    });
    observer.observe(document, { childList: true, subtree: true });
  }, timings);
}

// Locomotive drives the page, so ScrollTrigger reads window.scrollY rather than
// whatever scrollIntoViewIfNeeded moves — every other spec jumps the same way.
async function scrollToGrid(page) {
  const top = await page.locator(grid).evaluate(
    (node) => node.getBoundingClientRect().top + window.scrollY,
  );
  await page.evaluate((y) => window.scrollTo({ top: y - 200, behavior: "instant" }), top);
}

async function waitForInit(page) {
  await page.waitForFunction(() => document.querySelector("[data-impact-auto]")?._impactCollabAuto?.initialized);
}

test("stays idle while the grid is out of view", async ({ page }) => {
  await useShortTimings(page);
  await page.goto("/");
  await waitForInit(page);

  await expect.poll(() => page.locator(grid).evaluate((root) => ({
    picks: root._impactCollabAuto.pickHistory.length,
    autoTiles: root.querySelectorAll(":scope > .is-auto").length,
  })), { timeout: 900 }).toEqual({ picks: 0, autoTiles: 0 });
});

test("cycles through different tiles while the grid is in view", async ({ page }) => {
  await useShortTimings(page);
  await page.goto("/");
  await waitForInit(page);
  const root = page.locator(grid);
  await scrollToGrid(page);

  await expect.poll(() => root.evaluate((node) => node._impactCollabAuto.pickHistory.length), { timeout: 2500 })
    .toBeGreaterThanOrEqual(4);
  const picks = await root.evaluate((node) => node._impactCollabAuto.pickHistory);
  expect(new Set(picks).size).toBeGreaterThanOrEqual(2);
  expect(picks.every((pick, index) => index === 0 || pick !== picks[index - 1])).toBe(true);
});

test("removes the automatic shape after the hold", async ({ page }) => {
  // A slow interval next to a short hold leaves a long idle gap after the
  // first pick, so the assertion cannot race the tile being picked again.
  await useShortTimings(page, { interval: 1800, hold: 200, duration: 40 });
  await page.goto("/");
  await waitForInit(page);
  const root = page.locator(grid);
  await scrollToGrid(page);

  await expect.poll(() => root.evaluate((node) => node._impactCollabAuto.pickHistory.length), { timeout: 4000 })
    .toBeGreaterThan(0);
  const firstTileIndex = await root.evaluate((node) => node._impactCollabAuto.pickHistory[0]);
  // tiles is an absolute selector, so it is resolved from the page — chaining
  // it under root would look for a second [data-impact-auto] inside the grid.
  const firstTile = page.locator(tiles).nth(firstTileIndex);
  await expect.poll(() => firstTile.evaluate((node) => (
    !node.classList.contains("is-auto") && !node.style.getPropertyValue("--impact-tile-morph")
  )), { timeout: 1200 }).toBe(true);
});
