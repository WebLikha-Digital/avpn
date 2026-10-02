import { gsap, Draggable, InertiaPlugin, ScrollTrigger } from "../lib/gsap.js";
import { CLOSE_EVENT, OPEN_EVENT } from "./videoLightbox.js";

const RESIZE_DEBOUNCE = 200;
const DRAG_CLICK_THRESHOLD = 6;
const SWIPE_DISTANCE_RATIO = 0.1;
const SWIPE_DISTANCE_MAX = 40;
const SWIPE_VELOCITY = 300;

gsap.registerPlugin(Draggable, InertiaPlugin);

const reducedMotion = () => window.matchMedia?.(
  "(prefers-reduced-motion: reduce)",
).matches ?? false;

function bindResize() {
  initPartnersTestimonials._resize?.();
  let timer;
  let lastWidth = window.innerWidth;
  const onResize = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (window.innerWidth === lastWidth) return;
      lastWidth = window.innerWidth;
      initPartnersTestimonials();
    }, RESIZE_DEBOUNCE);
  };
  window.addEventListener("resize", onResize);
  initPartnersTestimonials._resize = () => {
    window.removeEventListener("resize", onResize);
    clearTimeout(timer);
  };
}

function initPartnersTestimonials() {
  bindResize();
  document.querySelectorAll("[data-testi-partners-init]").forEach((root) => {
    root._partnersTestimonialsInstance?.destroy();

    const slider = root.querySelector("[data-gsap-slider-init]");
    const collection = slider?.querySelector("[data-gsap-slider-collection]");
    const list = slider?.querySelector("[data-gsap-slider-list]");
    const items = [...(list?.querySelectorAll(":scope > [data-gsap-slider-item]") || [])];
    const controls = [...root.querySelectorAll("[data-gsap-slider-control]")];
    if (!slider || !collection || !list || !items.length) return;

    const instance = {
      root, slider, collection, list, items, controls,
      draggable: null, listeners: [], suppressClickUntil: 0, pointerDown: null,
      touchActionNodes: [], pressIndex: 0, pressX: 0, dragSamples: [],
      dragMoved: false, reduced: reducedMotion(), snapPoints: [], activeIndex: 0,
      autoplayCall: null, scrollTrigger: null, isInView: false,
      isHovered: false, isDragging: false, isLightboxOpen: false,
      destroy() {
        this.draggable?.kill();
        this.autoplayCall?.kill();
        this.scrollTrigger?.kill();
        this.listeners.forEach((remove) => remove());
        this.touchActionNodes.forEach((node) => node.style.removeProperty("touch-action"));
        gsap.killTweensOf(list);
        gsap.set(list, { clearProps: "transform" });
        list.removeAttribute("style");
        if (root._partnersTestimonialsInstance === this) {
          delete root._partnersTestimonialsInstance;
        }
      },
    };
    root._partnersTestimonialsInstance = instance;
    const listen = (target, type, handler, options) => {
      target.addEventListener(type, handler, options);
      instance.listeners.push(() => target.removeEventListener(type, handler, options));
    };

    const statusVar = getComputedStyle(slider).getPropertyValue("--slider-status").trim();
    let spvVar = parseFloat(getComputedStyle(slider).getPropertyValue("--slider-spv"));
    const firstRect = items[0].getBoundingClientRect();
    const marginRight = parseFloat(getComputedStyle(items[0]).marginRight) || 0;
    const slideW = firstRect.width + marginRight;
    if (!Number.isFinite(spvVar) && slideW) spvVar = collection.clientWidth / slideW;
    const spv = Math.max(1, Math.min(spvVar || 1, items.length));
    const sliderEnabled = statusVar === "on" && spv < items.length;
    slider.setAttribute("data-gsap-slider-status", sliderEnabled ? "active" : "not-active");

    slider.setAttribute("role", "region");
    slider.setAttribute("aria-roledescription", "carousel");
    slider.setAttribute("aria-label", "Slider");
    collection.setAttribute("role", "group");
    collection.setAttribute("aria-roledescription", "Slides List");
    collection.setAttribute("aria-label", "Slides");
    items.forEach((item, index) => {
      item.setAttribute("role", "group");
      item.setAttribute("aria-roledescription", "Slide");
      item.setAttribute("aria-label", `Slide ${index + 1} of ${items.length}`);
      item.setAttribute("aria-hidden", "true");
      item.setAttribute("aria-selected", "false");
      item.setAttribute("tabindex", "-1");
    });
    controls.forEach((button) => {
      button.type = "button";
      const direction = button.getAttribute("data-gsap-slider-control");
      button.setAttribute("role", "button");
      button.setAttribute("aria-label", direction === "prev" ? "Previous Slide" : "Next Slide");
    });

    const collectionRect = () => collection.getBoundingClientRect();
    const maxScroll = Math.max(list.scrollWidth - collection.clientWidth, 0);
    const minX = -maxScroll;
    const maxX = 0;
    const maxIndex = slideW ? maxScroll / slideW : 0;
    const full = Math.floor(maxIndex);
    for (let index = 0; index <= full; index += 1) instance.snapPoints.push(-index * slideW);
    if (full < maxIndex) instance.snapPoints.push(-maxIndex * slideW);
    if (!instance.snapPoints.length) instance.snapPoints.push(0);

    const updateStatus = (x) => {
      if (x > maxX || x < minX) return;
      const calcX = Math.max(minX, Math.min(maxX, x));
      let closest = instance.snapPoints[0];
      instance.snapPoints.forEach((point) => {
        if (Math.abs(point - calcX) < Math.abs(closest - calcX)) closest = point;
      });
      instance.activeIndex = instance.snapPoints.indexOf(closest);
      const rect = collectionRect();
      items.forEach((item, index) => {
        const itemRect = item.getBoundingClientRect();
        const leftEdge = itemRect.left - rect.left;
        const inView = leftEdge + itemRect.width / 2 > 0 && leftEdge + itemRect.width / 2 < rect.width;
        item.setAttribute("data-gsap-slider-item-status", index === instance.activeIndex
          ? "active" : inView ? "inview" : "not-active");
        item.setAttribute("aria-selected", index === instance.activeIndex ? "true" : "false");
        item.setAttribute("aria-hidden", inView ? "false" : "true");
        item.setAttribute("tabindex", index === instance.activeIndex ? "0" : "-1");
      });
      controls.forEach((button) => {
        const canMove = button.getAttribute("data-gsap-slider-control") === "prev"
          ? instance.activeIndex > 0
          : instance.activeIndex < instance.snapPoints.length - 1;
        button.disabled = !canMove;
        button.setAttribute("aria-disabled", canMove ? "false" : "true");
        button.setAttribute("data-gsap-slider-control-status", canMove ? "active" : "not-active");
      });
    };

    const autoplayDuration = (() => {
      const value = slider.getAttribute("data-gsap-slider-autoplay");
      if (value === "false" || value === "0") return 0;
      const duration = Number.parseFloat(value);
      return Number.isFinite(duration) && duration > 0 ? duration : 4000;
    })();
    const canAutoplay = () => autoplayDuration > 0
      && !instance.reduced
      && slider.getAttribute("data-gsap-slider-status") === "active"
      && instance.isInView && !instance.isHovered && !instance.isDragging
      && !instance.isLightboxOpen;
    const scheduleAutoplay = () => {
      instance.autoplayCall?.kill();
      instance.autoplayCall = null;
      if (!canAutoplay()) return;
      instance.autoplayCall = gsap.delayedCall(autoplayDuration / 1000, () => {
        instance.autoplayCall = null;
        if (canAutoplay()) goTo(instance.activeIndex + 1, true);
        else scheduleAutoplay();
      });
    };

    const setX = gsap.quickSetter(list, "x", "px");
    const goTo = (targetIndex, automatic = false) => {
      const target = automatic
        ? ((targetIndex % instance.snapPoints.length) + instance.snapPoints.length)
          % instance.snapPoints.length
        : targetIndex;
      const point = instance.snapPoints[target];
      if (point === undefined) return;
      instance.autoplayCall?.kill();
      instance.autoplayCall = null;
      gsap.to(list, {
        duration: instance.reduced ? 0 : 0.4,
        x: point,
        onUpdate: () => updateStatus(gsap.getProperty(list, "x")),
        onComplete: () => {
          updateStatus(point);
          scheduleAutoplay();
        },
      });
    };
    controls.forEach((button) => listen(button, "click", () => {
      if (button.disabled) return;
      const delta = button.getAttribute("data-gsap-slider-control") === "next" ? 1 : -1;
      goTo(instance.activeIndex + delta);
    }));
    const recordDragSample = (x) => {
      const now = performance.now();
      instance.dragSamples.push({ x, time: now });
      while (instance.dragSamples.length > 1 && now - instance.dragSamples[0].time > 100) {
        instance.dragSamples.shift();
      }
    };

    if (sliderEnabled) {
      instance.draggable = Draggable.create(list, {
        type: "x", inertia: true, bounds: { minX, maxX },
        throwResistance: 2000, dragResistance: 0.05,
        maxDuration: instance.reduced ? 0 : 0.6, minDuration: instance.reduced ? 0 : 0.2,
        edgeResistance: 0.75, dragClickables: true, allowEventDefault: true,
        snap: { x: function snapX(endValue) {
          if (!this.isThrowing) return endValue;
          const displacement = this.x - instance.pressX;
          const sample = instance.dragSamples[0];
          const elapsed = performance.now() - sample.time;
          const velocity = elapsed ? (this.x - sample.x) * 1000 / elapsed : 0;
          const direction = Math.abs(displacement) >= Math.min(
            slideW * SWIPE_DISTANCE_RATIO, SWIPE_DISTANCE_MAX,
          )
            ? Math.sign(displacement) : Math.abs(velocity) >= SWIPE_VELOCITY
              ? Math.sign(velocity) : 0;
          const targetIndex = Math.max(0, Math.min(instance.snapPoints.length - 1,
            instance.pressIndex + (direction < 0 ? 1 : direction > 0 ? -1 : 0)));
          return instance.snapPoints[targetIndex];
        }, duration: instance.reduced ? 0 : 0.4 },
        onPress() {
          instance.autoplayCall?.kill();
          instance.autoplayCall = null;
          instance.isDragging = true;
          instance.dragMoved = false;
          instance.pressIndex = instance.activeIndex;
          instance.pressX = this.x;
          instance.dragSamples = [];
          recordDragSample(this.x);
          list.setAttribute("data-gsap-slider-list-status", "grabbing");
        },
        onDragStart() { instance.dragMoved = true; },
        onDrag() { recordDragSample(this.x); setX(this.x); updateStatus(this.x); },
        onThrowUpdate() { setX(this.x); updateStatus(this.x); },
        onRelease() {
          setX(this.x); updateStatus(this.x);
          if (!this.isThrowing) {
            instance.isDragging = false;
            scheduleAutoplay();
          }
        },
        onThrowComplete() {
          setX(this.endX); updateStatus(this.endX);
          list.setAttribute("data-gsap-slider-list-status", "grab");
          instance.isDragging = false;
          scheduleAutoplay();
        },
      })[0];
      instance.touchActionNodes = [list, ...list.querySelectorAll("*")];
      instance.touchActionNodes.forEach((node) => node.style.setProperty("touch-action", "pan-y"));
    } else {
      list.removeAttribute("style");
      controls.forEach((button) => {
        button.disabled = true;
        button.setAttribute("aria-disabled", "true");
        button.setAttribute("data-gsap-slider-control-status", "not-active");
      });
    }
    setX(0);
    updateStatus(0);

    const onPointerDown = (event) => {
      instance.pointerDown = { x: event.clientX, y: event.clientY };
      instance.dragMoved = false;
    };
    const onPointerMove = (event) => {
      if (!instance.pointerDown) return;
      if (Math.hypot(event.clientX - instance.pointerDown.x, event.clientY - instance.pointerDown.y)
        > DRAG_CLICK_THRESHOLD) instance.dragMoved = true;
    };
    const onPointerUp = () => {
      if (instance.dragMoved) instance.suppressClickUntil = performance.now() + 100;
      instance.dragMoved = false;
      instance.pointerDown = null;
    };
    listen(list, "pointerdown", onPointerDown, true);
    listen(list, "pointermove", onPointerMove, true);
    listen(list, "pointerup", onPointerUp, true);
    listen(list, "pointercancel", onPointerUp, true);

    listen(list, "click", (event) => {
      if (performance.now() < instance.suppressClickUntil
        || instance.draggable?.isDragging || instance.draggable?.isThrowing) event.preventDefault();
    }, true);

    if (sliderEnabled) {
      listen(list, "pointerenter", (event) => {
        if (event.pointerType !== "mouse") return;
        instance.isHovered = true;
        instance.autoplayCall?.kill();
        instance.autoplayCall = null;
        list.setAttribute("data-gsap-slider-list-status", "grab");
      });
      listen(list, "pointerleave", (event) => {
        if (event.pointerType !== "mouse") return;
        instance.isHovered = false;
        list.removeAttribute("data-gsap-slider-list-status");
        scheduleAutoplay();
      });
    }
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
    listen(document, OPEN_EVENT, (event) => {
      if (!event.detail?.lightbox || !root.contains(event.detail.lightbox)) return;
      instance.isLightboxOpen = true;
      instance.autoplayCall?.kill();
      instance.autoplayCall = null;
    });
    listen(document, CLOSE_EVENT, (event) => {
      if (!event.detail?.lightbox || !root.contains(event.detail.lightbox)) return;
      instance.isLightboxOpen = false;
      scheduleAutoplay();
    });
    scheduleAutoplay();
  });
}

export { initPartnersTestimonials };
