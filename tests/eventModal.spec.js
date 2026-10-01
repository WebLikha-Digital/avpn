import { test, expect } from "@playwright/test";

const group = "[data-modal-group-status]";
const trigger = (name) => `[data-modal-target="${name}"]`;
const card = (name) => `[data-modal-name="${name}"]`;

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => !document.documentElement.classList.contains("is-preloading"));
  await page.locator(".section_signature-events").scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    // Mark each card played before jumping to the end, otherwise the band's
    // own trigger can fire afterwards and restart the timeline from 0.
    document.querySelector("[data-sig-events]")._signatureEvents.cards
      .forEach((card) => {
        card.played = true;
        card.timeline?.progress(1);
      });
  });
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

test("unloads modal videos until the card opens and stops them on close", async ({ page }) => {
  const video = page.locator(card("event-1")).locator("iframe");
  const source = "about:blank#video";

  await expect(video).toHaveAttribute("data-src", source);
  await expect(video).not.toHaveAttribute("src");

  await openModal(page, "event-1");
  await expect(page.locator(card("event-1")).locator("iframe")).toHaveAttribute("src", source);

  await page.locator(card("event-1")).locator("button[data-modal-close]").click();
  await expect(page.locator(card("event-1")).locator("iframe")).not.toHaveAttribute("src");
  await expect(page.locator(card("event-1")).locator("iframe")).toHaveAttribute("data-src", source);
});

test("unloads a modal video from the backdrop and Escape", async ({ page }) => {
  const video = page.locator(card("event-1")).locator("iframe");

  await openModal(page, "event-1");
  await expect(video).toHaveAttribute("src", "about:blank#video");
  await page.locator(`${group} [data-modal-close]:not(button)`).click({ position: { x: 8, y: 8 } });
  await expect(page.locator(card("event-1")).locator("iframe")).not.toHaveAttribute("src");

  await openModal(page, "event-1");
  await page.keyboard.press("Escape");
  await expect(page.locator(card("event-1")).locator("iframe")).not.toHaveAttribute("src");
});

test("does not change history while opening and closing a modal video", async ({ page }) => {
  const initialHistoryLength = await page.evaluate(() => history.length);

  await openModal(page, "event-1");
  await page.locator(card("event-1")).locator("button[data-modal-close]").click();
  await openModal(page, "event-1");
  await page.locator(card("event-1")).locator("button[data-modal-close]").click();

  expect(await page.evaluate(() => history.length)).toBe(initialHistoryLength);
});

test("preserves modal video URLs across reinitialization", async ({ page }) => {
  const source = "about:blank#video";

  await openModal(page, "event-1");
  await page.evaluate(async () => {
    const { initEventModal } = await import("/src/animations/eventModal.js");
    initEventModal();
  });

  await expect(page.locator(card("event-1")).locator("iframe")).not.toHaveAttribute("src");
  await expect(page.locator(card("event-1")).locator("iframe")).toHaveAttribute("data-src", source);

  await openModal(page, "event-1");
  await expect(page.locator(card("event-1")).locator("iframe")).toHaveAttribute("src", source);
  await page.locator(card("event-1")).locator("button[data-modal-close]").click();
  await expect(page.locator(card("event-1")).locator("iframe")).not.toHaveAttribute("src");
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

test("reveals each modal part and restores exact stat values", async ({ page }) => {
  await openModal(page, "event-1");

  const started = await page.locator(card("event-1")).evaluate((element) => ({
    cardOpacity: element.style.opacity,
    cardTransform: element.style.transform,
    mediaClip: element.querySelector(".modal__media")?.style.clipPath,
    numberText: element.querySelector(".modal__stat-number")?.textContent,
  }));
  expect(started.cardOpacity).not.toBe("");
  expect(started.cardTransform).not.toBe("");
  expect(started.mediaClip).not.toBe("");
  expect(started.numberText).not.toBe("1550");

  const odometerLayout = await page.locator(card("event-1")).locator(".modal__stat-number").first().evaluate((number) => {
    const mask = number.querySelector(".modal__odometer-mask");
    const styles = getComputedStyle(number);
    return {
      overflow: mask ? getComputedStyle(mask).overflow : "",
      height: number.getBoundingClientRect().height,
      fontSize: Number.parseFloat(styles.fontSize),
    };
  });
  expect(odometerLayout.overflow).toBe("hidden");
  expect(odometerLayout.height).toBeLessThanOrEqual(odometerLayout.fontSize * 1.6);

  await page.waitForTimeout(1600);
  const finished = await page.locator(card("event-1")).evaluate((element) => ({
    numbers: [...element.querySelectorAll(".modal__stat-number")].map((number) => ({
      text: number.textContent,
      label: number.getAttribute("aria-label"),
      opacity: number.style.opacity,
    })),
    cardTransform: element.style.transform,
    mediaClip: element.querySelector(".modal__media")?.style.clipPath,
  }));
  expect(finished.numbers.map(({ text }) => text)).toEqual(["1550", "300", "110", "50"]);
  expect(finished.numbers.map(({ label }) => label)).toEqual(["1550", "300", "110", "50"]);
  expect(finished.numbers.every(({ opacity }) => opacity === "")).toBe(true);
  expect(finished.cardTransform).toBe("");
  expect(finished.mediaClip).toBe("");
});

test("replays the reveal and cleans up when closed mid-animation", async ({ page }) => {
  await openModal(page, "event-1");
  await page.waitForTimeout(180);
  await page.locator(card("event-1")).locator("button[data-modal-close]").click();
  await openModal(page, "event-3");
  await page.locator(card("event-3")).locator("button[data-modal-close]").click();
  await openModal(page, "event-1");

  await page.waitForTimeout(1600);
  await expect(page.locator(card("event-1")).locator(".modal__stat-number").first()).toHaveText("1550");
  expect(await page.locator(card("event-1")).locator(".modal__odometer-roller").count()).toBe(0);
});

test("reduced motion opens in its final state without an odometer", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openModal(page, "event-1");

  await expect(page.locator(card("event-1")).locator(".modal__stat-number").nth(0)).toHaveText("1550");
  expect(await page.locator(card("event-1")).locator(".modal__odometer-roller").count()).toBe(0);
  expect(await page.locator(card("event-1")).evaluate((element) => ({
    opacity: element.style.opacity,
    transform: element.style.transform,
    clip: element.querySelector(".modal__media")?.style.clipPath,
  }))).toEqual({ opacity: "", transform: "", clip: "" });
});

test("scrolls the event card while keeping the page locked", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 700 });
  await openModal(page, "event-1");

  const eventCard = page.locator(card("event-1"));
  await expect.poll(() => eventCard.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  const cardBox = await eventCard.boundingBox();
  const initialWindowScrollY = await page.evaluate(() => window.scrollY);

  await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
  await page.mouse.wheel(0, 500);

  await expect.poll(() => eventCard.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(initialWindowScrollY);

  await page.mouse.move(8, 8);
  await page.mouse.wheel(0, 500);
  expect(await page.evaluate(() => window.scrollY)).toBe(initialWindowScrollY);
});
