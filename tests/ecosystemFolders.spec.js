import { test, expect } from "@playwright/test";

const folders = "[data-folders-init]";
const learn = "[data-deck-init=learn]";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.locator("[data-testid=ecosystem]").scrollIntoViewIfNeeded();
});

test("renders two stacked cream folders and fans on hover", async ({ page }) => {
  const root = page.locator(folders);
  await expect(root.locator("[data-deck-init]")).toHaveCount(2);
  await expect(root.locator("[data-deck-init=learn] [data-deck-count]")).toHaveText("19");
  await expect(root.locator("[data-deck-init=voice] [data-deck-count]")).toHaveText("11");
  await expect(root.locator("[data-deck-track] [data-deck-clone]")).toHaveCount(0);
  const card = root.locator(`${learn} [data-deck-card]`).first();
  const before = await card.evaluate((node) => getComputedStyle(node).transform);
  await root.locator(`${learn} [data-deck-folder]`).hover();
  await page.waitForTimeout(180);
  expect(await card.evaluate((node) => getComputedStyle(node).transform)).not.toBe(before);
});

test("expands, pauses marquee, collapses, and supports Esc", async ({ page }) => {
  const root = page.locator(folders);
  const deck = root.locator(learn);
  const jumpPromise = page.evaluate(() => new Promise((resolve) => {
    const root = document.querySelector("[data-folders-init]");
    // Only the first cards: the far ones legitimately cover thousands of px in
    // the 0.75s Flip, so a per-frame delta there is speed, not a layout jump.
    const cards = [...root.querySelectorAll("[data-deck-init=learn] [data-deck-card]")].slice(0, 3);
    let started = null;
    let previous = null;
    let previousTime = 0;
    let maxJump = 0;
    const sample = () => {
      if (root.dataset.foldersState === "expanding") {
        started ??= performance.now();
        const now = performance.now();
        const lefts = cards.map((card) => card.getBoundingClientRect().left);
        if (previous && now - started > 100) {
          // Normalise to a 60fps frame so dropped frames under parallel test
          // load read as speed, not as a layout jump.
          const frames = Math.max(1, (now - previousTime) / (1000 / 60));
          maxJump = Math.max(maxJump, ...lefts.map((left, index) => Math.abs(left - previous[index]) / frames));
        }
        previous = lefts;
        previousTime = now;
        if (performance.now() - started > 900) return resolve(maxJump);
      }
      if (root.dataset.foldersState === "expanded") return resolve(maxJump);
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }));
  await deck.locator("[data-deck-folder]").click();
  expect(await jumpPromise).toBeLessThan(60);
  await expect(root).toHaveAttribute("data-folders-state", "expanded");
  await expect(deck).toHaveAttribute("data-deck-state", "expanded");
  await expect(root.locator("[data-deck-init=voice]")).toBeHidden();
  await expect(deck.locator("[data-deck-collapse]")).toBeVisible();
  expect(await deck.locator("[data-deck-collapse]").evaluate((button) => {
    // The pill sits under the row; bring it on screen or elementFromPoint returns null.
    button.scrollIntoView({ block: "center" });
    const box = button.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return hit === button || button.contains(hit);
  })).toBe(true);
  await expect(deck.locator("[data-deck-card]").first()).not.toHaveAttribute("tabindex", /.+/);
  await page.mouse.move(0, 0);
  const before = await deck.locator("[data-deck-track]").evaluate((node) => node.getBoundingClientRect().left);
  await page.waitForTimeout(150);
  expect(await deck.locator("[data-deck-track]").evaluate((node) => node.getBoundingClientRect().left)).toBeLessThan(before);
  await deck.locator("[data-deck-viewport]").hover();
  const paused = await deck.locator("[data-deck-track]").evaluate((node) => node.getBoundingClientRect().left);
  await page.waitForTimeout(120);
  expect(await deck.locator("[data-deck-track]").evaluate((node) => node.getBoundingClientRect().left)).toBeCloseTo(paused, 0);

  const fadeSample = page.evaluate(() => new Promise((resolve) => {
    const deck = document.querySelector("[data-deck-init=learn]");
    const button = deck.querySelector("[data-deck-collapse]");
    button.addEventListener("click", () => requestAnimationFrame(() => resolve({
      opacity: Number.parseFloat(getComputedStyle(button).opacity),
      state: deck.dataset.deckState,
    })), { once: true });
  }));
  const collapsingTiming = page.evaluate(() => new Promise((resolve) => {
    const deck = document.querySelector("[data-deck-init=learn]");
    const button = deck.querySelector("[data-deck-collapse]");
    let clickedAt;
    const observer = new MutationObserver(() => {
      if (deck.dataset.deckState !== "collapsing") return;
      observer.disconnect();
      resolve(performance.now() - clickedAt);
    });
    observer.observe(deck, { attributes: true, attributeFilter: ["data-deck-state"] });
    button.addEventListener("click", () => { clickedAt = performance.now(); }, { once: true });
  }));
  await deck.locator("[data-deck-collapse]").click();
  const fade = await fadeSample;
  expect(fade.opacity).toBeGreaterThan(0);
  expect(fade.opacity).toBeLessThan(1);
  expect(fade.state).toBe("expanded");
  expect(await collapsingTiming).toBeGreaterThanOrEqual(150);
  await expect(root).toHaveAttribute("data-folders-state", "stacked");
  await expect(root.locator("[data-deck-init=voice]")).not.toBeHidden();
  await deck.locator("[data-deck-folder]").press("Enter");
  await expect(deck).toHaveAttribute("data-deck-state", "expanded");
  await page.keyboard.press("Escape");
  await expect(root).toHaveAttribute("data-folders-state", "stacked");
  await expect(root.locator("[data-deck-init=voice]")).not.toBeHidden();
  await expect(deck.locator("[data-deck-folder]")).toBeFocused();
});

test("keeps the ecosystem section height stable while a folder expands", async ({ page }) => {
  const deck = page.locator(learn);
  const heightSample = page.evaluate(() => new Promise((resolve) => {
    const section = document.querySelector(".section_ecosystem");
    const deck = document.querySelector("[data-deck-init=learn]");
    const heights = [];
    let sawExpanding = false;
    let expandedFrames = 0;

    const sample = () => {
      const state = deck.dataset.deckState;
      if (state === "expanding" || state === "expanded") {
        heights.push(section.getBoundingClientRect().height);
        sawExpanding ||= state === "expanding";
        if (state === "expanded") expandedFrames += 1;
      }
      if (expandedFrames >= 3) {
        resolve({
          heights,
          sawExpanding,
          sawExpanded: expandedFrames > 0,
        });
        return;
      }
      requestAnimationFrame(sample);
    };

    requestAnimationFrame(sample);
  }));

  await deck.locator("[data-deck-folder]").click();
  const result = await heightSample;
  expect(result.sawExpanding).toBe(true);
  expect(result.sawExpanded).toBe(true);
  expect(Math.max(...result.heights) - Math.min(...result.heights)).toBeLessThanOrEqual(1);
});

test("replays both folder intros after each collapse", async ({ page }) => {
  const root = page.locator(folders);
  const deck = root.locator(learn);
  await deck.locator("[data-deck-folder]").click();
  await expect(deck).toHaveAttribute("data-deck-state", "expanded");

  await page.evaluate(() => {
    const group = document.querySelector("[data-folders-init]");
    window.__folderCollapseEvents = [];
    group.addEventListener("ecosystemfolders:collapsed", (event) => {
      window.__folderCollapseEvents.push(event.detail?.id);
    });
  });

  const replay = page.evaluate(() => new Promise((resolve) => {
    const group = document.querySelector("[data-folders-init]");
    const onCollapsed = () => {
      group.removeEventListener("ecosystemfolders:collapsed", onCollapsed);
      const started = performance.now();
      let moved = false;
      const isIdentity = (value) => {
        if (value === "none") return true;
        const matrix = new DOMMatrix(value);
        return matrix.a === 1 && matrix.b === 0 && matrix.c === 0 &&
          matrix.d === 1 && matrix.e === 0 && matrix.f === 0;
      };
      const sample = () => {
        const line = group.querySelector("[data-deck-init=learn] .line");
        if (line && !isIdentity(getComputedStyle(line).transform)) moved = true;
        if (performance.now() - started < 150) requestAnimationFrame(sample);
        else resolve(moved);
      };
      requestAnimationFrame(sample);
    };
    group.addEventListener("ecosystemfolders:collapsed", onCollapsed);
  }));

  await deck.locator("[data-deck-collapse]").click();
  expect(await replay).toBe(true);
  expect(await page.evaluate(() => window.__folderCollapseEvents)).toEqual(["learn"]);
  for (const id of ["learn", "voice"]) {
    expect(await root.locator(`[data-deck-init=${id}] [data-split="heading"] .line`).count()).toBeGreaterThan(0);
  }
  await page.waitForTimeout(1200);
  expect(await deck.locator(".line").evaluateAll((lines) => lines.every((line) => {
    const value = getComputedStyle(line).transform;
    if (value === "none") return true;
    const matrix = new DOMMatrix(value);
    return matrix.a === 1 && matrix.b === 0 && matrix.c === 0 &&
      matrix.d === 1 && matrix.e === 0 && matrix.f === 0;
  }))).toBe(true);

  await deck.locator("[data-deck-folder]").press("Enter");
  await expect(deck).toHaveAttribute("data-deck-state", "expanded");
  await deck.locator("[data-deck-collapse]").click();
  await expect(root).toHaveAttribute("data-folders-state", "stacked");
  expect(await page.evaluate(() => window.__folderCollapseEvents)).toEqual(["learn", "learn"]);
});

test("replays both folder hints without replacing the other hint after collapse", async ({ page }) => {
  const root = page.locator(folders);
  const deck = root.locator(learn);
  const otherHint = root.locator("[data-deck-init=voice] [data-deck-hint]");
  await page.evaluate(() => { document.querySelectorAll("[data-deck-hint]").forEach((hint) => hint.setAttribute("data-split", "heading")); window.dispatchEvent(new CustomEvent("hscroll:rebuilt")); });
  await deck.locator("[data-deck-folder]").click();
  await expect(deck).toHaveAttribute("data-deck-state", "expanded");
  const replay = page.evaluate(() => new Promise((resolve) => {
    const group = document.querySelector("[data-folders-init]");
    const otherHint = group.querySelector("[data-deck-init=voice] [data-deck-hint]");
    let eventSeen = false, replayMutation = false, postEventMutations = 0, moved = { learn: false, voice: false };
    const observer = new MutationObserver(() => { if (eventSeen && !replayMutation) replayMutation = true; else if (eventSeen) postEventMutations += 1; });
    observer.observe(otherHint, { childList: true });
    group.addEventListener("ecosystemfolders:collapsed", () => {
      eventSeen = true;
      const started = performance.now();
      const sample = () => {
        ["learn", "voice"].forEach((id) => { const line = group.querySelector(`[data-deck-init=${id}] [data-deck-hint] .line`); if (line && new DOMMatrix(getComputedStyle(line).transform).f > 0) moved[id] = true; });
        if (performance.now() - started < 500) requestAnimationFrame(sample);
        else setTimeout(() => { observer.disconnect(); resolve({ moved, replayMutation, postEventMutations }); }, 700);
      };
      requestAnimationFrame(sample);
    }, { once: true });
  }));

  await deck.locator("[data-deck-collapse]").click();
  const result = await replay;
  expect(result.moved).toEqual({ learn: true, voice: true });
  expect(result.replayMutation).toBe(true);
  expect(result.postEventMutations).toBe(0);
  for (const id of ["learn", "voice"]) {
    const hint = root.locator(`[data-deck-init=${id}] [data-deck-hint]`);
    expect(await hint.locator(".line").count()).toBeGreaterThan(0);
    expect(await hint.locator(".line").evaluateAll((lines) => lines.every((line) =>
      ["none", "matrix(1, 0, 0, 1, 0, 0)"].includes(getComputedStyle(line).transform)))).toBe(true);
  }
  await expect(root.locator(`${learn} [data-deck-hint]`)).toHaveText("Click the folder to reveal all publications");
});

test("reduced motion uses a native row and supports another cycle", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await page.locator("[data-testid=ecosystem]").scrollIntoViewIfNeeded();
  const deck = page.locator(learn);
  await deck.locator("[data-deck-folder]").click();
  await expect(deck).toHaveAttribute("data-deck-state", "expanded");
  await expect(deck.locator("[data-deck-clone]")).toHaveCount(0);
  await expect(deck.locator("[data-deck-viewport]")).toHaveCSS("overflow-x", "auto");
  await deck.locator("[data-deck-collapse]").click();
  await expect(deck).toHaveAttribute("data-deck-state", "stacked");
  await deck.locator("[data-deck-folder]").press("Enter");
  await expect(deck).toHaveAttribute("data-deck-state", "expanded");
});

test("folders stack on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  const root = page.locator(folders);
  await expect(root.locator(".ecosystem_deck")).toHaveCount(2);
  await expect(root).toHaveCSS("flex-direction", "column");
  await expect(root.locator(".ecosystem_deck").first()).toHaveCSS("max-width", "380px");
});

test("drags the infinite row with inertia and keeps links safe", async ({ page }) => {
  const root = page.locator(folders);
  const deck = root.locator(learn);
  await deck.locator("[data-deck-folder]").click();
  await expect(deck).toHaveAttribute("data-deck-state", "expanded");
  await page.mouse.move(0, 0);
  await page.waitForTimeout(120);

  const cardPoint = await deck.locator("[data-deck-viewport]").evaluate((viewport) => {
    const viewportBox = viewport.getBoundingClientRect();
    const card = [...viewport.querySelectorAll("[data-deck-card]")].find((candidate) => {
      const box = candidate.getBoundingClientRect();
      return box.right > viewportBox.left && box.left < viewportBox.right && box.bottom > viewportBox.top && box.top < viewportBox.bottom;
    });
    if (!card) throw new Error("No visible publication card found for drag test");
    card.href = "#drag-test";
    const box = card.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  });
  const hashBefore = await page.evaluate(() => location.hash);
  const before = await deck.locator("[data-deck-track]").evaluate((track) => track.getBoundingClientRect().left);
  await page.mouse.move(cardPoint.x, cardPoint.y);
  await page.mouse.down();
  await expect(deck.locator("[data-deck-viewport]")).toHaveAttribute("data-deck-drag-status", "grabbing");
  for (let offset = 60; offset <= 300; offset += 60) {
    await page.mouse.move(cardPoint.x - offset, cardPoint.y);
  }
  const duringDrag = await deck.locator("[data-deck-track]").evaluate((track) => track.getBoundingClientRect().left);
  expect(duringDrag - before).toBeLessThan(-200);
  expect(duringDrag - before).toBeGreaterThan(-380);
  await page.mouse.up();
  await expect(deck.locator("[data-deck-viewport]")).toHaveAttribute("data-deck-drag-status", "grab");
  await page.waitForTimeout(50);
  expect(await page.evaluate(() => location.hash)).toBe(hashBefore);

  // Let the inertia throw settle before the clean click, or the card under the
  // pointer is still moving and the click lands on a neighbour or a gap.
  await expect.poll(async () => deck.evaluate((root) => root._ecosystemDeckInstance.throwActive), { timeout: 4000 }).toBe(false);
  const cleanPoint = await deck.locator("[data-deck-viewport]").evaluate((viewport) => {
    const viewportBox = viewport.getBoundingClientRect();
    // A card fully inside the window: a half-off-screen card at the left edge
    // has been seen to miss under parallel test load.
    const card = [...viewport.querySelectorAll("[data-deck-card]")].find((candidate) => {
      const box = candidate.getBoundingClientRect();
      return box.left > Math.max(viewportBox.left, 0) + 40 && box.right < Math.min(viewportBox.right, window.innerWidth) - 40;
    });
    if (!card) throw new Error("No fully visible publication card found for clean click");
    card.href = "#drag-test";
    const box = card.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  });
  await page.mouse.click(cleanPoint.x, cleanPoint.y);
  expect(await page.evaluate(() => location.hash)).toBe("#drag-test");
  await page.mouse.move(0, 0);
  const movingBefore = await deck.locator("[data-deck-track]").evaluate((track) => track.getBoundingClientRect().left);
  await expect.poll(async () => deck.locator("[data-deck-track]").evaluate((track) => track.getBoundingClientRect().left), { timeout: 1500 }).toBeLessThan(movingBefore);
});
