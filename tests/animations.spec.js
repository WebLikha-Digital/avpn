import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect.poll(() => page.locator("canvas").count()).toBeGreaterThan(0);
  expect(errors, "the preview should boot without browser errors").toEqual([]);
});

test("boots every preview component", async ({ page }) => {
  // How many lines SplitText builds depends on where the heading wraps, which
  // varies with the platform's default font — one line on macOS, two on CI's
  // Linux runner. Assert the split happened, not how many lines it produced.
  await expect
    .poll(() => page.locator(".mask-demo__inner .line").count())
    .toBeGreaterThan(0);
  await expect(page.locator("[data-tunnel-init] canvas")).toHaveCount(2);
  await expect(page.locator("[data-tunnel2-init] canvas")).toHaveCount(1);
});

test("uploads every tunnel2 texture before its first render", async ({ page }) => {
  await page.addInitScript(() => {
    window.__tunnel2Ready = null;
    document.addEventListener("tunnel2:ready", (event) => {
      window.__tunnel2Ready = event.detail;
    });
  });
  await page.goto("/");
  await page.locator("[data-tunnel2-init]").evaluate((mount) => {
    mount.scrollIntoView({ behavior: "instant", block: "center" });
  });
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await expect.poll(() => page.locator("[data-tunnel2-init]").evaluate((mount) => ({
    uploaded: mount._tunnel2?.uploaded ?? 0,
    textureCount: mount._tunnel2?.textureCount ?? -1,
    firstRenderUploaded: mount._tunnel2?.firstRenderUploaded,
  }))).toEqual({ uploaded: 12, textureCount: 12, firstRenderUploaded: 12 });
  await expect.poll(() => page.evaluate(() => window.__tunnel2Ready)).toEqual({
    uploaded: 12,
    textureCount: 12,
  });
  await expect.poll(() => page.locator("[data-tunnel2-init]").evaluate((mount) =>
    mount._tunnel2.gpuTextures(),
  )).toBe(12);
});

test("keeps pooled texture versions stable while tunnel2 recycles segments", async ({ page }) => {
  await page.addInitScript(() => {
    window.__tunnel2Ready = false;
    document.addEventListener("tunnel2:ready", () => {
      window.__tunnel2Ready = true;
    });
    const observer = new MutationObserver(() => {
      const mount = document.querySelector("[data-tunnel2-init]");
      if (!mount) return;
      mount.setAttribute("data-tunnel2-speed", "100");
      observer.disconnect();
    });
    observer.observe(document, { childList: true, subtree: true });
  });
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => window.__tunnel2Ready)).toBe(true);
  const mount = page.locator("[data-tunnel2-init]");
  await mount.evaluate((node) => {
    node.scrollIntoView({ behavior: "instant", block: "center" });
  });
  await page.evaluate(() => new Promise(requestAnimationFrame));
  const before = await mount.evaluate((node) => ({
    versions: node._tunnel2.textureVersions(),
    cloneCount: node._tunnel2.cloneCount,
    cacheSize: node._tunnel2.cacheSize,
  }));
  expect(before.cloneCount).toBe(before.cacheSize);
  await expect.poll(
    () => mount.evaluate((node) => node._tunnel2.recycled),
    { timeout: 15_000 },
  ).toBeGreaterThan(0);
  const after = await mount.evaluate((node) => ({
    versions: node._tunnel2.textureVersions(),
    cloneCount: node._tunnel2.cloneCount,
    cacheSize: node._tunnel2.cacheSize,
  }));
  expect(after.versions).toEqual(before.versions);
  expect(after.cloneCount).toBe(before.cloneCount);
  expect(after.cloneCount).toBe(after.cacheSize);
});

test("confines tunnel2 images to surfaces and cycles each pool in order", async ({ page }) => {
  await expect.poll(() => page.locator("[data-tunnel2-init] canvas").count()).toBe(1);
  const tileData = await page.locator("[data-tunnel2-init]").evaluate((mount) => {
    const scene = mount.__tunnel2?.scene;
    const tiles = [];
    // Segments are populated in descending z (initial build, then each recycle
    // appends at the far end), so sorting by z restores creation order even
    // after the loop has recycled a segment.
    [...(scene?.children ?? [])]
      .filter((segment) => segment.children.some((mesh) => mesh.name === "tile"))
      .sort((a, b) => b.position.z - a.position.z)
      .forEach((segment) => {
        segment.children.forEach((mesh) => {
          if (mesh.name === "tile") tiles.push(mesh.userData);
        });
      });
    return tiles;
  });

  const expected = {
    left: [0, 1, 2],
    right: [3, 4, 5],
    top: [6, 7, 8],
    bottom: [9, 10, 11],
  };
  for (const [surface, indices] of Object.entries(expected)) {
    const actual = tileData
      .filter((tile) => tile.surface === surface)
      .map((tile) => tile.sourceIndex);
    expect(actual.length).toBeGreaterThanOrEqual(indices.length * 2);
    actual.forEach((sourceIndex, index) => {
      expect(sourceIndex).toBe(indices[index % indices.length]);
    });
  }
});


// The bundle is a module script that mounts the tunnel as soon as it runs, before
// DOMContentLoaded. A manifest rewrite has to land while the document is still
// parsing, so watch the parser instead of waiting for the event: once something
// follows the mount, the manifest's own children are complete and can be swapped.
const rewriteTunnel2Manifest = (page, html) =>
  page.addInitScript((markup) => {
    const observer = new MutationObserver(() => {
      const mount = document.querySelector("[data-tunnel2-init]");
      if (!mount?.nextElementSibling) return;
      mount.querySelector("[data-tunnel2-images]").innerHTML = markup;
      observer.disconnect();
    });
    observer.observe(document, { childList: true, subtree: true });
  }, html);

test("lets unassigned tunnel2 images land on every surface", async ({ page }) => {
  await rewriteTunnel2Manifest(
    page,
    `<img alt="" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='2' height='2'%3E%3Crect width='2' height='2' fill='red'/%3E%3C/svg%3E">`,
  );
  await page.reload();
  await page.waitForLoadState("networkidle");

  const surfaces = await page.locator("[data-tunnel2-init]").evaluate((mount) => {
    const tiles = [];
    mount.__tunnel2?.scene.children.forEach((segment) => {
      segment.children.forEach((mesh) => {
        if (mesh.name === "tile") tiles.push(mesh.userData);
      });
    });
    return [...new Set(tiles.map((tile) => tile.surface))];
  });
  expect([...surfaces].sort()).toEqual(["bottom", "left", "right", "top"]);
});

test("leaves a surface empty when it has no eligible images", async ({ page }) => {
  await rewriteTunnel2Manifest(
    page,
    `<img alt="" data-tunnel2-surface="left" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='2' height='2'%3E%3Crect width='2' height='2' fill='blue'/%3E%3C/svg%3E">`,
  );
  await page.reload();
  await page.waitForLoadState("networkidle");

  const surfaces = await page.locator("[data-tunnel2-init]").evaluate((mount) => {
    const tiles = [];
    mount.__tunnel2?.scene.children.forEach((segment) => {
      segment.children.forEach((mesh) => {
        if (mesh.name === "tile") tiles.push(mesh.userData.surface);
      });
    });
    return [...new Set(tiles)];
  });
  expect(surfaces).toEqual(["left"]);
});

test("gives split masks descender room without changing line spacing", async ({ page }) => {
  const spacing = await page.locator(".mask-demo__inner .line-mask").first().evaluate((mask) => {
    const styles = getComputedStyle(mask);
    return {
      paddingBottom: Number.parseFloat(styles.paddingBottom),
      marginBottom: Number.parseFloat(styles.marginBottom),
    };
  });

  expect(spacing.paddingBottom).toBeGreaterThan(0);
  expect(spacing.paddingBottom + spacing.marginBottom).toBeCloseTo(0, 5);
});

test("keeps a parked line outside its padded mask while the page scrolls", async ({
  page,
}) => {
  // The descender padding grows the mask's visible box, which eats into the
  // offset that hides a line before its reveal fires. A settled reading cannot
  // catch that, so sample every frame across a full scroll.
  //
  // "Parked" is derived, not hard-coded: a line is parked at whatever its own
  // largest observed offset turns out to be, so retuning the reveal's yPercent
  // does not silently disarm this test. The reading kept is the intrusion —
  // how far a parked line's top sits *above* its mask's bottom edge. At or
  // below zero means no sliver of text ever shows.
  const worst = await page.evaluate(async () => {
    const masks = [...document.querySelectorAll(".line-mask")];
    const travel = document.documentElement.scrollHeight - window.innerHeight;
    const readings = masks.map(() => []);

    for (let step = 0; step <= 120; step++) {
      window.scrollTo(0, (travel * step) / 120);
      await new Promise((resolve) => requestAnimationFrame(resolve));

      masks.forEach((mask, index) => {
        const line = mask.firstElementChild;
        if (!line) return;

        const lineBox = line.getBoundingClientRect();
        if (lineBox.height === 0) return;

        readings[index].push({
          shift: new DOMMatrixReadOnly(getComputedStyle(line).transform).f,
          intrusion: mask.getBoundingClientRect().bottom - lineBox.top,
        });
      });
    }

    let intrusion = -Infinity;
    let parkedSamples = 0;

    for (const perMask of readings) {
      if (!perMask.length) continue;
      const parked = Math.max(...perMask.map((reading) => reading.shift));
      if (parked <= 0) continue;

      for (const reading of perMask) {
        if (reading.shift < parked * 0.98) continue;
        parkedSamples++;
        intrusion = Math.max(intrusion, reading.intrusion);
      }
    }

    return { intrusion, parkedSamples, maskCount: masks.length };
  });

  expect(worst.maskCount, "the preview should build split masks").toBeGreaterThan(0);
  expect(worst.parkedSamples, "the scroll should pass parked lines").toBeGreaterThan(0);
  expect(worst.intrusion).toBeLessThanOrEqual(0);
});

test("WebGL previews allocate live render surfaces", async ({ page }) => {
  const canvases = page.locator("canvas");
  const surfaces = await canvases.evaluateAll((items) =>
    items.map((canvas) => {
      const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
      return Boolean(gl && canvas.width > 0 && canvas.height > 0 && !gl.isContextLost());
    }),
  );

  expect(surfaces).toEqual([true, true, true]);
});

test("initializes the scroll-linked reveal state", async ({ page }) => {
  const heading = page.locator('.mask-demo__inner .word').first();
  await expect.poll(() => heading.evaluate((element) => getComputedStyle(element).transform)).not.toBe("none");
  await expect.poll(() => heading.evaluate((element) => {
    const triggers = element.closest("[data-foreword-fade-init]")?._forewordFadeTriggers;
    return Array.isArray(triggers) && triggers.length > 0 && triggers.every((trigger) => Number.isFinite(trigger.start) && Number.isFinite(trigger.end));
  })).toBe(true);
});

test("initializes the scroll-direction marquee", async ({ page }) => {
  await expect(page.locator("[data-marquee-status='normal']")).toHaveCount(1);
  expect(await page.locator("[data-marquee-scroll-direction-target]").evaluate((marquee) => ({
    collections: marquee.querySelectorAll("[data-marquee-collection-target]").length,
    hasDirectionTrigger: Boolean(marquee._marqueeScrollDirectionInstance?.directionTrigger),
    hasScrollTrigger: Boolean(marquee._marqueeScrollDirectionInstance?.scrollTimeline?.scrollTrigger),
  }))).toEqual({ collections: 3, hasDirectionTrigger: true, hasScrollTrigger: true });
});

test("draws every marked line in each draw-path wrapper", async ({ page }) => {
  const paths = page.locator("[data-draw-scroll-wrap] [data-draw-scroll-path]");
  await expect(paths).toHaveCount(5);

  expect(await page.locator("[data-draw-scroll-wrap]").evaluateAll((wrappers) =>
    wrappers.map((wrapper) => ({
      hasTrigger: Boolean(wrapper._drawTl && wrapper._drawTl.scrollTrigger),
      targetCount: wrapper._drawTl?.getChildren().reduce(
        (count, tween) => count + tween.targets().length,
        0,
      ) || 0,
    })),
  )).toEqual([
    { hasTrigger: true, targetCount: 1 },
    { hasTrigger: true, targetCount: 3 },
    // The connector inside the horizontal band: proves the wrapper still
    // builds a trigger when its scroller is the band rather than the window.
    { hasTrigger: true, targetCount: 1 },
  ]);
});

test("tolerates missing image manifests", async ({ page }) => {
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      document.querySelectorAll("[data-tunnel-images], [data-tunnel2-images]").forEach((manifest) => {
        manifest.remove();
      });
    });
  });
  await page.reload();
  await page.waitForLoadState("networkidle");

  await expect(page.locator("[data-tunnel-init] canvas")).toHaveCount(2);
  await expect(page.locator("[data-tunnel2-init] canvas")).toHaveCount(1);
});

test("keeps one canvas per instance after a resize", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.waitForTimeout(250);
  await expect(page.locator("[data-tunnel-init] canvas")).toHaveCount(2);
  await expect(page.locator("[data-tunnel2-init] canvas")).toHaveCount(1);
});

test("keeps decorative rendering out of the accessibility tree", async ({ page }) => {
  await expect(page.locator("canvas[aria-hidden='true']")).toHaveCount(3);
  await expect(page.locator("[data-tunnel-images][aria-hidden='true']")).toHaveCount(1);
  await expect(page.locator("[data-tunnel2-images][aria-hidden='true']")).toHaveCount(1);
  expect(await page.locator("[tabindex]").evaluateAll((items) =>
    items.every((item) => Number(item.getAttribute("tabindex")) <= 0),
  )).toBe(true);
});

test("remains usable with reduced motion enabled", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await page.waitForLoadState("networkidle");

  await expect(page.locator("body")).toBeVisible();
  await expect(page.locator(".mask-demo__inner")).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(3);
});

test("preview remains usable at a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.waitForLoadState("networkidle");

  await expect(page.locator("body")).toBeVisible();
  await expect(page.locator("[data-tunnel2-init] canvas")).toHaveCount(1);
  expect(await page.locator("body").evaluate((body) => body.scrollWidth)).toBeLessThanOrEqual(390);
});
