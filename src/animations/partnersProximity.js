import { gsap, ScrollTrigger } from "../lib/gsap.js";

const DEFAULTS = {
  revealDuration: 0.6,
  revealStagger: 0.035,
  revealDistance: "1.75rem",
  revealScale: 0.62,
  idleMin: 4,
  idleMax: 4,
  idleScale: 0.85,
  idleRotation: 3,
};

function readNumber(styles, property, fallback, isValid = Number.isFinite) {
  const value = parseFloat(styles.getPropertyValue(property));
  return isValid(value) ? value : fallback;
}

export function initPartnersProximity() {
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
      if (reducedMotion.matches || !revealComplete || !idleInViewport || idleDelay || idleTween) return;
      const gap = gsap.utils.random(idleMin, idleMax);
      idleDelay = gsap.delayedCall(gap, () => {
        idleDelay = null;
        playIdle();
      });
      idleState.paused = false;
    };

    function playIdle() {
      if (reducedMotion.matches || !revealComplete || !idleInViewport || idleTween) {
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

    if (reducedMotion.matches) {
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
        if (section._partnersProximity?.destroy === destroy) section._partnersProximity = null;
      };

      instance.destroy = destroy;
      section._partnersProximity = instance;
      return;
    }

    let destroyed = false;
    let instance;

    const destroy = () => {
      if (destroyed) return;
      destroyed = true;
      if (instance) instance.destroyed = true;
      gsap.killTweensOf(pills);
      revealTrigger?.kill();
      idleVisibilityTrigger?.kill();
      stopIdle();
      revealTimeline?.kill();
      gsap.set(pills, { clearProps: "transform,translate,rotate,scale,opacity,visibility" });
      if (section._partnersProximity?.destroy === destroy) section._partnersProximity = null;
    };

    instance = section._partnersProximity = {
      pills,
      revealTimeline,
      revealTrigger,
      idle: idleState,
      destroy,
      destroyed: false,
    };
  });
}
