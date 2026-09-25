import { gsap, ScrollTrigger } from "../lib/gsap.js";

const DESKTOP_START = "top 85%";
const DESKTOP_END = "center 55%";
const MOBILE_START = "top 90%";
const MOBILE_END = "bottom 85%";
const TILE_DURATION = 1;
const TILE_STAGGER = 0.55;
const REVEAL_COMPLETE = "data-impact-reveal-complete";
const REVEAL_STATE_EVENT = "impact:reveal-state";

/**
 * Scroll-scrub the ImpactCollab stat tiles into view in DOM order.
 *
 * Webflow contract:
 *   [data-impact-reveal]       the grid; its direct children are tiles
 *   [data-impact-reveal-start] optional ScrollTrigger start override
 *   [data-impact-reveal-end]   optional ScrollTrigger end override
 *
 * The grid completion attribute is also the coordination point used by
 * impactCollabAuto.js. It is present only while the reveal is fully complete.
 */
export function initImpactCollabReveal() {
  initImpactCollabReveal._mm?.revert();
  initImpactCollabReveal._mm = null;

  const grids = [...document.querySelectorAll("[data-impact-reveal]")];
  grids.forEach(teardown);
  if (!grids.length) return;

  const mm = gsap.matchMedia();
  initImpactCollabReveal._mm = mm;

  mm.add(
    {
      isDesktop: "(min-width: 992px)",
      isMobile: "(max-width: 991px)",
      reduceMotion: "(prefers-reduced-motion: reduce)",
    },
    (context) => {
      const { isDesktop, reduceMotion } = context.conditions;

      grids.forEach((grid) => {
        const tiles = [...grid.children];
        if (!tiles.length) return;

        if (reduceMotion) {
          gsap.set(tiles, {
            clearProps: "transform,transformOrigin,opacity",
          });
          setRevealComplete(grid, true);
          grid._impactCollabReveal = { tiles, reducedMotion: true };
          return;
        }

        const start = resolvePosition(
          grid.getAttribute("data-impact-reveal-start"),
          isDesktop ? DESKTOP_START : MOBILE_START,
        );
        const end = resolvePosition(
          grid.getAttribute("data-impact-reveal-end"),
          isDesktop ? DESKTOP_END : MOBILE_END,
        );

        gsap.set(tiles, {
          transformOrigin: "50% 50%",
          scale: 0,
          opacity: 0,
        });

        const timeline = gsap.timeline({
          scrollTrigger: {
            trigger: grid,
            start,
            end,
            scrub: 0.5,
            invalidateOnRefresh: true,
            onUpdate: (self) => setRevealComplete(grid, self.progress >= 0.9999),
          },
        });

        tiles.forEach((tile, index) => {
          timeline.to(
            tile,
            { scale: 1, opacity: 1, duration: TILE_DURATION, ease: "none" },
            index * TILE_STAGGER,
          );
        });

        grid._impactCollabReveal = { tiles, timeline };
        setRevealComplete(grid, timeline.scrollTrigger.progress >= 0.9999);
      });

      return () => grids.forEach(teardown);
    },
  );
}

function resolvePosition(authored, fallback) {
  return authored || fallback;
}

function setRevealComplete(grid, complete) {
  const wasComplete = grid.hasAttribute(REVEAL_COMPLETE);
  if (complete === wasComplete) return;

  if (complete) grid.setAttribute(REVEAL_COMPLETE, "");
  else grid.removeAttribute(REVEAL_COMPLETE);

  grid.dispatchEvent(
    new CustomEvent(REVEAL_STATE_EVENT, { detail: { complete } }),
  );
}

function teardown(grid) {
  const previous = grid._impactCollabReveal;
  if (!previous) {
    setRevealComplete(grid, false);
    return;
  }

  previous.timeline?.scrollTrigger?.kill();
  previous.timeline?.kill();
  gsap.set(previous.tiles, {
    clearProps: "transform,transformOrigin,opacity",
  });
  setRevealComplete(grid, false);
  grid._impactCollabReveal = null;
}
