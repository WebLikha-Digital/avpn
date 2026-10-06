const MOBILE_MAX_WIDTH = 767;

function isMobile() {
  return window.innerWidth <= MOBILE_MAX_WIDTH;
}

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function autoplayDelay(root) {
  const value = Number(root.getAttribute("data-snap-carousel-autoplay"));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function scrollPaddingLeft(hub) {
  const value = Number.parseFloat(getComputedStyle(hub).scrollPaddingLeft);
  return Number.isFinite(value) ? value : 0;
}

function snapPositions(hub, items) {
  const padding = scrollPaddingLeft(hub);
  return items.map((item) => Math.max(0, item.offsetLeft - padding));
}

function nearestIndex(scrollLeft, positions) {
  return positions.reduce(
    (nearest, position, index) =>
      Math.abs(position - scrollLeft) < Math.abs(positions[nearest] - scrollLeft)
        ? index
        : nearest,
    0,
  );
}

function setButtonState(button, disabled) {
  button.disabled = disabled;
  button.setAttribute("aria-disabled", String(disabled));
}

function teardown(root) {
  const previous = root._snapCarousel;
  if (!previous) return;

  previous.hub.removeEventListener("scroll", previous.onScroll);
  previous.hub.removeEventListener("scrollend", previous.onScrollEnd);
  previous.hub.removeEventListener("pointerdown", previous.onPointerStart);
  previous.hub.removeEventListener("touchstart", previous.onPointerStart);
  previous.hub.removeEventListener("wheel", previous.onWheel);
  window.removeEventListener("pointerup", previous.onPointerEnd);
  window.removeEventListener("pointercancel", previous.onPointerEnd);
  window.removeEventListener("touchend", previous.onPointerEnd);
  window.removeEventListener("touchcancel", previous.onPointerEnd);
  window.removeEventListener("resize", previous.onResize);
  document.removeEventListener("visibilitychange", previous.onVisibilityChange);
  if (previous.onMotionChange) {
    if (previous.motionQuery?.removeEventListener) {
      previous.motionQuery.removeEventListener("change", previous.onMotionChange);
    } else {
      previous.motionQuery?.removeListener?.(previous.onMotionChange);
    }
  }
  previous.intersectionObserver?.disconnect();
  if (previous.raf) cancelAnimationFrame(previous.raf);
  clearTimeout(previous.autoplayTimer);
  clearTimeout(previous.programmaticScrollTimer);
  previous.hub.removeEventListener("scroll", previous.onScrollActivity);
  previous.buttons.forEach(({ button, onClick }) =>
    button.removeEventListener("click", onClick),
  );
  root._snapCarousel = null;
}

/**
 * Pages a native mobile scroll-snap carousel one direct child at a time.
 *
 * Webflow contract:
 *   [data-snap-carousel]          carousel root
 *   [data-snap-carousel-track]    horizontal scroller; direct children are slides
 *   [data-snap-carousel-prev]     previous-card button
 *   [data-snap-carousel-next]     next-card button
 *   data-snap-carousel-autoplay    optional positive delay in milliseconds; mobile only
 */
export function initSnapCarousel() {
  document.querySelectorAll("[data-snap-carousel]").forEach((root) => {
    teardown(root);

    const hub = root.querySelector("[data-snap-carousel-track]");
    const previousButton = root.querySelector("[data-snap-carousel-prev]");
    const nextButton = root.querySelector("[data-snap-carousel-next]");
    if (!hub || !previousButton || !nextButton) return;

    const items = [...hub.children];
    if (!items.length) return;

    const buttons = [{ button: previousButton }, { button: nextButton }];

    buttons.forEach(({ button }) => {
      if (!button.hasAttribute("type")) button.setAttribute("type", "button");
    });

    let raf = 0;
    const autoplayInterval = autoplayDelay(root);
    const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    let autoplayTimer = 0;
    let programmaticScrollTimer = 0;
    let inViewport = false;
    let pointerActive = false;
    let programmaticScroll = false;

    const clearAutoplay = () => {
      clearTimeout(autoplayTimer);
      autoplayTimer = 0;
      if (root._snapCarousel) root._snapCarousel.autoplayTimer = 0;
    };

    const canAutoplay = () =>
      autoplayInterval > 0 &&
      isMobile() &&
      inViewport &&
      !document.hidden &&
      !prefersReducedMotion();

    const scheduleAutoplay = () => {
      clearAutoplay();
      if (!canAutoplay()) return;
      autoplayTimer = window.setTimeout(() => {
        autoplayTimer = 0;
        if (root._snapCarousel) root._snapCarousel.autoplayTimer = 0;
        if (!canAutoplay()) return;

        const positions = snapPositions(hub, items);
        const current = nearestIndex(hub.scrollLeft, positions);
        const target = current === items.length - 1 ? 0 : current + 1;
        beginProgrammaticScroll();
        hub.scrollTo({
          left: positions[target],
          behavior: prefersReducedMotion() ? "auto" : "smooth",
        });
        scheduleUpdate();
        scheduleAutoplay();
      }, autoplayInterval);
      if (root._snapCarousel) root._snapCarousel.autoplayTimer = autoplayTimer;
    };

    const markProgrammaticScrollComplete = () => {
      programmaticScroll = false;
      clearTimeout(programmaticScrollTimer);
      programmaticScrollTimer = 0;
      if (root._snapCarousel) root._snapCarousel.programmaticScrollTimer = 0;
    };

    const beginProgrammaticScroll = () => {
      programmaticScroll = true;
      clearTimeout(programmaticScrollTimer);
      programmaticScrollTimer = window.setTimeout(
        markProgrammaticScrollComplete,
        1000,
      );
      if (root._snapCarousel) {
        root._snapCarousel.programmaticScrollTimer = programmaticScrollTimer;
      }
    };

    const update = () => {
      raf = 0;
      if (root._snapCarousel) root._snapCarousel.raf = 0;
      if (!isMobile()) {
        // A mobile-to-desktop resize must not leave native button state behind
        // if the same DOM is later shown at the desktop breakpoint.
        buttons.forEach(({ button }) => {
          button.disabled = false;
          button.removeAttribute("aria-disabled");
        });
        return;
      }

      const positions = snapPositions(hub, items);
      const index = nearestIndex(hub.scrollLeft, positions);
      setButtonState(previousButton, index === 0);
      setButtonState(nextButton, index === items.length - 1);
    };

    const scheduleUpdate = () => {
      if (raf) return;
      raf = requestAnimationFrame(update);
      if (root._snapCarousel) root._snapCarousel.raf = raf;
    };

    const onScroll = scheduleUpdate;
    const onScrollActivity = () => {
      if (!programmaticScroll && !pointerActive) scheduleAutoplay();
    };
    const onScrollEnd = markProgrammaticScrollComplete;
    const onPointerStart = () => {
      pointerActive = true;
      markProgrammaticScrollComplete();
      clearAutoplay();
    };
    const onPointerEnd = () => {
      pointerActive = false;
      scheduleAutoplay();
    };
    const onWheel = () => {
      markProgrammaticScrollComplete();
      scheduleAutoplay();
    };
    const onResize = () => {
      scheduleUpdate();
      scheduleAutoplay();
    };
    const onClick = (event) => {
      event.preventDefault();
      if (!isMobile()) return;

      const positions = snapPositions(hub, items);
      const current = nearestIndex(hub.scrollLeft, positions);
      const direction = event.currentTarget === previousButton ? -1 : 1;
      const target = Math.min(
        items.length - 1,
        Math.max(0, current + direction),
      );

      beginProgrammaticScroll();
      hub.scrollTo({
        left: positions[target],
        behavior: prefersReducedMotion() ? "auto" : "smooth",
      });
      scheduleUpdate();
      scheduleAutoplay();
    };
    const onVisibilityChange = scheduleAutoplay;
    const onMotionChange = () => {
      scheduleUpdate();
      scheduleAutoplay();
    };

    buttons.forEach((entry) => {
      entry.onClick = onClick;
      entry.button.addEventListener("click", onClick);
    });
    hub.addEventListener("scroll", onScroll, { passive: true });
    hub.addEventListener("scroll", onScrollActivity, { passive: true });
    hub.addEventListener("scrollend", onScrollEnd, { passive: true });
    hub.addEventListener("pointerdown", onPointerStart, { passive: true });
    hub.addEventListener("touchstart", onPointerStart, { passive: true });
    hub.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("pointerup", onPointerEnd, { passive: true });
    window.addEventListener("pointercancel", onPointerEnd, { passive: true });
    window.addEventListener("touchend", onPointerEnd, { passive: true });
    window.addEventListener("touchcancel", onPointerEnd, { passive: true });
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibilityChange);
    if (motionQuery) {
      if (motionQuery.addEventListener) {
        motionQuery.addEventListener("change", onMotionChange);
      } else {
        motionQuery.addListener?.(onMotionChange);
      }
    }

    const intersectionObserver =
      autoplayInterval > 0 && "IntersectionObserver" in window
        ? new IntersectionObserver(([entry]) => {
            inViewport = entry.isIntersecting;
            scheduleAutoplay();
          })
        : null;
    intersectionObserver?.observe(root);

    root._snapCarousel = {
      hub,
      buttons,
      onScroll,
      onScrollActivity,
      onScrollEnd,
      onPointerStart,
      onPointerEnd,
      onWheel,
      onResize,
      onVisibilityChange,
      onMotionChange,
      motionQuery,
      intersectionObserver,
      autoplayTimer,
      programmaticScrollTimer,
      raf,
    };
    update();
  });
}
