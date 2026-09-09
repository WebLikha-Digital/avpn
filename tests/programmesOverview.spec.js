import { test, expect } from "@playwright/test";

const section = ".section_programmes-overview[data-prog-overview-init]";
const intro = "[data-prog-overview-intro]";
const list = "[data-prog-overview-list]";
const rows = "[data-hover-row]";
// The reveal animates a wrapper inside the row; the hover dims the row itself.
const reveals = "[data-prog-overview-row]";

async function scrollTo(page, y) {
  // Locomotive eases window.scrollY, so drive it the way a user would and let
  // the lerp settle before reading anything back.
  await page.evaluate((target) => window.scrollTo({ top: target, behavior: "instant" }), y);
  await page.waitForTimeout(400);
}

// The section's own height is the scrub distance: its top hitting the top of
// the viewport is progress 0, its bottom hitting the bottom is progress 1.
async function geometry(page) {
  return page.locator(section).evaluate((el) => ({
    top: el.getBoundingClientRect().top + window.scrollY,
    distance: el.offsetHeight - window.innerHeight,
  }));
}

const topOf = (page, selector) =>
  page.locator(selector).evaluate((el) => el.getBoundingClientRect().top);

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.locator(section)).toHaveCount(1);
});

test("sizes the section to the pin length it is given", async ({ page }) => {
  const { distance } = await geometry(page);
  const pin = await page
    .locator(section)
    .evaluate((el) =>
      Number.parseFloat(getComputedStyle(el).getPropertyValue("--prog-overview-pin")),
    );

  // --prog-overview-pin is authored in vh, and it is the whole scrub distance:
  // the first 100vh of the section is the sticky child's own height.
  const expected = (pin / 100) * (await page.evaluate(() => window.innerHeight));
  expect(distance).toBeCloseTo(expected, -1);
});

test("carries the intro out while the list rises into its place", async ({ page }) => {
  const { top, distance } = await geometry(page);

  await scrollTo(page, top);
  const introStart = await topOf(page, intro);
  const listStart = await topOf(page, list);

  await scrollTo(page, top + distance);
  const introEnd = await topOf(page, intro);
  const listEnd = await topOf(page, list);

  const viewportHeight = await page.evaluate(() => window.innerHeight);

  // The intro clears the top of the sticky window rather than merely shifting.
  expect(introStart - introEnd).toBeGreaterThan(viewportHeight * 0.8);
  expect(introEnd).toBeLessThan(0);

  // The list travels the other way: down the page at rest, up into the space
  // the intro leaves.
  expect(listStart - listEnd).toBeGreaterThan(viewportHeight * 0.4);
});

// Scrubbed, not once-and-stay — scrolling back has to put the section where it
// started. A once:true reveal passes the forward check and strands the rows.
test("reverses on the way back up", async ({ page }) => {
  const { top, distance } = await geometry(page);

  await scrollTo(page, top);
  const introStart = await topOf(page, intro);
  const listStart = await topOf(page, list);

  await scrollTo(page, top + distance);
  await scrollTo(page, top);

  expect(await topOf(page, intro)).toBeCloseTo(introStart, -1);
  expect(await topOf(page, list)).toBeCloseTo(listStart, -1);
});

// A settled reading passes on a timeline that only snaps into place at the
// ends, so sample while the page is actually moving.
test("tracks scroll continuously rather than snapping at the ends", async ({ page }) => {
  const { top, distance } = await geometry(page);

  const samples = [];
  for (let step = 0; step <= 8; step += 1) {
    await scrollTo(page, top + (distance * step) / 8);
    samples.push(await topOf(page, intro));
  }

  const deltas = samples.slice(1).map((value, i) => samples[i] - value);
  const travelled = samples[0] - samples[samples.length - 1];

  // The intro only travels over the first part of the section, so the later
  // steps are legitimately still. What matters is that it never goes backwards,
  // that several steps move it, and that no single step carries most of the
  // distance — the signature of a snap rather than a scrub.
  expect(Math.min(...deltas)).toBeGreaterThan(-1);
  expect(deltas.filter((delta) => delta > 1).length).toBeGreaterThanOrEqual(3);
  expect(Math.max(...deltas)).toBeLessThan(travelled * 0.6);
});

// A staggered `from` holds its start values on the first target only, which
// leaves six rows visible over the heading at the start and the seventh stuck
// invisible at the end. Check every row at both ends, not just one.
test("hides every row at the start and shows every row at the end", async ({ page }) => {
  const { top, distance } = await geometry(page);

  const opacities = () =>
    page
      .locator(reveals)
      .evaluateAll((els) =>
        els.map((el) => Number.parseFloat(getComputedStyle(el).opacity)),
      );

  await scrollTo(page, top);
  for (const value of await opacities()) expect(value).toBeLessThan(0.05);

  await scrollTo(page, top + distance);
  for (const value of await opacities()) expect(value).toBeCloseTo(1, 1);
});

test("fills one row on hover and dims the rest", async ({ page }) => {
  // The rows are hidden until the sequence has played, so hover at the end of
  // the scrub, which is where a visitor meets them.
  const { top, distance } = await geometry(page);
  await scrollTo(page, top + distance);

  const row = page.locator(rows).nth(1);
  await row.hover();
  await page.waitForTimeout(600);

  await expect(row).toHaveAttribute("data-hover-state", "active");
  await expect(page.locator(list)).toHaveAttribute("data-hover-state", "active");

  const bg = row.locator("[data-hover-bg]");
  const scaleY = await bg.evaluate(
    (el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).d,
  );
  expect(scaleY).toBeCloseTo(1, 1);

  const neighbour = page.locator(rows).nth(0);
  const dimmed = await neighbour.evaluate((el) =>
    Number.parseFloat(getComputedStyle(el).opacity),
  );
  expect(dimmed).toBeLessThan(0.5);
});

test("puts the row back when the pointer leaves the list", async ({ page }) => {
  // The rows are hidden until the sequence has played, so hover at the end of
  // the scrub, which is where a visitor meets them.
  const { top, distance } = await geometry(page);
  await scrollTo(page, top + distance);

  const row = page.locator(rows).nth(1);
  await row.hover();
  await page.waitForTimeout(600);

  await page.mouse.move(5, 5);
  await page.waitForTimeout(700);

  await expect(row).toHaveAttribute("data-hover-state", "idle");
  await expect(page.locator(list)).toHaveAttribute("data-hover-state", "idle");

  const scaleY = await row
    .locator("[data-hover-bg]")
    .evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).d);
  expect(scaleY).toBeCloseTo(0, 1);
});

// The rows are links, so tabbing has to light the same states the pointer does.
test("lights the same states from the keyboard", async ({ page }) => {
  // The rows are hidden until the sequence has played, so hover at the end of
  // the scrub, which is where a visitor meets them.
  const { top, distance } = await geometry(page);
  await scrollTo(page, top + distance);

  const row = page.locator(rows).nth(2);
  await row.focus();
  await page.waitForTimeout(600);

  await expect(row).toHaveAttribute("data-hover-state", "active");
  await expect(page.locator(list)).toHaveAttribute("data-hover-state", "active");
});

// The preview image is no longer painted in the row — listPreviewFollower
// clones the row's visual into a fixed element that tracks the pointer, so the
// row itself only carries the source copy, hidden.
test("clones the hovered row's visual into the cursor follower", async ({ page }) => {
  const { top, distance } = await geometry(page);
  await scrollTo(page, top + distance);

  const cursor = page.locator("[data-follower-cursor]");
  const clones = cursor.locator("[data-follower-visual]");

  await expect(clones).toHaveCount(0);

  // The in-row copy is the source, never something the reader sees.
  const inRow = page.locator("[data-follower-item] [data-follower-visual]").first();
  await expect(inRow).toHaveCSS("display", "none");

  await page.locator(rows).nth(1).hover();
  await page.waitForTimeout(700);
  await expect(clones).toHaveCount(1);

  // Leaving the list clears it again.
  await page.mouse.move(5, 5);
  await page.waitForTimeout(900);
  await expect(clones).toHaveCount(0);
});

// Moving down the list pushes the outgoing image up and brings the new one in
// from below, so mid-swap both are in the cursor at once.
test("swaps the visual when the pointer moves between rows", async ({ page }) => {
  const { top, distance } = await geometry(page);
  await scrollTo(page, top + distance);

  const clones = page.locator("[data-follower-cursor] [data-follower-visual]");

  await page.locator(rows).nth(1).hover();
  await page.waitForTimeout(700);
  await expect(clones).toHaveCount(1);

  await page.locator(rows).nth(3).hover();
  await page.waitForTimeout(150);
  await expect(clones).toHaveCount(2);

  await page.waitForTimeout(900);
  await expect(clones).toHaveCount(1);
});
