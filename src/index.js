import { ScrollTrigger } from "./lib/gsap.js";
import { initLocomotiveScroll } from "./lib/locomotive.js";
import { initDrawPathScroll } from "./animations/drawPathScroll.js";
import { initSplitReveal } from "./animations/splitReveal.js";
import { initMarqueeScrollDirection } from "./animations/marqueeScrollDirection.js";
import { initContentReveal } from "./animations/contentReveal.js";
import { initForewordFade } from "./animations/forewordAnim.js";
import { initClipReveal } from "./animations/clipReveal.js";
import { initHighlightDrum } from "./animations/highlightDrum.js";
import { initHorizontalParallax } from "./animations/horizontalParallax.js";
import { initShapeSwap } from "./animations/shapeSwap.js";
import { initShapeReveal } from "./animations/shapeReveal.js";
import {
  HSCROLL_REBUILT,
  initHorizontalScroller,
} from "./animations/horizontalScroller.js";
import { initRotaryWheel } from "./animations/rotaryWheel.js";
import { initStoriesStack } from "./animations/storiesStack.js";
import { initArcScrollTransition } from "./animations/arcScrollTransition.js";
import { initProgrammesOverview } from "./animations/programmesOverview.js";
import { initListHoverReveal } from "./animations/listHoverReveal.js";
import { initListPreviewFollower } from "./animations/listPreviewFollower.js";
import { initTunnel2 } from "./canvas/tunnel2.js";
import { initPreloader } from "./animations/preloader.js";

// Components that look up the band they sit in. The band has to exist before
// any of them initialize, and they all have to rebuild when a resize tears it
// down — so they're grouped rather than listed inline with the rest.
function initBandAware() {
  initRotaryWheel();
  initDrawPathScroll();
  initSplitReveal();
  initShapeReveal();
  initHorizontalParallax();
  initShapeSwap();
}

function init() {
  initLocomotiveScroll();
  initHorizontalScroller();
  initBandAware();
  initMarqueeScrollDirection();
  initContentReveal();
  initForewordFade();
  initClipReveal();
  initHighlightDrum();
  initStoriesStack();
  initArcScrollTransition();
  initProgrammesOverview();
  initListHoverReveal();
  initListPreviewFollower();
  initTunnel2();
  watchImagesForRefresh();
  watchDocumentHeight();
  initPreloader();
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

/**
 * Re-measure every trigger while the page is still growing.
 *
 * watchImagesForRefresh only binds to the <img> elements that exist at DOM
 * ready, and window.load fires once. Neither covers the real behaviour of this
 * page: for the first few seconds after a reload the document keeps getting
 * taller — lazy images, fonts, the Webflow embeds — while Locomotive is
 * restoring the previous scroll position.
 *
 * A trigger measured during that window holds a start offset from a shorter
 * page. Everything below the growth then sits somewhere the triggers do not
 * expect, and because the restore is still moving the scroll position, a
 * scrubbed section plays itself: reloading inside Programmes Overview walked
 * its progress from 1 back to 0 over about three seconds, untouched, with the
 * wheel doing nothing until it settled.
 *
 * A ResizeObserver on the document element catches every one of those changes,
 * whatever caused them. The refresh is debounced because the height arrives in
 * bursts, and ScrollTrigger.refresh() is expensive — it re-measures every
 * trigger on the page, including the pins inside the horizontal bands.
 */
function watchDocumentHeight() {
  if (typeof ResizeObserver === "undefined") return;

  // Stashed on the function so repeated init calls never stack observers.
  watchDocumentHeight._observer?.disconnect();

  let lastHeight = document.documentElement.scrollHeight;
  let timer;

  const observer = new ResizeObserver(() => {
    const height = document.documentElement.scrollHeight;
    if (height === lastHeight) return;
    lastHeight = height;

    clearTimeout(timer);
    timer = setTimeout(() => ScrollTrigger.refresh(), 150);
  });

  observer.observe(document.documentElement);
  watchDocumentHeight._observer = observer;
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

window.addEventListener("load", () => ScrollTrigger.refresh());
