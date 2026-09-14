import { getLocomotiveScroll } from "../lib/locomotive.js";

const CLOSE_TRANSITION_MS = 700;

export function initHamburgerNav() {
  document.querySelectorAll("[data-nav-init]").forEach((root) => {
    root._hamburgerNavInstance?.destroy();

    const statusRoot = root.closest("[data-navigation-status]") ||
      document.querySelector("[data-navigation-status]");
    const menuToggle = root.querySelector('[data-navigation-toggle="toggle"]');
    const panel = root.querySelector(".nav_panel");
    const accordion = root.querySelector("[data-accordion-css-init]");

    if (!statusRoot || !menuToggle || !panel || !accordion) return;

    const closeToggles = [
      ...root.querySelectorAll('[data-navigation-toggle="close"]'),
    ];
    const accordionToggles = [
      ...accordion.querySelectorAll("[data-accordion-toggle]"),
    ];
    const closeSiblings = accordion.getAttribute("data-accordion-close-siblings") === "true";
    let resetTimer;

    const isActive = () => statusRoot.getAttribute("data-navigation-status") === "active";
    const syncAria = () => {
      const active = isActive();
      menuToggle.setAttribute("aria-expanded", String(active));
      panel.setAttribute("aria-hidden", String(!active));
      accordionToggles.forEach((toggle) => {
        const item = toggle.closest("[data-accordion-status]");
        toggle.setAttribute(
          "aria-expanded",
          String(item?.getAttribute("data-accordion-status") === "active"),
        );
      });
    };

    const setScrollState = (active) => {
      const scroll = getLocomotiveScroll();
      if (active) scroll?.stop?.();
      else scroll?.start?.();
    };

    const resetAccordion = () => {
      accordion.querySelectorAll('[data-accordion-status="active"]').forEach((item) => {
        item.setAttribute("data-accordion-status", "not-active");
      });
      syncAria();
    };

    const setNavigationStatus = (nextStatus) => {
      clearTimeout(resetTimer);
      statusRoot.setAttribute("data-navigation-status", nextStatus);
      const active = nextStatus === "active";
      setScrollState(active);
      syncAria();
      if (!active) resetTimer = setTimeout(resetAccordion, CLOSE_TRANSITION_MS);
    };

    const onToggleClick = (event) => {
      event.preventDefault();
      setNavigationStatus(isActive() ? "not-active" : "active");
    };
    const onCloseClick = (event) => {
      if (event.target.closest("a")) event.preventDefault();
      setNavigationStatus("not-active");
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape" && isActive()) setNavigationStatus("not-active");
    };
    const onAccordionClick = (event) => {
      const toggle = event.target.closest("[data-accordion-toggle]");
      if (!toggle || !accordion.contains(toggle)) return;
      event.preventDefault();

      const item = toggle.closest("[data-accordion-status]");
      if (!item) return;
      const opening = item.getAttribute("data-accordion-status") !== "active";
      if (opening && closeSiblings) {
        accordion.querySelectorAll('[data-accordion-status="active"]').forEach((sibling) => {
          if (sibling !== item) sibling.setAttribute("data-accordion-status", "not-active");
        });
      }
      item.setAttribute("data-accordion-status", opening ? "active" : "not-active");
      syncAria();
    };
    const onAnchorClickCapture = (event) => {
      const link = event.target.closest('a[href^="#"][data-scroll-to]');
      if (!link || !root.contains(link)) return;
      setNavigationStatus("not-active");
      if (link.getAttribute("href") === "#") event.preventDefault();
    };

    menuToggle.addEventListener("click", onToggleClick);
    closeToggles.forEach((toggle) => toggle.addEventListener("click", onCloseClick));
    accordion.addEventListener("click", onAccordionClick);
    root.addEventListener("click", onAnchorClickCapture, true);
    document.addEventListener("keydown", onKeyDown);
    syncAria();

    root._hamburgerNavInstance = {
      destroy() {
        clearTimeout(resetTimer);
        menuToggle.removeEventListener("click", onToggleClick);
        closeToggles.forEach((toggle) => toggle.removeEventListener("click", onCloseClick));
        accordion.removeEventListener("click", onAccordionClick);
        root.removeEventListener("click", onAnchorClickCapture, true);
        document.removeEventListener("keydown", onKeyDown);
      },
    };
  });
}

