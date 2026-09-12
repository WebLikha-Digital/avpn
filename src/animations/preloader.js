import { gsap, ScrollTrigger } from "../lib/gsap.js";
import { getLocomotiveScroll } from "../lib/locomotive.js";

const MINIMUM_MS = 2000;
const MAXIMUM_MS = 8000;
const COUNTER_EASE = "power1.out";
const FLIP_EASE = "power4.inOut";
const REVEAL_EASE = "power4.inOut";

const TIME_CURVE = [
  { pct: 70, at: 0.25 },
  { pct: 70, at: 0.45 },
  { pct: 80, at: 0.6 },
  { pct: 80, at: 0.75 },
  { pct: 90, at: 0.9 },
  { pct: 90, at: 1 },
];

export function initPreloader() {
  document.querySelectorAll("[data-preloader-init]").forEach((container) => {
    if (!document.documentElement.classList.contains("is-preloading")) return;
    container._preloaderInstance?.kill();

    const counter = container.querySelector("[data-preloader-counter]");
    const background = container.querySelector("[data-preloader-bg]");
    const years = [...container.querySelectorAll("[data-preloader-year]")];
    const targets = years.map((copy) =>
      document.querySelector(`[data-preloader-target="${copy.dataset.preloaderYear}"]`),
    );
    if (!counter || !background || years.length !== 2 || targets.some((target) => !target)) return;
    container.style.display = "flex";

    const reveals = [...document.querySelectorAll("[data-preloader-reveal]")];
    const media = [...document.querySelectorAll("[data-preloader-media]")];
    const instance = { timeline: null, kill: () => {} };
    container._preloaderInstance = instance;

    const scroll = getLocomotiveScroll();
    scroll?.lenisInstance?.stop();

    const complete = () => {
      instance.completed = true;
      gsap.set(targets, { opacity: 1 });
      gsap.set(reveals, { opacity: 1, y: 0 });
      gsap.set(media, { opacity: 1 });
      gsap.set(years, { clearProps: "transform" });
      years.forEach((year) => { year.style.visibility = "hidden"; });
      document.documentElement.classList.remove("is-preloading");
      container.style.display = "none";
      scroll?.lenisInstance?.start();
      ScrollTrigger.refresh();
      window.dispatchEvent(new CustomEvent("preloader:complete"));
    };

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      complete();
      return;
    }

    const entrance = gsap.fromTo(
      [...years, counter],
      { y: "60vh" },
      { y: 0, duration: 1.2, ease: "power1.out" },
    );
    instance.entrance = entrance;

    const images = [...document.querySelectorAll("[data-tunnel2-images] img")];
    let shown = 0;
    const imageCount = images.length;
    let imageDone = 0;
    let loadDone = document.readyState === "complete";
    let fontsDone = false;
    let frame;
    let minimumTimer;
    let maximumTimer;
    let counterTween;
    let imageCheckTimer;
    const imageListeners = [];
    const milestones = imageCount + 2;

    const realProgress = () => (imageDone + Number(fontsDone) + Number(loadDone)) / milestones;
    const curveProgress = (elapsed) => {
      const at = Math.min(1, elapsed / MINIMUM_MS);
      let previous = { pct: 0, at: 0 };
      for (const point of TIME_CURVE) {
        if (at <= point.at) {
          const span = point.at - previous.at;
          return previous.pct + ((point.pct - previous.pct) * (at - previous.at)) / span;
        }
        previous = point;
      }
      return 90;
    };

    const renderCounter = (value) => { counter.textContent = `${Math.round(value)}`; };
    const tick = () => {
      const elapsed = performance.now() - startTime;
      const real = realProgress();
      const realTarget = realProgress() >= 1 ? real * 100 : Math.min(95, real * 100);
      const target = Math.min(realTarget, curveProgress(elapsed));
      shown += 0.09 * (target - shown);
      renderCounter(shown);
      if (!instance.completed) frame = requestAnimationFrame(tick);
    };

    const markImage = (image) => {
      if (image.dataset.preloaderDone) return;
      image.dataset.preloaderDone = "true";
      imageDone += 1;
    };
    images.forEach((image) => {
      if (image.complete) return;
      const onLoad = () => markImage(image);
      image.addEventListener("load", onLoad, { once: true });
      image.addEventListener("error", onLoad, { once: true });
      imageListeners.push([image, onLoad]);
    });
    images.filter((image) => image.complete).forEach((image) => markImage(image));

    const fontsReady = (document.fonts?.ready ?? Promise.resolve()).then(() => { fontsDone = true; });
    const loadReady = new Promise((resolve) => {
      if (document.readyState === "complete") { loadDone = true; resolve(); }
      else window.addEventListener("load", () => { loadDone = true; resolve(); }, { once: true });
    });
    const imagesReady = new Promise((resolve) => {
      const check = () => {
        if (imageDone >= imageCount) resolve();
        else imageCheckTimer = setTimeout(check, 16);
      };
      check();
    });
    const realComplete = Promise.all([
      fontsReady,
      loadReady,
      imagesReady,
    ]).then(() => {
      fontsDone = true;
      loadDone = true;
    });

    const startTime = performance.now();
    const beginExit = () => {
      if (instance.completed) return;
      cancelAnimationFrame(frame);
      shown = 100;
      renderCounter(100);

      // The measurement is deliberately performed immediately before the timeline
      // is created, after fonts have settled, so the swap frame has no layout gap.
      gsap.set(years, { clearProps: "transform" });
      const flips = years.map((copy, index) => {
        const from = copy.getBoundingClientRect();
        const to = targets[index].getBoundingClientRect();
        return { copy, x: to.left - from.left, y: to.top - from.top,
          scaleX: to.width / from.width, scaleY: to.height / from.height };
      });
      gsap.set(targets, { opacity: 0 });
      const timeline = gsap.timeline({ onComplete: complete });
      timeline.to(counter, { opacity: 0, duration: 0.4 }, 0)
        .to(background, { opacity: 0, duration: 0.6 }, 0);
      flips.forEach(({ copy, x, y, scaleX, scaleY }) => {
        timeline.to(copy, { x, y, scaleX, scaleY, transformOrigin: "top left", duration: 1, ease: FLIP_EASE }, 0);
      });
      timeline.call(() => {
        gsap.set(targets, { opacity: 1 });
        years.forEach((year) => { year.style.visibility = "hidden"; });
      }, [], 1);
      reveals.forEach((element, index) => {
        timeline.fromTo(element, { opacity: 0, y: "2em" },
          { opacity: 1, y: 0, duration: 0.8, ease: REVEAL_EASE }, 0.85 + index * 0.1);
      });
      media.forEach((element) => timeline.to(element, { opacity: 1, duration: 1.2, ease: "sine.out" }, 0.85));
      instance.timeline = timeline;
      window.dispatchEvent(new CustomEvent("preloader:exit", { detail: { timeline } }));
    };

    const finishPromise = Promise.race([
      Promise.all([realComplete, new Promise((resolve) => { minimumTimer = setTimeout(resolve, MINIMUM_MS); })]),
      new Promise((resolve) => { maximumTimer = setTimeout(resolve, MAXIMUM_MS); }),
    ]);
    finishPromise.then(() => {
      cancelAnimationFrame(frame);
      counterTween = gsap.to({ value: shown }, { value: 100, duration: 1, ease: COUNTER_EASE,
        onUpdate() { shown = Math.max(shown, this.targets()[0].value); renderCounter(shown); },
        onComplete: beginExit });
    });
    frame = requestAnimationFrame(tick);

    instance.kill = () => {
      cancelAnimationFrame(frame);
      clearTimeout(minimumTimer); clearTimeout(maximumTimer);
      clearTimeout(imageCheckTimer);
      imageListeners.forEach(([image, listener]) => { image.removeEventListener("load", listener); image.removeEventListener("error", listener); });
      instance.timeline?.kill();
      instance.entrance?.kill();
      counterTween?.kill();
      if (!instance.completed) scroll?.lenisInstance?.start();
    };
  });
}
