import { gsap, SplitText } from "../lib/gsap.js";
import { lockScroll } from "../lib/scrollLock.js";

const GROUP_SELECTOR = "[data-modal-group-status]";
const TRIGGER_SELECTOR = 'a[data-modal-target]';
const CARD_SELECTOR = "[data-modal-name]";
const CLOSE_SELECTOR = "[data-modal-close]";
const REVEAL_EASE = "power3.out";
const LINE_EASE = "power4.out";

const unloadIframes = (card) => {
  card.querySelectorAll("iframe").forEach((iframe) => {
    const replacement = iframe.cloneNode(true);
    replacement.removeAttribute("src");
    iframe.replaceWith(replacement);
  });
};

const loadIframes = (card) => {
  card.querySelectorAll("iframe").forEach((iframe) => {
    const replacement = iframe.cloneNode(true);
    const source = iframe.getAttribute("data-src");
    replacement.removeAttribute("src");
    if (source !== null) replacement.setAttribute("src", source);
    iframe.replaceWith(replacement);
  });
};

const prepareIframes = (card) => {
  card.querySelectorAll("iframe").forEach((iframe) => {
    if (!iframe.hasAttribute("data-src") && iframe.hasAttribute("src")) {
      iframe.setAttribute("data-src", iframe.getAttribute("src"));
    }
  });
  unloadIframes(card);
};

const restoreNumber = (number) => {
  const original = number.dataset.modalOriginalNumber;
  if (original === undefined) return;
  number.textContent = original;
  number.removeAttribute("data-modal-original-number");
};

const setupNumber = (number) => {
  const original = number.textContent;
  number.dataset.modalOriginalNumber = original;
  number.setAttribute("aria-label", original);
  number.textContent = "";
  const styles = getComputedStyle(number);
  const fontSize = Number.parseFloat(styles.fontSize) || 16;
  const lineHeight = Number.parseFloat(styles.lineHeight);
  const ratio = Number.isFinite(lineHeight) ? lineHeight / fontSize : 1.2;
  const rollers = [];
  [...original].forEach((character) => {
    if (!/\d/.test(character)) {
      number.appendChild(document.createTextNode(character));
      return;
    }
    const mask = document.createElement("span");
    mask.className = "modal__odometer-mask";
    mask.setAttribute("aria-hidden", "true");
    mask.style.display = "inline-block";
    mask.style.overflow = "hidden";
    mask.style.verticalAlign = "bottom";
    mask.style.height = `${ratio}em`;
    mask.style.lineHeight = `${ratio}em`;
    const roller = document.createElement("span");
    roller.className = "modal__odometer-roller";
    roller.setAttribute("aria-hidden", "true");
    roller.style.display = "block";
    roller.style.whiteSpace = "pre";
    roller.style.willChange = "transform";
    roller.textContent = Array.from({ length: 20 }, (_, index) => index % 10).join("\n");
    mask.appendChild(roller);
    number.appendChild(mask);
    rollers.push({ roller, digit: Number(character), ratio });
  });
  return { number, rollers };
};

const makeSplit = (element, splits) => {
  if (!element || !element.textContent.trim()) return null;
  const split = SplitText.create(element, {
    type: "lines",
    mask: "lines",
    linesClass: "modal__text-line",
    autoSplit: false,
  });
  splits.push(split);
  split.lines.forEach((line) => { line.style.display = "block"; });
  gsap.set(split.lines, { yPercent: 110 });
  return split;
};

const clearRevealProps = (card) => {
  const targets = [
    card,
    ...card.querySelectorAll(
      ".modal__media, .modal__media > *, .modal__title, .modal__desc, .modal__meta-item, .modal__meta-icon, .modal__meta-text, .modal__meta-divider, .modal__stat, .modal__close, .modal__text-line, .modal__odometer-mask, .modal__odometer-roller",
    ),
  ];
  gsap.set(targets, { clearProps: "transform,opacity,clipPath,visibility" });
};

const createReveal = (card, instance) => {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const splits = [];
  const numbers = [...card.querySelectorAll(".modal__stat-number")];
  const odometers = reduced ? [] : numbers.map(setupNumber);
  const titleSplit = reduced ? null : makeSplit(card.querySelector(".modal__title"), splits);
  const descSplit = reduced ? null : makeSplit(card.querySelector(".modal__desc"), splits);
  const media = card.querySelector(".modal__media");
  const mediaInner = media?.firstElementChild;
  const metaItems = [...card.querySelectorAll(".modal__meta-item")];
  const metaIcons = metaItems.map((item) => item.querySelector(".modal__meta-icon")).filter(Boolean);
  const metaTexts = metaItems.map((item) => item.querySelector(".modal__meta-text")).filter(Boolean);
  const dividers = [...card.querySelectorAll(".modal__meta-divider")];
  const stats = [...card.querySelectorAll(".modal__stat")];
  const closeButton = card.querySelector("button[data-modal-close]");
  const originalTransition = card.style.transition;
  const clear = () => {
    instance.timeline?.kill();
    instance.timeline = null;
    splits.forEach((split) => split.revert());
    numbers.forEach(restoreNumber);
    clearRevealProps(card);
    card.style.transition = originalTransition;
  };
  if (reduced) {
    clearRevealProps(card);
    return { clear };
  }
  card.style.transition = "none";
  const timeline = gsap.timeline({ onComplete: clear });
  instance.timeline = timeline;
  timeline.fromTo(card, { opacity: 0, y: "2rem" }, { opacity: 1, y: 0, duration: 0.6, ease: REVEAL_EASE }, 0);
  if (media) timeline.fromTo(media, { clipPath: "inset(100% 0 0 0)" }, { clipPath: "inset(0% 0 0 0)", duration: 0.55, ease: "power2.out" }, 0.12);
  if (mediaInner) timeline.fromTo(mediaInner, { scale: 1.05 }, { scale: 1, duration: 0.65, ease: REVEAL_EASE }, 0.12);
  if (titleSplit) timeline.to(titleSplit.lines, { yPercent: 0, duration: 0.55, ease: LINE_EASE, stagger: 0.06 }, 0.48);
  if (metaIcons.length) timeline.fromTo(metaIcons, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.35, ease: "back.out(1.7)", stagger: 0.08 }, 0.7);
  if (metaTexts.length) timeline.fromTo(metaTexts, { y: "1em", opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: REVEAL_EASE, stagger: 0.08 }, 0.78);
  if (dividers.length) timeline.fromTo(dividers, { opacity: 0 }, { opacity: 1, duration: 0.25, ease: REVEAL_EASE }, 0.78);
  if (descSplit) timeline.to(descSplit.lines, { yPercent: 0, duration: 0.5, ease: LINE_EASE, stagger: 0.05 }, 0.72);
  stats.forEach((stat, index) => {
    const position = 0.86 + index * 0.1;
    timeline.fromTo(stat, { y: "1.5rem", opacity: 0 }, { y: 0, opacity: 1, duration: 0.42, ease: REVEAL_EASE }, position);
    odometers[index]?.rollers.forEach(({ roller, digit, ratio }, digitIndex) => {
      timeline.to(roller, { y: `${-(10 + digit) * ratio}em`, duration: 0.42, ease: "power3.out" }, position + 0.12 + digitIndex * 0.035);
    });
  });
  if (closeButton) timeline.fromTo(closeButton, { x: "1.25rem", opacity: 0 }, { x: 0, opacity: 1, duration: 0.35, ease: REVEAL_EASE }, 1.12);
  return { clear };
};

export function initEventModal() {
  document.querySelectorAll(GROUP_SELECTOR).forEach((group) => {
    group._eventModalInstance?.destroy();

    const cards = [...group.querySelectorAll(CARD_SELECTOR)];
    cards.forEach(prepareIframes);
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

    const instance = { reveal: null, timeline: null };

    const setTriggerState = (trigger, active) => {
      trigger.setAttribute("data-modal-status", active ? "active" : "not-active");
      trigger.setAttribute("aria-expanded", String(active));
    };

    const setCardState = (card, active) => {
      card.setAttribute("data-modal-status", active ? "active" : "not-active");
      card.setAttribute("aria-hidden", String(!active));
    };

    const stopReveal = (card) => {
      if (instance.reveal?.card !== card) return;
      instance.reveal.clear();
      instance.reveal = null;
    };

    const revealCard = (card) => {
      instance.reveal?.clear();
      instance.reveal = { card, ...createReveal(card, instance) };
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
      const activeCard = cardsByName.get(activeTrigger.getAttribute("data-modal-target"));
      if (activeCard) unloadIframes(activeCard);
      cards.forEach((card) => {
        stopReveal(card);
        setCardState(card, false);
      });
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

      instance.reveal?.clear();
      instance.reveal = null;
      cards.forEach((item) => {
        setCardState(item, item === card);
        if (item === card) loadIframes(item);
        else unloadIframes(item);
      });
      validTriggers.forEach((item) => setTriggerState(item, item === trigger));
      group.setAttribute("data-modal-group-status", "active");
      group.removeAttribute("aria-hidden");
      if (!unlockScroll) unlockScroll = lockScroll({ className: "is-modal-open" });
      activeTrigger = trigger;
      revealCard(card);
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
        instance.reveal?.clear();
        if (group._eventModalInstance === this) delete group._eventModalInstance;
      },
    };
  });
}
