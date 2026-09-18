import { test, expect } from "@playwright/test";

const section = "[data-causes-init]";
const tile = `${section} [data-causes-tile]`;
const shapeValues = new Set([
  "15% 15% 15% 15%",
  "50% 50% 50% 50%",
  "25% 0% 25% 0%",
  "0% 25% 0% 25%",
  "100% 0% 0% 0%",
  "0% 100% 0% 0%",
  "0% 0% 100% 0%",
  "0% 0% 0% 100%",
]);

async function scrollIntoView(page) {
  await page.locator(section).scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
}

async function radii(page) {
  return page.locator(tile).evaluateAll((tiles) => tiles.map((element) => {
    const styles = getComputedStyle(element);
    return [
      styles.borderTopLeftRadius,
      styles.borderTopRightRadius,
      styles.borderBottomRightRadius,
      styles.borderBottomLeftRadius,
    ].join(" ");
  }));
}

test("morphs one visible tile to another authored shape", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const start = await radii(page);
  await scrollIntoView(page);
  await page.waitForTimeout(5000);

  const end = await radii(page);
  const changed = end.filter((value, index) => value !== start[index]);
  expect(changed).toHaveLength(1);
  expect(shapeValues.has(changed[0])).toBe(true);
});

test("reduced motion keeps all causes tiles unchanged", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const start = await radii(page);
  await scrollIntoView(page);
  await page.waitForTimeout(5000);
  expect(await radii(page)).toEqual(start);
  expect(await page.locator(section).evaluate((root) => root._causesShapes ?? null)).toBeNull();
});

test("sixteen swaps visit every tile once", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const visited = await page.locator(section).evaluate((root) => {
    const instance = root._causesShapes;
    const indices = [];
    const original = instance.tiles.map((tile) => tile.dataset.causesShape);
    for (let index = 0; index < instance.tiles.length; index += 1) {
      indices.push(instance.pattern[instance.patternIndex]);
      instance.swapNext();
      instance.currentTween.progress(1);
    }
    instance.tiles.forEach((tile, index) => {
      tile.dataset.causesShape = original[index];
    });
    return indices;
  });
  expect(new Set(visited).size).toBe(16);
});
