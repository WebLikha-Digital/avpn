import { HSCROLL_REBUILT } from "../animations/horizontalScroller.js";
import { ScrollTrigger } from "./gsap.js";
import { getLocomotiveScroll } from "./locomotive.js";

const QUIET_DELAY = 500;
const ANCHOR_STYLE_ID = "avpn-disable-scroll-anchoring";

function disableScrollAnchoring() {
  if (document.getElementById(ANCHOR_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = ANCHOR_STYLE_ID;
  style.textContent = "html, body { overflow-anchor: none !important; }";
  document.head.appendChild(style);
}

function topLevelSection(element) {
  const section = element.closest("section, [data-hscroll-init]");
  if (section) return section;

  const main = element.closest("main");
  if (main) {
    let child = element;
    while (child.parentElement && child.parentElement !== main) {
      child = child.parentElement;
    }
    return child.parentElement === main ? child : null;
  }

  let child = element;
  while (child.parentElement && child.parentElement !== document.body) {
    child = child.parentElement;
  }
  return child.parentElement === document.body ? child : null;
}

function findAnchor() {
  const y = Math.min(1, Math.max(0, window.innerHeight - 1));
  const elements = document.elementsFromPoint(window.innerWidth / 2, y);

  for (const element of elements) {
    const section = topLevelSection(element);
    if (!section) continue;

    const styles = getComputedStyle(section);
    if (styles.position === "fixed") continue;

    const rect = section.getBoundingClientRect();
    if (rect.bottom <= 0 || rect.top >= window.innerHeight) continue;

    return { section, offset: rect.top };
  }

  return null;
}

function restoreAnchor(anchor) {
  if (!anchor?.section.isConnected) return;

  const currentTop = anchor.section.getBoundingClientRect().top;
  const target = window.scrollY + currentTop - anchor.offset;
  const root = document.documentElement;
  const bounded = Math.min(
    Math.max(0, target),
    Math.max(0, root.scrollHeight - window.innerHeight),
  );
  const scroll = getLocomotiveScroll()?.lenisInstance;

  window.scrollTo(0, bounded);
  scroll?.scrollTo?.(bounded, { immediate: true, force: true });
}

/**
 * Preserve the section at the top of the viewport while width-driven layout
 * changes rebuild ScrollTriggers and responsive components.
 */
export function initResizeScrollPreservation() {
  if (initResizeScrollPreservation._initialized) return;
  initResizeScrollPreservation._initialized = true;

  disableScrollAnchoring();

  let lastWidth = window.innerWidth;
  let lastAnchor = null;
  let captureFrame = 0;
  let fallbackFrame = 0;
  let quietTimer;
  let resizeState = null;

  const captureAnchor = () => {
    captureFrame = 0;
    if (resizeState) return;

    const next = findAnchor();
    if (next) lastAnchor = next;
  };

  const scheduleCapture = () => {
    if (captureFrame) return;
    captureFrame = requestAnimationFrame(captureAnchor);
  };

  const finishResize = () => {
    if (!resizeState) return;
    resizeState = null;
    scheduleCapture();
  };

  const noteLayoutActivity = () => {
    if (!resizeState || resizeState.interrupted) return;

    restoreAnchor(resizeState.anchor);
    clearTimeout(quietTimer);
    quietTimer = setTimeout(finishResize, QUIET_DELAY);
  };

  const onResize = () => {
    if (window.innerWidth === lastWidth) return;
    lastWidth = window.innerWidth;

    // Use the snapshot from the last scroll frame. Measuring here would read
    // the already-reflowed layout on a single large viewport jump.
    if (!lastAnchor) return;
    clearTimeout(quietTimer);
    resizeState = { anchor: lastAnchor, interrupted: false };

    // Refresh normally fires during this resize event. This frame is a
    // fallback for pages without a trigger refresh, and also avoids waiting
    // for the debounce timers used by individual components.
    cancelAnimationFrame(fallbackFrame);
    fallbackFrame = requestAnimationFrame(() => {
      fallbackFrame = 0;
      noteLayoutActivity();
    });
  };

  const onUserInput = () => {
    if (!resizeState) return;
    resizeState.interrupted = true;
    clearTimeout(quietTimer);
    resizeState = null;
    scheduleCapture();
  };

  const onDocumentResize = () => noteLayoutActivity();

  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(onDocumentResize).observe(document.documentElement);
  }
  window.addEventListener("resize", onResize, true);
  window.addEventListener("scroll", scheduleCapture, { passive: true });
  window.addEventListener("wheel", onUserInput, { passive: true });
  window.addEventListener("touchstart", onUserInput, { passive: true });
  ScrollTrigger.addEventListener("refresh", noteLayoutActivity);
  window.addEventListener(HSCROLL_REBUILT, noteLayoutActivity);

  scheduleCapture();
  initResizeScrollPreservation._resize = onResize;
}
