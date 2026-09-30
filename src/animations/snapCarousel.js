const MOBILE_MAX_WIDTH = 767;

function isMobile() {
  return window.innerWidth <= MOBILE_MAX_WIDTH;
}

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
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
  window.removeEventListener("resize", previous.onResize);
  if (previous.raf) cancelAnimationFrame(previous.raf);
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
    const onResize = scheduleUpdate;
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

      hub.scrollTo({
        left: positions[target],
        behavior: prefersReducedMotion() ? "auto" : "smooth",
      });
      scheduleUpdate();
    };

    buttons.forEach((entry) => {
      entry.onClick = onClick;
      entry.button.addEventListener("click", onClick);
    });
    hub.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);

    root._snapCarousel = {
      hub,
      buttons,
      onScroll,
      onResize,
      raf,
    };
    update();
  });
}
