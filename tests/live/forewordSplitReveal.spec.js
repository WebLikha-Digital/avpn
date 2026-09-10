import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";

const BUNDLE_PATH = fileURLToPath(new URL("../../dist/animations.min.js", import.meta.url));
const SETTLE_TOLERANCE = 8;
const CONTENT = ".sticky-picture_content";

async function settledScrollY(page) {
  let previous = Number.NaN;

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const current = await page.evaluate(() => window.scrollY);
    if (Math.abs(current - previous) < 0.5) return current;
    previous = current;
    await page.waitForTimeout(80);
  }

  return page.evaluate(() => window.scrollY);
}

async function scrollTo(page, target) {
  const viewport = page.viewportSize();
  await page.mouse.move(viewport.width / 2, viewport.height / 2);

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const current = await settledScrollY(page);
    const remaining = target - current;
    if (Math.abs(remaining) <= SETTLE_TOLERANCE) return current;
    await page.mouse.wheel(0, Math.sign(remaining) * Math.min(Math.abs(remaining), 500));
  }

  throw new Error(`could not settle the page at scrollY ${target}`);
}

/**
 * Every split target in the column, with the offset of its own piece against
 * the mask that clips it. A piece parked at its resting position sits flush
 * with the mask (offset ~0); one still waiting reveals sits a full line below.
 */
function readTargets(page, selector) {
  return page.evaluate((contentSelector) => {
    const content = document.querySelector(contentSelector);
    const splits = [...content.querySelectorAll('[data-split="heading"]')];

    return splits.map((element) => {
      const type = element.getAttribute("data-split-reveal") || "lines";
      const pieces = [...element.querySelectorAll(type === "words" ? ".word" : ".line")];
      const rect = element.getBoundingClientRect();

      const offsets = pieces.map((piece) => {
        const mask = piece.parentElement;
        return piece.getBoundingClientRect().top - mask.getBoundingClientRect().top;
      });

      return {
        tag: element.tagName,
        type,
        split: Boolean(element._splitInstance),
        pieceCount: pieces.length,
        maskCount: element.querySelectorAll(".line").length,
        maxOffset: offsets.length ? Math.max(...offsets.map(Math.abs)) : Number.NaN,
        offsetTop: rect.top + window.scrollY,
        height: rect.height,
      };
    });
  }, selector);
}

test.beforeEach(async ({ page }) => {
  expect(existsSync(BUNDLE_PATH), `no bundle at ${BUNDLE_PATH} — run \`npm run build\``).toBe(true);

  await page.route("**/animations.min.js", async (route) => {
    await route.fulfill({ path: BUNDLE_PATH, contentType: "application/javascript" });
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect
    .poll(() =>
      page.evaluate(
        (selector) =>
          [...document.querySelectorAll(`${selector} [data-split="heading"]`)].every(
            (element) => Boolean(element._splitInstance),
          ),
        CONTENT,
      ),
    )
    .toBe(true);
});

test("splits the foreword heading and every body paragraph", async ({ page }) => {
  const targets = await readTargets(page, CONTENT);

  expect(targets).toHaveLength(5);
  expect(targets.filter((target) => target.tag === "H2")).toHaveLength(1);
  expect(targets.filter((target) => target.tag === "P")).toHaveLength(4);

  const heading = targets.find((target) => target.tag === "H2");
  expect(heading.type).toBe("words");

  for (const target of targets) {
    expect(target.split, `${target.tag} has no SplitText instance`).toBe(true);
    expect(target.pieceCount, `${target.tag} produced no split pieces`).toBeGreaterThan(0);
    // mask: "lines" — every reveal rides behind a per-line mask, whatever the
    // granularity the pieces are split at.
    expect(target.maskCount, `${target.tag} has no line masks`).toBeGreaterThan(0);
  }
});

test("holds each piece under its mask until the reveal fires, then lands it", async ({ page }) => {
  // At the top of the page every target is still far below the fold, so none of
  // them can have fired yet. The reveals cascade as the column passes, and
  // several share a viewport — so they are checked as a set at each end rather
  // than one at a time.
  const parked = await readTargets(page, CONTENT);

  for (const [index, target] of parked.entries()) {
    expect(
      target.offsetTop - 0.8 * page.viewportSize().height,
      `${target.tag} #${index} should start below the fold`,
    ).toBeGreaterThan(0);

    expect(
      target.maxOffset,
      `${target.tag} #${index} should still be parked below its mask`,
    ).toBeGreaterThan(target.height / target.maskCount / 2);
  }

  const last = parked[parked.length - 1];
  await scrollTo(page, last.offsetTop + last.height);
  await page.waitForTimeout(1500);

  const landed = await readTargets(page, CONTENT);

  for (const [index, target] of landed.entries()) {
    expect(
      target.maxOffset,
      `${target.tag} #${index} should have landed flush with its mask`,
    ).toBeLessThan(2);
  }
});
