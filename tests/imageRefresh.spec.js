import { test, expect } from "@playwright/test";

test("refreshes only when a lazy image load grows the document", async ({ page }) => {
  // Hold the fixture back so both images are still incomplete at DOM ready and
  // the window load refresh lands after the measurement window.
  await page.route("**/fixtures/lazy-refresh.svg", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    await route.fulfill({ contentType: "image/svg+xml", body: "<svg />" });
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);
  const refreshes = await page.evaluate(async () => {
    const { ScrollTrigger } = await import("/src/lib/gsap.js");
    let refreshes = 0;
    const onRefresh = () => { refreshes += 1; };
    ScrollTrigger.addEventListener("refresh", onRefresh);
    const container = document.querySelector("[data-refresh-test-container]");
    const images = container.querySelectorAll("img");
    images[0].dispatchEvent(new Event("load"));
    await new Promise((resolve) => setTimeout(resolve, 350));
    const unchanged = refreshes;

    container.style.height = "101px";
    images[1].dispatchEvent(new Event("load"));
    await new Promise((resolve) => setTimeout(resolve, 350));
    ScrollTrigger.removeEventListener("refresh", onRefresh);
    return [unchanged, refreshes - unchanged];
  });
  expect(refreshes).toEqual([0, 1]);
});
