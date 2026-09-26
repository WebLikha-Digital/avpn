import { test, expect } from "@playwright/test";

test("deep reload keeps ScrollTrigger init alive", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const navigation = performance.getEntriesByType("navigation")[0];
    if (navigation?.type === "reload") {
      document.addEventListener("DOMContentLoaded", () => {
        window.scrollTo(0, document.documentElement.scrollHeight);
      }, { once: true });
    }
  });

  await page.goto("/");
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(100);
  errors.length = 0;

  await page.reload({ waitUntil: "networkidle" });

  expect(errors).toEqual([]);
  await expect.poll(() => page.evaluate(() => [...document.querySelectorAll("[data-reveal-group]")]
    .flatMap((group) => [...group.children]
      .filter((child) => child.dataset.ignore !== "true")
      .filter((child) => child.getBoundingClientRect().bottom <= window.innerHeight)
      // A finished reveal clears its props, so any inline start state left
      // behind is a reveal that never completed.
      .flatMap((child) => child.style.opacity || child.style.visibility
        ? [{ className: child.className, opacity: child.style.opacity, visibility: child.style.visibility }]
        : []))), { timeout: 4_000 }).toEqual([]);
  await expect.poll(() => page.locator("[data-footer-reveal]").evaluate((root) =>
    Boolean(root._footerReveal?.trigger),
  )).toBe(true);
});
