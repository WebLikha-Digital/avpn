import { gsap, ScrollTrigger } from "../lib/gsap.js";

const DEFAULTS = {
  revealDuration: 0.6,
  revealStagger: 0.035,
  revealDistance: "1.75rem",
  revealScale: 0.62,
  idleMin: 4,
  idleMax: 4,
  idleStagger: 0.12,
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
    let idlePreviousPills = [];
    let idleInViewport = false;
    const idleBaseRotations = new Map();

    const idleState = {
      activePill: null,
      activePills: [],
      paused: true,
      running: false,
      mode: null,
      forceMode: null,
    };

    const resetIdlePill = (pill, baseRotation = idleBaseRotations.get(pill)) => {
      if (!pill) return;
      gsap.set(pill, {
        rotation: Number(baseRotation) || 0,
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
      idleState.activePills.forEach((pill) => resetIdlePill(pill));
      pills.forEach((pill) => {
        if (pill.dataset.partnersIdle) resetIdlePill(pill);
      });
      idleBaseRotations.clear();
      idlePreviousPills = [];
      idleState.activePill = null;
      idleState.activePills = [];
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

      const count = Math.min(pills.length, gsap.utils.random(2, 3, 1));
      const candidates = pills.filter((pill) => !idlePreviousPills.includes(pill));
      const pool = candidates.length >= count ? candidates : pills;
      const activePills = gsap.utils.shuffle([...pool]).slice(0, count);
      const forcedMode = idleState.forceMode;
      idleState.forceMode = null;

      activePills.forEach((pill) => {
        idleBaseRotations.set(pill, Number(gsap.getProperty(pill, "rotation")) || 0);
      });
      const modes = activePills.map(() => forcedMode || (Math.random() < 0.5 ? "wiggle" : "zoom-out"));
      const round = gsap.timeline({ onComplete: finishRound });
      idleState.activePill = activePills[0];
      idleState.activePills = activePills;
      idleState.running = true;
      idleState.paused = false;
      idleState.mode = modes[0];

      const finishPill = (pill) => {
        resetIdlePill(pill);
      };

      activePills.forEach((pill, index) => {
        const baseRotation = idleBaseRotations.get(pill);
        const mode = modes[index];
        pill.dataset.partnersIdle = mode;
        const pillTimeline = gsap.timeline({ onComplete: () => finishPill(pill) });

        if (mode === "wiggle") {
          pillTimeline
            .to(pill, { rotation: baseRotation + DEFAULTS.idleRotation, duration: 0.16, ease: "power2.out" })
            .to(pill, { rotation: baseRotation - DEFAULTS.idleRotation, duration: 0.2, ease: "power2.inOut" })
            .to(pill, { rotation: baseRotation, duration: 0.16, ease: "power2.out" });
        } else {
          pillTimeline
            .to(pill, { scaleX: DEFAULTS.idleScale, scaleY: DEFAULTS.idleScale, duration: 0.2, ease: "power2.out" })
            .to(pill, { scaleX: 1, scaleY: 1, duration: 0.42, ease: "back.out(2.2)" });
        }

        round.add(pillTimeline, index * DEFAULTS.idleStagger);
      });

      function finishRound() {
        activePills.forEach((pill) => finishPill(pill));
        idleBaseRotations.clear();
        idlePreviousPills = activePills;
        idleTween = null;
        idleState.activePill = null;
        idleState.activePills = [];
        idleState.running = false;
        idleState.mode = null;
        scheduleIdle();
      }

      idleTween = round;
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
