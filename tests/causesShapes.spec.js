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
const paddingValues = {
  square: [10, 10, 10, 10],
  circle: [10, 10, 10, 10],
  "leaf-a": [10, 10, 10, 10],
  "leaf-b": [10, 10, 10, 10],
  "quarter-tl": [28, 8, 8, 28],
  "quarter-tr": [28, 28, 8, 8],
  "quarter-br": [8, 28, 28, 8],
  "quarter-bl": [8, 8, 28, 28],
};
const quarterShapes = ["quarter-tl", "quarter-tr", "quarter-br", "quarter-bl"];

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

test("keeps every causes label corner inside quarter-round tiles while morphing", async ({ page }) => {
  for (const width of [1440, 991, 479]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const initialPaddings = await page.locator(tile).evaluateAll((tiles) =>
      tiles.map((element) => {
        const styles = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return {
          shape: element.dataset.causesShape,
          padding: [
            styles.paddingTop,
            styles.paddingRight,
            styles.paddingBottom,
            styles.paddingLeft,
          ].map((value) => parseFloat(value) / rect.width * 100),
        };
      }),
    );
    initialPaddings.forEach(({ shape, padding }) => {
      padding.forEach((value, index) => {
        expect(value).toBeCloseTo(paddingValues[shape][index], 1);
      });
    });

    for (const targetShape of quarterShapes) {
      const violations = await page.locator(section).evaluate((root, target) => {
        const instance = root._causesShapes;
        const targetTile = instance.tiles[0];
        targetTile.dataset.causesShape = "square";
        targetTile.style.borderRadius = "15% 15% 15% 15%";
        targetTile.style.padding = "10% 10% 10% 10%";
        const tween = instance.morphTo(0, target);
        const progressValues = [0, 0.25, 0.5, 0.75, 1];
        const cornerNames = ["top-left", "top-right", "bottom-right", "bottom-left"];
        const pointsFor = (rect) => [
          [rect.left, rect.top],
          [rect.right, rect.top],
          [rect.right, rect.bottom],
          [rect.left, rect.bottom],
        ];
        const violations = [];

        progressValues.forEach((progress) => {
          tween.progress(progress);
          const tileRect = targetTile.getBoundingClientRect();
          const styles = getComputedStyle(targetTile);
          const radii = [
            styles.borderTopLeftRadius,
            styles.borderTopRightRadius,
            styles.borderBottomRightRadius,
            styles.borderBottomLeftRadius,
          ].map((value) => parseFloat(value) / tileRect.width);
          const paragraphs = [...targetTile.querySelectorAll("p")];

          paragraphs.forEach((paragraph) => {
            pointsFor(paragraph.getBoundingClientRect()).forEach(([x, y], index) => {
              const localX = (x - tileRect.left) / tileRect.width;
              const localY = (y - tileRect.top) / tileRect.width;
              const radius = radii[index];
              const inCornerSquare = [
                localX < radius && localY < radius,
                localX > 1 - radius && localY < radius,
                localX > 1 - radius && localY > 1 - radius,
                localX < radius && localY > 1 - radius,
              ][index];
              if (!inCornerSquare) return;

              const centerX = index === 0 || index === 3 ? radius : 1 - radius;
              const centerY = index === 0 || index === 1 ? radius : 1 - radius;
              const distance = Math.hypot(localX - centerX, localY - centerY);
              if (distance > radius + 0.01) {
                violations.push({
                  progress,
                  paragraph: paragraph.className,
                  corner: cornerNames[index],
                  distance,
                  radius,
                });
              }
            });
          });
        });
        tween.kill();
        return violations;
      }, targetShape);
      expect(violations, `${width}px ${targetShape}`).toEqual([]);
    }
  }
});
