import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";

// The Key Highlights gradient on the published site. The palette lives on the
// Webflow elements, not in this repo, so the assertions read the section's own
// [data-highlight-drum-gradient] attributes and check the scrub against them
// rather than hardcoding hex values that Webflow can change.
const BUNDLE_PATH = fileURLToPath(new URL("../../dist/animations.min.js", import.meta.url));
const SECTION = ".section_highlights";

// The stops are hex at rest and rgba() mid-blend — a custom property is only a
// string, so the browser never normalises one. Resolving each through a real
// colour declaration gives both forms back as the same rgb() triple.
function readStops(page) {
  return page.evaluate((sel) => {
    const probe = document.createElement("span");
    document.body.appendChild(probe);
    const toRgb = (value) => {
      probe.style.color = value;
      return getComputedStyle(probe).color.match(/[\d.]+/g).slice(0, 3).map(Number);
    };

    const styles = getComputedStyle(document.querySelector(sel));
    const stops = {
      from: toRgb(styles.getPropertyValue("--highlight-drum-grad-from").trim()),
      to: toRgb(styles.getPropertyValue("--highlight-drum-grad-to").trim()),
    };
    probe.remove();
    return stops;
  }, SECTION);
}

test.beforeEach(async ({ page }) => {
  expect(existsSync(BUNDLE_PATH), `no bundle at ${BUNDLE_PATH} — run \`npm run build\``).toBe(true);

  // Chrome blocks the published page's http://localhost:4173 script tag as a
  // private-network request, so the bundle is fulfilled from dist/ here.
  await page.route("**/animations.min.js", async (route) => {
    await route.fulfill({ path: BUNDLE_PATH, contentType: "application/javascript" });
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect
    .poll(() => page.evaluate((s) => Boolean(document.querySelector(s)?._highlightDrumTrigger), SECTION))
    .toBe(true);
});

test("paints each stat's own gradient at its own scroll position", async ({ page }) => {
  const palette = await page.evaluate((sel) => {
    const section = document.querySelector(sel);
    return [...section.querySelectorAll("[data-highlight-drum-item]")].map((item) =>
      (item.getAttribute("data-highlight-drum-gradient") || "").split(",").map((c) => c.trim()),
    );
  }, SECTION);

  expect(palette.length, "every stat needs a gradient pair in Webflow").toBeGreaterThan(1);
  expect(palette.every((pair) => pair.length === 2 && pair.every(Boolean))).toBe(true);

  const geo = await page.evaluate((sel) => {
    const section = document.querySelector(sel);
    return {
      top: section.getBoundingClientRect().top + window.scrollY,
      height: section.offsetHeight,
    };
  }, SECTION);

  // The scrub runs from the section's top hitting the viewport top to its
  // bottom hitting the viewport bottom, so its usable range is one viewport
  // shorter than the section.
  const range = geo.height - 900;
  const hex = (value) => {
    const n = parseInt(value.replace("#", ""), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };

  for (const [index, pair] of palette.entries()) {
    const progress = index / (palette.length - 1);
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), geo.top + range * progress);
    await page.waitForTimeout(600);

    const stops = await readStops(page);
    for (const [channel, expected] of hex(pair[0]).entries()) {
      expect(Math.abs(stops.from[channel] - expected), `stat ${index + 1} bottom stop`).toBeLessThanOrEqual(2);
    }
    for (const [channel, expected] of hex(pair[1]).entries()) {
      expect(Math.abs(stops.to[channel] - expected), `stat ${index + 1} top stop`).toBeLessThanOrEqual(2);
    }
  }
});

test("blends the gradient continuously while the drum turns", async ({ page }) => {
  // Reading settled positions cannot tell a scrub from a step — both land on
  // the same colours at the same stops. The difference is only visible in
  // motion, so this samples the stop per animation frame through one step and
  // checks the colour keeps moving instead of jumping once.
  const geo = await page.evaluate((sel) => {
    const section = document.querySelector(sel);
    return {
      top: section.getBoundingClientRect().top + window.scrollY,
      height: section.offsetHeight,
      steps: section.querySelectorAll("[data-highlight-drum-item]").length - 1,
    };
  }, SECTION);

  const range = geo.height - 900;
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), geo.top + 40);
  await page.waitForTimeout(700);

  await page.evaluate((sel) => {
    window.__gradFrames = [];
    const section = document.querySelector(sel);
    const tick = () => {
      window.__gradFrames.push(
        getComputedStyle(section).getPropertyValue("--highlight-drum-grad-from").trim(),
      );
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, SECTION);

  await page.mouse.move(700, 450);
  const wheelSteps = Math.round(range / geo.steps / 60);
  for (let i = 0; i < wheelSteps; i += 1) {
    await page.mouse.wheel(0, 60);
    await page.waitForTimeout(30);
  }
  await page.waitForTimeout(400);

  const distinct = await page.evaluate(() => new Set(window.__gradFrames).size);

  // A stepped gradient produces two distinct colours across this scroll; a
  // scrubbed one produces a new colour on most frames.
  expect(distinct, "the gradient should blend, not snap, through a step").toBeGreaterThan(10);
});
