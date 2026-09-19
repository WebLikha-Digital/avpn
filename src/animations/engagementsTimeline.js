import { gsap, ScrollTrigger, SplitText } from "../lib/gsap.js";

const SHAPES = Object.freeze({
  "leaf-a": "22% 0 22% 0",
  "leaf-b": "0 22% 0 22%",
  circle: "50%",
  "quarter-tr": "0 50% 0 0",
  "quarter-bl": "0 0 0 50%",
});
const mod = (value, total) => ((value % total) + total) % total;

function isReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function isTypingTarget(target) {
  return target instanceof HTMLElement && (
    target.matches("input, textarea, [contenteditable='true']")
    || Boolean(target.closest("input, textarea, [contenteditable='true']"))
  );
}

function colorsFor(slide) {
  return (slide.dataset.engagementsColors || "").trim().split(/\s+/).slice(0, 3);
}

function initEngagementsTimeline(scope = document) {
  bindResize();
  const roots = scope.matches?.("[data-engagements-init]")
    ? [scope]
    : [...scope.querySelectorAll("[data-engagements-init]")];

  roots.forEach((root) => {
    root._engagementsTimelineInstance?.kill();

    const slidesWrap = root.querySelector("[data-engagements-slides]");
    const ticks = root.querySelector("[data-engagements-ticks]");
    const media = root.querySelector("[data-engagements-media]");
    const nav = root.querySelector("[data-engagements-nav]");
    const navWrap = root.querySelector(".engagements_nav-wrap");
    const tooltip = root.querySelector("[data-engagements-tooltip]");
    const backgrounds = [...root.querySelectorAll("[data-engagements-bg]")];
    const slides = [...(slidesWrap?.querySelectorAll(":scope > [data-engagements-slide]") || [])];
    const images = [...(media?.querySelectorAll(":scope > [data-engagements-image]") || [])];
    if (!slidesWrap || !ticks || !media || !nav || !navWrap || !tooltip || backgrounds.length !== 2 || !slides.length) return;

    const controls = [...root.querySelectorAll("[data-engagements-prev], [data-engagements-next]")];
    const reduced = isReducedMotion();
    const instance = {
      root,
      slides,
      images,
      backgrounds,
      ticks,
      nav,
      navWrap,
      tooltip,
      splits: [],
      listeners: [],
      scrollTrigger: null,
      master: null,
      autoplayCall: null,
      activeIndex: Math.max(0, Math.min(
        slides.length - 1,
        (Number.parseInt(root.dataset.engagementsActive, 10) || 1) - 1,
      )),
      isAnimating: false,
      isInView: false,
      reduced,
    };
    root._engagementsTimelineInstance = instance;

    const listen = (target, type, handler, options) => {
      target.addEventListener(type, handler, options);
      instance.listeners.push(() => target.removeEventListener(type, handler, options));
    };

    const setColors = (layer, slide) => {
      const colors = colorsFor(slide);
      ["--eng-c1", "--eng-c2", "--eng-c3"].forEach((name, index) => {
        if (colors[index]) layer.style.setProperty(name, colors[index]);
      });
    };

    const setSlideState = (slide, active) => {
      slide.dataset.engagementsSlideStatus = active ? "active" : "not-active";
      slide.setAttribute("aria-current", active ? "true" : "false");
      slide.setAttribute("aria-hidden", active ? "false" : "true");
    };

    const setImageState = (image, active) => {
      image.dataset.engagementsImageStatus = active ? "active" : "not-active";
    };

    const markerFor = (index) => ticks.querySelector(`[data-engagements-tick-index="${index}"]`);
    const navTarget = (index) => {
      const marker = markerFor(index);
      if (!marker) return 0;
      return marker.getBoundingClientRect().left + marker.getBoundingClientRect().width / 2
        - nav.getBoundingClientRect().left;
    };
    const setNav = (index) => {
      const value = `${navTarget(index)}px`;
      gsap.set([nav, navWrap], { "--eng-nav-x": value });
      gsap.set(navWrap, { "--eng-tip-x": value });
    };

    const buildTicks = () => {
      ticks.replaceChildren();
      for (let index = 0; index < 2; index += 1) {
        const tick = document.createElement("div");
        tick.className = "engagements_tick";
        tick.setAttribute("aria-hidden", "true");
        ticks.append(tick);
      }
      slides.forEach((slide, index) => {
        const marker = document.createElement("button");
        marker.type = "button";
        marker.className = "engagements_tick is-marker";
        marker.dataset.engagementsTick = "";
        marker.dataset.engagementsTickIndex = String(index);
        marker.dataset.engagementsTickStatus = index === instance.activeIndex ? "active" : "not-active";
        marker.setAttribute("aria-label", `Go to ${slide.dataset.engagementsDate || `slide ${index + 1}`}`);
        ticks.append(marker);
        for (let cosmetic = 0; cosmetic < 2; cosmetic += 1) {
          const tick = document.createElement("div");
          tick.className = "engagements_tick";
          tick.setAttribute("aria-hidden", "true");
          ticks.append(tick);
        }
      });
    };

    const setInitialState = () => {
      const activeSlide = slides[instance.activeIndex];
      const activeImage = images[instance.activeIndex];
      root.setAttribute("role", "region");
      root.setAttribute("aria-roledescription", "carousel");
      root.setAttribute("aria-label", root.getAttribute("aria-label") || "Engagements with Members");
      root.dataset.engagementsActive = String(instance.activeIndex + 1);
      slides.forEach((slide, index) => {
        slide.setAttribute("aria-label", `Slide ${index + 1} of ${slides.length}`);
        setSlideState(slide, index === instance.activeIndex);
        gsap.set(slide, { autoAlpha: index === instance.activeIndex ? 1 : 0 });
      });
      images.forEach((image, index) => {
        setImageState(image, index === instance.activeIndex);
        gsap.set(image, { autoAlpha: index === instance.activeIndex ? 1 : 0 });
      });
      media.dataset.engagementsShape = activeSlide.dataset.engagementsShape || "leaf-a";
      gsap.set(media, { borderRadius: SHAPES[media.dataset.engagementsShape] || SHAPES["leaf-a"] });
      const activeBackground = backgrounds.find((layer) => layer.dataset.engagementsBgStatus === "active") || backgrounds[0];
      const hiddenBackground = backgrounds.find((layer) => layer !== activeBackground) || backgrounds[1];
      setColors(activeBackground, activeSlide);
      setColors(hiddenBackground, slides[mod(instance.activeIndex + 1, slides.length)]);
      gsap.set(activeBackground, { autoAlpha: 1 });
      gsap.set(hiddenBackground, { autoAlpha: 0 });
      tooltip.textContent = activeSlide.dataset.engagementsDate || "";
      buildTicks();
      setNav(instance.activeIndex);
    };

    const setupSplits = () => {
      if (instance.reduced) return;
      slides.flatMap((slide) => [...slide.querySelectorAll("[data-engagements-split]")]).forEach((target) => {
        const split = SplitText.create(target, {
          type: "lines",
          mask: "lines",
          linesClass: "text-line",
          autoSplit: true,
          onSplit(next) {
            const slide = target.closest("[data-engagements-slide]");
            gsap.set(next.lines, { yPercent: slide === slides[instance.activeIndex] ? 0 : 110 });
          },
        });
        instance.splits.push(split);
      });
    };

    const canAutoplay = () => root.dataset.engagementsAutoplay === "true"
      && instance.isInView && !instance.isAnimating;
    const scheduleAutoplay = () => {
      instance.autoplayCall?.kill();
      instance.autoplayCall = null;
      if (!canAutoplay()) return;
      const duration = Number.parseFloat(root.dataset.engagementsAutoplayDuration) || 6000;
      instance.autoplayCall = gsap.delayedCall(duration / 1000, () => {
        instance.autoplayCall = null;
        if (canAutoplay()) goTo(instance.activeIndex + 1, true);
      });
    };

    const animateLines = (oldIndex, newIndex, timeline) => {
      const linesFor = (index) => instance.splits
        .filter((split) => split.lines[0]?.closest("[data-engagements-slide]") === slides[index])
        .flatMap((split) => split.lines);
      const outgoing = linesFor(oldIndex);
      const incoming = linesFor(newIndex);
      if (outgoing.length) timeline.to(outgoing, {
        yPercent: -110, duration: 0.6, ease: "power4.inOut", stagger: { amount: 0.25 },
      }, 0);
      if (incoming.length) timeline.to(incoming, {
        yPercent: 0, duration: 0.6, ease: "power4.inOut", stagger: { amount: 0.3 },
      }, 0);
    };

    function goTo(targetIndex, automatic = false) {
      if (instance.isAnimating) return;
      const newIndex = mod(targetIndex, slides.length);
      if (newIndex === instance.activeIndex) return;
      const oldIndex = instance.activeIndex;
      const oldSlide = slides[oldIndex];
      const newSlide = slides[newIndex];
      const oldImage = images[oldIndex];
      const newImage = images[newIndex];
      const visibleBackground = backgrounds.find((layer) => layer.dataset.engagementsBgStatus === "active") || backgrounds[0];
      const hiddenBackground = backgrounds.find((layer) => layer !== visibleBackground) || backgrounds[1];
      const targetShape = SHAPES[newSlide.dataset.engagementsShape] || SHAPES["leaf-a"];
      const targetNav = navTarget(newIndex);

      instance.autoplayCall?.kill();
      instance.autoplayCall = null;
      instance.isAnimating = true;
      instance.activeIndex = newIndex;
      root.dataset.engagementsActive = String(newIndex + 1);
      slides.forEach((slide, index) => setSlideState(slide, index === newIndex));
      ticks.querySelectorAll("[data-engagements-tick]").forEach((marker, index) => {
        marker.dataset.engagementsTickStatus = index === newIndex ? "active" : "not-active";
      });
      gsap.set([oldSlide, newSlide], { autoAlpha: 1 });
      setColors(hiddenBackground, newSlide);
      setImageState(oldImage, false);
      setImageState(newImage, true);
      gsap.set([oldImage, newImage], { autoAlpha: 1 });
      gsap.set(newImage, { autoAlpha: 0 });
      if (!instance.reduced) gsap.set(newSlide.querySelectorAll(".text-line"), { yPercent: 110 });
      if (instance.reduced) gsap.set(media, { borderRadius: targetShape });

      const timeline = gsap.timeline({
        defaults: { ease: "radial" },
        onComplete: () => {
          oldSlide.setAttribute("aria-hidden", "true");
          gsap.set(oldSlide, { autoAlpha: 0 });
          gsap.set(oldImage, { autoAlpha: 0 });
          gsap.set(newImage, { autoAlpha: 1 });
          media.dataset.engagementsShape = newSlide.dataset.engagementsShape || "leaf-a";
          visibleBackground.dataset.engagementsBgStatus = "hidden";
          hiddenBackground.dataset.engagementsBgStatus = "active";
          gsap.set(visibleBackground, { autoAlpha: 0 });
          gsap.set(hiddenBackground, { autoAlpha: 1 });
          instance.isAnimating = false;
          scheduleAutoplay();
        },
      });
      instance.master = timeline;
      if (instance.reduced) {
        timeline.to(oldSlide, { autoAlpha: 0, duration: 0.35 }, 0);
        timeline.fromTo(newSlide, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.35 }, 0);
      } else {
        animateLines(oldIndex, newIndex, timeline);
        timeline.to(oldSlide.querySelector(".engagements_meta"), { autoAlpha: 0, duration: 0.35 }, 0.4);
        timeline.fromTo(newSlide.querySelector(".engagements_meta"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.35 }, 0.4);
        timeline.to(media, { borderRadius: targetShape, duration: 0.8, ease: "smooth", onComplete: () => {
          media.dataset.engagementsShape = newSlide.dataset.engagementsShape || "leaf-a";
        } }, 0);
      }
      timeline.to(oldImage, { autoAlpha: 0, duration: 0.5, ease: "power1.inOut" }, 0.1);
      timeline.to(newImage, { autoAlpha: 1, duration: 0.5, ease: "power1.inOut" }, 0.1);
      timeline.to(hiddenBackground, { autoAlpha: 1, duration: 0.7, ease: "power1.inOut" }, 0);
      timeline.to([nav, navWrap], {
        "--eng-nav-x": `${targetNav}px`,
        duration: instance.reduced ? 0 : 0.6,
        ease: "smooth",
      }, 0);
      timeline.to(navWrap, {
        "--eng-tip-x": `${targetNav}px`,
        duration: instance.reduced ? 0 : 0.6,
        ease: "smooth",
      }, 0);
      if (instance.reduced) {
        timeline.call(() => { tooltip.textContent = newSlide.dataset.engagementsDate || ""; }, [], 0);
      } else {
        timeline.to(tooltip, { autoAlpha: 0, duration: 0.15, ease: "power1.in" }, 0.15);
        timeline.call(() => { tooltip.textContent = newSlide.dataset.engagementsDate || ""; }, [], 0.3);
        timeline.to(tooltip, { autoAlpha: 1, duration: 0.15, ease: "power1.out" }, 0.3);
      }
      if (automatic) scheduleAutoplay();
    }

    setInitialState();
    setupSplits();
    instance.scrollTrigger = ScrollTrigger.create({
      trigger: root,
      start: "top bottom",
      end: "bottom top",
      onToggle: (self) => {
        instance.isInView = self.isActive;
        scheduleAutoplay();
      },
    });
    const rect = root.getBoundingClientRect();
    instance.isInView = rect.top < window.innerHeight && rect.bottom > 0;
    scheduleAutoplay();

    controls.forEach((control) => listen(control, "click", () => goTo(
      instance.activeIndex + (control.hasAttribute("data-engagements-next") ? 1 : -1),
    )));
    listen(ticks, "click", (event) => {
      const marker = event.target.closest("[data-engagements-tick-index]");
      if (marker) goTo(Number(marker.dataset.engagementsTickIndex));
    });
    if (!window.matchMedia?.("(pointer: coarse)").matches) {
      ticks.querySelectorAll("[data-engagements-tick-index]").forEach((marker) => {
        listen(marker, "mouseenter", () => {
          if (instance.isAnimating) return;
          const index = Number(marker.dataset.engagementsTickIndex);
          tooltip.textContent = slides[index].dataset.engagementsDate || "";
          gsap.to(navWrap, {
            "--eng-tip-x": `${navTarget(index)}px`, duration: 0.3, ease: "smooth", overwrite: true,
          });
        });
        listen(marker, "mouseleave", () => {
          if (instance.isAnimating) return;
          tooltip.textContent = slides[instance.activeIndex].dataset.engagementsDate || "";
          gsap.to(navWrap, {
            "--eng-tip-x": `${navTarget(instance.activeIndex)}px`, duration: 0.3, ease: "smooth", overwrite: true,
          });
        });
      });
    }
    listen(window, "keydown", (event) => {
      if (!instance.isInView || isTypingTarget(event.target)) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      goTo(instance.activeIndex + (event.key === "ArrowRight" ? 1 : -1));
    });

    instance.kill = () => {
      instance.autoplayCall?.kill();
      instance.master?.kill();
      instance.scrollTrigger?.kill();
      instance.listeners.forEach((remove) => remove());
      instance.splits.forEach((split) => split.revert());
      ticks.replaceChildren();
      gsap.killTweensOf(navWrap);
      gsap.set([...slides, ...images, ...backgrounds, media, nav, navWrap, tooltip], { clearProps: "all" });
      if (root._engagementsTimelineInstance === instance) root._engagementsTimelineInstance = null;
    };
  });
}

function bindResize() {
  if (initEngagementsTimeline._resize) return;
  let lastWidth = window.innerWidth;
  let timer = null;
  const onResize = () => {
    if (window.innerWidth === lastWidth) return;
    lastWidth = window.innerWidth;
    clearTimeout(timer);
    timer = setTimeout(() => initEngagementsTimeline(), 200);
  };
  window.addEventListener("resize", onResize);
  initEngagementsTimeline._resize = () => {
    clearTimeout(timer);
    window.removeEventListener("resize", onResize);
    initEngagementsTimeline._resize = null;
  };
}

export { initEngagementsTimeline };
