import { gsap } from "../lib/gsap.js";
import { measureScreenPath } from "./screenPath.js";

/**
 * Resolve data-line-reveal without making reveal modules know how a draw line
 * is implemented. The draw module refreshes this state once per ScrollTrigger
 * refresh, after the line trigger has measured itself.
 */
export function lineRevealContext(element) {
  const selector = element.getAttribute("data-line-reveal");
  if (!selector) return null;

  let line;
  try {
    line = element.closest(selector) || document.querySelector(selector);
  } catch {
    return null;
  }

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
 * Refresh the crossing geometry once, not on every animation frame. Path
 * points and target bounds are compared in the line wrapper's local space so
 * horizontal scrolling cannot change the answer.
 */
export function refreshLineRevealState(wrap, paths, timeline, trigger, stagger) {
  const duration = timeline.duration() || 1;
  const wrapperRect = wrap.getBoundingClientRect();
  const pathsForLine = [...paths].map((path) => ({
    path,
    measurement: localizeMeasurement(
      measureScreenPath(path, true),
      wrapperRect.left,
    ),
  }));

  wrap._drawLineState = {
    trigger,
    paths: pathsForLine,
    stagger,
    duration,
    revealScrollPosition(element) {
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
