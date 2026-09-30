import { test, expect } from "@playwright/test";

const viewports = [
  { width: 1440, height: 900 },
  { width: 900, height: 900 },
];

async function loadPodcastPage(page, viewport) {
  await page.setViewportSize(viewport);
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.locator("[data-podcast-section]")).toHaveCount(1);
}

async function findOverlappingPoints(page) {
  return page.evaluate(() => {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const blobs = [...document.querySelectorAll(".newsletter_blob")];
    const blobRects = blobs.map((blob) => blob.getBoundingClientRect());
    const cards = [...document.querySelectorAll(".section_podcast .podcast_card")];
    const points = [];

    for (const card of cards) {
      const rect = card.getBoundingClientRect();
      for (let y = rect.top + 8; y <= rect.bottom - 8; y += 24) {
        for (let x = rect.left + 8; x <= rect.right - 8; x += 24) {
          const inViewport = x >= 0 && x < viewport.width && y >= 0 && y < viewport.height;
          const inBlob = blobRects.some((blob) =>
            x >= blob.left && x < blob.right && y >= blob.top && y < blob.bottom,
          );
          if (inViewport && inBlob) points.push({ x, y });
        }
      }
    }

    return points;
  });
}

async function positionPodcastCards(page) {
  const lastCard = page.locator(".section_podcast .podcast_card").last();
  // Cards start hidden until their scroll reveal plays, so scroll first.
  await lastCard.scrollIntoViewIfNeeded();
  await expect(lastCard).toBeVisible();
  await page.addStyleTag({ content: ".newsletter_blob{pointer-events:auto!important}" });

  if ((await findOverlappingPoints(page)).length > 0) return;

  await page.evaluate(() => {
    const newsletter = document.querySelector(".section_newsletter");
    if (!newsletter) throw new Error("Newsletter section is missing");

    const targetScrollY = window.scrollY + newsletter.getBoundingClientRect().top - window.innerHeight + 8;
    window.scrollTo({ top: Math.max(0, targetScrollY), behavior: "instant" });
  });
}

for (const viewport of viewports) {
  test(`keeps podcast cards above newsletter blobs at ${viewport.width}px`, async ({ page }) => {
    await loadPodcastPage(page, viewport);
    await positionPodcastCards(page);

    const overlapPoints = await findOverlappingPoints(page);
    expect(overlapPoints.length, `expected card/blob overlap at ${viewport.width}px`).toBeGreaterThan(0);

    const blobHits = await page.evaluate((points) => points.map(({ x, y }) => {
      const hit = document.elementFromPoint(x, y);
      return Boolean(hit && hit.closest(".newsletter_blob"));
    }), overlapPoints);
    expect(blobHits, `podcast card points hit newsletter blobs at ${viewport.width}px`)
      .toEqual(overlapPoints.map(() => false));
  });
}
