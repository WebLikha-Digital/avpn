import { test, expect } from "@playwright/test";

async function loadFixture(page, width) {
  await page.setViewportSize({ width, height: 800 });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.locator('[data-testid="text-fit-width"] [data-fit-width]')).toHaveCSS(
    "font-size",
    /.+/,
  );
}

async function measure(page) {
  return page.locator('[data-testid="text-fit-width"] [data-fit-width]').evaluate((el) => {
    const parent = el.parentElement;
    const style = getComputedStyle(parent);
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const rects = [];
    let node;
    while ((node = walker.nextNode())) {
      if (!node.nodeValue.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      rects.push(...range.getClientRects());
    }
    return {
      textWidth: Math.max(...rects.map((rect) => rect.right)) - Math.min(...rects.map((rect) => rect.left)),
      availableWidth:
        parent.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
      tops: rects.map((rect) => rect.top),
      whiteSpace: getComputedStyle(el).whiteSpace,
      fontSize: el.style.fontSize,
    };
  });
}

for (const width of [1440, 1024, 390]) {
  test(`fits the Foreword title at ${width}px without wrapping`, async ({ page }) => {
    await loadFixture(page, width);
    const result = await measure(page);

    expect(Math.abs(result.textWidth - result.availableWidth)).toBeLessThanOrEqual(
      Math.max(result.availableWidth * 0.002, 2),
    );
    expect(Math.max(...result.tops) - Math.min(...result.tops)).toBeLessThanOrEqual(1);
    expect(result.whiteSpace).toBe("nowrap");
    if (width === 1440) expect(Number.parseFloat(result.fontSize)).toBeGreaterThanOrEqual(60);
  });
}

test("refits after resize and remains stable across a re-init round trip", async ({ page }) => {
  await loadFixture(page, 1440);
  await page.setViewportSize({ width: 390, height: 800 });
  await expect.poll(async () => Math.abs((await measure(page)).textWidth - (await measure(page)).availableWidth)).toBeLessThanOrEqual(2);
  const mobile = await measure(page);

  await page.setViewportSize({ width: 1440, height: 800 });
  await expect.poll(async () => Math.abs((await measure(page)).textWidth - (await measure(page)).availableWidth)).toBeLessThanOrEqual(2);
  const desktop = await measure(page);
  expect(desktop.fontSize).not.toBe(mobile.fontSize);

  await page.setViewportSize({ width: 390, height: 800 });
  await expect.poll(async () => Math.abs((await measure(page)).textWidth - (await measure(page)).availableWidth)).toBeLessThanOrEqual(2);
  const mobileAgain = await measure(page);
  expect(mobileAgain.fontSize).toBe(mobile.fontSize);
  expect(Math.max(...mobileAgain.tops) - Math.min(...mobileAgain.tops)).toBeLessThanOrEqual(1);
});
