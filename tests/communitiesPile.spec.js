import { test, expect } from "@playwright/test";

const section = "[data-communities-init]";
const ball = `${section} [data-communities-ball]`;

async function scrollIntoView(page) {
  await page.locator(section).scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
}

async function snapshot(page) {
  return page.locator(section).evaluate((root) => {
    const pile = root.querySelector("[data-communities-pile]").getBoundingClientRect();
    const header = root.querySelector("[data-communities-obstacle]").getBoundingClientRect();
    const bounds = (rect) => ({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom });
    return [...root.querySelectorAll("[data-communities-ball]")].map((element) => {
      const rect = element.getBoundingClientRect();
      const radius = element.offsetWidth / 2;
      return {
        centre: { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 },
        radius,
        rotation: Number.parseFloat(element.style.transform.match(/rotate\(([-\d.]+)rad\)/)?.[1] ?? 0),
        pile: bounds(pile),
        header: bounds(header),
      };
    });
  });
}

test("does not drop until Communities Served enters the viewport", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.locator(`${section}[data-communities-state="physics"]`)).toHaveCount(1);
  const initial = await page.locator(ball).first().evaluate((element) => ({
    transform: element.style.transform,
    visibility: getComputedStyle(element).visibility,
  }));
  expect(initial.visibility).toBe("hidden");
  await scrollIntoView(page);
  await expect.poll(() => page.locator(ball).first().evaluate((element) => ({
    transform: element.style.transform,
    visibility: getComputedStyle(element).visibility,
  }))).toEqual(expect.objectContaining({ visibility: "visible" }));
  await expect.poll(() => page.locator(ball).first().evaluate((element) => element.style.transform)).not.toBe(initial.transform);
});

test("drops balls from largest to smallest without reordering the DOM", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const domWidths = await page.locator(ball).evaluateAll((elements) => (
    elements.map((element) => element.offsetWidth)
  ));
  expect(domWidths).not.toEqual([...domWidths].sort((left, right) => right - left));

  await page.locator(section).evaluate((root) => {
    const elements = [...root.querySelectorAll("[data-communities-ball]")];
    const order = [];
    const seen = new Set();
    const observer = new MutationObserver((records) => {
      records.forEach(({ target }) => {
        const index = elements.indexOf(target);
        if (target.style.visibility !== "visible" || seen.has(index)) return;
        seen.add(index);
        order.push({ index, width: target.offsetWidth });
      });
      root.__communitiesVisibilityOrder = {
        done: seen.size === elements.length,
        order,
      };
      if (seen.size === elements.length) observer.disconnect();
    });
    elements.forEach((element) => observer.observe(element, {
      attributes: true,
      attributeFilter: ["style"],
    }));
  });

  await page.locator(section).scrollIntoViewIfNeeded();
  await expect.poll(() => page.locator(section).evaluate((root) => (
    root.__communitiesVisibilityOrder?.done
  )), { timeout: 5000 }).toBe(true);

  const visibilityOrder = await page.locator(section).evaluate((root) => (
    root.__communitiesVisibilityOrder.order.map(({ width }) => width)
  ));
  expect(visibilityOrder).toEqual(
    [...visibilityOrder].sort((left, right) => right - left),
  );
});

test("balls move on consecutive frames and settle inside the desktop pile", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await scrollIntoView(page);
  const samples = await page.locator(section).evaluate(async (root) => {
    const element = [...root.querySelectorAll("[data-communities-ball]")]
      .reduce((largest, candidate) => (
        candidate.offsetWidth > largest.offsetWidth ? candidate : largest
      ));
    const values = [];
    for (let index = 0; index < 24; index += 1) {
      values.push(element.style.transform);
      await new Promise(requestAnimationFrame);
    }
    return values;
  });
  expect(new Set(samples).size).toBeGreaterThan(3);
  await page.waitForTimeout(4200);
  // Ceiling lands once the last ball is inside; settle is judged after that.
  await expect.poll(() => page.locator(section).evaluate((root) => ({
    ceiling: Boolean(root._communitiesPile.ceiling),
    tickerActive: root._communitiesPile.tickerActive,
  })), { timeout: 8000 }).toEqual({ ceiling: true, tickerActive: false });
  const positions = await snapshot(page);
  positions.forEach(({ centre, radius, rotation, pile, header }) => {
    expect(Math.abs(rotation)).toBeLessThanOrEqual(0.3);
    expect(centre.x - radius).toBeGreaterThanOrEqual(pile.left - 1);
    expect(centre.x + radius).toBeLessThanOrEqual(pile.right + 1);
    expect(centre.y - radius).toBeGreaterThanOrEqual(pile.top - 8); // resting slop against the ceiling
    expect(centre.y + radius).toBeLessThanOrEqual(pile.bottom + 1);
    const closestX = Math.max(header.left, Math.min(centre.x, header.right));
    const closestY = Math.max(header.top, Math.min(centre.y, header.bottom));
    expect(Math.hypot(centre.x - closestX, centre.y - closestY)).toBeGreaterThanOrEqual(radius - 1);
  });
});

test("settles inside the pile on mobile without a header obstacle", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await scrollIntoView(page);
  await page.waitForTimeout(4200);
  const positions = await snapshot(page);
  positions.forEach(({ centre, radius, rotation, pile }) => {
    expect(Math.abs(rotation)).toBeLessThanOrEqual(0.3);
    expect(centre.x - radius).toBeGreaterThanOrEqual(pile.left - 1);
    expect(centre.x + radius).toBeLessThanOrEqual(pile.right + 1);
    expect(centre.y + radius).toBeLessThanOrEqual(pile.bottom + 1);
  });
});

test("dragging a settled desktop ball wakes, tracks, and flings the pile", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await scrollIntoView(page);
  await page.waitForTimeout(4200);

  const before = await page.locator(section).evaluate((root) => {
    const element = root.querySelector("[data-communities-ball]");
    const rect = element.getBoundingClientRect();
    return {
      centre: { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 },
      tickerActive: root._communitiesPile.tickerActive,
    };
  });
  expect(before.tickerActive).toBe(false);

  await page.mouse.move(before.centre.x, before.centre.y);
  await page.evaluate(() => {
    window.__communitiesDragFrames = [];
    const element = document.querySelector("[data-communities-init] [data-communities-ball]");
    const sample = () => {
      window.__communitiesDragFrames.push(element.style.transform);
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.mouse.down();
  let dragging = false;
  for (let index = 1; index <= 30; index += 1) {
    await page.mouse.move(before.centre.x + index * 12, before.centre.y - index * 8);
    dragging ||= await page.locator(section).evaluate((root) => Boolean(
      root.querySelector("[data-communities-dragging]"),
    ));
    await page.waitForTimeout(30);
  }
  // Release over the fixed nav, outside the pile, so only the window listener sees it.
  await page.mouse.move(1400, 20);
  await page.mouse.up();

  const frames = await page.evaluate(() => window.__communitiesDragFrames);
  expect(new Set(frames).size).toBeGreaterThan(3);
  expect(dragging).toBe(true);
  // The ball tracked the pointer while held: judge the drag itself, not where the
  // ball lands afterwards — a plucked ball may drop straight back into its own hole.
  const translate = (value) => {
    const match = value.match(/translate3d\(([-\d.]+)px, ([-\d.]+)px/);
    return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
  };
  const origin = translate(frames[0]);
  const reach = Math.max(...frames.map((value) => {
    const point = translate(value);
    return point && origin ? Math.hypot(point.x - origin.x, point.y - origin.y) : 0;
  }));
  expect(reach).toBeGreaterThan(40);

  await expect.poll(() => page.locator(section).evaluate((root) => ({
    dragging: Boolean(root.querySelector("[data-communities-dragging]")),
    button: root._communitiesPile.mouse.button,
  })), { timeout: 3000 }).toEqual({ dragging: false, button: -1 });

  await page.waitForTimeout(2000);
  await expect.poll(() => page.locator(section).evaluate((root) => ({
    sleeping: root._communitiesPile.bodies.every((body) => body.isSleeping),
    tickerActive: root._communitiesPile.tickerActive,
  })), { timeout: 8000 }).toEqual({ sleeping: true, tickerActive: false });
  const after = await snapshot(page);
  after.forEach(({ centre, radius, pile }) => {
    expect(centre.x - radius).toBeGreaterThanOrEqual(pile.left - 1);
    expect(centre.x + radius).toBeLessThanOrEqual(pile.right + 1);
    expect(centre.y - radius).toBeGreaterThanOrEqual(pile.top - 8); // resting slop against the ceiling
    expect(centre.y + radius).toBeLessThanOrEqual(pile.bottom + 1);
  });
});

test("reduced motion keeps the authored static layout", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.locator(`${section}[data-communities-state]`)).toHaveCount(0);
  await expect(page.locator(ball)).toHaveCount(11);
});

test("sizes balls linearly from their percentage values", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const values = await page.locator(ball).evaluateAll((elements) => elements.map((element) => ({
    label: element.querySelector(".communities_ball-label").textContent.trim(),
    value: Number.parseFloat(element.querySelector(".communities_ball-value").textContent),
    t: Number.parseFloat(element.style.getPropertyValue("--communities-t")),
    diameter: element.offsetWidth,
  })));
  const sorted = [...values].sort((left, right) => left.value - right.value);
  expect(sorted.map(({ diameter }) => diameter)).toEqual(
    [...sorted].sort((left, right) => left.diameter - right.diameter).map(({ diameter }) => diameter),
  );
  expect(values.find(({ label }) => label === "Children and youths")).toMatchObject({ t: 1 });
  expect(values.find(({ label }) => label === "Offenders and re-offenders")).toMatchObject({ t: 0 });
});

test("unparseable values use the middle-size fallback and equal values stay equal", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const result = await page.locator(section).evaluate(async (root) => {
    root.querySelectorAll(".communities_ball-value").forEach((element) => {
      element.textContent = "5%";
    });
    const invalid = root.querySelector("[data-communities-ball]");
    invalid.querySelector(".communities_ball-value").textContent = "unknown";
    const { initCommunitiesPile } = await import("/src/animations/communitiesPile.js");
    initCommunitiesPile();
    return [...root.querySelectorAll("[data-communities-ball]")].map((element) => ({
      property: element.style.getPropertyValue("--communities-t"),
      diameter: element.offsetWidth,
    }));
  });
  expect(result[0].property).toBe("");
  expect(result.slice(1).every(({ property }) => property === "0.5")).toBe(true);
  expect(new Set(result.map(({ diameter }) => diameter)).size).toBe(1);
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 991, height: 768 },
  { width: 820, height: 1180 },
  { width: 390, height: 844 },
]) {
  test(`ball text stays inside its circle at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    // Reduced motion keeps the static layout (no tilt), so client rects are exact.
    // Check every rendered line box: centred lines narrow toward the circle's poles.
    const overflow = await page.locator(ball).evaluateAll((elements) => elements.map((element) => {
      const box = element.getBoundingClientRect();
      const radius = box.width / 2;
      const range = document.createRange();
      const worst = [...element.querySelectorAll(".communities_ball-label, .communities_ball-value")]
        .flatMap((child) => {
          range.selectNodeContents(child);
          return [...range.getClientRects()];
        })
        .flatMap((line) => [[line.left, line.top], [line.right, line.top], [line.left, line.bottom], [line.right, line.bottom]])
        .reduce((max, [x, y]) => Math.max(max, Math.hypot(x - box.left - radius, y - box.top - radius)), 0);
      return worst > radius + 0.5 ? element.querySelector(".communities_ball-label").textContent.trim() : null;
    }));
    expect(overflow.filter(Boolean)).toEqual([]);
  });
}

for (const viewport of [
  { width: 991, height: 768 },
  { width: 820, height: 1180 },
]) {
  test(`settles inside the tablet pile at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await scrollIntoView(page);
    await expect.poll(() => page.locator(section).evaluate((root) => ({
      ceiling: Boolean(root._communitiesPile.ceiling),
      tickerActive: root._communitiesPile.tickerActive,
    })), { timeout: 15000 }).toEqual({ ceiling: true, tickerActive: false });
    const positions = await snapshot(page);
    positions.forEach(({ centre, radius, pile }) => {
      expect(centre.x - radius).toBeGreaterThanOrEqual(pile.left - 1);
      expect(centre.x + radius).toBeLessThanOrEqual(pile.right + 1);
      expect(centre.y - radius).toBeGreaterThanOrEqual(pile.top - 8);
      expect(centre.y + radius).toBeLessThanOrEqual(pile.bottom + 1);
    });
  });
}

test("re-init replaces one instance and teardown removes physics state", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const result = await page.locator(section).evaluate(async (root) => {
    const { initCommunitiesPile } = await import("/src/animations/communitiesPile.js");
    const first = root._communitiesPile;
    initCommunitiesPile();
    const second = root._communitiesPile;
    const triggerCount = (await import("/src/lib/gsap.js")).ScrollTrigger.getAll()
      .filter((trigger) => trigger.vars.trigger === root).length;
    second.kill();
    return { replaced: first !== second, triggerCount, state: root.dataset.communitiesState };
  });
  expect(result.replaced).toBe(true);
  expect(result.triggerCount).toBe(1);
  expect(result.state).toBeUndefined();
});
