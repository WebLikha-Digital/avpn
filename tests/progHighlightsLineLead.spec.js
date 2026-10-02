import { test, expect } from "@playwright/test";

const fixture = `
<style>
  .line-lead-spacer{height:1000px}
  [data-testid=line-lead-fixture]{height:1px}
  [data-testid=line-lead-fixture] [data-hscroll-viewport]{position:sticky;top:0;height:100vh;overflow:hidden}
  [data-testid=line-lead-fixture] [data-hscroll-track]{position:relative;display:flex;width:max-content;height:100%}
  .line-lead-panel{position:relative;flex:0 0 600px;height:100%;padding:120px 40px}
  .line-lead-panel:last-child{flex-basis:1200px}
  [data-testid=line-lead-fixture] [data-draw-scroll-wrap]{position:absolute;left:0;top:0;width:1800px;height:100%;pointer-events:none}
  [data-testid=line-lead-fixture] [data-draw-scroll-wrap] svg{width:100%;height:100%;overflow:visible}
  [data-testid=line-lead-fixture] [data-line-target]{position:relative;z-index:1}
  [data-testid=line-lead-fixture] [data-shape-reveal]{width:120px;height:120px;background:#fff}
  [data-testid=line-lead-fixture] [data-wipe-reveal]{width:140px;height:100px;object-fit:cover;background:#fff}
</style>
<div class=line-lead-spacer></div>
<section data-testid=line-lead-fixture data-hscroll-init><div data-hscroll-viewport><div data-hscroll-track>
  <div class=lead-line data-draw-scroll-wrap data-draw-scroll-lead="top 60%" data-draw-scroll-end="clamp(right center)"><svg viewBox="0 0 1800 1000" preserveAspectRatio="none" data-draw-scroll-desktop><path d="M0 100 C300 100 420 180 600 260 S900 480 1200 520 S1550 800 1800 980" vector-effect="non-scaling-stroke" fill="none" stroke="white" stroke-width="5" data-draw-scroll-path></svg></div>
  <div class=default-line data-draw-scroll-wrap data-draw-scroll-start="clamp(left center)" data-draw-scroll-end="clamp(right center)"><svg viewBox="0 0 1800 1000" preserveAspectRatio="none" data-draw-scroll-desktop><path d="M0 800 L1800 800" vector-effect="non-scaling-stroke" fill="none" stroke="white" stroke-width="5" data-draw-scroll-path></svg></div>
  <div class=line-lead-panel><h2 data-split=heading data-line-reveal=.lead-line>First line</h2><div data-shape-reveal=circle data-line-reveal=.lead-line></div><p data-split=heading data-testid=default-heading>Default line</p></div>
  <div class=line-lead-panel><img data-wipe-reveal data-line-reveal=.lead-line alt="" src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="></div>
  <div class=line-lead-panel><p data-line-target>Last panel</p></div>
</div></div></section>`;

async function loadFixture(page, width, height) {
  await page.addInitScript((html) => {
    const install = () => {
      if (document.readyState !== "interactive") return;
      document.body.insertAdjacentHTML("afterbegin", html);
    };
    if (document.readyState === "interactive") install();
    else document.addEventListener("readystatechange", install, { once: true });
  }, fixture);
  await page.setViewportSize({ width, height });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.locator("[data-testid=line-lead-fixture][data-hscroll-active]")).toHaveCount(1);
}

async function geometry(page) {
  return page.locator("[data-testid=line-lead-fixture]").evaluate((band) => {
    const line = band.querySelector(".lead-line");
    const st = line._drawTl.scrollTrigger;
    return { bandStart: band.getBoundingClientRect().top + scrollY, lead: st.start, end: st.end };
  });
}

async function crossingProgress(page) {
  return page.locator("[data-line-reveal]").evaluateAll((elements) => {
    const line = document.querySelector(".lead-line");
    const path = line.querySelector("[data-draw-scroll-path]");
    const lineLeft = line.getBoundingClientRect().left;
    const matrix = path.getScreenCTM();
    const total = path.getTotalLength();
    const points = [];
    let length = 0;
    let previous;
    for (let i = 0; i <= 128; i += 1) {
      const local = total * i / 128;
      const point = path.getPointAtLength(local);
      const current = { x: matrix.a * point.x + matrix.c * point.y + matrix.e, y: matrix.b * point.x + matrix.d * point.y + matrix.f };
      if (previous) length += Math.hypot(current.x - previous.x, current.y - previous.y);
      points.push({ x: current.x - lineLeft, length });
      previous = current;
    }
    return elements.map((element) => {
      const left = element.getBoundingClientRect().left - lineLeft;
      const index = Math.max(1, points.findIndex((point) => point.x >= left));
      const before = points[index - 1];
      const after = points[index];
      const ratio = after.x === before.x ? 0 : (left - before.x) / (after.x - before.x);
      return (before.length + (after.length - before.length) * ratio) / points.at(-1).length;
    });
  });
}

for (const [width, height] of [[1280, 800], [1440, 900], [1920, 1080]]) {
  test(`lead and reveals stay continuous at ${width}x${height}`, async ({ page }) => {
    await loadFixture(page, width, height);
    const range = await geometry(page);
    const crossings = await crossingProgress(page);

    await page.evaluate((range) => {
      scrollTo({ top: range.lead - 100, behavior: "instant" });
      const line = document.querySelector(".lead-line");
      const path = line.querySelector("[data-draw-scroll-path]");
      const targets = [...document.querySelectorAll("[data-line-reveal]")];
      const values = [];
      const sample = () => {
        values.push({
          y: scrollY,
          line: line._drawTl.progress(),
          dash: Number.parseFloat(path.style.strokeDasharray),
          reveals: targets.map((target) => (target._splitTween || target._shapeRevealTween || target._wipeTween).progress()),
        });
        if (scrollY < range.end + 80 && values.length < 800) requestAnimationFrame(sample);
        else window.__lineLeadSamplesDone = true;
      };
      window.__lineLeadSamples = values;
      window.__lineLeadSamplesDone = false;
      requestAnimationFrame(sample);
    }, range);
    for (let i = 0; i < 70; i += 1) {
      await page.mouse.wheel(0, 40);
      await page.waitForTimeout(16);
    }
    await page.waitForFunction(() => window.__lineLeadSamplesDone === true);
    const records = await page.evaluate(() => window.__lineLeadSamples);
    expect(records.length).toBeGreaterThan(20);

    const pin = records.reduce((best, record) => Math.abs(record.y - range.bandStart) < Math.abs(best.y - range.bandStart) ? record : best);
    expect(pin.line).toBeGreaterThan(0);
    expect(pin.line).toBeLessThan(1);
    const aroundPin = records.filter((record) => Math.abs(record.y - range.bandStart) < 80);
    expect(Math.max(...aroundPin.slice(1).map((record, i) => Math.abs(record.line - aroundPin[i].line)))).toBeLessThan(0.2);

    const totalScreen = records.at(-1).dash / records.at(-1).line;
    crossings.forEach((progress, index) => {
      const tip = records.find((record) => record.dash >= progress * totalScreen);
      const reveal = records.find((record) => record.reveals[index] > 0);
      expect(tip).toBeTruthy();
      expect(reveal).toBeTruthy();
      expect(reveal.y).toBeGreaterThanOrEqual(tip.y - 2);
      expect(Math.abs(reveal.y - (range.lead + (range.end - range.lead) * progress))).toBeLessThanOrEqual(50);
    });
  });
}

test("resize rebuilds the line mapping and preserves opt-outs", async ({ page }) => {
  await loadFixture(page, 1440, 900);
  const before = await geometry(page);
  await expect(page.locator("[data-testid=default-heading]")).toHaveCount(1);
  await expect.poll(() => page.locator("[data-testid=default-heading]").evaluate((element) => ({ start: element._splitTween.scrollTrigger.vars.start, horizontal: element._splitTween.scrollTrigger.vars.horizontal }))).toEqual({ start: "clamp(left 80%)", horizontal: true });
  await expect.poll(() => page.locator(".default-line").evaluate((line) => ({ horizontal: line._drawTl.scrollTrigger.vars.horizontal, scroller: Boolean(line._drawTl.scrollTrigger.vars.scroller) }))).toEqual({ horizontal: true, scroller: true });
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect.poll(() => page.locator(".lead-line").evaluate((line) => line._drawTl?.scrollTrigger?.end)).not.toBe(before.end);
  await expect(page.locator("[data-testid=line-lead-fixture][data-hscroll-active]")).toHaveCount(1);
});
