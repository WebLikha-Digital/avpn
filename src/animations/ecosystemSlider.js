import { gsap, Draggable, ScrollTrigger } from "../lib/gsap.js";

const RESIZE_DEBOUNCE = 200;
const mod = (value, total) => ((value % total) + total) % total;
const reducedMotion = () => window.matchMedia?.(
  "(prefers-reduced-motion: reduce)",
).matches;

function initEcosystemSlider(scope = document) {
  bindResize();
  const roots = scope.matches?.("[data-radial-slider-init]")
    ? [scope]
    : [...scope.querySelectorAll("[data-radial-slider-init]")];

  roots.forEach((root) => {
    root._ecosystemSliderInstance?.kill();
    const collection = root.querySelector("[data-radial-slider-collection]");
    const list = root.querySelector("[data-radial-slider-list]");
    if (!collection || !list) return;
    root.querySelectorAll("[data-radial-slider-clone]").forEach((clone) => clone.remove());
    const originalItems = [...list.querySelectorAll(
      ":scope > [data-radial-slider-item]:not([data-radial-slider-clone])",
    )];
    if (!originalItems.length) return;

    const panel = root.closest("[data-tabs-panel]");
    const tabsRoot = root.closest("[data-tabs-init]");
    const controls = [...root.querySelectorAll(
      '[data-radial-slider-control="prev"], [data-radial-slider-control="next"]',
    )];
    const instance = {
      root, collection, list, originalItems, controls, panel, tabsRoot,
      draggable: null, proxy: null, proxyWrap: null, revealTimeline: null,
      revealTrigger: null, arrowTween: null, listeners: [], movedSincePress: false,
      activeIndex: 0, reduced: reducedMotion(),
    };
    root._ecosystemSliderInstance = instance;
    const listen = (target, type, handler, options) => {
      target.addEventListener(type, handler, options);
      instance.listeners.push(() => target.removeEventListener(type, handler, options));
    };
    const onTabChange = (event) => {
      if (!panel || event.detail?.id !== panel.dataset.tabsPanel) return;
      initEcosystemSlider(panel);
      panel.querySelector("[data-radial-slider-init]")?._ecosystemSliderInstance?.reveal();
    };
    // Hidden tab panels measure zero; keep this listener alive before measurement.
    if (tabsRoot) listen(tabsRoot, "ecosystemtabs:change", onTabChange);

    instance.reveal = () => {
      instance.revealTimeline?.kill();
      const items = [...list.querySelectorAll(":scope > [data-radial-slider-item]")];
      gsap.set(items, { opacity: instance.reduced ? 1 : 0, y: instance.reduced ? 0 : 40 });
      if (instance.reduced) {
        instance.revealTimeline = null;
        return;
      }
      instance.revealTimeline = gsap.timeline().to(items, {
        opacity: 1, y: 0, duration: 0.6, ease: "smooth",
        stagger: { each: 0.05, from: "center" },
      });
    };
    instance.kill = () => {
      instance.draggable?.kill();
      instance.arrowTween?.kill();
      if (instance.proxy) gsap.killTweensOf(instance.proxy);
      instance.revealTimeline?.kill();
      instance.revealTrigger?.kill();
      instance.listeners.forEach((remove) => remove());
      gsap.set(originalItems, { clearProps: "all" });
      gsap.set(list, { clearProps: "height" });
      list.querySelectorAll(":scope > [data-radial-slider-item]").forEach((item) => {
        if (item.hasAttribute("data-radial-slider-clone")) item.remove();
      });
      instance.proxyWrap?.remove();
      if (root._ecosystemSliderInstance === instance) delete root._ecosystemSliderInstance;
    };

    const style = getComputedStyle(root);
    const rotateStep = Math.abs(parseFloat(style.getPropertyValue("--slider-rotate"))) || 18;
    const collectionRect = collection.getBoundingClientRect();
    const firstRect = originalItems[0].getBoundingClientRect();
    // A hidden panel gets a listener and a state object, but no zero-size geometry.
    if (!collectionRect.width || !firstRect.width || !firstRect.height) return;
    const itemWidth = firstRect.width;
    const itemHeight = firstRect.height;
    const maxLoopItems = Math.max(1, Math.floor(360 / rotateStep));
    const originParts = getComputedStyle(originalItems[0]).transformOrigin.split(" ");
    const originY = parseFloat(originParts[1]) || itemHeight * 3.75;
    const wheelRadius = Math.max(0, originY - itemHeight / 2);
    const proxyRadius = wheelRadius + Math.max(itemWidth, itemHeight) * 0.525;
    const getBoundsAtAngle = (angle) => {
      const radians = angle * Math.PI / 180;
      return {
        x: Math.sin(radians) * wheelRadius,
        y: originY - Math.cos(radians) * wheelRadius,
        halfWidth: Math.abs(Math.cos(radians)) * itemWidth / 2
          + Math.abs(Math.sin(radians)) * itemHeight / 2,
        halfHeight: Math.abs(Math.sin(radians)) * itemWidth / 2
          + Math.abs(Math.cos(radians)) * itemHeight / 2,
      };
    };
    const isOffsetInsideContainer = (offset) => {
      const containerRect = root.getBoundingClientRect();
      const trackRect = list.getBoundingClientRect();
      const originX = trackRect.left + trackRect.width / 2;
      const bounds = getBoundsAtAngle(offset * rotateStep);
      return bounds.x + bounds.halfWidth >= containerRect.left - originX
        && bounds.x - bounds.halfWidth <= containerRect.right - originX
        && bounds.y + bounds.halfHeight >= containerRect.top - trackRect.top
        && bounds.y - bounds.halfHeight <= containerRect.bottom - trackRect.top;
    };
    const visibleOffsets = [0];
    const maxSide = Math.ceil(maxLoopItems / 2);
    let leftEdge = 0;
    let rightEdge = 0;
    for (let i = 1; i <= maxSide && isOffsetInsideContainer(i); i += 1) {
      visibleOffsets.push(i); rightEdge = i;
    }
    for (let i = 1; i <= maxSide && isOffsetInsideContainer(-i); i += 1) {
      visibleOffsets.unshift(-i); leftEdge = -i;
    }
    if (Math.abs(leftEdge - 1) <= maxSide) visibleOffsets.unshift(leftEdge - 1);
    if (Math.abs(rightEdge + 1) <= maxSide) visibleOffsets.push(rightEdge + 1);
    const neededItems = Math.ceil(
      Math.min(maxLoopItems, Math.max(originalItems.length, visibleOffsets.length))
      / originalItems.length,
    ) * originalItems.length;
    for (let i = originalItems.length; i < neededItems; i += 1) {
      const clone = originalItems[i % originalItems.length].cloneNode(true);
      clone.setAttribute("data-radial-slider-clone", "");
      clone.setAttribute("aria-hidden", "true");
      clone.tabIndex = -1;
      list.appendChild(clone);
    }
    const items = [...list.querySelectorAll(":scope > [data-radial-slider-item]")];
    const totalItems = items.length;
    list.style.height = `${itemHeight}px`;
    root.setAttribute("role", "region");
    root.setAttribute("aria-roledescription", "carousel");
    root.setAttribute("aria-label", root.getAttribute("aria-label") || "Ecosystem cards");
    list.setAttribute("role", "group");
    list.setAttribute("aria-label", "Slides");
    controls.forEach((control) => {
      control.disabled = false;
      control.setAttribute("aria-label", control.dataset.radialSliderControl === "prev"
        ? "Previous slide" : "Next slide");
    });
    originalItems.forEach((item, index) => {
      item.setAttribute("aria-label", `Slide ${index + 1} of ${originalItems.length}`);
    });
    items.filter((item) => item.hasAttribute("data-radial-slider-clone")).forEach((item) => {
      item.setAttribute("aria-hidden", "true"); item.tabIndex = -1;
    });

    const containerRect = root.getBoundingClientRect();
    const trackRect = list.getBoundingClientRect();
    const proxyWrap = document.createElement("div");
    proxyWrap.setAttribute("data-radial-slider-proxy-wrap", "");
    Object.assign(proxyWrap.style, {
      position: "absolute", left: `${containerRect.left - collectionRect.left}px`,
      top: `${containerRect.top - collectionRect.top}px`, width: `${containerRect.width}px`,
      height: `${containerRect.height}px`, overflow: "hidden", pointerEvents: "none",
    });
    const proxy = document.createElement("div");
    proxy.setAttribute("data-radial-slider-proxy", "");
    Object.assign(proxy.style, {
      position: "absolute", width: `${proxyRadius * 2}px`, height: `${proxyRadius * 2}px`,
      left: `${trackRect.left + trackRect.width / 2 - containerRect.left}px`,
      top: `${trackRect.top - containerRect.top + originY - proxyRadius}px`,
      transform: "translateX(-50%)", borderRadius: "50%", pointerEvents: "auto", opacity: "0",
    });
    proxyWrap.appendChild(proxy); collection.appendChild(proxyWrap);
    instance.proxy = proxy; instance.proxyWrap = proxyWrap;
    gsap.set(proxy, { rotation: 0 });

    const setRotation = items.map((item) => gsap.quickSetter(item, "rotation", "deg"));
    const getIndexFromProxy = () => -Number(gsap.getProperty(proxy, "rotation")) / rotateStep;
    const nearestDelta = (index, realIndex, total) => {
      const loop = Math.round((realIndex - index) / total);
      return index - (realIndex - loop * total);
    };
    const render = () => {
      const realIndex = getIndexFromProxy();
      const activeIndex = mod(Math.round(realIndex), totalItems);
      instance.activeIndex = activeIndex;
      items.forEach((item, index) => {
        setRotation[index](nearestDelta(index, realIndex, totalItems) * rotateStep);
        const active = index === activeIndex;
        item.setAttribute("data-radial-slider-item-status", active ? "active" : "inview");
        item.tabIndex = active && !item.hasAttribute("data-radial-slider-clone") ? 0 : -1;
        item.setAttribute("aria-current", active ? "true" : "false");
      });
    };
    const goTo = (targetIndex, duration = instance.reduced ? 0 : 1) => {
      gsap.killTweensOf(proxy);
      instance.arrowTween = gsap.to(proxy, {
        rotation: -targetIndex * rotateStep,
        duration, ease: "radial", overwrite: true, onUpdate: render, onComplete: render,
      });
    };
    const onClick = (event) => {
      const item = event.target.closest?.("a[data-radial-slider-item]");
      if (!item || !root.contains(item)) return;
      if (instance.movedSincePress) { event.preventDefault(); return; }
      const itemIndex = items.indexOf(item);
      if (itemIndex < 0 || itemIndex === instance.activeIndex) return;
      event.preventDefault();
      goTo(getIndexFromProxy() + nearestDelta(itemIndex, getIndexFromProxy(), totalItems));
    };
    const onKeyDown = (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      goTo(Math.round(getIndexFromProxy()) + (event.key === "ArrowRight" ? 1 : -1));
    };
    listen(root, "click", onClick, true); listen(root, "keydown", onKeyDown);
    controls.forEach((control) => listen(control, "click", () => goTo(
      Math.round(getIndexFromProxy()) + (control.dataset.radialSliderControl === "next" ? 1 : -1),
    )));
    instance.draggable = Draggable.create(proxy, {
      type: "rotation", trigger: [proxy, ...items], inertia: !instance.reduced,
      allowEventDefault: true,
      throwResistance: 2000, dragResistance: 0.05, maxDuration: 1, minDuration: 0.5,
      edgeResistance: 0.75, overshootTolerance: 0, minimumMovement: 4,
      snap: (value) => Math.round(value / rotateStep) * rotateStep,
      onPress: () => {
        instance.movedSincePress = false; gsap.killTweensOf(proxy);
        root.setAttribute("data-radial-slider-drag-status", "grabbing");
      },
      onDragStart: () => {
        instance.movedSincePress = true; root.setAttribute("data-radial-slider-drag-status", "grabbing");
      },
      onDrag: render, onThrowUpdate: render,
      onRelease: () => {
        root.setAttribute("data-radial-slider-drag-status", "grab");
        if (instance.reduced) goTo(Math.round(getIndexFromProxy()), 0);
      },
      onDragEnd: () => root.setAttribute("data-radial-slider-drag-status", "grab"),
      onThrowComplete: () => { root.setAttribute("data-radial-slider-drag-status", "grab"); render(); },
    })[0];
    render();
    instance.revealTrigger = ScrollTrigger.create({ trigger: root, start: "top 80%", once: true, onEnter: instance.reveal });
  });
}

function bindResize() {
  initEcosystemSlider._resize?.();
  let timer;
  let lastWidth = window.innerWidth;
  const onResize = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (window.innerWidth === lastWidth) return;
      lastWidth = window.innerWidth;
      initEcosystemSlider();
    }, RESIZE_DEBOUNCE);
  };
  window.addEventListener("resize", onResize);
  initEcosystemSlider._resize = () => { window.removeEventListener("resize", onResize); clearTimeout(timer); };
}

export { initEcosystemSlider };
