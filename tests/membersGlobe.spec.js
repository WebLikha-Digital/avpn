import { test, expect } from "@playwright/test";

test("uses a copied 2D frame and destroys the globe canvas", async ({ page }) => {
  await page.goto("/");
  const mount = page.locator("[data-members-globe]");
  const canvas = mount.locator("canvas");
  await expect(canvas).toHaveClass(/is-ready/, { timeout: 10_000 });
  await expect(canvas).toHaveAttribute("aria-hidden", "true");

  const frame = await mount.evaluate((node) => {
    const canvas = node.querySelector("canvas");
    const context = canvas.getContext("2d");
    const { width, height } = canvas;
    const samples = [0.2, 0.5, 0.8].flatMap((x) => [0.2, 0.5, 0.8].map((y) => [width * x, height * y]));
    return [node.querySelectorAll("canvas").length, Boolean(context), samples.map(([x, y]) => [...context.getImageData(x, y, 1, 1).data])];
  });
  expect(frame[0]).toBe(1);
  expect(frame[1]).toBe(true);
  expect(frame[2].some(([r, g, b, a]) => a > 0 && r + g + b > 0)).toBe(true);
  expect(new Set(frame[2].map((pixel) => pixel.join(","))).size).toBeGreaterThan(1);

  await mount.evaluate((node) => node._membersGlobeInstance.destroy());
  await expect(mount.locator("canvas")).toHaveCount(0);
});
