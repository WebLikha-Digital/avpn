const SAMPLE_COUNT = 512;

export function usesScreenPathLength(path) {
  const matrix = path.getScreenCTM?.();
  if (!matrix) return false;

  const vectorEffect = getComputedStyle(path).vectorEffect
    || path.getAttribute("vector-effect");
  if (vectorEffect !== "non-scaling-stroke") return false;

  const scaleX = Math.hypot(matrix.a, matrix.b);
  const scaleY = Math.hypot(matrix.c, matrix.d);
  return Math.abs(scaleX - scaleY) > 0.0001;
}

export function measureScreenPath(path) {
  const localLength = path.getTotalLength?.() || 0;
  const matrix = path.getScreenCTM?.();
  if (!localLength || !matrix) {
    return { localLength, screenLength: 0, points: [] };
  }

  const count = Math.max(SAMPLE_COUNT, Math.ceil(localLength / 8));
  const points = [];
  let previous = transformPoint(matrix, path.getPointAtLength(0));
  let screenLength = 0;
  points.push({ localLength: 0, x: previous.x, y: previous.y, screenLength });

  for (let index = 1; index <= count; index += 1) {
    const local = localLength * index / count;
    const point = transformPoint(matrix, path.getPointAtLength(local));
    screenLength += Math.hypot(point.x - previous.x, point.y - previous.y);
    points.push({ localLength: local, x: point.x, y: point.y, screenLength });
    previous = point;
  }

  return { localLength, screenLength, points };
}

export function setScreenPathProgress(path, progress, measurement = measureScreenPath(path)) {
  const clampedProgress = clamp(progress, 0, 1);
  if (path._screenPathVisibilityState === undefined) {
    path._screenPathVisibilityState = path.style.visibility;
  }
  const visibility = clampedProgress <= 0 ? "hidden" : "visible";
  if (path.style.visibility !== visibility) path.style.visibility = visibility;
  path.style.strokeDasharray = clampedProgress <= 0
    ? "0px, 999999px"
    : `${clampedProgress * measurement.screenLength}px, 999999px`;
  path.style.strokeDashoffset = "0px";
}

export function restoreScreenPathVisibility(path) {
  if (path._screenPathVisibilityState === undefined) return;
  path.style.visibility = path._screenPathVisibilityState;
  delete path._screenPathVisibilityState;
}

export function pathScreenScale(path) {
  const matrix = path.getScreenCTM?.();
  return matrix ? Math.abs(matrix.a) || 1 : 1;
}

function transformPoint(matrix, point) {
  return {
    x: matrix.a * point.x + matrix.c * point.y + matrix.e,
    y: matrix.b * point.x + matrix.d * point.y + matrix.f,
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
