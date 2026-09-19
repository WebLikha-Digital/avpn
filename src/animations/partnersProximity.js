import { gsap } from "../lib/gsap.js";

const DEFAULTS = {
  radius: 180,
  maxScale: 1.3,
  duration: 0.35,
};

function readNumber(styles, property, fallback, isValid = Number.isFinite) {
  const value = parseFloat(styles.getPropertyValue(property));
  return isValid(value) ? value : fallback;
}

/**
 * Scale partner pills according to their distance from the pointer over the
 * whole section. Rectangles are cached between layout-affecting events so a
 * pointermove does not force 28 layout reads; resize and scroll invalidate the
 * cache, and the next pointermove refreshes it against the current viewport.
 */
export function initPartnersProximity() {
  const hoverNone = window.matchMedia("(hover: none)");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  document.querySelectorAll("[data-partners-init]").forEach((section) => {
    section._partnersProximity?.destroy();

    if (hoverNone.matches || reducedMotion.matches) return;

    const pills = [...section.querySelectorAll("[data-partners-pill]")];
    if (!pills.length) return;

    const styles = getComputedStyle(section);
    const radius = readNumber(styles, "--partners-radius", DEFAULTS.radius, (value) => Number.isFinite(value) && value > 0);
    const maxScale = readNumber(styles, "--partners-scale", DEFAULTS.maxScale);
    const duration = readNumber(styles, "--partners-duration", DEFAULTS.duration, (value) => Number.isFinite(value) && value >= 0);

    let rects = [];
    let rectsDirty = true;
    let destroyed = false;
    let instance;

    const refreshRects = () => {
      rects = pills.map((pill) => pill.getBoundingClientRect());
      rectsDirty = false;
    };

    const invalidateRects = () => {
      rectsDirty = true;
    };

    // GSAP quickTo/resetTo does not resolve the "scale" alias; drive both axes.
    const createQuickScales = () => pills.map((pill) => [
      gsap.quickTo(pill, "scaleX", {
        duration,
        ease: "power2.out",
        overwrite: "auto",
      }),
      gsap.quickTo(pill, "scaleY", {
        duration,
        ease: "power2.out",
        overwrite: "auto",
      }),
    ]);

    let quickScales = createQuickScales();
    let quickScalesNeedRefresh = false;

    const onPointerMove = ({ clientX, clientY }) => {
      if (destroyed) return;
      if (rectsDirty) refreshRects();
      if (quickScalesNeedRefresh) {
        quickScales = createQuickScales();
        quickScalesNeedRefresh = false;
      }

      quickScales.forEach(([scaleXTo, scaleYTo], index) => {
        const pill = pills[index];
        const rect = rects[index];
        const distance = Math.hypot(
          clientX - (rect.left + rect.width / 2),
          clientY - (rect.top + rect.height / 2),
        );
        const proximity = gsap.utils.clamp(
          0,
          1,
          gsap.utils.mapRange(0, radius, 1, 0, distance),
        );
        const targetScale = 1 + (maxScale - 1) * proximity;

        if (targetScale > 1.001) pill.dataset.partnersLift = "";
        else delete pill.dataset.partnersLift;

        scaleXTo(targetScale);
        scaleYTo(targetScale);
      });
    };

    const onMouseLeave = () => {
      if (destroyed) return;

      // quickTo owns a paused tween internally. Kill those tweens before the
      // longer leave tween, then rebuild quickTos on the next pointermove so
      // re-entry never tries to drive a killed tween.
      gsap.killTweensOf(pills);
      quickScalesNeedRefresh = true;
      pills.forEach((pill) => delete pill.dataset.partnersLift);
      gsap.to(pills, {
        scale: 1,
        duration: duration * 2,
        ease: "power2.out",
        overwrite: "auto",
      });
    };

    const destroy = () => {
      if (destroyed) return;
      destroyed = true;
      if (instance) instance.destroyed = true;
      section.removeEventListener("pointermove", onPointerMove);
      section.removeEventListener("mouseleave", onMouseLeave);
      window.removeEventListener("resize", invalidateRects);
      window.removeEventListener("scroll", invalidateRects, true);
      gsap.killTweensOf(pills);
      gsap.set(pills, { clearProps: "transform,translate,rotate,scale" });
      pills.forEach((pill) => delete pill.dataset.partnersLift);
      if (section._partnersProximity?.destroy === destroy) section._partnersProximity = null;
    };

    section.addEventListener("pointermove", onPointerMove);
    section.addEventListener("mouseleave", onMouseLeave);
    window.addEventListener("resize", invalidateRects);
    window.addEventListener("scroll", invalidateRects, true);

    instance = section._partnersProximity = {
      radius,
      maxScale,
      duration,
      pills,
      destroy,
      destroyed: false,
    };
  });
}
