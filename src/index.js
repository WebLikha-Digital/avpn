import { ScrollTrigger } from "./lib/gsap.js";
import { initLocomotiveScroll } from "./lib/locomotive.js";
import { initDrawPathScroll } from "./animations/drawPathScroll.js";
import { initSplitReveal } from "./animations/splitReveal.js";
import { initMarqueeScrollDirection } from "./animations/marqueeScrollDirection.js";
import { initForewordFade } from "./animations/forewordAnim.js";
import { initHighlightDrum } from "./animations/highlightDrum.js";
import { initHorizontalParallax } from "./animations/horizontalParallax.js";
import { initShapeSwap } from "./animations/shapeSwap.js";
import {
  HSCROLL_REBUILT,
  initHorizontalScroller,
} from "./animations/horizontalScroller.js";
import { initRotaryWheel } from "./animations/rotaryWheel.js";
import { initStoriesStack } from "./animations/storiesStack.js";
import { initTunnel } from "./canvas/tunnel.js";
import { initTunnel2 } from "./canvas/tunnel2.js";

// Components that look up the band they sit in. The band has to exist before
// any of them initialize, and they all have to rebuild when a resize tears it
// down — so they're grouped rather than listed inline with the rest.
function initBandAware() {
  initRotaryWheel();
  initDrawPathScroll();
  initSplitReveal();
  initHorizontalParallax();
  initShapeSwap();
}

function init() {
  initLocomotiveScroll();
  initHorizontalScroller();
  initBandAware();
  initMarqueeScrollDirection();
  initForewordFade();
  initHighlightDrum();
  initStoriesStack();
  initTunnel();
  initTunnel2();
  watchImagesForRefresh();
}

window.addEventListener(HSCROLL_REBUILT, initBandAware);

function watchImagesForRefresh() {
  let refreshTimer;
  document.querySelectorAll("img").forEach((img) => {
    if (img.complete) return;
    img.addEventListener(
      "load",
      () => {
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => ScrollTrigger.refresh(), 100);
      },
      { once: true }
    );
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

window.addEventListener("load", () => ScrollTrigger.refresh());
