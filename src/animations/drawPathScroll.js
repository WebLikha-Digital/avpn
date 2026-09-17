import { gsap, ScrollTrigger } from "../lib/gsap.js";
import { bandContext } from "./horizontalScroller.js";

/**
 * Draw Path on Scroll — based on the Osmo Supply resource, wired into this
 * repo's build and generalized to drive more than one line.
 *
 * Scrubs SVG stroke drawing from 0% to 100% across the active SVG's scroll range,
 * with an optional separate SVG for mobile. A reveal wrapper instead draws once
 * when its trigger crosses the start point.
 *
 *   [data-draw-scroll-wrap]      configuration scope; one animation per wrapper
 *     [data-draw-scroll-desktop] SVG used above 768px
 *       [data-draw-scroll-path]  every marked shape in here draws
 *     [data-draw-scroll-mobile]  optional SVG used at/below 767px
 *       [data-draw-scroll-path]
 *
 * Optional per-wrapper overrides, so separate instances can behave differently
 * without touching this file. Each falls back to the upstream default:
 *
 *   data-draw-scroll-start     ScrollTrigger start   (default "clamp(top center)")
 *   data-draw-scroll-end       ScrollTrigger end     (default "clamp(bottom center)")
 *   data-draw-scroll-stagger   seconds between each shape starting, when a
 *                              wrapper marks several (default 0 — all together)
 *   data-draw-scroll-reveal    presence enables a one-shot 0.8s expo.out reveal;
 *                              data-draw-scroll-end is ignored in this mode
 *   data-draw-scroll-trigger   CSS selector for a vertical window trigger;
 *                              nearest matching ancestor, then first page match,
 *                              then the active SVG
 *   data-draw-scroll-once      set to "false" to replay a reveal on re-entry
 *   data-draw-scroll-after     selector for a reveal wrapper that must complete
 *                              before a scrub wrapper starts drawing
 *
 * Despite the attribute name, [data-draw-scroll-path] works on anything
 * DrawSVGPlugin accepts: path, line, polyline, polygon, rect, ellipse, circle.
 *
 * Two things to know when reusing this:
 *
 *   1. It draws a *stroke*. It cannot animate a fill. To reveal filled artwork
 *      (see the signature demo in index.html) make the drawn shape a stroke
 *      inside an SVG <mask> and put the filled artwork in a masked <g>.
 *   2. Keep each drawn shape to a single subpath. SVG restarts
 *      stroke-dasharray at every `M`, so a shape with two subpaths draws both
 *      from 0% simultaneously rather than one after the other. Join them with a
 *      travel segment, or mark them as two separate shapes and use
 *      data-draw-scroll-stagger.
 *
 * Changes from the resource as published, all required to fit this repo or to
 * support more than one line:
 *
 *   - GSAP and its plugins come from `src/lib/gsap.js` (npm) instead of CDN
 *     <script> tags, so registerPlugin lives there.
 *   - Exported and called from `src/index.js` alongside every other component
 *     instead of self-invoking on DOMContentLoaded. Note it must be called
 *     before initSplitReveal() — see the comment at that call site.
 *   - querySelectorAll instead of querySelector for the drawn shape, so a
 *     wrapper can drive several lines. Upstream animated only the first.
 *   - The matchMedia context is stored on the function and reverted before a
 *     new one is built, so calling init twice replaces its work instead of
 *     stacking a second set of contexts and timelines on the same elements.
 *   - start/end/stagger read from the wrapper, defaulting to upstream's values.
 *
 * The breakpoint, scrub behaviour, per-wrapper teardown and refresh are
 * unchanged.
 */
export function initDrawPathScroll() {
  // Idempotent re-init: drop the previous matchMedia context (and everything
  // it created) before building a new one. Without this a second call leaves
  // the first context alive, so both drive the same shapes.
  initDrawPathScroll._mm?.revert();

  const mm = gsap.matchMedia();
  initDrawPathScroll._mm = mm;

  const wrappers = document.querySelectorAll("[data-draw-scroll-wrap]");

  mm.add(
    {
      isDesktop: "(min-width: 768px)",
      isMobile: "(max-width: 767px)",
    },
    (context) => {
      const { isMobile } = context.conditions;
      const gatedScrubs = [];

      wrappers.forEach((wrap) => {
        teardownDrawWrapper(wrap);

        const desktopSVG = wrap.querySelector("[data-draw-scroll-desktop]");
        const mobileSVG = wrap.querySelector("[data-draw-scroll-mobile]"); // optional

        // default: desktop
        let svgToUse = desktopSVG;

        // on mobile, use mobileSVG if it exists
        if (isMobile && mobileSVG) {
          svgToUse = mobileSVG;
        }

        if (!svgToUse) return;

        // All marked shapes in the active SVG, not just the first.
        const paths = svgToUse.querySelectorAll("[data-draw-scroll-path]");
        if (!paths.length) return;

        const reveal = wrap.hasAttribute("data-draw-scroll-reveal");
        const triggerSelector = wrap.getAttribute("data-draw-scroll-trigger");
        const hasWindowTrigger = triggerSelector !== null;
        const trigger = hasWindowTrigger
          ? resolveDrawTrigger(wrap, triggerSelector, svgToUse)
          : svgToUse;

        if (reveal && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          gsap.set(paths, { drawSVG: "100%" });
          return;
        }

        // Inside a horizontal band the wrapper never moves vertically, so the
        // defaults have to swap axis with it. An authored start/end still wins,
        // and has to be written in the band's axis when there is one.
        const band = bandContext(wrap);
        const scrollBand = hasWindowTrigger ? null : band;
        const start =
          wrap.getAttribute("data-draw-scroll-start") ||
          (reveal || hasWindowTrigger
            ? "top 80%"
            : band
              ? "clamp(left center)"
              : "clamp(top center)");
        const end =
          wrap.getAttribute("data-draw-scroll-end") ||
          (scrollBand ? "clamp(right center)" : "clamp(bottom center)");
        const configuredStagger = Number.parseFloat(
          wrap.getAttribute("data-draw-scroll-stagger"),
        );
        // Negative stagger values make the timeline start before zero and can
        // leave the first shape partially undrawn. Treat invalid/negative
        // values as the documented default instead.
        const stagger = Number.isFinite(configuredStagger)
          ? Math.max(0, configuredStagger)
          : 0;

        const once =
          wrap.getAttribute("data-draw-scroll-once") !== "false";
        const scrollTrigger = {
          // Use the active signature SVG as the trigger for scrub mode. Reveal
          // mode may replace it with an authored section/ancestor trigger.
          trigger,
          start,
          ...(reveal
            ? {
                once,
                ...(once ? {} : { toggleActions: "restart none none none" }),
              }
            : {
                end,
                scrub: true,
                invalidateOnRefresh: true,
                ...scrollBand,
              }),
        };

        // Set every target immediately so paths stay invisible until the
        // reveal fires, and so delayed scrub targets do not flash at load.
        gsap.set(paths, { drawSVG: 0 });

        if (reveal) {
          wrap._drawTl = gsap.to(paths, {
            drawSVG: "100%",
            duration: 0.8,
            ease: "expo.out",
            stagger,
            scrollTrigger,
          });
          return;
        }

        const afterSelector = wrap.getAttribute("data-draw-scroll-after");
        if (afterSelector !== null) {
          gatedScrubs.push({
            wrap,
            paths,
            scrollTrigger,
            stagger,
          });
          return;
        }

        createScrubTimeline(wrap, paths, scrollTrigger, stagger);
      });

      gatedScrubs.forEach(({ wrap, paths, scrollTrigger, stagger }) => {
        setupGatedScrub(wrap, paths, scrollTrigger, stagger);
      });

      // Refresh after the matchMedia callback returns so this context cannot
      // capture tweens that other components create during refresh.
      queueMicrotask(() => ScrollTrigger.refresh());

      // Cleanup when breakpoint changes
      return () => {
        wrappers.forEach((wrap) => {
          teardownDrawWrapper(wrap);
        });
      };
    }
  );
}

function createScrubTimeline(wrap, paths, scrollTrigger, stagger) {
  const tl = gsap.timeline({
    defaults: {
      ease: "linear", // scroll speed controls easing
    },
    scrollTrigger: {
      ...scrollTrigger,
    },
  });

  // One tween over every shape. With stagger 0 they draw together and the
  // timeline is 1 unit long; with a stagger it grows to
  // 1 + (count - 1) * stagger, and scrub maps whatever that is across the
  // full scroll range, so the drawing still finishes exactly at `end`.
  tl.to(paths, { drawSVG: "100%", duration: 1, stagger }, 0);

  // Keep a reference so we can kill it on breakpoint change
  wrap._drawTl = tl;
  return tl;
}

function setupGatedScrub(wrap, paths, scrollTrigger, stagger) {
  const selector = wrap.getAttribute("data-draw-scroll-after");
  const target = resolveDrawTrigger(wrap, selector, null);
  const targetTween = target?._drawTl;

  // A missing selector, a non-reveal target, or a reveal that opted out of a
  // tween (reduced motion) all retain the original ungated behaviour.
  if (!target?.hasAttribute("data-draw-scroll-reveal")) {
    createScrubTimeline(wrap, paths, scrollTrigger, stagger);
    return;
  }

  if (!targetTween || targetTween.progress() >= 1) {
    createScrubTimeline(wrap, paths, scrollTrigger, stagger);
    return;
  }

  const gate = { cancelled: false };
  wrap._drawScrollGate = gate;
  targetTween.then(() => {
    if (gate.cancelled || wrap._drawScrollGate !== gate) return;
    wrap._drawScrollGate = null;

    const tl = createScrubTimeline(wrap, paths, scrollTrigger, stagger);
    // The trigger measures on the next refresh, not on creation. Refresh it
    // now so the timeline sits at its mapped progress before it is read.
    tl.scrollTrigger?.refresh();
    const mapped = [...paths].map((path) => {
      const tween = gsap.getTweensOf(path).find((item) => item.timeline === tl);
      const progress = tween?.progress() ?? tl.progress();
      return { progress, drawSVG: `0 ${progress * 100}%` };
    });
    if (!mapped.some(({ progress }) => progress > 0)) return;

    const catchup = gsap.fromTo(
      paths,
      { drawSVG: "0" },
      {
        drawSVG: (index) => mapped[index].drawSVG,
        duration: 0.5,
        ease: "power2.out",
        overwrite: false,
        onComplete: () => {
          if (wrap._drawScrollCatchup === catchup) {
            wrap._drawScrollCatchup = null;
          }
        },
      },
    );
    wrap._drawScrollCatchup = catchup;
  });
}

function teardownDrawWrapper(wrap) {
  if (wrap._drawScrollGate) {
    wrap._drawScrollGate.cancelled = true;
    wrap._drawScrollGate = null;
  }

  if (wrap._drawScrollCatchup) {
    wrap._drawScrollCatchup.kill();
    wrap._drawScrollCatchup = null;
  }

  if (!wrap._drawTl) return;

  if (wrap._drawTl.scrollTrigger) {
    wrap._drawTl.scrollTrigger.kill();
  }
  wrap._drawTl.kill();
  wrap._drawTl = null;
}

function resolveDrawTrigger(wrap, selector, fallback) {
  if (!selector) return fallback;

  try {
    return wrap.closest(selector) || document.querySelector(selector) || fallback;
  } catch {
    return fallback;
  }
}
