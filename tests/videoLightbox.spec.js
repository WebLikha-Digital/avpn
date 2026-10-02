import { test, expect } from "@playwright/test";

test("keeps an early-closed YouTube player paused after it becomes ready", async ({ page }) => {
  await page.route("https://www.youtube-nocookie.com/embed/**", (route) => route.fulfill({
    status: 200,
    contentType: "text/html",
    body: `<!doctype html><script>
      let listening = false;
      let ready = false;
      let started = false;
      let state = 2;
      const report = (message) => parent.postMessage(JSON.stringify(message), "*");
      const setState = (next) => { state = next; report({ event: "infoDelivery", info: { playerState: state } }); };
      const announceReady = () => {
        if (!ready || started) return;
        started = true;
        report({ event: "onReady" });
        setTimeout(() => setState(3), 20);
        setTimeout(() => setState(1), 40);
      };
      addEventListener("message", (event) => {
        const message = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (message?.event === "listening") { listening = true; announceReady(); return; }
        if (!ready || message?.event !== "command") return;
        setState(message.func === "pauseVideo" ? 2 : 1);
      });
      setTimeout(() => {
        ready = true;
        announceReady();
      }, 1500);
    </script>`,
  }));
  await page.route("**/*youtube.com/**", (route) => route.abort());
  await page.addInitScript(() => {
    window.__videoLightboxStates = [];
    addEventListener("message", (event) => {
      if (typeof event.data !== "string") return;
      try {
        const message = JSON.parse(event.data);
        if (message.event === "infoDelivery") window.__videoLightboxStates.push(message.info.playerState);
      } catch (_) {}
    });
  });
  await page.goto("/");

  const root = page.locator("#hear-from-partners");
  await root.scrollIntoViewIfNeeded();
  const trigger = root.locator("[data-video-lightbox-trigger]").first();
  await trigger.click();
  await root.locator("button[data-video-lightbox-close]").click();
  await expect(root.locator("[data-video-lightbox]")).toHaveAttribute(
    "data-video-lightbox-status", "not-active",
  );
  // Wait until the stub has attempted its autoplay, then let any re-sent pause land.
  await expect.poll(() => page.evaluate(() => window.__videoLightboxStates.includes(1)), { timeout: 5000 }).toBe(true);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__videoLightboxStates.at(-1))).toBe(2);
});
