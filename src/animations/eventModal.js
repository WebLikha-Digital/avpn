import { lockScroll } from "../lib/scrollLock.js";

const GROUP_SELECTOR = "[data-modal-group-status]";
const TRIGGER_SELECTOR = 'a[data-modal-target]';
const CARD_SELECTOR = "[data-modal-name]";
const CLOSE_SELECTOR = "[data-modal-close]";

export function initEventModal() {
  document.querySelectorAll(GROUP_SELECTOR).forEach((group) => {
    group._eventModalInstance?.destroy();

    const cards = [...group.querySelectorAll(CARD_SELECTOR)];
    const triggers = [...document.querySelectorAll(TRIGGER_SELECTOR)];
    const backdrop = group.querySelector(`${CLOSE_SELECTOR}:not(button)`);
    if (!cards.length || !triggers.length || !backdrop) return;

    const cardsByName = new Map(
      cards.map((card) => [card.getAttribute("data-modal-name"), card]),
    );
    const validTriggers = triggers.filter((trigger) =>
      cardsByName.has(trigger.getAttribute("data-modal-target")),
    );
    if (!validTriggers.length) return;

    let activeTrigger;
    let unlockScroll;

    const setTriggerState = (trigger, active) => {
      trigger.setAttribute("data-modal-status", active ? "active" : "not-active");
      trigger.setAttribute("aria-expanded", String(active));
    };

    const setCardState = (card, active) => {
      card.setAttribute("data-modal-status", active ? "active" : "not-active");
      card.setAttribute("aria-hidden", String(!active));
    };

    const setA11y = () => {
      group.setAttribute("aria-hidden", "true");
      cards.forEach((card) => {
        card.setAttribute("role", "dialog");
        card.setAttribute("aria-modal", "true");
        const heading = card.querySelector("h1, h2, h3, h4, h5, h6");
        if (heading) {
          if (!heading.id) heading.id = `event-modal-${card.dataset.modalName}-title`;
          card.setAttribute("aria-labelledby", heading.id);
        }
        const closeButton = card.querySelector('button[data-modal-close]');
        if (closeButton) {
          closeButton.type = "button";
          closeButton.setAttribute("aria-label", closeButton.getAttribute("aria-label") || "Close");
        }
        setCardState(card, false);
      });
      validTriggers.forEach((trigger) => setTriggerState(trigger, false));
    };

    const close = () => {
      if (!activeTrigger) return;
      cards.forEach((card) => setCardState(card, false));
      validTriggers.forEach((trigger) => setTriggerState(trigger, false));
      group.setAttribute("data-modal-group-status", "not-active");
      group.setAttribute("aria-hidden", "true");
      const triggerToRestore = activeTrigger;
      activeTrigger = undefined;
      if (unlockScroll) {
        unlockScroll();
        unlockScroll = undefined;
      }
      triggerToRestore.focus();
    };

    const open = (trigger) => {
      const card = cardsByName.get(trigger.getAttribute("data-modal-target"));
      if (!card) return;

      cards.forEach((item) => setCardState(item, item === card));
      validTriggers.forEach((item) => setTriggerState(item, item === trigger));
      group.setAttribute("data-modal-group-status", "active");
      group.removeAttribute("aria-hidden");
      if (!unlockScroll) unlockScroll = lockScroll({ className: "is-modal-open" });
      activeTrigger = trigger;
      card.querySelector('button[data-modal-close]')?.focus();
    };

    const onTriggerClick = (event) => {
      event.preventDefault();
      open(event.currentTarget);
    };
    const onCloseClick = (event) => {
      const closeTarget = event.target.closest(CLOSE_SELECTOR);
      if (closeTarget && group.contains(closeTarget)) close();
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape" && activeTrigger) close();
    };

    setA11y();
    validTriggers.forEach((trigger) => trigger.addEventListener("click", onTriggerClick));
    group.addEventListener("click", onCloseClick);
    document.addEventListener("keydown", onKeyDown);
    group._eventModalInstance = {
      destroy() {
        validTriggers.forEach((trigger) => trigger.removeEventListener("click", onTriggerClick));
        group.removeEventListener("click", onCloseClick);
        document.removeEventListener("keydown", onKeyDown);
        close();
        if (group._eventModalInstance === this) delete group._eventModalInstance;
      },
    };
  });
}
