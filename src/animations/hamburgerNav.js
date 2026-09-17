import { lockScroll } from "../lib/scrollLock.js";
import { initAccordion } from "./accordion.js";

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
    const accordionInstance = initAccordion(accordion);
    let resetTimer;
    let unlockScroll;

    const isActive = () => statusRoot.getAttribute("data-navigation-status") === "active";
    const syncAria = () => {
      const active = isActive();
      menuToggle.setAttribute("aria-expanded", String(active));
      panel.setAttribute("aria-hidden", String(!active));
      accordionInstance.syncAria();
    };

    const setScrollState = (active) => {
      if (active) {
        if (!unlockScroll) unlockScroll = lockScroll({ className: "is-nav-open" });
      } else if (unlockScroll) {
        unlockScroll();
        unlockScroll = undefined;
      }
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
    const onAnchorClickCapture = (event) => {
      const link = event.target.closest('a[href^="#"][data-scroll-to]');
      if (!link || !root.contains(link)) return;
      setNavigationStatus("not-active");
      if (link.getAttribute("href") === "#") event.preventDefault();
    };

    menuToggle.addEventListener("click", onToggleClick);
    closeToggles.forEach((toggle) => toggle.addEventListener("click", onCloseClick));
    root.addEventListener("click", onAnchorClickCapture, true);
    document.addEventListener("keydown", onKeyDown);
    syncAria();

    root._hamburgerNavInstance = {
      destroy() {
        clearTimeout(resetTimer);
        if (unlockScroll) unlockScroll();
        unlockScroll = undefined;
        menuToggle.removeEventListener("click", onToggleClick);
        closeToggles.forEach((toggle) => toggle.removeEventListener("click", onCloseClick));
        accordionInstance.destroy();
        root.removeEventListener("click", onAnchorClickCapture, true);
        document.removeEventListener("keydown", onKeyDown);
      },
    };
  });
}
