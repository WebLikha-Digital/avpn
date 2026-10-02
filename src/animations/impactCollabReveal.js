import { gsap, ScrollTrigger } from "../lib/gsap.js";
import { measureScreenPath } from "./screenPath.js";

const DESKTOP_START = "top 85%";
const DESKTOP_END = "center 55%";
const MOBILE_START = "top 90%";
const MOBILE_END = "bottom 85%";
const TILE_DURATION = 1;
const TILE_STAGGER = 0.55;
const LINE_REVEAL_SPAN = 0.14;
const REVEAL_COMPLETE = "data-impact-reveal-complete";
const REVEAL_STATE_EVENT = "impact:reveal-state";

/**
 * Scroll-scrub the ImpactCollab stat tiles into view in DOM order.
 *
 * Webflow contract:
 *   [data-impact-reveal]       the grid; its direct children are tiles
 *   [data-impact-reveal-start] optional ScrollTrigger start override
 *   [data-impact-reveal-end]   optional ScrollTrigger end override
 *   [data-impact-reveal-line]  optional selector for the draw-scroll line wrap;
 *                              resolved inside the closest section, then document-wide
 *   [data-impact-reveal-span]  optional normalized scrub span for line-led reveals
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

        const line = isLineLed(grid);
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

        // Line-led: complete once the scroll passes the last tile's reveal end,
        // not the trigger end (which runs on past the line's end), so the
        // auto-morph starts while the grid is still in view.
        const isComplete = (self) => {
          if (!line) return self.progress >= 0.9999;
          const positions = grid._impactCollabReveal?.lineRevealPositions;
          if (!positions) return false;
          const span = readLineRevealSpan(grid);
          const last = (Math.max(...positions) + span) / (1 + span);
          return self.progress >= Math.min(0.9999, last - 0.0001);
        };

        const timeline = gsap.timeline({
          scrollTrigger: {
            trigger: line?.line || grid,
            start: line ? () => lineStart(line) : start,
            end: line ? () => lineEnd(line, grid) : end,
            scrub: 0.5,
            invalidateOnRefresh: true,
            onRefresh: line
              ? (self) => {
                  positionLineTiles(grid, tiles, timeline, line, self);
                  setRevealComplete(grid, isComplete(self));
                }
              : (self) => setRevealComplete(grid, isComplete(self)),
            onUpdate: (self) => setRevealComplete(grid, isComplete(self)),
          },
        });

        // Keep the timeline's normalized range fixed; line-led tile tweens are
        // moved within it after the line trigger has refreshed its geometry.
        timeline.to({}, { duration: line ? 1 + readLineRevealSpan(grid) : 1 }, 0);
        // timeline.to() returns the timeline, so build each tween first and
        // keep its handle; positionLineTiles moves them individually.
        const tileTweens = tiles.map((tile, index) => {
          const tween = gsap.to(tile, {
            scale: 1,
            opacity: 1,
            duration: line ? readLineRevealSpan(grid) : TILE_DURATION,
            ease: "none",
          });
          timeline.add(tween, line ? 0 : index * TILE_STAGGER);
          return tween;
        });

        grid._impactCollabReveal = {
          tiles,
          timeline,
          line: line?.line || null,
          tileTweens,
          lineRevealPositions: null,
        };
        if (line) positionLineTiles(grid, tiles, timeline, line, timeline.scrollTrigger);
        setRevealComplete(grid, isComplete(timeline.scrollTrigger));
      });

      return () => grids.forEach(teardown);
    },
  );
}

function resolvePosition(authored, fallback) {
  return authored || fallback;
}

function isLineLed(grid) {
  if (window.innerWidth < 768) return null;
  const selector = grid.getAttribute("data-impact-reveal-line")?.trim();
  if (!selector) return null;

  try {
    const section = grid.closest("section");
    const line = section?.querySelector(selector) || document.querySelector(selector);
    return line ? { line } : null;
  } catch {
    return null;
  }
}

function lineStart(line) {
  return line.line?._drawScrubState?.trigger?.start ?? 0;
}

function lineEnd(line, grid) {
  const start = lineStart(line);
  const end = line.line?._drawScrubState?.trigger?.end ?? start;
  return end + (end - start) * readLineRevealSpan(grid);
}

function positionLineTiles(grid, tiles, timeline, line, trigger) {
  if (!grid._impactCollabReveal) return;
  const state = line.line?._drawScrubState;
  if (!state?.paths?.length || !state.trigger) return;

  const measurements = [...state.paths].map((path) => measureScreenPath(path, true));
  const positions = tiles.map((tile) => {
    const rect = finalRect(tile);
    let best = null;

    measurements.forEach((measurement) => {
      const progress = pathEntryProgress(measurement, rect);
      if (progress !== null && (best === null || progress < best)) best = progress;
    });

    if (best === null) {
      measurements.forEach((measurement) => {
        const progress = closestProgress(measurement, rect);
        if (progress !== null && (best === null || progress < best)) best = progress;
      });
    }
    return best ?? 1;
  });

  const lineDuration = state.duration || 1;
  const stagger = state.stagger || 0;
  const pathCount = Math.max(1, state.paths.length);
  const pathDuration = lineDuration / Math.max(1, 1 + (pathCount - 1) * stagger);
  const normalized = positions.map((progress) => gsap.utils.clamp(
    0,
    1,
    (progress * pathDuration) / lineDuration,
  ));

  // The line's draw occupies timeline time 0..1; the trailing span lets the
  // last tile finish after the line does.
  tiles.forEach((tile, index) => {
    const tween = grid._impactCollabReveal.tileTweens?.[index];
    tween?.startTime(normalized[index]);
  });
  grid._impactCollabReveal.lineRevealPositions = normalized;
  if (trigger?.progress != null) timeline.progress(trigger.progress);
}

function finalRect(tile) {
  const authoredTransform = tile.style.transform;
  tile.style.transform = "none";
  const rect = tile.getBoundingClientRect();
  tile.style.transform = authoredTransform;
  return rect;
}

function pathEntryProgress(measurement, rect) {
  const points = measurement.points;
  if (!measurement.screenLength || points.length < 2) return null;
  if (pointInside(points[0], rect)) return 0;

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const entry = segmentRectEntry(previous, current, rect);
    if (entry === null) continue;
    const screenLength = previous.screenLength +
      (current.screenLength - previous.screenLength) * entry;
    return gsap.utils.clamp(0, 1, screenLength / measurement.screenLength);
  }
  return null;
}

function closestProgress(measurement, rect) {
  if (!measurement.screenLength || !measurement.points.length) return null;
  let closest = measurement.points[0];
  let distance = distanceToRect(closest, rect);
  measurement.points.slice(1).forEach((point) => {
    const nextDistance = distanceToRect(point, rect);
    if (nextDistance < distance) {
      closest = point;
      distance = nextDistance;
    }
  });
  return gsap.utils.clamp(0, 1, closest.screenLength / measurement.screenLength);
}

function segmentRectEntry(a, b, rect) {
  let enter = 0;
  let exit = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  for (const [origin, delta, min, max] of [
    [a.x, dx, rect.left, rect.right],
    [a.y, dy, rect.top, rect.bottom],
  ]) {
    if (Math.abs(delta) < 0.0001) {
      if (origin < min || origin > max) return null;
      continue;
    }
    const first = (min - origin) / delta;
    const second = (max - origin) / delta;
    enter = Math.max(enter, Math.min(first, second));
    exit = Math.min(exit, Math.max(first, second));
    if (enter > exit) return null;
  }
  return enter >= 0 && enter <= 1 ? enter : null;
}

function pointInside(point, rect) {
  return point.x >= rect.left && point.x <= rect.right &&
    point.y >= rect.top && point.y <= rect.bottom;
}

function distanceToRect(point, rect) {
  const dx = Math.max(rect.left - point.x, 0, point.x - rect.right);
  const dy = Math.max(rect.top - point.y, 0, point.y - rect.bottom);
  return Math.hypot(dx, dy);
}

function readLineRevealSpan(grid) {
  const configured = Number(grid.getAttribute("data-impact-reveal-span"));
  return Number.isFinite(configured) && configured > 0
    ? Math.min(1, configured)
    : LINE_REVEAL_SPAN;
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
