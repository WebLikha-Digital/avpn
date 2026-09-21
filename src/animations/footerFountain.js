import { gsap, ScrollTrigger } from "../lib/gsap.js";

gsap.registerPlugin(ScrollTrigger);

const DEFAULTS = Object.freeze({
  desktop: Object.freeze({
    restVH: 22,
    apex: [38, 60],
    driftStart: [2, 7],
    driftEnd: [8, 24],
    upDur: [0.9, 1.3],
    gravityRatio: [1.15, 1.5],
    spin: [220, 600],
    repeatDelay: [0.2, 0.9],
    staggerStart: 0.55,
  }),
  mobile: Object.freeze({
    restVH: 8,
    apex: [12, 18],
    driftStart: [1, 3],
    driftEnd: [5, 10],
    upDur: [0.7, 0.95],
    gravityRatio: [1.08, 1.18],
    spin: [80, 180],
    repeatDelay: [0.12, 0.38],
    staggerStart: 0.4,
  }),
});

const REDUCED_POSES = [
  { y: -14, x: -2, rotation: -10 },
  { y: -10, x: 1, rotation: 8 },
  { y: -16, x: -1, rotation: -4 },
  { y: -12, x: 2, rotation: 12 },
  { y: -9, x: 0, rotation: 6 },
];

function randomBetween([min, max]) {
  return min + Math.random() * (max - min);
}

function killAnimationState(state) {
  state.live.forEach((timeline) => timeline.kill());
  state.pending.forEach((call) => call.kill());
  state.staticTweens.forEach((tween) => tween.kill());
  state.live.clear();
  state.pending.clear();
  state.staticTweens.length = 0;
  state.trigger?.kill();
  state.trigger = null;
}

function clearItems(items) {
  gsap.set(items, { clearProps: "transform,opacity" });
}

export function initFooterFountain() {
  document.querySelectorAll("[data-footer-fountain]").forEach((root) => {
    root._footerFountain?.destroy();

    const items = [...root.querySelectorAll("[data-footer-fountain-item]")];
    if (items.length === 0) return;

    const state = {
      root,
      items,
      live: new Set(),
      pending: new Set(),
      staticTweens: [],
      trigger: null,
      launches: 0,
      active: false,
      destroyed: false,
      visibilityHandler: null,
      matchMedia: gsap.matchMedia(),
      destroy() {
        if (state.destroyed) return;
        state.destroyed = true;
        state.matchMedia.revert();
        killAnimationState(state);
        if (state.visibilityHandler) {
          document.removeEventListener("visibilitychange", state.visibilityHandler);
        }
        clearItems(items);
        root._footerFountain = null;
      },
    };

    root._footerFountain = state;

    state.matchMedia.add(
      {
        reduce: "(prefers-reduced-motion: reduce)",
        desktop: "(min-width: 768px)",
        mobile: "(max-width: 767px)",
      },
      (context) => {
        const { reduce, desktop } = context.conditions;
        const preset = desktop ? DEFAULTS.desktop : DEFAULTS.mobile;

        killAnimationState(state);
        state.active = false;
        items.forEach((item) => {
          gsap.set(item, {
            xPercent: -50,
            x: 0,
            y: `${preset.restVH}vh`,
            rotation: 0,
            opacity: 0,
            scale: 0.9,
            transformOrigin: "50% 50%",
            force3D: true,
          });
        });

        if (reduce) {
          items.forEach((item, index) => {
            const pose = REDUCED_POSES[index % REDUCED_POSES.length];
            const mobilePose = desktop
              ? pose
              : { ...pose, y: pose.y / 2 };
            state.staticTweens.push(
              gsap.fromTo(
                item,
                { opacity: 0, scale: 0.85 },
                {
                  ...mobilePose,
                  y: `${mobilePose.y}vh`,
                  x: `${mobilePose.x}vw`,
                  opacity: 1,
                  scale: 1,
                  duration: 0.7,
                  delay: 0.12 * index,
                  ease: "power2.out",
                },
              ),
            );
          });
          return () => {
            killAnimationState(state);
            clearItems(items);
          };
        }

        const pauseAll = () => {
          state.live.forEach((timeline) => timeline.pause());
          state.pending.forEach((call) => call.pause());
        };
        let startLaunches = () => {};
        const resumeAll = () => {
          if (!state.active || document.hidden) return;
          state.live.forEach((timeline) => timeline.resume());
          state.pending.forEach((call) => call.resume());
        };
        const setActive = (active) => {
          state.active = active && !document.hidden;
          if (state.active) {
            startLaunches();
            resumeAll();
          }
          else pauseAll();
        };

        const launch = (item) => {
          if (state.destroyed || !state.active || document.hidden) return;

          const direction = Math.random() < 0.5 ? -1 : 1;
          const startX = -randomBetween(preset.driftStart) * direction;
          const endX = randomBetween(preset.driftEnd) * direction;
          const apex = randomBetween(preset.apex);
          const up = randomBetween(preset.upDur);
          const down = up * randomBetween(preset.gravityRatio);
          const total = up + down;
          const spin = randomBetween(preset.spin) * (Math.random() < 0.5 ? -1 : 1);
          const delay = randomBetween(preset.repeatDelay);

          gsap.set(item, {
            x: `${startX}vw`,
            y: `${preset.restVH}vh`,
            rotation: 0,
            opacity: 0,
            scale: 0.9,
          });

          const timeline = gsap.timeline({
            defaults: { overwrite: "auto" },
            onComplete: () => {
              state.live.delete(timeline);
              const call = gsap.delayedCall(delay, () => {
                state.pending.delete(call);
                launch(item);
              });
              state.pending.add(call);
              if (!state.active || document.hidden) call.pause();
            },
          });

          state.launches += 1;
          state.live.add(timeline);
          timeline
            .to(item, { opacity: 1, scale: 1, duration: 0.18, ease: "power1.out" }, 0)
            .to(item, { y: `${-apex}vh`, duration: up, ease: "power2.out" }, 0)
            .to(item, { y: `${preset.restVH}vh`, duration: down, ease: "power2.in" }, up)
            .to(item, { x: `${endX}vw`, duration: total, ease: "sine.inOut" }, 0)
            .to(item, { rotation: spin, duration: total, ease: "none" }, 0)
            .to(item, { opacity: 0, duration: 0.25, ease: "power1.in" }, total - 0.25);
        };

        let launchesStarted = false;
        startLaunches = () => {
          if (launchesStarted || !state.active) return;
          launchesStarted = true;
          items.forEach((item, index) => {
            const call = gsap.delayedCall(
              index * preset.staggerStart + Math.random() * 0.4,
              () => {
                state.pending.delete(call);
                launch(item);
              },
            );
            state.pending.add(call);
          });
        };

        state.trigger = ScrollTrigger.create({
          trigger:
            root.parentElement?.querySelector("[data-footer-reveal]") ||
            document.querySelector("[data-footer-reveal]") ||
            root,
          start: "top bottom",
          end: "bottom top",
          onToggle: (self) => setActive(self.isActive),
        });
        state.visibilityHandler = () => setActive(state.trigger?.isActive ?? false);
        document.addEventListener("visibilitychange", state.visibilityHandler);

        if (state.trigger.isActive) setActive(true);

        return () => {
          killAnimationState(state);
          if (state.visibilityHandler) {
            document.removeEventListener("visibilitychange", state.visibilityHandler);
            state.visibilityHandler = null;
          }
          clearItems(items);
        };
      },
    );
  });
}
