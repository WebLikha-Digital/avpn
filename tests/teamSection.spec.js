import { test, expect } from "@playwright/test";

const root = "[data-team-init]";
const panel = (id) => `[data-team-panel="${id}"]`;

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.locator(root)).toHaveCount(1);
});

test("switches team categories and keeps tab state exclusive", async ({ page }) => {
  const section = page.locator(root);
  const toggle = section.locator("[data-team-toggle]");
  const group = section.locator("[data-team-group]");

  await toggle.click();
  await expect(group).toHaveAttribute("data-team-open", "true");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(section.locator(panel("team-advisor"))).not.toBeHidden();

  const categories = await section.locator("[data-team-subtabs] [data-team-tab]").evaluateAll(
    (tabs) => tabs.map((tab) => tab.dataset.teamTab),
  );
  expect(categories).toHaveLength(10);
  for (const id of categories) {
    await section.locator(`[data-team-tab="${id}"]`).click();
    for (const candidate of ["board", ...categories]) {
      const current = section.locator(panel(candidate));
      if (candidate === id) await expect(current).not.toBeHidden();
      else await expect(current).toBeHidden();
    }
    await expect(section.locator('[data-team-tab][aria-selected="true"]')).toHaveCount(1);
    await expect(section.locator(`[data-team-tab="${id}"]`)).toHaveAttribute("aria-selected", "true");
  }

  await section.locator('[data-team-tab="board"]').click();
  await expect(group).toHaveAttribute("data-team-open", "false");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(section.locator(panel("board"))).not.toBeHidden();
  await expect(section.locator('[data-team-tab="board"]')).toHaveAttribute("aria-selected", "true");
  await expect(section.locator('[data-team-subtabs]')).toHaveAttribute("inert", "");
});

test("reveals incoming rows on category changes and settles cleanly", async ({ page }) => {
  const section = page.locator(root);
  await section.locator("[data-team-toggle]").click();

  const advisor = section.locator(panel("team-advisor"));
  await expect.poll(() => advisor.locator("[data-team-row]").evaluateAll((nodes) =>
    nodes.every((row) => getComputedStyle(row).opacity === "1" && !row.style.transform),
  ), { timeout: 2_000 }).toBe(true);

  const rows = section.locator(panel("team-programmes")).locator("[data-team-row]");

  const minOpacities = await page.evaluate(async () => {
    document.querySelector('[data-team-tab="team-programmes"]').click();
    const rows = [...document.querySelectorAll('[data-team-panel="team-programmes"] [data-team-row]')];
    const samples = [];
    const started = performance.now();

    await new Promise((resolve) => {
      const sample = () => {
        const opacities = rows.map((row) => Number.parseFloat(getComputedStyle(row).opacity));
        samples.push(Math.min(...opacities));
        if (opacities.every((opacity) => opacity >= 1) || performance.now() - started >= 1_500) {
          resolve();
          return;
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });

    return samples;
  });

  expect(minOpacities[0]).toBeLessThan(1);
  minOpacities.slice(1).forEach((opacity, index) => {
    expect(opacity).toBeGreaterThanOrEqual(minOpacities[index] - 0.02);
  });
  expect(minOpacities.some((opacity) => opacity > 0 && opacity < 1)).toBe(true);
  await expect.poll(() => rows.evaluateAll((nodes) => nodes.every((row) => {
    const styles = getComputedStyle(row);
    return styles.opacity === "1" &&
      (styles.transform === "none" || new DOMMatrix(styles.transform).isIdentity) &&
      !row.style.opacity && !row.style.transform;
  })), { timeout: 2_000 }).toBe(true);
});

test("rapid switching clears the interrupted panel and reveals the last panel", async ({ page }) => {
  const section = page.locator(root);
  await section.locator("[data-team-toggle]").click();
  const advisor = section.locator(panel("team-advisor"));
  await expect.poll(() => advisor.locator("[data-team-row]").evaluateAll((nodes) =>
    nodes.every((row) => getComputedStyle(row).opacity === "1" && !row.style.transform),
  ), { timeout: 2_000 }).toBe(true);

  await page.evaluate(async () => {
    document.querySelector('[data-team-tab="team-programmes"]').click();
    await new Promise((resolve) => setTimeout(resolve, 80));
    document.querySelector('[data-team-tab="team-finance"]').click();
  });

  const result = await page.evaluate(() => [...document.querySelectorAll("[data-team-panel]")].map((panel) => ({
    id: panel.dataset.teamPanel,
    hidden: panel.hidden,
    rows: [...panel.querySelectorAll("[data-team-row]")].map((row) => ({
      opacity: row.style.opacity,
      transform: row.style.transform,
    })),
  })));

  const intermediate = result.find(({ id }) => id === "team-programmes");
  const last = result.find(({ id }) => id === "team-finance");
  expect(intermediate.hidden).toBe(true);
  expect(intermediate.rows.every(({ opacity, transform }) => !opacity && !transform)).toBe(true);
  expect(last.hidden).toBe(false);
  await expect.poll(() => section.locator(panel("team-finance")).locator("[data-team-row]").evaluateAll((nodes) =>
    nodes.every((row) => {
      const styles = getComputedStyle(row);
      return styles.opacity === "1" && (styles.transform === "none" || new DOMMatrix(styles.transform).isIdentity);
    }),
  ), { timeout: 1_500 }).toBe(true);
});

test("ArrowDown switches subtabs and reduced motion swaps without inline reveal styles", async ({ page }) => {
  const section = page.locator(root);
  await section.locator("[data-team-toggle]").click();
  const advisorTab = section.locator('[data-team-tab="team-advisor"]');
  await advisorTab.focus();
  await advisorTab.press("ArrowDown");
  await expect(section.locator(panel("team-ceo-office"))).not.toBeHidden();

  await page.emulateMedia({ reducedMotion: "reduce" });
  await section.locator('[data-team-tab="team-finance"]').click();
  const reduced = await section.locator(panel("team-finance")).locator("[data-team-row]").evaluateAll((nodes) =>
    nodes.map((row) => ({ opacity: row.style.opacity, transform: row.style.transform, computed: getComputedStyle(row).opacity })),
  );
  expect(reduced.every(({ opacity, transform, computed }) => !opacity && !transform && computed === "1")).toBe(true);
});

function assertDoesNotIntersect(preview, boxes) {
  for (const box of boxes) {
    const horizontal = preview.left < box.right && preview.right > box.left;
    const vertical = preview.top < box.bottom && preview.bottom > box.top;
    expect(horizontal && vertical).toBe(false);
  }
}

async function previewState(list) {
  return list.locator("[data-team-preview]").evaluate((preview) => ({
    opacity: Number.parseFloat(getComputedStyle(preview).opacity),
    preview: preview.getBoundingClientRect().toJSON(),
    images: [...preview.querySelectorAll("img")].map((image) => image.currentSrc || image.src),
  }));
}

async function waitForRowToSettle(row) {
  let previous;
  await expect.poll(async () => {
    const current = await row.boundingBox();
    const settled = current && previous && ["x", "y", "width", "height"].every((key) =>
      Math.abs(current[key] - previous[key]) <= 0.5,
    );
    previous = current;
    return Boolean(settled);
  }, { timeout: 3_000 }).toBe(true);
}

async function expectPreviewForRow(page, list, index) {
  const row = list.locator("[data-team-row]").nth(index);
  await row.scrollIntoViewIfNeeded();
  await waitForRowToSettle(row);
  await row.hover();
  await expect.poll(() => previewState(list).then((state) => state.opacity), { timeout: 3_000 })
    .toBeGreaterThanOrEqual(0.9);
  const state = await previewState(list);
  const expectedSrc = await row.locator("img").getAttribute("src");
  expect(state.opacity).toBeCloseTo(1, 1);
  expect(state.images).toEqual([expectedSrc]);
  return { row, state };
}

async function assertPreviewDoesNotTouchText(list, state) {
  const boxes = await list.locator(".team_name, .team_role").evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect().toJSON()),
  );
  assertDoesNotIntersect(state.preview, boxes);
}

test("travels to hovered board rows and swaps one image", async ({ page }) => {
  const list = page.locator(panel("board")).locator("[data-team-list]");
  const first = await expectPreviewForRow(page, list, 2);
  await assertPreviewDoesNotTouchText(list, first.state);

  const row = list.locator("[data-team-row]").nth(2);
  const rowBox = await row.boundingBox();
  expect(Math.abs(first.state.preview.bottom - (rowBox.y + rowBox.height))).toBeLessThanOrEqual(2);

  const nextRow = list.locator("[data-team-row]").nth(5);
  const expectedNextSrc = await nextRow.locator("img").getAttribute("src");
  await nextRow.hover();
  await expect.poll(() => previewState(list).then((state) => state.images), { timeout: 3_000 })
    .toEqual([expectedNextSrc]);
  await expect.poll(() => previewState(list).then((state) => state.opacity), { timeout: 3_000 })
    .toBeGreaterThanOrEqual(0.9);
  const second = await previewState(list);
  expect(second.images).toHaveLength(1);
  await expect(second.images[0]).toBe(expectedNextSrc);

  await page.mouse.move(2, 2);
  await expect.poll(() => previewState(list).then((state) => state.opacity), { timeout: 3_000 }).toBe(0);
});

test("keeps every panel live across category switches", async ({ page }) => {
  const section = page.locator(root);
  const toggle = section.locator("[data-team-toggle]");
  const boardList = section.locator(panel("board")).locator("[data-team-list]");

  await toggle.click();
  const advisor = section.locator(panel("team-advisor")).locator("[data-team-list]");
  await expectPreviewForRow(page, advisor, 1);
  await expect.poll(() => previewState(boardList).then((state) => state.opacity), { timeout: 3_000 }).toBe(0);

  await section.locator('[data-team-tab="team-programmes"]').click();
  const programmes = section.locator(panel("team-programmes")).locator("[data-team-list]");
  await expectPreviewForRow(page, programmes, 1);
  await expect.poll(() => previewState(boardList).then((state) => state.opacity), { timeout: 3_000 }).toBe(0);

  await section.locator('[data-team-tab="board"]').click();
  await expectPreviewForRow(page, boardList, 0);
  expect((await previewState(boardList)).images).toHaveLength(1);
});

for (const width of [1280, 1024]) {
  test(`keeps the preview in the slot at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const list = page.locator(panel("board")).locator("[data-team-list]");
    const { state } = await expectPreviewForRow(page, list, 2);
    await assertPreviewDoesNotTouchText(list, state);
  });
}

test("shows the preview instantly under reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  const list = page.locator(panel("board")).locator("[data-team-list]");
  await list.locator("[data-team-row]").nth(1).hover();
  await page.waitForTimeout(10);
  expect((await previewState(list)).opacity).toBe(1);
});
