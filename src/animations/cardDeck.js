import { gsap, Flip } from "../lib/gsap.js";

const DEFAULT_FAN = 3;
const DEFAULT_SPEED = 60;

/**
 * Expandable publication-card decks.
 *
 * Webflow contract:
 *   [data-deck-init]       deck root and state owner
 *   [data-deck-viewport]   clipped viewport and pause boundary
 *   [data-deck-track]      stack/row track
 *   [data-deck-card]       original links
 *   [data-deck-hint]       stacked/expanded hint output
 *   [data-deck-collapse]   collapse control
 *
 * Flip preserves measured stack geometry while the track changes to a flex
 * row. The root is a button only while stacked so the visible stack is one
 * keyboard control; expanded cards remain ordinary links. A complete clone
 * set is always added before checking viewport coverage because a deck wider
 * than the viewport still needs a second set at the modulo seam.
 */
export function initCardDeck() {
  document.querySelectorAll("[data-deck-init]").forEach((root) => {
    teardown(root);

    const viewport = root.querySelector("[data-deck-viewport]");
    const track = root.querySelector("[data-deck-track]");
    const collapseButton = root.querySelector("[data-deck-collapse]");
    const hint = root.querySelector("[data-deck-hint]");
    const cards = [...root.querySelectorAll("[data-deck-card]")];

    if (!viewport || !track || !cards.length) return;

    const reduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const speed = number(
      getComputedStyle(root).getPropertyValue("--deck-speed"),
      DEFAULT_SPEED,
    );
    const instance = {
      cards,
      viewport,
      track,
      collapseButton,
      hint,
      reduced,
      paused: false,
      offset: 0,
      setWidth: 0,
      ticker: null,
      tween: null,
      listeners: [],
    };

    root._deckInstance = instance;

    const listen = (target, type, handler, options) => {
      target.addEventListener(type, handler, options);
      instance.listeners.push(() => {
        target.removeEventListener(type, handler, options);
      });
    };

    const setState = (value) => {
      root.setAttribute("data-deck-state", value);
    };

    const setHint = (state) => {
      if (!hint) return;

      const key = `deckHint${state[0].toUpperCase()}${state.slice(1)}`;
      hint.textContent = hint.dataset[key] || "";
    };

    // Resting cards are absolute so every card shares the viewport centre.
    const stack = (finalize = true) => {
      removeClones(root);
      gsap.set(track, { clearProps: "x" });
      track.style.display = "block";
      track.style.position = "relative";

      const fan = number(
        getComputedStyle(root).getPropertyValue("--deck-fan"),
        DEFAULT_FAN,
      );

      cards.forEach((card, index) => {
        const depth = Math.min(index, 6);
        const magnitude = Math.min(fan * 0.6 * depth, 2 * fan);
        const rotation = depth === 0
          ? -fan
          : depth % 2
            ? magnitude
            : -magnitude;

        gsap.set(card, {
          position: "absolute",
          left: "50%",
          top: "50%",
          xPercent: -50,
          yPercent: -50,
          x: (depth % 2 ? 1 : -1) * 6 * depth,
          y: 3 * depth,
          rotation,
          scale: 1 - depth * 0.006,
          zIndex: cards.length - index,
          boxShadow: depth === 0 ? "" : "none",
          clearProps: "right,bottom",
        });
      });

      if (!finalize) return;

      root.removeAttribute("role");
      root.removeAttribute("tabindex");
      root.removeAttribute("aria-label");
      root.setAttribute("role", "button");
      root.tabIndex = 0;
      root.setAttribute("aria-label", "Reveal all cards");

      cards.forEach((card) => {
        card.tabIndex = -1;
      });

      if (collapseButton) collapseButton.hidden = true;
      if (reduced) viewport.style.overflowX = "hidden";
      setState("stacked");
      setHint("stacked");
    };

    const row = () => {
      track.style.display = "flex";
      track.style.position = "relative";

      cards.forEach((card) => {
        gsap.set(card, { clearProps: "boxShadow" });
        card.style.position = "relative";
        card.style.left = "";
        card.style.top = "";
        card.style.transform = "";
        card.tabIndex = 0;
      });
    };

    const expand = () => {
      if (root.dataset.deckState !== "stacked") return;

      setState("expanding");
      const flipState = reduced ? null : Flip.getState(cards);
      row();

      const finish = () => {
        setState("expanded");
        cards.forEach((card) => card.removeAttribute("tabindex"));
        root.removeAttribute("role");
        root.removeAttribute("tabindex");
        root.removeAttribute("aria-label");
        setHint("expanded");

        if (collapseButton) collapseButton.hidden = false;
        if (reduced) {
          viewport.style.overflowX = "auto";
          return;
        }

        startMarquee();
      };

      if (!flipState) {
        finish();
        return;
      }

      instance.tween = Flip.from(flipState, {
        duration: 0.75,
        stagger: { amount: Math.min(0.4, cards.length * 0.08) },
        ease: "smooth",
        absolute: true,
        onComplete: finish,
      });
    };

    const collapse = (instant = false) => {
      if (!["expanded", "expanding"].includes(root.dataset.deckState)) return;

      stopMarquee();
      setState("collapsing");

      if (instant || reduced) {
        stack();
        return;
      }

      const flipState = Flip.getState(cards);
      stack(false);
      instance.tween = Flip.from(flipState, {
        duration: 0.65,
        stagger: { amount: Math.min(0.3, cards.length * 0.06) },
        ease: "smooth",
        absolute: true,
        onComplete: stack,
      });
    };

    const startMarquee = () => {
      if (reduced) return;

      removeClones(root);
      const originalsWidth = cards.reduce(
        (total, card) => total + card.getBoundingClientRect().width,
        0,
      ) + (cards.length - 1) * gap(track);
      const fragment = document.createDocumentFragment();
      let width = originalsWidth;

      do {
        cards.forEach((card) => {
          const clone = card.cloneNode(true);
          clone.setAttribute("data-deck-clone", "");
          clone.setAttribute("aria-hidden", "true");
          clone.tabIndex = -1;
          fragment.appendChild(clone);
        });
        width += originalsWidth;
      } while (width < viewport.clientWidth * 2);

      track.appendChild(fragment);
      instance.setWidth = originalsWidth;
      instance.offset = 0;
      instance.paused = false;
      instance.ticker = () => {
        if (instance.paused || !instance.setWidth) return;

        instance.offset = (
          instance.offset - speed * gsap.ticker.deltaRatio(60) / 60
        ) % instance.setWidth;
        gsap.set(track, { x: instance.offset });
      };

      gsap.ticker.add(instance.ticker, false, true);
      setHint("expanded");
    };

    const stopMarquee = () => {
      if (instance.ticker) gsap.ticker.remove(instance.ticker);

      instance.ticker = null;
      instance.setWidth = 0;
      gsap.set(track, { clearProps: "x" });
      removeClones(root);
    };

    instance.relayout = () => {
      if (root.dataset.deckState === "stacked") {
        stack();
      } else if (root.dataset.deckState === "expanded") {
        stopMarquee();
        row();
        if (!reduced) startMarquee();
        else viewport.style.overflowX = "auto";
      }
    };

    const onClick = (event) => {
      if (root.dataset.deckState === "expanded") return;

      event.preventDefault();
      if (root.dataset.deckState === "stacked") expand();
    };

    const onKeyDown = (event) => {
      if (!["Enter", " "].includes(event.key)) return;
      if (root.dataset.deckState !== "stacked") return;

      event.preventDefault();
      expand();
    };

    listen(root, "click", onClick);
    listen(root, "keydown", onKeyDown);

    if (collapseButton) {
      listen(collapseButton, "click", () => collapse());
    }

    listen(viewport, "pointerenter", () => {
      instance.paused = true;
    });
    listen(viewport, "pointerleave", () => {
      instance.paused = false;
    });
    listen(viewport, "focusin", () => {
      instance.paused = true;
    });
    listen(viewport, "focusout", (event) => {
      if (!viewport.contains(event.relatedTarget)) instance.paused = false;
    });

    const tabsRoot = root.closest("[data-tabs-init]");
    if (tabsRoot) {
      listen(tabsRoot, "ecosystemtabs:change", () => {
        const panel = root.closest("[data-tabs-panel]");
        if (!panel) return;

        if (panel.hidden) collapse(true);
        else requestAnimationFrame(() => stack());
      });
    }

    stack();
  });

  initCardDeck._resize?.remove();
  let lastWidth = window.innerWidth;
  let timer;
  const onResize = () => {
    if (window.innerWidth === lastWidth) return;

    lastWidth = window.innerWidth;
    clearTimeout(timer);
    timer = setTimeout(() => {
      document.querySelectorAll("[data-deck-init]").forEach((root) => {
        root._deckInstance?.relayout();
      });
    }, 120);
  };

  window.addEventListener("resize", onResize);
  initCardDeck._resize = {
    remove() {
      clearTimeout(timer);
      window.removeEventListener("resize", onResize);
    },
  };
}

function number(value, fallback) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function gap(track) {
  const styles = getComputedStyle(track);
  return number(styles.columnGap || styles.gap, 24);
}

function removeClones(root) {
  root.querySelectorAll("[data-deck-clone]").forEach((clone) => clone.remove());
}

function teardown(root) {
  const instance = root._deckInstance;
  if (!instance) return;

  instance.tween?.kill();
  if (instance.ticker) gsap.ticker.remove(instance.ticker);
  instance.listeners?.forEach((remove) => remove());
  removeClones(root);
  root.querySelectorAll("[data-deck-card]").forEach((card) => {
    gsap.set(card, { clearProps: "all" });
  });
  root._deckInstance = null;
}
