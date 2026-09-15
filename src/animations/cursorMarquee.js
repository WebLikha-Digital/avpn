import { gsap } from "../lib/gsap.js";

const FOLLOW_DURATION = 0.4;
const FOLLOW_EASE = "power3";
const LEAVE_PAUSE_DELAY = 400;

function initCursorMarquee() {
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const coarse = window.matchMedia?.("(hover: none), (pointer: coarse)")?.matches;

  document.querySelectorAll("[data-cursor-marquee-init]").forEach((root) => {
    root._cursorMarqueeInstance?.kill();
    const cursor = root.querySelector("[data-cursor-marquee-status]");
    if (!cursor) return;

    cursor.setAttribute("data-cursor-marquee-status", "idle");
    if (coarse) return;

    const targets = [...cursor.querySelectorAll("[data-cursor-marquee-text-target]")];
    const xTo = gsap.quickTo(cursor, "x", { duration: FOLLOW_DURATION, ease: FOLLOW_EASE });
    const yTo = gsap.quickTo(cursor, "y", { duration: FOLLOW_DURATION, ease: FOLLOW_EASE });
    let lastX = 0;
    let lastY = 0;
    let pauseTimer;
    let activeText = null;
    const listeners = [];

    const listen = (target, type, handler, options) => {
      target.addEventListener(type, handler, options);
      listeners.push(() => target.removeEventListener(type, handler, options));
    };
    const setStatus = (status) => cursor.setAttribute("data-cursor-marquee-status", status);
    const pauseMarquee = () => {
      targets.forEach((target) => { target.style.animationPlayState = "paused"; });
    };
    const updateHit = () => {
      const hit = document.elementFromPoint(lastX, lastY);
      const section = hit?.closest?.("[data-cursor-marquee-init]");
      const textElement = section === root
        ? hit.closest("[data-cursor-marquee-text]")
        : null;

      clearTimeout(pauseTimer);
      if (!section || section !== root) {
        activeText = null;
        setStatus("idle");
        pauseMarquee();
        return;
      }
      if (!textElement) {
        activeText = null;
        setStatus("not-active");
        pauseTimer = setTimeout(pauseMarquee, LEAVE_PAUSE_DELAY);
        return;
      }

      const text = textElement.getAttribute("data-cursor-marquee-text") || "";
      if (activeText !== textElement) {
        targets.forEach((target) => { target.textContent = text; });
        activeText = textElement;
      }
      setStatus("active");
      targets.forEach((target) => {
        target.style.animationDuration = text.length / 5 + "s";
        target.style.animationPlayState = reduced ? "paused" : "running";
      });
    };
    const onPointerMove = (event) => {
      lastX = event.clientX;
      lastY = event.clientY;
      xTo(lastX);
      yTo(lastY);
      updateHit();
    };
    const onScroll = () => updateHit();

    listen(document, "pointermove", onPointerMove);
    listen(document, "scroll", onScroll, true);
    root._cursorMarqueeInstance = {
      kill() {
        clearTimeout(pauseTimer);
        listeners.forEach((remove) => remove());
        xTo.tween?.kill();
        yTo.tween?.kill();
        gsap.killTweensOf(cursor);
        pauseMarquee();
        setStatus("idle");
        if (root._cursorMarqueeInstance === this) delete root._cursorMarqueeInstance;
      },
    };
  });
}

export { initCursorMarquee };
