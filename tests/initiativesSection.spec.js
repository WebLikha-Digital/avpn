import { test, expect } from "@playwright/test";

const root = ".section_initiatives";

for (const viewport of [
  { width: 390, height: 844 },
  { width: 600, height: 900 },
  { width: 768, height: 1024 },
]) {
  test(`keeps initiative photos square at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    // The published Webflow page sizes every box as border-box (webflow.css);
    // the sandbox does not, which hid the bug: under content-box the square
    // aspect-ratio applied to the content box and uneven padding grew the frame
    // instead of squashing the photo. Match the real page.
    await page.addStyleTag({ content: "*,*::before,*::after{box-sizing:border-box}" });

    const section = page.locator(root);
    await expect(section).toHaveCount(1);
    const photos = section.locator(".initiatives_photo");
    await expect(photos).toHaveCount(4);

    const dimensions = await photos.evaluateAll((elements) => elements.map((element) => {
      const { width, height } = element.getBoundingClientRect();
      return { width, height };
    }));

    for (const [index, { width, height }] of dimensions.entries()) {
      expect(Math.abs(width - height), `photo ${index + 1} at ${viewport.width}px`).toBeLessThanOrEqual(1);
    }

    const circle = section.locator(".initiatives_photo.is-3");
    const circleStyles = await circle.evaluate((element) => {
      const styles = getComputedStyle(element);
      const { width, height } = element.getBoundingClientRect();
      return {
        width,
        height,
        borderRadii: [
          styles.borderTopLeftRadius,
          styles.borderTopRightRadius,
          styles.borderBottomRightRadius,
          styles.borderBottomLeftRadius,
        ],
      };
    });

    expect(Math.abs(circleStyles.width - circleStyles.height)).toBeLessThanOrEqual(1);
    expect(circleStyles.borderRadii).toEqual(["50%", "50%", "50%", "50%"]);
  });
}
