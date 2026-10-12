import { test, expect } from "@playwright/test";

const root = "[data-team-init]";
const panel = (id) => `[data-team-panel="${id}"]`;

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.locator(root)).toHaveCount(1);
});

async function revealTeamTabs(page) {
  const section = page.locator(root);
  const tabs = section.locator("[data-team-tabs]");
  await tabs.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
  await expect(tabs).toBeVisible();
  return { section, tabs };
}

test("switches the two team tabs and keeps tab state and panels exclusive", async ({ page }) => {
  const { section } = await revealTeamTabs(page);
  const tabs = section.locator("[data-team-tab]");
  const panels = section.locator("[data-team-panel]");

  await expect(section.locator('[role="tablist"]')).toHaveCount(1);
  await expect(tabs).toHaveCount(2);
  expect(await tabs.evaluateAll((nodes) => nodes.every((tab) => tab.tagName === "BUTTON"))).toBe(true);
  expect(await tabs.evaluateAll((nodes) => nodes.map((tab) => tab.dataset.teamTab))).toEqual([
    "board",
    "team-management",
  ]);
  await expect(panels).toHaveCount(2);

  for (const id of ["team-management", "board"]) {
    await section.locator(`[data-team-tab="${id}"]`).click();
    const otherId = id === "board" ? "team-management" : "board";
    await expect(section.locator(panel(id))).not.toBeHidden();
    await expect(section.locator(panel(otherId))).toBeHidden();
    await expect(section.locator('[data-team-tab][aria-selected="true"]')).toHaveCount(1);
    await expect(section.locator(`[data-team-tab="${id}"]`)).toHaveAttribute("aria-selected", "true");
    await expect(section.locator(`[data-team-tab="${otherId}"]`)).toHaveAttribute("aria-selected", "false");
  }
});

test("hides board rows until the team list enters view, then reveals them", async ({ page }) => {
  const list = page.locator(panel("board")).locator("[data-team-list]");
  await expect.poll(() => list.locator("[data-team-row]").evaluateAll((nodes) =>
    nodes.every((row) => getComputedStyle(row).opacity === "0"),
  )).toBe(true);

  const minOpacities = await page.evaluate(async () => {
    const list = document.querySelector('[data-team-panel="board"] [data-team-list]');
    const rows = [...document.querySelectorAll('[data-team-panel="board"] [data-team-row]')];
    const samples = [];
    list.scrollIntoView({ block: "center" });
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
  expect(minOpacities.some((opacity) => opacity > 0 && opacity < 1)).toBe(true);
  await expect.poll(() => list.locator("[data-team-row]").evaluateAll((nodes) =>
    nodes.every((row) => {
      const styles = getComputedStyle(row);
      return styles.opacity === "1" &&
        (styles.transform === "none" || new DOMMatrix(styles.transform).isIdentity) &&
        !row.style.opacity && !row.style.transform;
    }),
  ), { timeout: 2_000 }).toBe(true);
});

test("switching before entry cancels the board reveal", async ({ page }) => {
  const section = page.locator(root);
  const board = section.locator(panel("board"));

  // Keep this a genuine pre-entry switch: contentReveal hides the tabs before
  // they enter view, but a DOM click can activate the tab before any scroll.
  await page.evaluate(() => document.querySelector('[data-team-tab="team-management"]').click());
  await expect(section.locator(panel("team-management"))).not.toBeHidden();
  await revealTeamTabs(page);
  await section.locator("[data-team-tabs]").evaluate((element) =>
    element.scrollIntoView({ block: "center", inline: "nearest" }),
  );
  await page.waitForTimeout(700);

  await expect.poll(() => section.locator(panel("team-management")).locator("[data-team-row]").evaluateAll((nodes) =>
    nodes.every((row) => getComputedStyle(row).opacity === "1" && !row.style.opacity && !row.style.transform),
  ), { timeout: 2_000 }).toBe(true);
  await expect.poll(() => board.locator("[data-team-row]").evaluateAll((nodes) =>
    nodes.every((row) => !row.style.opacity && !row.style.transform),
  )).toBe(true);
});

test("keeps board rows visible without an entry reveal under reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await page.waitForLoadState("networkidle");

  const rows = page.locator(panel("board")).locator("[data-team-row]");
  await expect(rows).toHaveCount(11);
  await expect.poll(() => rows.evaluateAll((nodes) =>
    nodes.every((row) => getComputedStyle(row).opacity === "1" && !row.style.opacity && !row.style.transform),
  )).toBe(true);
});

test("reveals incoming rows on panel changes and settles cleanly", async ({ page }) => {
  const { section } = await revealTeamTabs(page);
  const rows = section.locator(panel("team-management")).locator("[data-team-row]");

  const minOpacities = await page.evaluate(async () => {
    document.querySelector('[data-team-tab="team-management"]').click();
    const rows = [...document.querySelectorAll('[data-team-panel="team-management"] [data-team-row]')];
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
  const { section } = await revealTeamTabs(page);

  await page.evaluate(async () => {
    document.querySelector('[data-team-tab="team-management"]').click();
    await new Promise((resolve) => setTimeout(resolve, 80));
    document.querySelector('[data-team-tab="board"]').click();
  });

  const result = await page.evaluate(() => [...document.querySelectorAll("[data-team-panel]")].map((panel) => ({
    id: panel.dataset.teamPanel,
    hidden: panel.hidden,
    rows: [...panel.querySelectorAll("[data-team-row]")].map((row) => ({
      opacity: row.style.opacity,
      transform: row.style.transform,
    })),
  })));

  const intermediate = result.find(({ id }) => id === "team-management");
  const last = result.find(({ id }) => id === "board");
  expect(intermediate.hidden).toBe(true);
  expect(intermediate.rows.every(({ opacity, transform }) => !opacity && !transform)).toBe(true);
  expect(last.hidden).toBe(false);
  await expect.poll(() => section.locator(panel("board")).locator("[data-team-row]").evaluateAll((nodes) =>
    nodes.every((row) => {
      const styles = getComputedStyle(row);
      return styles.opacity === "1" && (styles.transform === "none" || new DOMMatrix(styles.transform).isIdentity);
    }),
  ), { timeout: 1_500 }).toBe(true);
});

test("ArrowDown, ArrowUp, Home, and End switch tabs; reduced motion skips reveal styles", async ({ page }) => {
  const { section } = await revealTeamTabs(page);
  const boardTab = section.locator('[data-team-tab="board"]');
  const managementTab = section.locator('[data-team-tab="team-management"]');

  await boardTab.focus();
  await boardTab.press("ArrowDown");
  await expect(managementTab).toHaveAttribute("aria-selected", "true");
  await expect(section.locator(panel("team-management"))).not.toBeHidden();
  await managementTab.focus();
  await managementTab.press("ArrowUp");
  await expect(boardTab).toHaveAttribute("aria-selected", "true");
  await boardTab.focus();
  await boardTab.press("End");
  await expect(managementTab).toHaveAttribute("aria-selected", "true");
  await managementTab.focus();
  await managementTab.press("Home");
  await expect(boardTab).toHaveAttribute("aria-selected", "true");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await managementTab.click();
  const reduced = await section.locator(panel("team-management")).locator("[data-team-row]").evaluateAll((nodes) =>
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
  const previewCenter = (first.state.preview.top + first.state.preview.bottom) / 2;
  const rowCenter = rowBox.y + rowBox.height / 2;
  expect(Math.abs(previewCenter - rowCenter)).toBeLessThanOrEqual(2);

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

test("keeps every panel live across tab switches", async ({ page }) => {
  const { section } = await revealTeamTabs(page);
  const boardList = section.locator(panel("board")).locator("[data-team-list]");

  await section.locator('[data-team-tab="team-management"]').click();
  const management = section.locator(panel("team-management")).locator("[data-team-list]");
  await expectPreviewForRow(page, management, 1);
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
