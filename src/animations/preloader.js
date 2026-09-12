import { gsap, ScrollTrigger } from "../lib/gsap.js";
import { getLocomotiveScroll } from "../lib/locomotive.js";

const MINIMUM_MS = 2000;
const MAXIMUM_MS = 8000;
const COUNTER_EASE = "power1.out";
const FLIP_EASE = "power4.inOut";
const REVEAL_EASE = "power4.inOut";
const STEP_THRESHOLDS = [70, 85];
const MOVE = { duration: 1, ease: "power3.inOut" };
const ENTRANCE = { duration: 0.6, ease: "power3.out" };
const YEAR_CORNERS = {
  "2025": ["bl", "tl"],
  "2026": ["tr", "br"],
};

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
    const shape = container.querySelector("[data-preloader-shape]");
    const years = [...container.querySelectorAll("[data-preloader-year]")];
    const getYearSvg = (element) => element.querySelector("svg") ?? element;
    const targets = years.map((copy) =>
      document.querySelector(`[data-preloader-target="${copy.dataset.preloaderYear}"]`),
    );
    if (!counter || !background || years.length !== 2 || targets.some((target) => !target)) return;
    container.style.display = "flex";

    let widthRetryFrame;
    let resizeTimer;
    let lastWidth = window.innerWidth;
    const applyYearWidths = (retry = true) => {
      let needsRetry = false;
      years.forEach((year, index) => {
        const targetWidth = getYearSvg(targets[index]).getBoundingClientRect().width;
        if (targetWidth > 0) year.style.width = `${targetWidth}px`;
        else needsRetry = true;
      });
      if (needsRetry && retry && !widthRetryFrame) {
        widthRetryFrame = requestAnimationFrame(() => {
          widthRetryFrame = undefined;
          applyYearWidths(false);
        });
      }
    };
    applyYearWidths();

    const onResize = () => {
      if (window.innerWidth === lastWidth) return;
      lastWidth = window.innerWidth;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => applyYearWidths(), 100);
    };
    const removeResize = () => {
      window.removeEventListener("resize", onResize);
      clearTimeout(resizeTimer);
      if (widthRetryFrame) cancelAnimationFrame(widthRetryFrame);
      if (initPreloader._resize === removeResize) initPreloader._resize = null;
    };
    initPreloader._resize?.();
    initPreloader._resize = removeResize;
    window.addEventListener("resize", onResize);

    const reveals = [...document.querySelectorAll("[data-preloader-reveal]")];
    const media = [...document.querySelectorAll("[data-preloader-media]")];
    const instance = { timeline: null, counterValue: 0, kill: () => {} };
    container._preloaderInstance = instance;

    const scroll = getLocomotiveScroll();
    scroll?.lenisInstance?.stop();
    const lockedScrollX = window.scrollX;
    const lockedScrollY = window.scrollY;
    const isEditableTarget = (target) => {
      if (!(target instanceof Element)) return false;
      return target.isContentEditable || Boolean(target.closest("input, textarea, select"));
    };
    const onWheel = (event) => event.preventDefault();
    const onTouchMove = (event) => event.preventDefault();
    const onKeyDown = (event) => {
      if (!isEditableTarget(event.target) && [
        "Space", "PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown",
      ].includes(event.code)) event.preventDefault();
    };
    let snapFrame;
    const snapScroll = () => {
      window.scrollTo(lockedScrollX, lockedScrollY);
      scroll?.lenisInstance?.scrollTo(lockedScrollY, { immediate: true, force: true, lock: true });
    };
    const onScroll = () => {
      if (window.scrollX !== lockedScrollX || window.scrollY !== lockedScrollY) {
        snapScroll();
        if (!snapFrame) {
          snapFrame = requestAnimationFrame(() => {
            snapFrame = undefined;
            if (document.documentElement.classList.contains("is-preloading")) snapScroll();
          });
        }
      }
    };
    const listenerOptions = { capture: true, passive: false };
    const removeScrollLock = () => {
      if (snapFrame) cancelAnimationFrame(snapFrame);
      snapFrame = undefined;
      window.removeEventListener("wheel", onWheel, listenerOptions);
      window.removeEventListener("touchmove", onTouchMove, listenerOptions);
      window.removeEventListener("keydown", onKeyDown, listenerOptions);
      window.removeEventListener("scroll", onScroll, listenerOptions);
    };
    window.addEventListener("wheel", onWheel, listenerOptions);
    window.addEventListener("touchmove", onTouchMove, listenerOptions);
    window.addEventListener("keydown", onKeyDown, listenerOptions);
    window.addEventListener("scroll", onScroll, listenerOptions);

    const complete = () => {
      instance.completed = true;
      removeScrollLock();
      initPreloader._resize?.();
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

    let entranceComplete = false;
    let exitDeferred = false;
    let exitStarted = false;
    let entranceFrame;
    const startEntrance = () => {
      if (shape) {
        gsap.set(shape, { borderRadius: "0% 0% 0% 0%" });
      }
      const entrance = gsap.fromTo(
        [...years, counter, ...(shape ? [shape] : [])],
        { y: "60vh" },
        {
          y: 0, ...ENTRANCE,
          onComplete: () => {
            entranceComplete = true;
            startTime = performance.now();
            finishPromise = Promise.race([
              Promise.all([realComplete, new Promise((resolve) => { minimumTimer = setTimeout(resolve, MINIMUM_MS); })]),
              new Promise((resolve) => { maximumTimer = setTimeout(resolve, MAXIMUM_MS); }),
            ]);
            finishPromise.then(() => {
              cancelAnimationFrame(frame);
              counterTween = gsap.to({ value: shown }, { value: 100, duration: 1, ease: COUNTER_EASE,
                onUpdate() {
                  shown = Math.max(shown, this.targets()[0].value);
                  renderCounter(shown);
                  queueSteps(instance.counterValue);
                },
                onComplete: beginExit });
            });
            tick();
            if (stepTimeline.duration() && !stepTimeline.isActive()) stepTimeline.play();
          },
        },
      );
      instance.entrance = entrance;
    };
    // Let the init task finish measuring and constructing the rest of the page
    // before the entrance clock starts. This keeps the first visible frame from
    // being delayed by unrelated initialization work.
    entranceFrame = requestAnimationFrame(startEntrance);

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
    let loadListener;
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

    counter.setAttribute("aria-hidden", "true");
    const getLineHeightRatio = (element) => {
      const styles = getComputedStyle(element);
      return styles.lineHeight === "normal" ? 1.2 : parseFloat(styles.lineHeight) / parseFloat(styles.fontSize);
    };
    const step = getLineHeightRatio(counter);
    const rollers = [];
    const masks = [];
    const digitPositions = [0, 0, 0];
    const cells = [0, 0, 0];
    const fontSize = parseFloat(getComputedStyle(counter).fontSize);
    counter.textContent = "";
    for (let index = 0; index < 3; index += 1) {
      const mask = document.createElement("span");
      mask.dataset.odometerPart = "mask";
      mask.style.height = `${step}em`;
      mask.style.lineHeight = `${step}em`;
      const roller = document.createElement("span");
      roller.dataset.odometerPart = "roller";
      roller.style.lineHeight = `${step}em`;
      roller.textContent = Array.from({ length: 20 }, (_, cell) => cell % 10).join("\n");
      mask.appendChild(roller);
      counter.appendChild(mask);
      const widthEm = mask.offsetWidth / fontSize;
      gsap.set(mask, { width: index === 2 ? `${widthEm}em` : 0, opacity: index === 2 ? 1 : 0, overflow: "hidden" });
      gsap.set(roller, { y: 0 });
      masks.push({ element: mask, widthEm });
      rollers.push(roller);
    }

    const revealDigit = (index) => {
      if (index === 0 && instance.counterValue < 100) return;
      if (index === 1 && instance.counterValue < 10) return;
      if (masks[index].element.dataset.odometerRevealed) return;
      masks[index].element.dataset.odometerRevealed = "true";
      gsap.to(masks[index].element, { width: `${masks[index].widthEm}em`, opacity: 1, duration: 0.4, ease: "power2.out", overwrite: true });
    };
    const renderCounter = (value) => {
      const next = Math.max(0, Math.min(100, Math.round(value)));
      const digits = String(next).padStart(3, "0").split("").map(Number);
      instance.counterValue = next;
      [0, 1, 2].forEach(revealDigit);
      digits.forEach((digit, index) => {
        const previous = digitPositions[index];
        if (digit === previous) return;
        digitPositions[index] = digit;
        let target = cells[index];
        while (target % 10 !== digit) target += 1;
        if (target >= 20) {
          const current = Number.parseFloat(gsap.getProperty(rollers[index], "y", "em"));
          gsap.set(rollers[index], { y: `${current + 10 * step}em` });
          cells[index] -= 10;
          target -= 10;
        }
        cells[index] = target;
        gsap.to(rollers[index], {
          y: `${-target * step}em`, duration: 0.35, delay: (2 - index) * 0.04, ease: "power3.out",
          force3D: true, overwrite: true,
        });
      });
    };
    renderCounter(0);
    const stepTimeline = gsap.timeline({ paused: true });
    instance.stepTimeline = stepTimeline;
    let nextStep = 0;
    const moveYears = (threshold, position) => {
      const stepIndex = STEP_THRESHOLDS.indexOf(threshold) + 1;
      const move = gsap.timeline();
      move.call(() => {
        years.forEach((year) => {
          const nextCorner = YEAR_CORNERS[year.dataset.preloaderYear]?.[stepIndex - 1];
          if (!nextCorner || year.dataset.preloaderCorner === nextCorner) return;
          const oldRect = year.getBoundingClientRect();
          year.dataset.preloaderCorner = nextCorner;
          const newRect = year.getBoundingClientRect();
          gsap.set(year, { x: oldRect.left - newRect.left, y: oldRect.top - newRect.top });
        });
      }, [], 0);
      years.forEach((year) => {
        move.to(year, { x: 0, y: 0, ...MOVE, overwrite: "auto" }, 0);
      });
      if (shape) {
        const borderRadius = stepIndex === 1 ? "50% 50% 50% 50%" : "50% 0% 50% 0%";
        move.to(shape, { borderRadius, ...MOVE, overwrite: "auto" }, 0);
      }
      stepTimeline.add(move, position);
    };
    const queueSteps = (value) => {
      while (nextStep < STEP_THRESHOLDS.length && value >= STEP_THRESHOLDS[nextStep]) {
        const threshold = STEP_THRESHOLDS[nextStep];
        const position = stepTimeline.duration();
        moveYears(threshold, position);
        nextStep += 1;
      }
      if (entranceComplete && stepTimeline.duration() && !stepTimeline.isActive()) stepTimeline.play();
    };
    const tick = () => {
      const elapsed = performance.now() - startTime;
      const real = realProgress();
      const realTarget = realProgress() >= 1 ? real * 100 : Math.min(95, real * 100);
      const target = Math.min(realTarget, curveProgress(elapsed));
      shown += 0.09 * (target - shown);
      renderCounter(shown);
      queueSteps(instance.counterValue);
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
      else {
        loadListener = () => { loadDone = true; resolve(); };
        window.addEventListener("load", loadListener, { once: true });
      }
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

    let startTime;
    let finishPromise;
    const beginExit = () => {
      if (instance.completed || exitStarted || exitDeferred) return;
      cancelAnimationFrame(frame);
      shown = 100;
      renderCounter(100);
      queueSteps(100);
      if (stepTimeline.duration() && stepTimeline.progress() < 1) {
        exitDeferred = true;
        stepTimeline.eventCallback("onComplete", () => {
          stepTimeline.eventCallback("onComplete", null);
          exitDeferred = false;
          beginExit();
        });
        if (entranceComplete && !stepTimeline.isActive()) stepTimeline.play();
        return;
      }
      exitStarted = true;
      stepTimeline.pause().kill();
      years.forEach((year) => {
        year.dataset.preloaderCorner = year.dataset.preloaderYear === "2025" ? "tl" : "br";
      });
      gsap.killTweensOf(years);

      // The measurement is deliberately performed immediately before the timeline
      // is created, after fonts have settled, so the swap frame has no layout gap.
      gsap.set(years, { clearProps: "transform" });
      const flips = years.map((copy, index) => {
        const from = getYearSvg(copy).getBoundingClientRect();
        const to = getYearSvg(targets[index]).getBoundingClientRect();
        const scale = to.width / from.width;
        return { copy, x: to.left - from.left, y: to.top - from.top,
          scaleX: scale, scaleY: scale };
      });
      gsap.set(targets, { opacity: 0 });
      const timeline = gsap.timeline({ onComplete: complete });
      timeline.to(counter, { opacity: 0, duration: 0.4 }, 0)
        .to(background, { opacity: 0, duration: 0.6 }, 0);
      if (shape) {
        timeline.to(shape, { borderRadius: "100% 0% 0% 0%", ...MOVE }, 0)
          .to(shape, { opacity: 0, duration: 0.6 }, 0);
      }
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

    instance.kill = () => {
      removeScrollLock();
      initPreloader._resize?.();
      cancelAnimationFrame(frame);
      cancelAnimationFrame(entranceFrame);
      clearTimeout(minimumTimer); clearTimeout(maximumTimer);
      clearTimeout(imageCheckTimer);
      imageListeners.forEach(([image, listener]) => { image.removeEventListener("load", listener); image.removeEventListener("error", listener); });
      if (loadListener) window.removeEventListener("load", loadListener);
      instance.timeline?.kill();
      instance.entrance?.kill();
      counterTween?.kill();
      stepTimeline.pause().kill();
      gsap.killTweensOf([...years, ...rollers, ...masks.map(({ element }) => element)]);
      if (!instance.completed) scroll?.lenisInstance?.start();
    };
  });
}
