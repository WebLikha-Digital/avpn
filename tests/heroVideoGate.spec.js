import { test, expect } from "@playwright/test";

const desktopUrl = "/fixtures/hero-desktop.mp4";
const mobileUrl = "/fixtures/hero-mobile.mp4";
const desktopBase = "/fixtures/hero-desktop";
const mobileBase = "/fixtures/hero-mobile";

async function openAt(page, width) {
  await page.setViewportSize({ width, height: 844 });
  const requests = [];
  page.on("request", (request) => {
    if (request.url().includes("/fixtures/hero-")) requests.push(request.url());
  });
  await page.route("**/fixtures/**", (route) => route.abort());
  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");
  return requests;
}

async function state(page) {
  return page.locator(".hero-bg_video").evaluateAll((wrappers) =>
    wrappers.map((wrapper) => {
      const video = wrapper.querySelector("video");
      return {
        className: wrapper.className,
        display: getComputedStyle(wrapper).display,
        sources: video.querySelectorAll("source").length,
        currentSrc: video.currentSrc,
        networkState: video.networkState,
        paused: video.paused,
      };
    }),
  );
}

test("gates the portrait video at desktop boot", async ({ page }) => {
  await openAt(page, 1440);
  // Sources can be requested while parsing, before the end-of-body bundle gates them.
  expect((await state(page)).map(({ sources, currentSrc, networkState }) => ({
    sources,
    currentSrc,
    networkState,
  }))).toEqual([
    { sources: 2, currentSrc: expect.stringContaining(desktopBase), networkState: expect.any(Number) },
    { sources: 0, currentSrc: expect.any(String), networkState: 0 },
  ]);
});

test("gates the landscape video at mobile boot", async ({ page }) => {
  await openAt(page, 390);
  // Sources can be requested while parsing, before the end-of-body bundle gates them.
  expect((await state(page)).map(({ sources, currentSrc, networkState }) => ({
    sources,
    currentSrc,
    networkState,
  }))).toEqual([
    { sources: 0, currentSrc: expect.any(String), networkState: 0 },
    { sources: 2, currentSrc: expect.stringContaining(mobileBase), networkState: expect.any(Number) },
  ]);
});

test("swaps sources when resizing down and back up", async ({ page }) => {
  const requests = await openAt(page, 1440);
  let requestStart = requests.length;
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => (await state(page)).map(({ sources }) => sources)).toEqual([0, 2]);
  expect(requests.slice(requestStart).some((url) => url.includes(mobileUrl))).toBe(true);
  expect(requests.slice(requestStart).some((url) => url.includes(desktopUrl))).toBe(false);
  expect((await state(page))[0].paused).toBe(true);

  requestStart = requests.length;
  await page.setViewportSize({ width: 1440, height: 844 });
  await expect.poll(async () => (await state(page)).map(({ sources }) => sources)).toEqual([2, 0]);
  expect(requests.slice(requestStart).some((url) => url.includes(desktopUrl))).toBe(true);
  expect(requests.slice(requestStart).some((url) => url.includes(mobileUrl))).toBe(false);
  expect((await state(page))[1].paused).toBe(true);
});

test("does not touch unrelated videos", async ({ page }) => {
  await openAt(page, 1440);
  expect(await page.locator("#hero-video-gate-unrelated").evaluate((video) => ({
    src: video.getAttribute("src"),
    sources: video.querySelectorAll("source").length,
  }))).toEqual({ src: "/fixtures/unrelated.mp4", sources: 0 });
});
