import { gsap, ScrollTrigger } from "../lib/gsap.js";

const DEFAULTS = {
  radius: 180,
  maxScale: 1.3,
  duration: 0.35,
  revealDuration: 0.6,
  revealStagger: 0.035,
  revealDistance: "1.75rem",
  revealScale: 0.62,
  idleMin: 1.5,
  idleMax: 2.5,
  idleScale: 0.85,
  idleRotation: 3,
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
    const previous = section._partnersProximity;
    if (previous?.revealTimeline && !section._partnersRevealPlayed) {
      previous.revealTimeline.progress(1);
    }
    previous?.destroy();

    const pills = [...section.querySelectorAll("[data-partners-pill]")];
    if (!pills.length) return;

    const cloud = section.querySelector("[data-partners-cloud]");
    if (!cloud) return;

    const styles = getComputedStyle(section);
    const radius = readNumber(styles, "--partners-radius", DEFAULTS.radius, (value) => Number.isFinite(value) && value > 0);
    const maxScale = readNumber(styles, "--partners-scale", DEFAULTS.maxScale);
    const duration = readNumber(styles, "--partners-duration", DEFAULTS.duration, (value) => Number.isFinite(value) && value >= 0);
    const idleMin = readNumber(styles, "--partners-idle-min", DEFAULTS.idleMin, (value) => Number.isFinite(value) && value >= 0);
    const idleMax = readNumber(styles, "--partners-idle-max", DEFAULTS.idleMax, (value) => Number.isFinite(value) && value >= idleMin);

    const revealPlayed = section._partnersRevealPlayed === true;
    let revealComplete = reducedMotion.matches || revealPlayed;
    let revealTimeline = null;
    let revealTrigger = null;
    let idleVisibilityTrigger = null;
    let idleDelay = null;
    let idleTween = null;
    let idlePill = null;
    let idleLastIndex = -1;
    let idleInViewport = false;
    let idlePointerInside = false;
    let idleStartRotation = 0;

    const idleState = {
      activePill: null,
      paused: true,
      running: false,
      mode: null,
      forceMode: null,
    };

    const resetIdlePill = (pill) => {
      if (!pill) return;
      gsap.set(pill, {
        rotation: idleStartRotation,
        scaleX: 1,
        scaleY: 1,
      });
      delete pill.dataset.partnersIdle;
    };

    const stopIdle = () => {
      idleDelay?.kill();
      idleDelay = null;
      idleTween?.kill();
      idleTween = null;
      resetIdlePill(idlePill);
      idlePill = null;
      idleState.activePill = null;
      idleState.running = false;
      idleState.paused = true;
      idleState.mode = null;
    };

    const scheduleIdle = () => {
      if (reducedMotion.matches || !revealComplete || !idleInViewport || idlePointerInside || idleDelay || idleTween) return;
      const gap = gsap.utils.random(idleMin, idleMax);
      idleDelay = gsap.delayedCall(gap, () => {
        idleDelay = null;
        playIdle();
      });
      idleState.paused = false;
    };

    function playIdle() {
      if (reducedMotion.matches || !revealComplete || !idleInViewport || idlePointerInside || idleTween) {
        idleState.paused = true;
        return;
      }

      let index = gsap.utils.random(0, pills.length - 1, 1);
      if (pills.length > 1 && index === idleLastIndex) index = (index + 1) % pills.length;
      idleLastIndex = index;
      idlePill = pills[index];
      const pill = idlePill;
      const baseRotation = Number(gsap.getProperty(pill, "rotation")) || 0;
      idleStartRotation = baseRotation;
      const mode = idleState.forceMode || (Math.random() < 0.5 ? "wiggle" : "zoom-out");
      idleState.forceMode = null;

      pill.dataset.partnersIdle = mode;
      idleState.activePill = pill;
      idleState.running = true;
      idleState.paused = false;
      idleState.mode = mode;

      const finish = () => {
        resetIdlePill(pill);
        idleTween = null;
        idlePill = null;
        idleState.activePill = null;
        idleState.running = false;
        idleState.mode = null;
        scheduleIdle();
      };

      if (mode === "wiggle") {
        idleTween = gsap.timeline({ onComplete: finish })
          .to(pill, { rotation: baseRotation + DEFAULTS.idleRotation, duration: 0.16, ease: "power2.out" })
          .to(pill, { rotation: baseRotation - DEFAULTS.idleRotation, duration: 0.2, ease: "power2.inOut" })
          .to(pill, { rotation: baseRotation, duration: 0.16, ease: "power2.out" });
      } else {
        idleTween = gsap.timeline({ onComplete: finish })
          .to(pill, { scaleX: DEFAULTS.idleScale, scaleY: DEFAULTS.idleScale, duration: 0.2, ease: "power2.out" })
          .to(pill, { scaleX: 1, scaleY: 1, duration: 0.42, ease: "back.out(2.2)" });
      }
    }

    const createIdleVisibilityTrigger = () => {
      if (reducedMotion.matches) return;
      idleVisibilityTrigger = ScrollTrigger.create({
        trigger: section,
        start: "top bottom",
        end: "bottom top",
        onEnter: () => {
          idleInViewport = true;
          scheduleIdle();
        },
        onEnterBack: () => {
          idleInViewport = true;
          scheduleIdle();
        },
        onLeave: () => {
          idleInViewport = false;
          stopIdle();
        },
        onLeaveBack: () => {
          idleInViewport = false;
          stopIdle();
        },
      });
    };

    if (!reducedMotion.matches && !revealPlayed) {
      revealTimeline = gsap.timeline({
        paused: true,
        onComplete: () => {
          revealComplete = true;
          section._partnersRevealPlayed = true;
          scheduleIdle();
        },
      });
      revealTimeline.from(pills, {
        autoAlpha: 0,
        y: DEFAULTS.revealDistance,
        scaleX: DEFAULTS.revealScale,
        scaleY: DEFAULTS.revealScale,
        duration: DEFAULTS.revealDuration,
        ease: "back.out(1.6)",
        stagger: DEFAULTS.revealStagger,
        overwrite: false,
      });
      revealTrigger = ScrollTrigger.create({
        trigger: cloud,
        start: "clamp(top 80%)",
        once: true,
        animation: revealTimeline,
      });
    }

    createIdleVisibilityTrigger();

    if (reducedMotion.matches || hoverNone.matches) {
      const instance = {
        pills,
        revealTimeline,
        revealTrigger,
        idle: idleState,
        destroy: null,
        destroyed: false,
      };
      const destroy = () => {
        if (instance.destroyed) return;
        instance.destroyed = true;
        if (revealTrigger) revealTrigger.kill();
        if (idleVisibilityTrigger) idleVisibilityTrigger.kill();
        stopIdle();
        if (revealTimeline) revealTimeline.kill();
        gsap.killTweensOf(pills);
        gsap.set(pills, { clearProps: "transform,translate,rotate,scale,opacity,visibility" });
        pills.forEach((pill) => delete pill.dataset.partnersLift);
        if (section._partnersProximity?.destroy === destroy) section._partnersProximity = null;
      };

      instance.destroy = destroy;
      section._partnersProximity = instance;
      return;
    }

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
      if (destroyed || !revealComplete) return;
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

    const onPointerEnter = () => {
      if (destroyed) return;
      idlePointerInside = true;
      stopIdle();
    };

    const onMouseLeave = () => {
      idlePointerInside = false;
      if (destroyed || !revealComplete) return;

      // quickTo owns a paused tween internally. Kill those tweens before the
      // longer leave tween, then rebuild quickTos on the next pointermove so
      // re-entry never tries to drive a killed tween.
      gsap.killTweensOf(pills, "scaleX,scaleY");
      quickScalesNeedRefresh = true;
      pills.forEach((pill) => delete pill.dataset.partnersLift);
      gsap.to(pills, {
        scaleX: 1,
        scaleY: 1,
        duration: duration * 2,
        ease: "power2.out",
        overwrite: "auto",
        onComplete: scheduleIdle,
      });
    };

    const destroy = () => {
      if (destroyed) return;
      destroyed = true;
      if (instance) instance.destroyed = true;
      section.removeEventListener("pointermove", onPointerMove);
      section.removeEventListener("pointerenter", onPointerEnter);
      section.removeEventListener("mouseleave", onMouseLeave);
      window.removeEventListener("resize", invalidateRects);
      window.removeEventListener("scroll", invalidateRects, true);
      gsap.killTweensOf(pills);
      revealTrigger?.kill();
      idleVisibilityTrigger?.kill();
      stopIdle();
      revealTimeline?.kill();
      gsap.set(pills, { clearProps: "transform,translate,rotate,scale,opacity,visibility" });
      pills.forEach((pill) => delete pill.dataset.partnersLift);
      if (section._partnersProximity?.destroy === destroy) section._partnersProximity = null;
    };

    section.addEventListener("pointermove", onPointerMove);
    section.addEventListener("pointerenter", onPointerEnter);
    section.addEventListener("mouseleave", onMouseLeave);
    window.addEventListener("resize", invalidateRects);
    window.addEventListener("scroll", invalidateRects, true);

    instance = section._partnersProximity = {
      radius,
      maxScale,
      duration,
      pills,
      revealTimeline,
      revealTrigger,
      idle: idleState,
      destroy,
      destroyed: false,
    };
  });
}
