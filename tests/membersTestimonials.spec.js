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
  await expect.poll(() => root.evaluate((node) => {
    const instance = node._membersTestimonialsInstance;
    return Boolean(instance?.introComplete && !instance.introTimeline?.isActive());
  })).toBe(true);
  return root;
}

async function enableAutoplay(page, duration = 300) {
  await page.addInitScript((autoplayDuration) => {
    const applyAutoplay = () => {
      const root = document.querySelector("[data-testimonials-init]");
      if (!root) return false;
      root.setAttribute("data-testimonials-autoplay", "true");
      root.setAttribute("data-testimonials-autoplay-duration", String(autoplayDuration));
      return true;
    };
    if (applyAutoplay()) return;
    const observer = new MutationObserver(() => {
      if (applyAutoplay()) observer.disconnect();
    });
    observer.observe(document, { childList: true, subtree: true });
  }, duration);
  await page.reload();
}

test.beforeEach(async ({ page }) => {
  await page.route("https://www.youtube-nocookie.com/embed/**", (route) => route.fulfill({
    status: 200,
    contentType: "text/html",
    body: "<!doctype html><script>window.addEventListener('message',event=>parent.postMessage({videoLightboxEcho:event.data},'*'));parent.postMessage({videoLightboxEcho:{ready:true}},'*');</script>",
  }));
  await page.route("**/*youtube.com/**", (route) => route.abort());
  await page.addInitScript(() => {
    window.__videoLightboxMessages = [];
    window.addEventListener("message", (event) => {
      if (event.data?.videoLightboxEcho) {
        const message = event.data.videoLightboxEcho;
        window.__videoLightboxMessages.push(typeof message === "string" ? JSON.parse(message) : message);
      }
    });
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

test("uses the default reveal duration and ease when overrides are absent", async ({ page }) => {
  await page.addInitScript(() => {
    const applyDefaults = () => {
      const orbit = document.querySelector(".testimonials_orbit");
      if (!orbit) return;
      orbit.removeAttribute("data-draw-scroll-duration");
      orbit.removeAttribute("data-draw-scroll-ease");
      orbit.removeAttribute("data-draw-scroll-delay");
    };
    const observer = new MutationObserver(applyDefaults);
    observer.observe(document, { childList: true, subtree: true });
    applyDefaults();
  });
  await page.reload();
  const reveal = page.locator(".testimonials_orbit");
  await expect.poll(() => reveal.evaluate((node) => ({
    duration: node._drawTl.duration(),
    ease: node._drawTl.vars.defaults.ease,
    delay: node._drawTl.vars.delay,
  }))).toEqual({ duration: 0.8, ease: "expo.out", delay: 0 });
});

test("uses the testimonials orbit reveal overrides for the wheel intro", async ({ page }) => {
  const reveal = page.locator(".testimonials_orbit");
  await expect.poll(() => reveal.evaluate((node) => ({
    duration: node._drawTl.duration(),
    totalDuration: node._drawTl.totalDuration(),
    ease: node._drawTl.vars.defaults.ease,
    delay: node._drawTl.vars.delay,
    targetCount: node._drawTl.getChildren().length,
  }))).toEqual({
    duration: 1.44,
    totalDuration: 1.44,
    ease: "radial",
    delay: 0,
    targetCount: 3,
  });
});

test("falls back to the default reveal duration for an invalid override", async ({ page }) => {
  await page.addInitScript(() => {
    const applyInvalidDuration = () => {
      const orbit = document.querySelector(".testimonials_orbit");
      if (!orbit) return;
      orbit.setAttribute("data-draw-scroll-duration", "not-a-duration");
    };
    const observer = new MutationObserver(applyInvalidDuration);
    observer.observe(document, { childList: true, subtree: true });
    applyInvalidDuration();
  });
  await page.reload();
  await expect.poll(() => page.locator(".testimonials_orbit").evaluate((node) => (
    node._drawTl.duration()
  ))).toBe(0.8);
});

test("starts hidden two orbit slots back and follows the orbit during its one-time intro", async ({ page }) => {
  const root = page.locator(rootSelector);
  const initial = await root.evaluate((node) => {
    const instance = node._membersTestimonialsInstance;
    return {
      top: node.getBoundingClientRect().top,
      threshold: window.innerHeight * 0.7,
      opacity: [...node.querySelectorAll("[data-testimonials-item]")].map((item) => getComputedStyle(item).opacity),
      angles: instance.states.map((state) => state.angle),
      step: instance.step,
      activeIndex: instance.activeIndex,
    };
  });
  expect(initial.top).toBeGreaterThan(initial.threshold);
  expect(initial.opacity).toEqual(["0", "0", "0"]);
  expect(initial.angles).toEqual(initial.angles.map((angle, index) => {
    const offset = ((index - initial.activeIndex + 1 + 3) % 3) - 1;
    return (offset - 2) * initial.step;
  }));

  const samples = await root.evaluate((node) => new Promise((resolve) => {
    const start = node.getBoundingClientRect();
    window.scrollTo(0, window.scrollY + start.top - window.innerHeight * 0.7 + 40);
    const wheel = node.querySelector("[data-testimonials-wheel]").getBoundingClientRect();
    const radius = node.querySelector(".testimonials_orbit").offsetWidth / 2;
    const frames = [];
    const sample = () => {
      const instance = node._membersTestimonialsInstance;
      const origin = node.querySelector("[data-testimonials-wheel]").getBoundingClientRect();
      const item = node.querySelectorAll("[data-testimonials-item]")[0].getBoundingClientRect();
      frames.push({
        radius: Math.hypot(
          item.left + item.width / 2 - (origin.left + wheel.width / 2),
          item.top + item.height / 2 - (origin.top + wheel.height / 2),
        ),
        opacity: getComputedStyle(node.querySelectorAll("[data-testimonials-item]")[0]).opacity,
      });
      if (!instance?.isAnimating) resolve({ frames, radius });
      else requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }));
  expect(samples.frames.length).toBeGreaterThan(5);
  expect(samples.frames.some((frame) => frame.opacity > 0 && frame.opacity < 1)).toBe(true);
  expect(samples.frames.slice(1).every((frame) => Math.abs(frame.radius - samples.radius) < 2)).toBe(true);
  await settle(root);
  await expect(root.locator("[data-testimonials-item]")).toHaveCount(3);
  expect(await root.evaluate((node) => node._membersTestimonialsInstance.introComplete)).toBe(true);
});

test("does not replay after scrolling away or resizing", async ({ page }) => {
  const root = await showSection(page);
  const before = await root.evaluate((node) => ({
    angles: node._membersTestimonialsInstance.states.map((state) => state.angle),
  }));
  await root.evaluate((node) => window.scrollTo(0, node.offsetTop + node.offsetHeight + window.innerHeight));
  await page.waitForTimeout(100);
  await root.evaluate((node) => node.scrollIntoView({ block: "center", behavior: "instant" }));
  await page.setViewportSize({ width: 1279, height: 900 });
  await expect.poll(() => root.evaluate((node) => node._membersTestimonialsInstance?.introComplete)).toBe(true);
  expect(await root.evaluate((node) => node._membersTestimonialsIntroPlayed)).toBe(true);
  expect(await root.evaluate((node) => node._membersTestimonialsInstance.states.map((state) => state.angle))).toEqual(before.angles);
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

test("swaps quote lines and opens only the active card video", async ({ page }) => {
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

  const videoItem = root.locator('[data-testimonials-item-status="active"]');
  const trigger = videoItem.locator("[data-video-lightbox-trigger]");
  await trigger.click();
  const lightbox = root.locator("[data-video-lightbox]");
  await expect(lightbox).toHaveAttribute("data-video-lightbox-status", "active");
  await expect(lightbox.locator("iframe")).toHaveAttribute("src", /youtube-nocookie\.com\/embed\/SwPYymyWWb4/);
  await expect(lightbox.locator("iframe")).toHaveAttribute("src", /enablejsapi=1/);
  const player = lightbox.locator("iframe");
  await expect.poll(() => page.evaluate(() => window.__videoLightboxMessages?.some(
    (message) => message?.ready === true,
  ))).toBe(true);
  await player.evaluate((iframe) => { iframe.dataset.videoLightboxTestPlayer = "first"; });
  await page.keyboard.press("ArrowRight");
  await expect(root.locator(activeItem)).toHaveAttribute("aria-label", "Slide 2 of 3");
  await page.keyboard.press("Escape");
  await expect(lightbox).toHaveAttribute("data-video-lightbox-status", "not-active");
  await expect.poll(() => page.evaluate(() => window.__videoLightboxMessages)).toContainEqual(
    expect.objectContaining({ func: "pauseVideo" }),
  );
  await trigger.click();
  await expect.poll(() => page.evaluate(() => window.__videoLightboxMessages)).toContainEqual(
    expect.objectContaining({ func: "playVideo" }),
  );
  expect(await page.locator('iframe[data-video-lightbox-test-player="first"]').count()).toBe(1);
  await page.locator("#hear-from-members button[data-video-lightbox-close]").click();
  await root.locator("[data-testimonials-next]").click();
  await settle(root);
  await root.locator('[data-testimonials-item-status="active"] [data-video-lightbox-trigger]').evaluate((node) => {
    node.setAttribute("data-video-lightbox-src", "https://www.youtube.com/watch?v=different-member-video");
  });
  await root.locator('[data-testimonials-item-status="active"] [data-video-lightbox-trigger]').click();
  await expect(lightbox.locator("iframe")).toHaveCount(1);
  await expect(lightbox.locator('iframe[data-video-lightbox-test-player="first"]')).toHaveCount(0);
  await page.locator("#hear-from-members button[data-video-lightbox-close]").click();
  await expect(root.locator(activeItem)).toHaveAttribute("aria-label", "Slide 3 of 3");
  await expect(root.locator("[data-testimonials-item] [data-video-lightbox-trigger]")).toHaveCount(3);
});

test("does not open a non-active card video", async ({ page }) => {
  const root = await showSection(page);
  await root.locator('[data-testimonials-item-status="next"] [data-video-lightbox-trigger]').click({ force: true });
  await expect(root.locator("[data-video-lightbox]")).toHaveAttribute(
    "data-video-lightbox-status", "not-active",
  );
});

test("autoplay advances when enabled and pauses after leaving the viewport", async ({ page }) => {
  await enableAutoplay(page);
  const root = await showSection(page);
  await expect(root.locator(activeItem)).toHaveAttribute("aria-label", "Slide 2 of 3", { timeout: 3000 });
  const activeBeforeExit = await root.locator(activeItem).getAttribute("aria-label");
  await root.evaluate((node) => window.scrollTo(0, node.offsetTop + node.offsetHeight + window.innerHeight));
  await page.waitForTimeout(1000);
  await expect(root.locator(activeItem)).toHaveAttribute("aria-label", activeBeforeExit);
});

test("pauses autoplay while media or quote content is hovered, but not in empty section space", async ({ page }) => {
  await enableAutoplay(page);
  const root = await showSection(page);
  const media = root.locator('[data-testimonials-item-status="active"] .testimonials_media');
  const content = root.locator(".testimonials_content");
  const list = root.locator("[data-testimonials-list]");

  await media.hover();
  const mediaLabel = await root.locator(activeItem).getAttribute("aria-label");
  await page.waitForTimeout(700);
  await expect(root.locator(activeItem)).toHaveAttribute("aria-label", mediaLabel);

  await page.mouse.move(1, 1);
  await page.waitForTimeout(100);
  await expect(root.locator(activeItem)).toHaveAttribute("aria-label", mediaLabel);
  await expect.poll(() => root.locator(activeItem).getAttribute("aria-label"), {
    timeout: 1500,
  }).not.toBe(mediaLabel);

  await content.hover({ position: { x: 5, y: 5 } });
  const emptyAreaLabel = await root.locator(activeItem).getAttribute("aria-label");
  await page.waitForTimeout(700);
  await expect.poll(() => root.locator(activeItem).getAttribute("aria-label"), {
    timeout: 4000,
  }).not.toBe(emptyAreaLabel);

  await list.hover();
  const contentLabel = await root.locator(activeItem).getAttribute("aria-label");
  await page.waitForTimeout(700);
  await expect(root.locator(activeItem)).toHaveAttribute("aria-label", contentLabel);
  await page.mouse.move(1, 1);
});

test("pauses autoplay while focus remains inside the section", async ({ page }) => {
  await enableAutoplay(page);
  const root = await showSection(page);
  const playButton = root.locator('[data-testimonials-item-status="active"] [data-video-lightbox-trigger]');
  await page.evaluate(() => document.activeElement?.blur());
  let focusedViaKeyboard = false;
  for (let index = 0; index < 100; index += 1) {
    await page.keyboard.press("Tab");
    focusedViaKeyboard = await playButton.evaluate((node) => (
      document.activeElement === node && node.matches(":focus-visible")
    ));
    if (focusedViaKeyboard) break;
  }
  expect(focusedViaKeyboard).toBe(true);
  const focusedLabel = await root.locator(activeItem).getAttribute("aria-label");
  await page.waitForTimeout(700);
  await expect(root.locator(activeItem)).toHaveAttribute("aria-label", focusedLabel);

  await page.evaluate(() => {
    const outside = document.createElement("button");
    outside.type = "button";
    outside.id = "members-testimonials-focus-outside";
    outside.textContent = "outside";
    document.body.append(outside);
    outside.focus({ preventScroll: true });
  });
  await expect.poll(() => root.locator(activeItem).getAttribute("aria-label"), {
    timeout: 1500,
  }).not.toBe(focusedLabel);
});

test("does not keep autoplay paused after a mouse click focuses the next arrow", async ({ page }) => {
  await enableAutoplay(page);
  const root = await showSection(page);
  const next = root.locator("[data-testimonials-next]");
  await next.click();
  await settle(root);
  const clickedLabel = await root.locator(activeItem).getAttribute("aria-label");
  await page.mouse.move(1, 1);
  await expect.poll(() => root.locator(activeItem).getAttribute("aria-label"), {
    timeout: 1500,
  }).not.toBe(clickedLabel);
});

test("pauses autoplay after a touch interaction until leaving and re-entering the section", async ({ page }) => {
  await enableAutoplay(page);
  const root = await showSection(page);
  const media = root.locator('[data-testimonials-item-status="active"] .testimonials_media');
  await media.dispatchEvent("pointerdown", { pointerType: "touch" });
  const touchLabel = await root.locator(activeItem).getAttribute("aria-label");
  await page.waitForTimeout(700);
  await expect(root.locator(activeItem)).toHaveAttribute("aria-label", touchLabel);

  await root.evaluate((node) => window.scrollTo(0, node.offsetTop + node.offsetHeight + window.innerHeight));
  await page.waitForTimeout(100);
  await root.evaluate((node) => node.scrollIntoView({ block: "center", behavior: "instant" }));
  await expect.poll(() => root.locator(activeItem).getAttribute("aria-label"), {
    timeout: 1500,
  }).not.toBe(touchLabel);
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
  expect(await root.evaluate((node) => ({
    complete: node._membersTestimonialsInstance.introComplete,
    opacities: [...node.querySelectorAll("[data-testimonials-item]")].map((item) => getComputedStyle(item).opacity),
  }))).toEqual({ complete: true, opacities: ["1", "1", "1"] });
  await root.locator("[data-testimonials-next]").click();
  await settle(root);
  await expect(root.locator("[data-testimonials-slide-status=active] [data-testimonials-text]")).toContainText("Through AVPN");
  await expect(root.locator("[data-testimonials-slide-status=active]")).toHaveCSS("opacity", "1");
});
