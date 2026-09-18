import { test, expect } from "@playwright/test";

const rootSelector = "[data-testimonials-init]";
const activeItem = '[data-testimonials-item-status="active"]';

async function settle(root) {
  await expect.poll(() => root.evaluate((node) => node._membersTestimonialsInstance?.isAnimating)).toBe(false);
}

async function showSection(page) {
  const root = page.locator(rootSelector);
  await root.evaluate((node) => node.scrollIntoView({ block: "center", behavior: "instant" }));
  await expect(root.locator(activeItem)).toHaveCount(1);
  return root;
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const proto = HTMLMediaElement.prototype;
    proto.play = function playStub() {
      this.__played = true;
      return Promise.resolve();
    };
    proto.pause = function pauseStub() {
      this.__paused = true;
    };
  });
  await page.goto("/");
});

test("places the active visual at three o'clock and the thumbs at the orbit slots", async ({ page }) => {
  const root = await showSection(page);
  const geometry = await root.evaluate((node) => {
    const origin = node.querySelector("[data-testimonials-wheel]").getBoundingClientRect();
    const radius = node.querySelector(".testimonials_orbit").offsetWidth / 2;
    const step = Number.parseFloat(getComputedStyle(node).getPropertyValue("--testi-step"));
    const items = [...node.querySelectorAll("[data-testimonials-item]")];
    return {
      origin: { x: origin.left, y: origin.top },
      radius,
      step,
      items: items.map((item) => {
        const box = item.getBoundingClientRect();
        return {
          status: item.dataset.testimonialsItemStatus,
          x: box.left + box.width / 2,
          y: box.top + box.height / 2,
          scale: Number(getComputedStyle(item).transform.match(/matrix\([^,]+, [^,]+, [^,]+, ([^,]+)/)?.[1] || 1),
        };
      }),
    };
  });
  const active = geometry.items.find((item) => item.status === "active");
  const prev = geometry.items.find((item) => item.status === "prev");
  const next = geometry.items.find((item) => item.status === "next");
  expect(active.x).toBeCloseTo(geometry.origin.x + geometry.radius, 0);
  expect(active.y).toBeCloseTo(geometry.origin.y, 0);
  expect(active.scale).toBeCloseTo(1, 2);
  expect(prev.y).toBeLessThan(geometry.origin.y);
  expect(next.y).toBeGreaterThan(geometry.origin.y);
  expect(prev.scale).toBeLessThan(1);
  expect(next.scale).toBeLessThan(1);
  expect(Math.abs(prev.x - geometry.origin.x)).toBeGreaterThan(0);
  expect(geometry.step).toBe(70);
});

test("rotates the wheel to the mobile six o'clock layout without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const root = await showSection(page);
  const geometry = await root.evaluate((node) => {
    const origin = node.querySelector("[data-testimonials-wheel]").getBoundingClientRect();
    const radius = node.querySelector(".testimonials_orbit").offsetWidth / 2;
    const base = Number.parseFloat(getComputedStyle(node).getPropertyValue("--testi-base"));
    const items = [...node.querySelectorAll("[data-testimonials-item]")];
    return {
      origin: { x: origin.left, y: origin.top },
      radius,
      base,
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      items: items.map((item) => {
        const box = item.getBoundingClientRect();
        return {
          status: item.dataset.testimonialsItemStatus,
          x: box.left + box.width / 2,
          y: box.top + box.height / 2,
          scale: Number(getComputedStyle(item).transform.match(/matrix\([^,]+, [^,]+, [^,]+, ([^,]+)/)?.[1] || 1),
        };
      }),
    };
  });
  const active = geometry.items.find((item) => item.status === "active");
  const prev = geometry.items.find((item) => item.status === "prev");
  const next = geometry.items.find((item) => item.status === "next");
  expect(geometry.base).toBe(90);
  expect(Math.abs(active.x - geometry.origin.x)).toBeLessThan(2);
  expect(Math.abs(active.y - (geometry.origin.y + geometry.radius))).toBeLessThan(2);
  expect(active.scale).toBeCloseTo(1, 2);
  expect(prev.x).toBeGreaterThan(geometry.origin.x);
  expect(prev.y).toBeGreaterThan(geometry.origin.y);
  expect(next.x).toBeLessThan(geometry.origin.x);
  expect(next.y).toBeGreaterThan(geometry.origin.y);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.viewportWidth);
});

test("rotates both directions, including the hidden wrap slot sampled during motion", async ({ page }) => {
  const root = await showSection(page);
  const start = await root.locator("[data-testimonials-item]").evaluateAll((items) => items.map((item) => item.dataset.testimonialsItemStatus));
  const samples = await root.evaluate((node) => {
    node.querySelector("[data-testimonials-next]").click();
    const item = node.querySelectorAll("[data-testimonials-item]")[2];
    const radius = node.querySelector(".testimonials_orbit").offsetWidth / 2;
    const frames = [];
    return new Promise((resolve) => {
      const sample = () => {
        const box = item.getBoundingClientRect();
        frames.push({
          opacity: Number(getComputedStyle(item).opacity),
          x: box.left,
          y: box.top,
        });
        if (!node._membersTestimonialsInstance?.isAnimating) resolve({ frames, radius });
        else requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
  });
  expect(samples.frames.some((sample) => sample.opacity < 0.1)).toBe(true);
  expect(samples.frames.at(-1).y).toBeGreaterThan(samples.frames[0].y);
  const jumpIndex = samples.frames.findIndex((sample, index) => index > 0 && Math.hypot(
    sample.x - samples.frames[index - 1].x,
    sample.y - samples.frames[index - 1].y,
  ) > samples.radius / 2);
  expect(jumpIndex).toBeGreaterThan(0);
  expect(samples.frames[jumpIndex].opacity).toBeLessThan(0.1);
  expect(samples.frames[jumpIndex - 1].opacity).toBeLessThan(0.1);
  await settle(root);
  await expect(root.locator("[data-testimonials-item-status=active]")).toHaveAttribute("aria-current", "true");
  expect(await root.locator("[data-testimonials-item]").evaluateAll((items) => items.map((item) => item.dataset.testimonialsItemStatus))).toEqual(["prev", "active", "next"]);

  for (let i = 0; i < 2; i += 1) {
    await root.locator("[data-testimonials-next]").click();
    await settle(root);
  }
  expect(await root.locator("[data-testimonials-item]").evaluateAll((items) => items.map((item) => item.dataset.testimonialsItemStatus))).toEqual(start);

  for (let i = 0; i < 3; i += 1) {
    await root.locator("[data-testimonials-prev]").click();
    await settle(root);
  }
  expect(await root.locator("[data-testimonials-item]").evaluateAll((items) => items.map((item) => item.dataset.testimonialsItemStatus))).toEqual(start);
});

test("swaps quote lines and pauses a playing video on advance", async ({ page }) => {
  const root = await showSection(page);
  const firstQuote = await root.locator("[data-testimonials-slide-status=active] [data-testimonials-text]").innerText();
  const outgoingIndex = await root.locator("[data-testimonials-slide-status=active]").evaluate((slide) => (
    [...slide.parentElement.children].indexOf(slide)
  ));
  await root.locator("[data-testimonials-next]").click();
  await settle(root);
  const secondQuote = await root.locator("[data-testimonials-slide-status=active] [data-testimonials-text]").innerText();
  expect(secondQuote).not.toBe(firstQuote);
  const lineState = await root.evaluate((node, index) => {
    const slides = [...node.querySelectorAll("[data-testimonials-slide]")];
    return {
      outgoing: [...slides[index].querySelectorAll(".text-line")].map((line) => line._gsap?.yPercent),
      untouched: [...slides.find((slide, slideIndex) => slideIndex !== index && slide.dataset.testimonialsSlideStatus === "not-active").querySelectorAll(".text-line")].map((line) => line._gsap?.yPercent),
      incoming: [...node.querySelectorAll("[data-testimonials-slide-status=active] .text-line")].map((line) => line._gsap?.yPercent),
    };
  }, outgoingIndex);
  expect(lineState.outgoing.length).toBeGreaterThan(0);
  expect(lineState.outgoing.every((value) => value <= -109)).toBe(true);
  expect(lineState.untouched.length).toBeGreaterThan(0);
  expect(lineState.untouched.every((value) => value >= 109)).toBe(true);
  expect(lineState.incoming.every((value) => value === 0)).toBe(true);

  const videoItem = root.locator("[data-testimonials-item]:has([data-testimonials-video])");
  await videoItem.locator("[data-testimonials-play]").click();
  await expect(videoItem).toHaveAttribute("data-testimonials-playing", "true");
  await root.locator("[data-testimonials-next]").click();
  await settle(root);
  await expect(videoItem).not.toHaveAttribute("data-testimonials-playing");
  expect(await videoItem.locator("video").evaluate((video) => video.__paused)).toBe(true);
});

test("autoplay advances when enabled and pauses after leaving the viewport", async ({ page }) => {
  await page.addInitScript(() => {
    const applyAutoplay = () => {
      const root = document.querySelector("[data-testimonials-init]");
      if (!root) return false;
      root.setAttribute("data-testimonials-autoplay", "true");
      root.setAttribute("data-testimonials-autoplay-duration", "300");
      return true;
    };
    if (applyAutoplay()) return;
    const observer = new MutationObserver(() => {
      if (applyAutoplay()) observer.disconnect();
    });
    observer.observe(document, { childList: true, subtree: true });
  });
  await page.reload();
  const root = await showSection(page);
  await expect(root.locator(activeItem)).toHaveAttribute("aria-label", "Slide 2 of 3", { timeout: 3000 });
  const activeBeforeExit = await root.locator(activeItem).getAttribute("aria-label");
  await root.evaluate((node) => window.scrollTo(0, node.offsetTop + node.offsetHeight + window.innerHeight));
  await page.waitForTimeout(1000);
  await expect(root.locator(activeItem)).toHaveAttribute("aria-label", activeBeforeExit);
});

test("does not schedule autoplay when explicitly disabled and only responds to arrows in view", async ({ page }) => {
  const root = await showSection(page);
  await expect.poll(() => root.evaluate((node) => node._membersTestimonialsInstance?.autoplayCall)).toBe(null);
  await page.evaluate(() => {
    const input = document.createElement("input");
    input.setAttribute("data-test-input", "");
    document.body.appendChild(input);
    input.focus();
  });
  await page.keyboard.press("ArrowRight");
  await expect(root.locator(activeItem)).toHaveAttribute("aria-label", "Slide 1 of 3");
  await root.evaluate((node) => window.scrollTo(0, node.offsetTop + node.offsetHeight + window.innerHeight));
  await page.keyboard.press("ArrowRight");
  await expect(root.locator(activeItem)).toHaveAttribute("aria-label", "Slide 1 of 3");
});

test("crossfades quote slides without SplitText motion under reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  const root = await showSection(page);
  await expect(root.locator(".text-line")).toHaveCount(0);
  await root.locator("[data-testimonials-next]").click();
  await settle(root);
  await expect(root.locator("[data-testimonials-slide-status=active] [data-testimonials-text]")).toContainText("Through AVPN");
  await expect(root.locator("[data-testimonials-slide-status=active]")).toHaveCSS("opacity", "1");
});
