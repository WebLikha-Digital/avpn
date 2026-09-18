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
const shapeRadii = {
  square: "15% 15% 15% 15%",
  circle: "50% 50% 50% 50%",
  "leaf-a": "25% 0% 25% 0%",
  "leaf-b": "0% 25% 0% 25%",
  "quarter-tl": "100% 0% 0% 0%",
  "quarter-tr": "0% 100% 0% 0%",
  "quarter-br": "0% 0% 100% 0%",
  "quarter-bl": "0% 0% 0% 100%",
};
const shapeNames = Object.keys(shapeRadii);
const fitTolerance = 0.02;
// Authored shapes are checked loosely, only to catch a start shape that visibly
// spills; the original Climate quarter-tl measured 1.14–1.20. The morph rule
// is stricter.
const authoredTolerance = 0.06;

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

function fitsBoxes(boxes, radii, tolerance = fitTolerance) {
  const centers = [
    (radius) => [radius, radius],
    (radius) => [1 - radius, radius],
    (radius) => [1 - radius, 1 - radius],
    (radius) => [radius, 1 - radius],
  ];
  return boxes.length > 0 && boxes.every((box) =>
    [
      [box.left, box.top],
      [box.right, box.top],
      [box.right, box.bottom],
      [box.left, box.bottom],
    ].every(([x, y]) =>
      radii.every((radius, index) => {
        if (radius <= 0) return true;
        const inCornerSquare = [
          x <= radius && y <= radius,
          x >= 1 - radius && y <= radius,
          x >= 1 - radius && y >= 1 - radius,
          x <= radius && y >= 1 - radius,
        ][index];
        if (!inCornerSquare) return true;
        const [centerX, centerY] = centers[index](radius);
        return Math.hypot(x - centerX, y - centerY) <= radius * (1 + tolerance);
      }),
    ),
  );
}

async function independentFits(page, shapeName, tolerance = fitTolerance) {
  return page.locator(tile).evaluateAll((tiles, authoredRadii) => {
    return tiles.map((element) => {
      const tileRect = element.getBoundingClientRect();
      const boxes = [];
      element.querySelectorAll("p").forEach((paragraph) => {
        const range = document.createRange();
        range.selectNodeContents(paragraph);
        const styles = getComputedStyle(paragraph);
        const lineHeight = parseFloat(styles.lineHeight);
        const fontSize = parseFloat(styles.fontSize);
        const inset = Number.isFinite(lineHeight) && Number.isFinite(fontSize)
          ? (lineHeight - fontSize) / 2
          : 0;
        [...range.getClientRects()].forEach((rect) => {
          if (rect.width === 0 || rect.height === 0) return;
          boxes.push({
            left: (rect.left - tileRect.left) / tileRect.width,
            top: (rect.top + inset - tileRect.top) / tileRect.width,
            right: (rect.right - tileRect.left) / tileRect.width,
            bottom: (rect.bottom - inset - tileRect.top) / tileRect.width,
          });
        });
      });
      return {
        boxes,
        radii: authoredRadii.split(" ").map((radius) => parseFloat(radius) / 100),
      };
    });
  }, shapeRadii[shapeName]).then((measurements) =>
    measurements.map(({ boxes, radii }) => fitsBoxes(boxes, radii, tolerance)),
  );
}

test("fitsShape matches the independent geometry check at every breakpoint", async ({ page }) => {
  for (const width of [1440, 991, 479]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const result = await page.locator(section).evaluate((root, names) => {
      const instance = root._causesShapes;
      return {
        authored: instance.tiles.map((tile) => tile.dataset.causesShape),
        actual: instance.tiles.map((_, tileIndex) =>
          names.map((shapeName) => instance.fitsShape(tileIndex, shapeName)),
        ),
      };
    }, shapeNames);

    for (const shapeName of shapeNames) {
      expect(result.actual.map((tile) => tile[shapeNames.indexOf(shapeName)])).toEqual(
        await independentFits(page, shapeName),
      );
    }
    const authoredFits = await Promise.all(
      result.authored.map((shapeName) =>
        independentFits(page, shapeName, authoredTolerance),
      ),
    );
    for (const [index, shapeName] of result.authored.entries()) {
      expect(authoredFits[index][index]).toBe(true);
    }
  }
});

test("never morphs a tile into a shape that spills its live text box", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const violations = await page.locator(section).evaluate((root, tolerance) => {
    const instance = root._causesShapes;
    const failures = [];
    for (let swap = 0; swap < instance.tiles.length * 2; swap += 1) {
      instance.swapNext();
      instance.currentTween?.progress(1);
      instance.tiles.forEach((element, index) => {
        const tileRect = element.getBoundingClientRect();
        const boxes = [];
        element.querySelectorAll("p").forEach((paragraph) => {
          const range = document.createRange();
          range.selectNodeContents(paragraph);
          const paragraphStyles = getComputedStyle(paragraph);
          const lineHeight = parseFloat(paragraphStyles.lineHeight);
          const fontSize = parseFloat(paragraphStyles.fontSize);
          const inset = Number.isFinite(lineHeight) && Number.isFinite(fontSize)
            ? (lineHeight - fontSize) / 2
            : 0;
          [...range.getClientRects()].forEach((rect) => {
            if (rect.width === 0 || rect.height === 0) return;
            boxes.push({
              left: (rect.left - tileRect.left) / tileRect.width,
              top: (rect.top + inset - tileRect.top) / tileRect.width,
              right: (rect.right - tileRect.left) / tileRect.width,
              bottom: (rect.bottom - inset - tileRect.top) / tileRect.width,
            });
          });
        });
        const styles = getComputedStyle(element);
        const radii = [
          styles.borderTopLeftRadius,
          styles.borderTopRightRadius,
          styles.borderBottomRightRadius,
          styles.borderBottomLeftRadius,
        ].map((radius) =>
          radius.endsWith("%")
            ? parseFloat(radius) / 100
            : parseFloat(radius) / tileRect.width,
        );
        const centers = [
          (radius) => [radius, radius],
          (radius) => [1 - radius, radius],
          (radius) => [1 - radius, 1 - radius],
          (radius) => [radius, 1 - radius],
        ];
        const fits = boxes.length > 0 && boxes.every((box) =>
          [
            [box.left, box.top],
            [box.right, box.top],
            [box.right, box.bottom],
            [box.left, box.bottom],
          ].every(([x, y]) =>
            radii.every((radius, cornerIndex) => {
              if (radius <= 0) return true;
              const inCornerSquare = [
                x <= radius && y <= radius,
                x >= 1 - radius && y <= radius,
                x >= 1 - radius && y >= 1 - radius,
                x <= radius && y >= 1 - radius,
              ][cornerIndex];
              if (!inCornerSquare) return true;
              const [centerX, centerY] = centers[cornerIndex](radius);
              return Math.hypot(x - centerX, y - centerY) <= radius * (1 + tolerance);
            }),
          ),
        );
        if (!fits) failures.push({ swap, index });
      });
    }
    return failures;
  }, fitTolerance);
  expect(violations).toEqual([]);
});

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
