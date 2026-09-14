import { getLocomotiveScroll } from "./locomotive.js";

const SCROLL_KEYS = new Set([
  "Space", "PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown",
]);

export function lockScroll({ className } = {}) {
  const scroll = getLocomotiveScroll();
  const lenis = scroll?.lenisInstance;
  lenis?.stop?.();
  if (className) document.documentElement.classList.add(className);

  const lockedScrollX = window.scrollX;
  const lockedScrollY = window.scrollY;
  const isEditableTarget = (target) => {
    if (!(target instanceof Element)) return false;
    return target.isContentEditable || Boolean(target.closest("input, textarea, select"));
  };
  const onWheel = (event) => event.preventDefault();
  const onTouchMove = (event) => event.preventDefault();
  const onKeyDown = (event) => {
    if (!isEditableTarget(event.target) && SCROLL_KEYS.has(event.code)) event.preventDefault();
  };
  let snapFrame;
  const snapScroll = () => {
    window.scrollTo(lockedScrollX, lockedScrollY);
    lenis?.scrollTo?.(lockedScrollY, { immediate: true, force: true, lock: true });
  };
  const onScroll = () => {
    if (window.scrollX !== lockedScrollX || window.scrollY !== lockedScrollY) {
      snapScroll();
      if (!snapFrame) {
        snapFrame = requestAnimationFrame(() => {
          snapFrame = undefined;
          if (!className || document.documentElement.classList.contains(className)) snapScroll();
        });
      }
    }
  };
  const listenerOptions = { capture: true, passive: false };
  window.addEventListener("wheel", onWheel, listenerOptions);
  window.addEventListener("touchmove", onTouchMove, listenerOptions);
  window.addEventListener("keydown", onKeyDown, listenerOptions);
  window.addEventListener("scroll", onScroll, listenerOptions);

  let unlocked = false;
  return () => {
    if (unlocked) return;
    unlocked = true;
    if (snapFrame) cancelAnimationFrame(snapFrame);
    snapFrame = undefined;
    window.removeEventListener("wheel", onWheel, listenerOptions);
    window.removeEventListener("touchmove", onTouchMove, listenerOptions);
    window.removeEventListener("keydown", onKeyDown, listenerOptions);
    window.removeEventListener("scroll", onScroll, listenerOptions);
    if (className) document.documentElement.classList.remove(className);
    lenis?.start?.();
  };
}
