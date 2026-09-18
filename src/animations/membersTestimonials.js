import { gsap, ScrollTrigger, SplitText } from "../lib/gsap.js";

const ITEM_COUNT = 3;
const MOTION_DURATION = 1;
const WRAP_FADE_DURATION = 0.35;
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

function initMembersTestimonials(scope = document) {
  bindResize();
  const roots = scope.matches?.("[data-testimonials-init]")
    ? [scope]
    : [...scope.querySelectorAll("[data-testimonials-init]")];

  roots.forEach((root) => {
    root._membersTestimonialsInstance?.kill();

    const wheel = root.querySelector("[data-testimonials-wheel]");
    const orbit = root.querySelector(".testimonials_orbit");
    const list = root.querySelector("[data-testimonials-list]");
    const items = [...(wheel?.querySelectorAll(":scope > [data-testimonials-item]") || [])];
    const slides = [...(list?.querySelectorAll(":scope > [data-testimonials-slide]") || [])];
    if (!wheel || !orbit || !list || items.length !== ITEM_COUNT || slides.length !== ITEM_COUNT) return;

    const controls = [
      ...root.querySelectorAll("[data-testimonials-prev], [data-testimonials-next]"),
    ];
    const videos = items.map((item) => item.querySelector("[data-testimonials-video]"));
    const splitTargets = slides.flatMap((slide) => [
      slide.querySelector("[data-testimonials-text]"),
      ...slide.querySelectorAll("[data-testimonials-split]"),
    ].filter(Boolean));
    const reduced = isReducedMotion();
    const instance = {
      root,
      wheel,
      orbit,
      items,
      slides,
      videos,
      splits: [],
      states: items.map(() => ({ angle: 0 })),
      listeners: [],
      scrollTrigger: null,
      master: null,
      autoplayCall: null,
      activeIndex: Math.max(0, items.findIndex((item) => item.dataset.testimonialsItemStatus === "active")),
      isAnimating: false,
      isInView: false,
      reduced,
      radius: 0,
      step: 70,
      thumbScale: 0.476,
    };
    root._membersTestimonialsInstance = instance;

    const listen = (target, type, handler, options) => {
      target.addEventListener(type, handler, options);
      instance.listeners.push(() => target.removeEventListener(type, handler, options));
    };

    const readGeometry = () => {
      const styles = getComputedStyle(root);
      instance.step = Number.parseFloat(styles.getPropertyValue("--testi-step")) || 70;
      instance.thumbScale = Number.parseFloat(
        styles.getPropertyValue("--testi-thumb-scale"),
      ) || 0.476;
      instance.radius = orbit.offsetWidth / 2;
      if (!instance.radius) instance.radius = items[0].getBoundingClientRect().width / 2;
    };

    const offsetFor = (index, activeIndex) => mod(index - activeIndex + 1, ITEM_COUNT) - 1;
    const slotStatus = (offset) => (offset === 0 ? "active" : offset < 0 ? "prev" : "next");
    const renderItem = (index, angle) => {
      const item = items[index];
      const activeOffset = offsetFor(index, instance.activeIndex);
      const progress = Math.min(1, Math.abs(angle) / Math.max(0.001, instance.step));
      gsap.set(item, {
        x: instance.radius * Math.cos(angle * Math.PI / 180),
        y: instance.radius * Math.sin(angle * Math.PI / 180),
        scale: 1 - (1 - instance.thumbScale) * progress,
      });
      item.setAttribute("data-testimonials-item-status", slotStatus(activeOffset));
    };

    const setSlideState = (slide, active) => {
      slide.setAttribute("data-testimonials-slide-status", active ? "active" : "not-active");
      slide.setAttribute("aria-current", active ? "true" : "false");
      slide.setAttribute("aria-hidden", active ? "false" : "true");
      gsap.set(slide, { autoAlpha: active ? 1 : 0 });
    };

    const setInitialState = () => {
      readGeometry();
      instance.items.forEach((item, index) => {
        const offset = offsetFor(index, instance.activeIndex);
        instance.states[index].angle = offset * instance.step;
        item.setAttribute("aria-label", `Slide ${index + 1} of ${ITEM_COUNT}`);
        item.setAttribute("aria-current", offset === 0 ? "true" : "false");
        renderItem(index, instance.states[index].angle);
        gsap.set(item, { autoAlpha: 1 });
      });
      instance.slides.forEach((slide, index) => {
        slide.setAttribute("aria-label", `Slide ${index + 1} of ${ITEM_COUNT}`);
        setSlideState(slide, index === instance.activeIndex);
      });
    };

    const setupSplits = () => {
      if (instance.reduced) return;
      instance.splits = splitTargets.map((target) => SplitText.create(target, {
        type: "lines",
        mask: "lines",
        linesClass: "text-line",
        autoSplit: true,
        onSplit(split) {
          const slide = target.closest("[data-testimonials-slide]");
          gsap.set(split.lines, { yPercent: slide === slides[instance.activeIndex] ? 0 : 110 });
        },
      }));
    };

    const pauseVideos = () => {
      videos.forEach((video, index) => {
        if (!video) return;
        video.pause();
        try { video.currentTime = 0; } catch (_) { /* media may not be seekable yet */ }
        items[index].removeAttribute("data-testimonials-playing");
      });
    };

    const canAutoplay = () => root.dataset.testimonialsAutoplay === "true"
      && instance.isInView && !instance.isAnimating
      && items[instance.activeIndex]?.dataset.testimonialsPlaying !== "true";
    const scheduleAutoplay = () => {
      instance.autoplayCall?.kill();
      instance.autoplayCall = null;
      if (!canAutoplay()) return;
      const duration = Number.parseFloat(root.dataset.testimonialsAutoplayDuration) || 6000;
      instance.autoplayCall = gsap.delayedCall(duration / 1000, () => {
        instance.autoplayCall = null;
        if (canAutoplay()) goTo(instance.activeIndex + 1, true);
        else scheduleAutoplay();
      });
    };

    const animateQuote = (oldIndex, newIndex, timeline) => {
      const outgoing = instance.splits.filter((split) => split.lines[0]?.closest(
        "[data-testimonials-slide]",
      ) === slides[oldIndex]).flatMap((split) => split.lines);
      const incoming = instance.splits.filter((split) => split.lines[0]?.closest(
        "[data-testimonials-slide]",
      ) === slides[newIndex]).flatMap((split) => split.lines);
      if (outgoing.length) timeline.to(outgoing, {
        yPercent: -110, duration: 0.6, ease: "power4.inOut", stagger: { amount: 0.25 },
      }, 0);
      if (incoming.length) timeline.to(incoming, {
        yPercent: 0, duration: 0.7, ease: "power4.inOut", stagger: { amount: 0.4 },
      }, ">-=0.3");
    };

    function goTo(targetIndex, automatic = false) {
      if (instance.isAnimating) return;
      const newIndex = mod(targetIndex, ITEM_COUNT);
      if (newIndex === instance.activeIndex) return;
      const oldIndex = instance.activeIndex;
      const nextStates = instance.items.map((_, index) => ({
        target: offsetFor(index, newIndex) * instance.step,
        current: instance.states[index].angle,
        index,
      }));
      pauseVideos();
      instance.autoplayCall?.kill();
      instance.autoplayCall = null;
      instance.isAnimating = true;
      instance.activeIndex = newIndex;
      instance.items.forEach((item, index) => {
        const offset = offsetFor(index, newIndex);
        item.setAttribute("data-testimonials-item-status", slotStatus(offset));
        item.setAttribute("aria-current", offset === 0 ? "true" : "false");
      });
      instance.slides.forEach((slide, index) => setSlideState(slide, index === newIndex));
      gsap.set([slides[oldIndex], slides[newIndex]], { autoAlpha: 1 });

      const timeline = gsap.timeline({
        defaults: { ease: "radial" },
        onComplete: () => {
          instance.items.forEach((_, index) => {
            instance.states[index].angle = nextStates[index].target;
            renderItem(index, instance.states[index].angle);
          });
          instance.isAnimating = false;
          scheduleAutoplay();
        },
      });
      instance.master = timeline;
      nextStates.forEach(({ index, current, target }) => {
        const wraps = Math.abs(target - current) > instance.step * 1.5;
        if (wraps && !instance.reduced) {
          timeline.to(items[index], { autoAlpha: 0, duration: WRAP_FADE_DURATION }, 0);
          timeline.to(instance.states[index], {
            angle: target,
            duration: 0,
            onUpdate: () => renderItem(index, target),
          }, MOTION_DURATION * WRAP_FADE_DURATION);
          timeline.to(items[index], {
            autoAlpha: 1, duration: WRAP_FADE_DURATION,
          }, MOTION_DURATION - WRAP_FADE_DURATION);
        } else if (instance.reduced) {
          timeline.to(instance.states[index], {
            angle: target, duration: 0, onUpdate: () => renderItem(index, target),
          }, 0);
        } else {
          timeline.to(instance.states[index], {
            angle: target,
            duration: MOTION_DURATION,
            ease: "radial",
            onUpdate: () => renderItem(index, instance.states[index].angle),
          }, 0);
        }
      });

      if (instance.reduced) {
        timeline.to(slides[oldIndex], { autoAlpha: 0, duration: 0.4, ease: "power2.out" }, 0);
        timeline.fromTo(slides[newIndex], { autoAlpha: 0 }, {
          autoAlpha: 1, duration: 0.4, ease: "power2.out",
        }, 0);
      } else {
        animateQuote(oldIndex, newIndex, timeline);
        timeline.to(slides[oldIndex], { autoAlpha: 0, duration: 0 }, MOTION_DURATION);
      }
      if (automatic) scheduleAutoplay();
    }

    root.setAttribute("role", "region");
    root.setAttribute("aria-roledescription", "carousel");
    root.setAttribute("aria-label", root.getAttribute("aria-label") || "Hear from Our Members");
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
    const initialRect = root.getBoundingClientRect();
    instance.isInView = initialRect.top < window.innerHeight && initialRect.bottom > 0;
    scheduleAutoplay();

    controls.forEach((control) => listen(control, "click", () => goTo(
      instance.activeIndex + (control.hasAttribute("data-testimonials-next") ? 1 : -1),
    )));
    listen(window, "keydown", (event) => {
      if (!instance.isInView || isTypingTarget(event.target)) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      goTo(instance.activeIndex + (event.key === "ArrowRight" ? 1 : -1));
    });
    items.forEach((item, index) => {
      const video = videos[index];
      const play = item.querySelector("[data-testimonials-play]");
      const media = item.querySelector(".testimonials_media");
      if (!video || !play || !media) return;
      listen(play, "click", (event) => {
        event.stopPropagation();
        if (index !== instance.activeIndex || instance.isAnimating) return;
        const result = video.play();
        Promise.resolve(result).then(() => {
          item.setAttribute("data-testimonials-playing", "true");
          instance.autoplayCall?.kill();
          instance.autoplayCall = null;
        }).catch(() => {});
      });
      listen(media, "click", (event) => {
        if (event.target.closest("[data-testimonials-play]")) return;
        if (item.dataset.testimonialsPlaying !== "true") return;
        video.pause();
        item.removeAttribute("data-testimonials-playing");
        scheduleAutoplay();
      });
      listen(video, "ended", () => {
        item.removeAttribute("data-testimonials-playing");
        try { video.currentTime = 0; } catch (_) { /* media may not be seekable yet */ }
        scheduleAutoplay();
      });
    });

    instance.kill = () => {
      instance.autoplayCall?.kill();
      instance.master?.kill();
      instance.scrollTrigger?.kill();
      instance.listeners.forEach((remove) => remove());
      instance.splits.forEach((split) => split.revert());
      pauseVideos();
      gsap.set(items, { clearProps: "all" });
      gsap.set(slides, { clearProps: "all" });
      if (root._membersTestimonialsInstance === instance) root._membersTestimonialsInstance = null;
    };
  });
}

function bindResize() {
  if (initMembersTestimonials._resize) return;
  let lastWidth = window.innerWidth;
  let timer = null;
  const onResize = () => {
    if (window.innerWidth === lastWidth) return;
    lastWidth = window.innerWidth;
    clearTimeout(timer);
    timer = setTimeout(() => initMembersTestimonials(), 200);
  };
  window.addEventListener("resize", onResize);
  initMembersTestimonials._resize = () => {
    clearTimeout(timer);
    window.removeEventListener("resize", onResize);
    initMembersTestimonials._resize = null;
  };
}

export { initMembersTestimonials };
