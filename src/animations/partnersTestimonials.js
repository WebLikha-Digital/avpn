import { gsap, Draggable, InertiaPlugin } from "../lib/gsap.js";
import { lockScroll } from "../lib/scrollLock.js";

const RESIZE_DEBOUNCE = 200;
const DRAG_CLICK_THRESHOLD = 6;

gsap.registerPlugin(Draggable, InertiaPlugin);

const reducedMotion = () => window.matchMedia?.(
  "(prefers-reduced-motion: reduce)",
).matches ?? false;

function videoEmbedSource(src) {
  try {
    const url = new URL(src, window.location.href);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    let id;
    if (host === "youtube.com" || host === "m.youtube.com") {
      if (url.pathname === "/watch") id = url.searchParams.get("v");
      else if (url.pathname.startsWith("/embed/")) id = url.pathname.split("/")[2];
    } else if (host === "youtu.be") {
      id = url.pathname.slice(1).split("/")[0];
    }
    if (id) return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
    if (host === "vimeo.com" || host === "player.vimeo.com") {
      const match = url.pathname.match(/\/(?:video\/)?(\d+)/);
      if (match) return `https://player.vimeo.com/video/${match[1]}?autoplay=1`;
    }
  } catch (_) {
    // An invalid URL is handled as a native video source below.
  }
  return null;
}

function createPlayer(src) {
  const embed = videoEmbedSource(src);
  if (embed) {
    const iframe = document.createElement("iframe");
    iframe.src = embed;
    iframe.setAttribute("allow", "autoplay; fullscreen; picture-in-picture");
    iframe.setAttribute("allowfullscreen", "");
    return iframe;
  }
  const video = document.createElement("video");
  video.controls = true;
  video.autoplay = true;
  video.playsInline = true;
  video.src = src;
  return video;
}

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
    const lightbox = root.querySelector("[data-video-lightbox]");
    const player = lightbox?.querySelector("[data-video-lightbox-player]");
    const triggers = [...root.querySelectorAll("[data-video-lightbox-trigger]")];
    const closeTargets = [...(lightbox?.querySelectorAll("[data-video-lightbox-close]") || [])];
    if (!slider || !collection || !list || !items.length || !lightbox || !player) return;

    const instance = {
      root, slider, collection, list, items, controls, lightbox, player, triggers,
      closeTargets, draggable: null, listeners: [], unlockScroll: null,
      activeTrigger: null, suppressClickUntil: 0, pointerDown: null,
      dragMoved: false, reduced: reducedMotion(), snapPoints: [], activeIndex: 0,
      destroy() {
        this.close();
        this.draggable?.kill();
        this.listeners.forEach((remove) => remove());
        gsap.killTweensOf(list);
        gsap.set(list, { clearProps: "transform" });
        list.onmouseenter = null;
        list.onmouseleave = null;
        list.removeAttribute("style");
        if (root._partnersTestimonialsInstance === this) {
          delete root._partnersTestimonialsInstance;
        }
      },
      close() {
        if (!this.activeTrigger && !this.unlockScroll) return;
        const trigger = this.activeTrigger;
        const media = player.querySelector("video");
        if (media) {
          media.pause();
          media.removeAttribute("src");
          media.load();
        }
        player.replaceChildren();
        lightbox.setAttribute("data-video-lightbox-status", "not-active");
        lightbox.setAttribute("aria-hidden", "true");
        this.unlockScroll?.();
        this.unlockScroll = null;
        this.activeTrigger = null;
        trigger?.focus();
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

    const closeButton = lightbox.querySelector("button[data-video-lightbox-close]");
    if (closeButton) closeButton.type = "button";
    triggers.forEach((trigger) => {
      trigger.type = "button";
      trigger.setAttribute("aria-haspopup", "dialog");
    });
    lightbox.setAttribute("aria-hidden", "true");
    lightbox.setAttribute("data-video-lightbox-status", "not-active");

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

    const setX = gsap.quickSetter(list, "x", "px");
    const goTo = (target) => {
      const point = instance.snapPoints[target];
      if (point === undefined) return;
      gsap.to(list, {
        duration: instance.reduced ? 0 : 0.4,
        x: point,
        onUpdate: () => updateStatus(gsap.getProperty(list, "x")),
        onComplete: () => updateStatus(point),
      });
    };
    controls.forEach((button) => listen(button, "click", () => {
      if (button.disabled) return;
      const delta = button.getAttribute("data-gsap-slider-control") === "next" ? 1 : -1;
      goTo(instance.activeIndex + delta);
    }));

    if (sliderEnabled) {
      list.onmouseenter = () => list.setAttribute("data-gsap-slider-list-status", "grab");
      list.onmouseleave = () => list.removeAttribute("data-gsap-slider-list-status");
      instance.draggable = Draggable.create(list, {
        type: "x", inertia: true, bounds: { minX, maxX },
        throwResistance: 2000, dragResistance: 0.05,
        maxDuration: instance.reduced ? 0 : 0.6, minDuration: instance.reduced ? 0 : 0.2,
        edgeResistance: 0.75, dragClickables: true, allowEventDefault: true,
        snap: { x: instance.snapPoints, duration: instance.reduced ? 0 : 0.4 },
        onPress() {
          instance.dragMoved = false;
          list.setAttribute("data-gsap-slider-list-status", "grabbing");
        },
        onDragStart() { instance.dragMoved = true; },
        onDrag() { setX(this.x); updateStatus(this.x); },
        onThrowUpdate() { setX(this.x); updateStatus(this.x); },
        onRelease() { setX(this.x); updateStatus(this.x); },
        onThrowComplete() {
          setX(this.endX); updateStatus(this.endX);
          list.setAttribute("data-gsap-slider-list-status", "grab");
        },
      })[0];
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

    const open = (trigger) => {
      const src = trigger.getAttribute("data-video-lightbox-src");
      if (!src) return;
      instance.close();
      player.replaceChildren(createPlayer(src));
      lightbox.setAttribute("data-video-lightbox-status", "active");
      lightbox.setAttribute("aria-hidden", "false");
      instance.unlockScroll = lockScroll({ className: "is-modal-open" });
      instance.activeTrigger = trigger;
      closeButton?.focus();
    };
    const onTriggerClick = (event) => {
      if (performance.now() < instance.suppressClickUntil
        || instance.draggable?.isDragging || instance.draggable?.isThrowing) {
        event.preventDefault();
        return;
      }
      event.preventDefault();
      open(event.currentTarget);
    };
    triggers.forEach((trigger) => listen(trigger, "click", onTriggerClick));
    closeTargets.forEach((target) => listen(target, "click", () => instance.close()));
    listen(document, "keydown", (event) => {
      if (event.key === "Escape" && instance.activeTrigger) instance.close();
    });
  });
}

export { initPartnersTestimonials };
