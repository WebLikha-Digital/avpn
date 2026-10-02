import { gsap } from "../lib/gsap.js";
import { measureScreenPath } from "./screenPath.js";

// Webflow's desktop breakpoint. Line-led behavior is intentionally absent at
// tablet and phone widths, where the existing horizontal-band behavior owns.
export const DESKTOP_LINE_REVEAL_MIN_WIDTH = 992;

export function hasLineRevealDependants(line) {
  if (window.innerWidth < DESKTOP_LINE_REVEAL_MIN_WIDTH) return false;
  return [...document.querySelectorAll("[data-line-reveal]")].some(
    (element) => resolveLine(element) === line,
  );
}

/**
 * Resolve data-line-reveal without making reveal modules know how a draw line
 * is implemented. The draw module refreshes this state once per ScrollTrigger
 * refresh, after the line trigger has measured itself.
 */
export function lineRevealContext(element) {
  if (window.innerWidth < DESKTOP_LINE_REVEAL_MIN_WIDTH) return null;
  const line = resolveLine(element);

  const state = line?._drawLineState;
  if (!state?.trigger || !line.closest("[data-hscroll-init][data-hscroll-active]")) {
    return null;
  }

  return {
    line,
    get trigger() {
      return line._drawLineState?.trigger || state.trigger;
    },
    start: () => {
      const current = line._drawLineState;
      return current?.revealScrollPosition?.(element)
        ?? state.revealScrollPosition(element);
    },
  };
}

/**
 * Invalidate the crossing geometry on refresh, then measure it lazily on the
 * first dependant lookup. Every dependant in that refresh shares the same
 * wrapper-local path measurement; nothing is sampled per animation frame.
 */
export function refreshLineRevealState(wrap, paths, timeline, trigger, stagger) {
  const duration = timeline.duration() || 1;
  let pathsForLine;

  wrap._drawLineState = {
    trigger,
    paths,
    stagger,
    duration,
    revealScrollPosition(element) {
      if (!pathsForLine) {
        const wrapperLeft = wrap.getBoundingClientRect().left;
        pathsForLine = [...paths].map((path) => ({
          path,
          measurement: localizeMeasurement(
            measureScreenPath(path, true),
            wrapperLeft,
          ),
        }));
      }
      const targetRect = element.getBoundingClientRect();
      const targetLeft = targetRect.left - wrap.getBoundingClientRect().left;
      let pathProgress = 1;
      let pathIndex = pathsForLine.length - 1;

      for (let index = 0; index < pathsForLine.length; index += 1) {
        const progress = crossingProgress(
          pathsForLine[index].measurement,
          targetLeft,
        );
        if (progress !== null) {
          pathProgress = progress;
          pathIndex = index;
          break;
        }
      }

      const pathDuration = duration / Math.max(
        1,
        1 + (pathsForLine.length - 1) * stagger,
      );
      const timelineProgress = gsap.utils.clamp(
        0,
        1,
        (pathIndex * stagger + pathProgress * pathDuration) / duration,
      );
      const start = trigger.start;
      const end = trigger.end;
      return start + (end - start) * timelineProgress;
    },
  };
}

function resolveLine(element) {
  const selector = element.getAttribute("data-line-reveal");
  if (!selector) return null;

  try {
    return element.closest(selector) || document.querySelector(selector);
  } catch {
    return null;
  }
}

function localizeMeasurement(measurement, wrapperLeft) {
  return {
    ...measurement,
    points: measurement.points.map((point) => ({
      ...point,
      x: point.x - wrapperLeft,
    })),
  };
}

function crossingProgress(measurement, targetLeft) {
  if (!measurement.screenLength || !measurement.points.length) return null;

  const points = measurement.points;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const previousX = previous.x;
    const currentX = current.x;
    if (previousX >= targetLeft) {
      return previous.screenLength / measurement.screenLength;
    }
    if (currentX >= targetLeft && currentX !== previousX) {
      const ratio = (targetLeft - previousX) / (currentX - previousX);
      const screenLength = previous.screenLength +
        (current.screenLength - previous.screenLength) * ratio;
      return gsap.utils.clamp(0, 1, screenLength / measurement.screenLength);
    }
  }

  return points.at(-1).x >= targetLeft ? 1 : null;
}
