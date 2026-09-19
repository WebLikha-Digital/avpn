import { test, expect } from "@playwright/test";

const section = "#hear-from-partners";
const slider = `${section} [data-gsap-slider-init]`;
const collection = `${slider} [data-gsap-slider-collection]`;
const list = `${slider} [data-gsap-slider-list]`;
const item = `${slider} [data-gsap-slider-item]`;
const next = `${section} [data-gsap-slider-control="next"]`;
const prev = `${section} [data-gsap-slider-control="prev"]`;
const trigger = `${section} [data-video-lightbox-trigger]`;
const lightbox = `${section} [data-video-lightbox]`;
const readX = (node) => {
  const transform = getComputedStyle(node).transform;
  if (!transform || transform === "none") return 0;
  return Number.parseFloat(transform.match(/matrix\([^,]+,\s*[^,]+,\s*[^,]+,\s*[^,]+,\s*([^,]+)/)?.[1] || 0);
};

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => !document.documentElement.classList.contains("is-preloading"));
  await page.locator(section).scrollIntoViewIfNeeded();
});

test("initializes the slider and its controls", async ({ page }) => {
  await expect(page.locator(slider)).toHaveAttribute("data-gsap-slider-status", "active");
  await expect(page.locator(item).nth(0)).toHaveAttribute("data-gsap-slider-item-status", "active");
  await expect(page.locator(prev)).toHaveAttribute("data-gsap-slider-control-status", "not-active");
  await expect(page.locator(next)).toHaveAttribute("data-gsap-slider-control-status", "active");
});

test("moves one snap point at a time and disables next at the end", async ({ page }) => {
  const listHandle = page.locator(list);
  const waitForListToSettle = async () => {
    let previous;
    await expect.poll(async () => {
      const current = await listHandle.evaluate(readX);
      const settled = previous === current;
      previous = current;
      return settled;
    }).toBeTruthy();
  };
  const firstX = await listHandle.evaluate(readX);
  await page.locator(next).click();
  await waitForListToSettle();
  expect(await listHandle.evaluate(readX)).not.toBe(firstX);
  await expect(page.locator(item).nth(1)).toHaveAttribute("data-gsap-slider-item-status", "active");
  for (;;) {
    await waitForListToSettle();
    if (await page.locator(next).getAttribute("data-gsap-slider-control-status") !== "active") break;
    await page.locator(next).click();
  }
  await waitForListToSettle();
  await expect(page.locator(next)).toHaveAttribute("data-gsap-slider-control-status", "not-active");
  await expect(page.locator(prev)).toHaveAttribute("data-gsap-slider-control-status", "active");
  const finalIndex = await page.locator(item).evaluateAll((nodes) =>
    nodes.findIndex((node) => node.getAttribute("data-gsap-slider-item-status") === "active"));
  const snapCount = await page.locator(list).evaluate((node) =>
    node.closest("[data-testi-partners-init]")._partnersTestimonialsInstance.snapPoints.length);
  expect(finalIndex).toBe(snapCount - 1);
});

test("throws a real pointer drag onto a snap point", async ({ page }) => {
  const box = await page.locator(list).boundingBox();
  await page.evaluate(() => {
    const node = document.querySelector("#hear-from-partners [data-gsap-slider-list]");
    window.__tpSamples = [];
    window.__tpStop = false;
    const sample = () => {
      const transform = getComputedStyle(node).transform;
      const x = transform === "none" ? 0 : Number.parseFloat(
        transform.match(/matrix\([^,]+,\s*[^,]+,\s*[^,]+,\s*[^,]+,\s*([^,]+)/)?.[1] || 0,
      );
      window.__tpSamples.push(x);
      if (!window.__tpStop) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height / 2);
  await page.mouse.down();
  for (let step = 1; step <= 6; step += 1) {
    await page.mouse.move(box.x + box.width * (0.75 - step * 0.08), box.y + box.height / 2, { steps: 4 });
  }
  await page.mouse.up();
  await page.waitForTimeout(700);
  const { samples, finalX, snapPoints } = await page.evaluate(() => {
    window.__tpStop = true;
    const node = document.querySelector("#hear-from-partners [data-gsap-slider-list]");
    const transform = getComputedStyle(node).transform;
    const current = transform === "none" ? 0 : Number.parseFloat(
      transform.match(/matrix\([^,]+,\s*[^,]+,\s*[^,]+,\s*[^,]+,\s*([^,]+)/)?.[1] || 0,
    );
    return {
      samples: window.__tpSamples,
      finalX: current,
      snapPoints: node.closest("[data-testi-partners-init]")._partnersTestimonialsInstance.snapPoints,
    };
  });
  expect(snapPoints.length).toBe(await page.locator(list).evaluate((node) => {
    const collectionNode = node.closest("[data-gsap-slider-collection]");
    const itemNode = node.querySelector("[data-gsap-slider-item]");
    const slideW = itemNode.getBoundingClientRect().width
      + parseFloat(getComputedStyle(itemNode).marginRight);
    return Math.ceil((node.scrollWidth - collectionNode.clientWidth) / slideW) + 1;
  }));
  expect(finalX).not.toBe(0);
  expect(Math.min(...snapPoints.map((point) => Math.abs(point - finalX)))).toBeLessThanOrEqual(1);
  expect(samples.some((value) => value < 0 && value > finalX)).toBeTruthy();
});

test("resolves the slider item width below the collection width", async ({ page }) => {
  const result = await page.locator(item).first().evaluate((node) => {
    const collectionNode = node.closest("[data-gsap-slider-collection]");
    return {
      itemWidth: parseFloat(getComputedStyle(node).width),
      collectionWidth: collectionNode.clientWidth,
    };
  });
  expect(result.itemWidth).toBeLessThan(result.collectionWidth);
});

test("opens and closes the video lightbox with focus restoration", async ({ page }) => {
  const opener = page.locator(trigger).first();
  const src = await opener.getAttribute("data-video-lightbox-src");
  const clientWidth = await page.locator("html").evaluate((node) => node.clientWidth);
  await opener.click();
  await expect(page.locator(lightbox)).toHaveAttribute("data-video-lightbox-status", "active");
  await expect(page.locator(`${lightbox} video`)).toHaveAttribute("src", src);
  await expect(page.locator("html")).toHaveClass(/is-modal-open/);
  const scrollState = await page.locator("html").evaluate((node) => ({
    overflowY: getComputedStyle(node).overflowY,
    clientWidth: node.clientWidth,
  }));
  expect(["clip", "hidden"]).not.toContain(scrollState.overflowY);
  expect(scrollState.clientWidth).toBe(clientWidth);
  await page.keyboard.press("Escape");
  await expect(page.locator(lightbox)).toHaveAttribute("data-video-lightbox-status", "not-active");
  await expect(page.locator(`${lightbox} video`)).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test("does not open the lightbox after dragging from a media button", async ({ page }) => {
  const opener = page.locator(trigger).first();
  const box = await opener.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator(lightbox)).toHaveAttribute("data-video-lightbox-status", "not-active");
});

test("opens the lightbox from keyboard activation after a drag", async ({ page }) => {
  const opener = page.locator(trigger).first();
  const box = await opener.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(700);
  await opener.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(lightbox)).toHaveAttribute("data-video-lightbox-status", "active");
});

test("rebuilds once after a width change", async ({ page }) => {
  await page.locator(section).evaluate((node) => {
    node._partnersTestimonialsInstance.__token = "first";
  });
  await page.setViewportSize({ width: 900, height: 800 });
  await page.waitForTimeout(350);
  const result = await page.locator(section).evaluate((node) => ({
    token: node._partnersTestimonialsInstance?.__token,
    draggable: Boolean(node._partnersTestimonialsInstance?.draggable),
    targetMatchesList: node._partnersTestimonialsInstance?.draggable?.target
      === node.querySelector("[data-gsap-slider-list]"),
  }));
  expect(result.token).toBeUndefined();
  expect(result.draggable).toBeTruthy();
  expect(result.targetMatchesList).toBeTruthy();
});
