import { test, expect } from "@playwright/test";

const ROOT = '[data-testid="scroll-parallax"]';
const IMAGE = `${ROOT} [data-parallax]`;
const FRAME = `${ROOT} .sticky-picture-demo__frame`;

function normalizeClipPath(clipPath) {
  return clipPath.replace(/\s+/g, "").toLowerCase();
}

async function serializedClipPath(page, clipPath) {
  return page
    .evaluate((value) => {
      const scratch = document.createElement("div");
      scratch.style.clipPath = value;
      return scratch.style.clipPath;
    }, clipPath)
    .then(normalizeClipPath);
}

async function loadFixture(page, reducedMotion = "no-preference") {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.emulateMedia({ reducedMotion });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
}

async function sectionRange(page) {
  return page.locator(IMAGE).evaluate((image) => {
    const trigger = image._scrollParallax.scrollTrigger;
    return { start: trigger.start, end: trigger.end };
  });
}

async function sampleWhileScrolling(page, start, end, count = 40) {
  return page.evaluate(
    ({ start, end, count }) =>
      new Promise((resolve) => {
        const image = document.querySelector('[data-testid="scroll-parallax"] [data-parallax]');
        const frame = document.querySelector('[data-testid="scroll-parallax"] .sticky-picture-demo__frame');
        const samples = [];
        let index = 0;

        const sample = () => {
          const imageRect = image.getBoundingClientRect();
          const frameRect = frame.getBoundingClientRect();
          samples.push({
            scrollY: window.scrollY,
            imageTop: imageRect.top,
            imageBottom: imageRect.bottom,
            frameTop: frameRect.top,
            frameBottom: frameRect.bottom,
          });

          index += 1;
          if (index >= count) {
            resolve(samples);
            return;
          }

          const progress = index / (count - 1);
          window.scrollTo({
            top: start + (end - start) * progress,
            behavior: "instant",
          });
          requestAnimationFrame(sample);
        };

        window.scrollTo({ top: start, behavior: "instant" });
        requestAnimationFrame(sample);
      }),
    { start, end, count },
  );
}

test("covers the frame and moves monotonically during continuous scroll", async ({ page }) => {
  await loadFixture(page);
  await expect
    .poll(() => page.locator(IMAGE).evaluate((image) => Boolean(image._scrollParallax)))
    .toBe(true);

  const { start, end } = await sectionRange(page);
  const samples = await sampleWhileScrolling(page, start + 20, end - 20);

  expect(samples.length).toBeGreaterThan(10);
  for (const sample of samples) {
    expect(sample.imageTop).toBeLessThanOrEqual(sample.frameTop + 0.5);
    expect(sample.imageBottom).toBeGreaterThanOrEqual(sample.frameBottom - 0.5);
  }

  const relativeTops = samples.map((sample) => sample.imageTop - sample.frameTop);
  for (let index = 1; index < relativeTops.length; index += 1) {
    expect(relativeTops[index]).toBeGreaterThanOrEqual(relativeTops[index - 1] - 1);
  }
  expect(relativeTops.at(-1)).toBeGreaterThan(relativeTops[0] + 10);
});

test("tears down below the minimum width and rebuilds exactly once", async ({ page }) => {
  await loadFixture(page);
  const image = page.locator(IMAGE);

  await expect.poll(() => image.evaluate((element) => Boolean(element._scrollParallax))).toBe(true);

  await page.setViewportSize({ width: 500, height: 800 });
  await expect.poll(() => image.evaluate((element) => Boolean(element._scrollParallax))).toBe(false);
  await expect.poll(() => image.evaluate((element) => element.style.transform)).toBe("");

  await page.setViewportSize({ width: 1200, height: 800 });
  await expect.poll(() => image.evaluate((element) => Boolean(element._scrollParallax))).toBe(true);
  await expect
    .poll(() => image.evaluate(async (element) => {
      const { ScrollTrigger } = await import("/src/lib/gsap.js");
      return ScrollTrigger.getAll().filter(
        (trigger) => trigger.vars.trigger === element.closest("section"),
      ).length;
    }))
    .toBe(1);
});

test("leaves the image untouched for reduced motion", async ({ page }) => {
  await loadFixture(page, "reduce");
  const image = page.locator(IMAGE);

  await expect.poll(() => image.evaluate((element) => element.style.transform)).toBe("");
  await expect.poll(() => image.evaluate((element) => Boolean(element._scrollParallax))).toBe(false);
});

test("keeps the wipe reveal working on the parallax image", async ({ page }) => {
  await loadFixture(page);
  const image = page.locator(IMAGE);

  await expect.poll(() => image.evaluate((element) => Boolean(element._wipeTween))).toBe(true);
  const end = await image.evaluate((element) => element._wipeTween.scrollTrigger.end);
  await page.evaluate((top) => window.scrollTo({ top: top + 20, behavior: "instant" }), end);

  await expect
    .poll(() => image.evaluate((element) => element.style.clipPath).then(normalizeClipPath))
    .toBe(await serializedClipPath(page, "inset(0% 0% 0% 0%)"));
});
