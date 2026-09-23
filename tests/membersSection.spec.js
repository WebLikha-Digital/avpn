import { test, expect } from "@playwright/test";

const nextFrame = (page) => page.evaluate(() => new Promise(requestAnimationFrame));

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("[data-members-globe] canvas")).toHaveClass(/is-ready/, { timeout: 10_000 });
});

test("mounts the globe and scrubs both globe rotation and list position", async ({ page }) => {
  const section = page.locator("[data-members-init]");
  await section.evaluate((node) => node.scrollIntoView({ block: "start", behavior: "instant" }));
  await nextFrame(page);
  const start = await page.locator("[data-members-globe]").getAttribute("data-members-globe-phi");
  const startTransform = await page.locator("[data-members-list]").evaluate((node) => getComputedStyle(node).transform);

  await section.evaluate((node) => window.scrollTo(0, node.offsetTop + node.offsetHeight * 0.55));
  await expect.poll(() => page.locator("[data-members-globe]").getAttribute("data-members-globe-phi")).not.toBe(start);
  await expect.poll(() => page.locator("[data-members-list]").evaluate((node) => getComputedStyle(node).transform)).not.toBe(startTransform);
  const mount = page.locator("[data-members-globe]");
  await page.waitForTimeout(600);
  const idlePhi = await mount.getAttribute("data-members-globe-phi");
  await page.waitForTimeout(300);
  await expect(mount).toHaveAttribute("data-members-globe-phi", idlePhi);
});

test("keeps member rows inside the wrap during continuous scroll", async ({ page }) => {
  const section = page.locator("[data-members-init]");
  const sectionTop = await section.evaluate((node) => node.getBoundingClientRect().top + window.scrollY);
  await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), sectionTop);
  await nextFrame(page);

  const openRow = page.locator("[data-members-list] > [data-accordion-status]").nth(8);
  await openRow.locator("[data-accordion-toggle]").click({ position: { x: 20, y: 20 } });
  await expect(openRow).toHaveAttribute("data-accordion-status", "active");
  await page.waitForTimeout(700);
  await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), sectionTop);
  await nextFrame(page);

  const startWidths = await page.locator("[data-members-list] > [data-accordion-status]").evaluateAll((rows) =>
    rows.map((row) => row.getBoundingClientRect().width),
  );

  await page.evaluate(() => {
    window.__membersRowFrames = [];
    const sectionNode = document.querySelector("[data-members-init]");
    const wrap = document.querySelector("[data-members-list-wrap]");
    const rows = [...document.querySelectorAll("[data-members-list] > [data-accordion-status]")];
    const measuredRow = rows[8];
    const measuredText = measuredRow.querySelector(".members_item-text");
    let frameCount = 0;
    const sample = () => {
      const sectionRect = sectionNode.getBoundingClientRect();
      if (sectionRect.bottom > 0 && sectionRect.top < window.innerHeight) {
        const wrapRight = wrap.getBoundingClientRect().right;
        window.__membersRowFrames.push({
          maxRowRight: Math.max(...rows.map((row) => row.getBoundingClientRect().right)),
          wrapRight,
          rowHeight: measuredRow.getBoundingClientRect().height,
          textWidth: measuredText.getBoundingClientRect().width,
        });
      }
      frameCount += 1;
      if (frameCount < 240) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });

  await page.mouse.move(600, 450);
  for (let index = 0; index < 55; index += 1) {
    await page.mouse.wheel(0, 60);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(100);

  const frames = await page.evaluate(() => window.__membersRowFrames);
  expect(frames.length).toBeGreaterThan(0);
  expect(Math.max(...frames.map(({ maxRowRight, wrapRight }) => maxRowRight - wrapRight))).toBeLessThanOrEqual(1);
  expect(Math.max(...frames.map(({ rowHeight }) => rowHeight)) - Math.min(...frames.map(({ rowHeight }) => rowHeight))).toBeLessThanOrEqual(1);
  expect(Math.max(...frames.map(({ textWidth }) => textWidth)) - Math.min(...frames.map(({ textWidth }) => textWidth))).toBeLessThanOrEqual(1);
  expect(startWidths.at(-1)).toBeLessThan(startWidths[0] - 1);

  const sectionBottom = await section.evaluate((node) => node.getBoundingClientRect().bottom + window.scrollY);
  await page.evaluate((bottom) => window.scrollTo({ top: bottom - window.innerHeight, behavior: "instant" }), sectionBottom);
  await nextFrame(page);
  await expect.poll(() => page.locator("[data-members-list] > [data-accordion-status]").evaluateAll((rows) => {
    const widths = rows.map((row) => row.getBoundingClientRect().width);
    return Math.abs(widths[0] - widths.at(-1));
  })).toBeLessThanOrEqual(1);
});

test("members accordion opens one row and closes its active sibling", async ({ page }) => {
  const section = page.locator("[data-members-init]");
  const list = page.locator("[data-members-list]");
  const items = list.locator("[data-members-color]");
  const sectionTop = await section.evaluate((node) => {
    const top = node.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top, behavior: "instant" });
    return top;
  });
  await page.waitForTimeout(400);
  await expect.poll(() => page.evaluate((top) => {
    const listTransform = getComputedStyle(document.querySelector("[data-members-list]")).transform;
    const identity = /^(none|matrix\(1, 0, 0, 1, 0, 0\))$/.test(listTransform);
    return Math.abs(window.scrollY - top) < 2 && identity;
  }, sectionTop), { timeout: 15_000 }).toBe(true);
  await items.nth(1).locator("[data-accordion-toggle]").click({ position: { x: 20, y: 20 } });
  await expect(items.nth(1)).toHaveAttribute("data-accordion-status", "active");
  await expect(items.nth(0)).toHaveAttribute("data-accordion-status", "not-active");
  await expect(items.nth(1).locator("[data-accordion-toggle]")).toHaveAttribute("aria-expanded", "true");
  await expect(items.nth(0).locator("[data-accordion-toggle]")).toHaveAttribute("aria-expanded", "false");
});

test("keeps globe rotation fixed for reduced-motion users", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  const mount = page.locator("[data-members-globe]");
  await expect(mount.locator("canvas")).toHaveClass(/is-ready/, { timeout: 10_000 });
  const before = await mount.getAttribute("data-members-globe-phi");
  await mount.evaluate((node) => node.closest("[data-members-init]").scrollIntoView({ block: "center", behavior: "instant" }));
  await nextFrame(page);
  const after = await mount.getAttribute("data-members-globe-phi");
  expect(after).toBe(before);
});
