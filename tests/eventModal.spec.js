import { test, expect } from "@playwright/test";

const group = "[data-modal-group-status]";
const trigger = (name) => `[data-modal-target="${name}"]`;
const card = (name) => `[data-modal-name="${name}"]`;

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => !document.documentElement.classList.contains("is-preloading"));
  await page.locator(".section_signature-events").scrollIntoViewIfNeeded();
});

async function openModal(page, name) {
  await page.locator(trigger(name)).dispatchEvent("click");
  await expect(page.locator(group)).toHaveAttribute("data-modal-group-status", "active");
  await expect(page.locator(card(name))).toHaveAttribute("data-modal-status", "active");
}

test("opens event 2 without scrolling and focuses its close button", async ({ page }) => {
  const scrollY = await page.evaluate(() => window.scrollY);

  await openModal(page, "event-2");

  await expect(page.locator(card("event-1"))).toHaveAttribute("data-modal-status", "not-active");
  await expect(page.locator(card("event-3"))).toHaveAttribute("data-modal-status", "not-active");
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
  await expect(page.locator("html")).toHaveClass(/is-modal-open/);
  await expect(page.locator(card("event-2")).locator("button[data-modal-close]")).toBeFocused();
  await expect(page.locator(group)).not.toHaveAttribute("aria-hidden", "true");
  await expect(page.locator(trigger("event-2"))).toHaveAttribute("aria-expanded", "true");
});

test("closes from the card button and restores focus to the trigger", async ({ page }) => {
  const opener = page.locator(trigger("event-2"));
  await openModal(page, "event-2");
  await page.locator(card("event-2")).locator("button[data-modal-close]").click();

  await expect(page.locator(group)).toHaveAttribute("data-modal-group-status", "not-active");
  await expect(page.locator(card("event-2"))).toHaveAttribute("data-modal-status", "not-active");
  await expect(page.locator("html")).not.toHaveClass(/is-modal-open/);
  await expect(opener).toBeFocused();
  await expect(page.locator(group)).toHaveAttribute("aria-hidden", "true");
  await expect(opener).toHaveAttribute("aria-expanded", "false");
});

test("closes from the backdrop", async ({ page }) => {
  await openModal(page, "event-2");
  await page.locator(`${group} [data-modal-close]:not(button)`).click({ position: { x: 8, y: 8 } });

  await expect(page.locator(group)).toHaveAttribute("data-modal-group-status", "not-active");
  await expect(page.locator("html")).not.toHaveClass(/is-modal-open/);
});

test("closes from Escape only while a modal is open", async ({ page }) => {
  await page.keyboard.press("Escape");
  await expect(page.locator(group)).toHaveAttribute("data-modal-group-status", "not-active");

  await openModal(page, "event-2");
  await page.keyboard.press("Escape");
  await expect(page.locator(group)).toHaveAttribute("data-modal-group-status", "not-active");
  await expect(page.locator("html")).not.toHaveClass(/is-modal-open/);
});

test("swaps active cards while keeping the modal scroll lock", async ({ page }) => {
  await openModal(page, "event-1");
  await openModal(page, "event-3");

  await expect(page.locator(card("event-1"))).toHaveAttribute("data-modal-status", "not-active");
  await expect(page.locator(card("event-2"))).toHaveAttribute("data-modal-status", "not-active");
  await expect(page.locator(card("event-3"))).toHaveAttribute("data-modal-status", "active");
  await expect(page.locator(trigger("event-1"))).toHaveAttribute("data-modal-status", "not-active");
  await expect(page.locator(trigger("event-3"))).toHaveAttribute("data-modal-status", "active");
  await expect(page.locator("html")).toHaveClass(/is-modal-open/);
  await expect(page.locator(card("event-3")).locator("button[data-modal-close]")).toBeFocused();
});
