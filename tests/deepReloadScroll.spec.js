import { test, expect } from "@playwright/test";

for (const viewport of [{ width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
test(`deep reload restores at ${viewport.width}px without a jump or layout shift`, async ({ page }) => {
  await page.setViewportSize(viewport);
  await page.addInitScript(() => {
    window.__deepReload = { frames: [], shifts: [] };
    const started = performance.now();
    const sample = () => {
      const elapsed = performance.now() - started;
      window.__deepReload.frames.push({ time: elapsed, y: scrollY });
      if ((document.readyState === "complete" && elapsed >= 600) || elapsed >= 12000) {
        window.__deepReload.done = true;
      } else {
        requestAnimationFrame(sample);
      }
    };
    requestAnimationFrame(sample);
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) window.__deepReload.shifts.push(entry.value);
      }
    }).observe({ type: "layout-shift", buffered: true });
  });

  await page.goto("/");
  await page.waitForFunction(() => document.documentElement.scrollHeight > innerHeight * 2);
  const target = await page.evaluate(() => {
    const max = document.documentElement.scrollHeight - innerHeight;
    const y = Math.round(max * 0.72);
    window.scrollTo(0, y);
    return y;
  });
  await expect.poll(() => page.evaluate((y) => Math.abs(scrollY - y) < 2, target), { timeout: 3000 }).toBe(true);

  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => window.__deepReload.done === true, null, { timeout: 15_000 });
  const result = await page.evaluate(() => {
    const frames = window.__deepReload.frames;
    const settled = frames.at(-1)?.y ?? scrollY;
    const first = frames.findIndex((frame) => frame.y > 0);
    return {
      settled,
      drift: frames.slice(first < 0 ? 0 : first).reduce((max, frame) => Math.max(max, Math.abs(frame.y - settled)), 0),
      shift: window.__deepReload.shifts.reduce((sum, value) => sum + value, 0),
      maxEntry: Math.max(0, ...window.__deepReload.shifts),
    };
  });

  expect(Math.abs(result.settled - target)).toBeLessThanOrEqual(2);
  expect(result.drift).toBeLessThanOrEqual(2);
  expect(result.shift).toBeLessThanOrEqual(0.1);
  expect(result.maxEntry).toBeLessThan(0.05);
});
}
