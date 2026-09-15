import { gsap, Flip } from "../lib/gsap.js";

const DEFAULT_FAN = 8;
const DEFAULT_SPEED = 60;
const FOLDER_PATH = "M-2,151 a16,16 0 0 1 16,-16 h247 c26.6,0 59.3,59 76,59 h149 a32,32 0 0 1 32,32 v368 a32,32 0 0 1 -32,32 h-456 a32,32 0 0 1 -32,-32 Z";

/**
 * Two coordinated publication decks for the ecosystem sandbox/Webflow contract.
 * The cards remain ordinary links in the expanded state and are only removed
 * from the tab order while their containing folder is the keyboard target.
 */
export function initEcosystemFolders() {
  document.querySelectorAll("[data-folders-init]").forEach((group) => {
    teardown(group);
    const roots = [...group.querySelectorAll(":scope > [data-deck-init]")];
    if (!roots.length) return;

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const instance = { group, decks: [], reduced, listeners: [], active: null };
    group._ecosystemFoldersInstance = instance;

    const listen = (target, type, handler, options) => {
      target.addEventListener(type, handler, options);
      instance.listeners.push(() => target.removeEventListener(type, handler, options));
    };
    const setGroupState = (state, active) => {
      group.dataset.foldersState = state;
      if (active) group.dataset.foldersActive = active;
      else group.removeAttribute("data-folders-active");
    };

    roots.forEach((root) => {
      const folder = root.querySelector("[data-deck-folder]");
      const panel = root.querySelector("[data-deck-panel]");
      const viewport = root.querySelector("[data-deck-viewport]");
      const track = root.querySelector("[data-deck-track]");
      const collapse = root.querySelector("[data-deck-collapse]");
      const hint = root.querySelector("[data-deck-hint]");
      const cards = [...root.querySelectorAll(":scope [data-deck-card]")];
      if (!folder || !viewport || !track || !cards.length) return;

      const deck = {
        root, folder, panel, viewport, track, collapse, hint, cards,
        reduced, paused: false, offset: 0, setWidth: 0, ticker: null,
        tween: null, hoverTween: null, listeners: [],
      };
      instance.decks.push(deck);
      root._ecosystemDeckInstance = deck;
      root.dataset.deckState = "stacked";
      folder.setAttribute("role", "button");
      folder.tabIndex = 0;
      folder.setAttribute("aria-expanded", "false");
      folder.setAttribute("aria-label", `Reveal ${root.dataset.deckInit} publications`);
      const count = root.querySelector("[data-deck-count]");
      if (count) count.textContent = cards.length;
      const meta = root.querySelector("[data-deck-meta]");
      if (meta && !meta.textContent.trim()) meta.textContent = root.dataset.deckMeta || "";
      const localListen = (target, type, handler, options) => {
        target.addEventListener(type, handler, options);
        deck.listeners.push(() => target.removeEventListener(type, handler, options));
      };
      const setHint = (state) => {
        if (hint) hint.textContent = hint.dataset[`deckHint${state[0].toUpperCase()}${state.slice(1)}`] || "";
      };
      const stack = (finalize = true) => {
        deck.tween?.kill();
        deck.tween = null;
        stopMarquee(deck);
        track.style.display = "block";
        track.style.position = "relative";
        const styles = getComputedStyle(root);
        const fan = number(styles.getPropertyValue("--deck-fan"), DEFAULT_FAN);
        const cardScale = number(styles.getPropertyValue("--deck-card-scale"), 0.62);
        cards.forEach((card, index) => {
          const depth = Math.min(index, 6);
          const side = depth % 2 ? 1 : -1;
          gsap.set(card, {
            position: "absolute", left: "50%", top: "50%", xPercent: -50, yPercent: -50,
            x: side * Math.min(6 * depth, 42), y: depth * 3,
            rotation: depth ? side * Math.min(fan, 8) * (depth / 6) : 0,
            scale: cardScale * (1 - depth * 0.006), zIndex: cards.length - index,
            clearProps: "right,bottom,boxShadow",
          });
          card.tabIndex = -1;
        });
        if (!finalize) return;
        root.dataset.deckState = "stacked";
        folder.setAttribute("aria-expanded", "false");
        folder.tabIndex = 0;
        setHint("stacked");
        if (collapse) collapse.hidden = true;
        viewport.style.overflowX = "";
      };
      const row = () => {
        track.style.display = "flex";
        track.style.position = "relative";
        cards.forEach((card) => {
          gsap.set(card, { clearProps: "all" });
          card.style.position = "relative";
          card.style.left = "";
          card.style.top = "";
          card.style.transform = "";
          card.tabIndex = 0;
        });
      };
      const finishExpand = () => {
        if (root.dataset.deckState !== "expanding") return;
        root.dataset.deckState = "expanded";
        folder.setAttribute("aria-expanded", "true");
        folder.removeAttribute("tabindex");
        folder.removeAttribute("role");
        cards.forEach((card) => card.removeAttribute("tabindex"));
        setHint("expanded");
        if (collapse) collapse.hidden = false;
        viewport.style.overflowX = deck.reduced ? "auto" : "hidden";
        if (!deck.reduced) startMarquee(deck);
      };
      const expand = () => {
        if (group.dataset.foldersState !== "stacked" || root.dataset.deckState !== "stacked") return;
        const other = instance.decks.find((candidate) => candidate !== deck);
        setGroupState("expanding", root.dataset.deckInit);
        instance.active = deck;
        deck.hoverTween?.kill();
        gsap.set([root, panel], { clearProps: "y,yPercent" });
        other?.root.setAttribute("data-deck-state", "inactive");
        other?.root.classList.add("is-ecosystem-deck-hidden");
        if (other && !deck.reduced) {
          const currentLeft = root.getBoundingClientRect().left;
          other.root.hidden = true;
          const singleDeckLeft = root.getBoundingClientRect().left;
          other.root.hidden = false;
          const layoutShift = singleDeckLeft - currentLeft;
          if (layoutShift) gsap.to(root, { x: layoutShift, duration: 0.25, ease: "power1.inOut" });
        }
        const beginExpand = () => {
          if (group.dataset.foldersState !== "expanding") return;
          if (other) other.root.hidden = true;
          if (deck.reduced) {
            root.dataset.deckState = "expanding";
            row();
            finishExpand();
            setGroupState("expanded", root.dataset.deckInit);
            return;
          }
          gsap.set(root, { clearProps: "x" });
          const state = Flip.getState(cards);
          root.dataset.deckState = "expanding";
          row();
          if (panel) gsap.to(panel, { opacity: 0, duration: 0.35, ease: "power2.out" });
          deck.tween = Flip.from(state, {
            absolute: true, scale: true,
            duration: 0.75,
            stagger: { amount: Math.min(0.4, cards.length * 0.08) },
            ease: "power2.inOut",
            onComplete: () => {
              gsap.set(root, { clearProps: "transform" });
              gsap.set([deck.folder, deck.panel], { clearProps: "opacity,scale" });
              finishExpand();
              setGroupState("expanded", root.dataset.deckInit);
            },
          });
        };
        if (!other || deck.reduced) {
          beginExpand();
          return;
        }
        gsap.to(other.root, { opacity: 0, scale: 0.92, duration: 0.25, onComplete: beginExpand });
      };
      const collapseDeck = (instant = false) => {
        if (instance.active !== deck || !["expanded", "expanding", "collapsing"].includes(root.dataset.deckState)) return;
        deck.tween?.kill();
        deck.hoverTween?.kill();
        gsap.set([root, panel], { clearProps: "y,yPercent" });
        const state = deck.reduced ? null : Flip.getState(cards);
        root.dataset.deckState = "collapsing";
        setGroupState("collapsing", root.dataset.deckInit);
        const other = instance.decks.find((candidate) => candidate !== deck);
        if (instant || deck.reduced) {
          if (panel) gsap.set(panel, { clearProps: "opacity" });
          stopMarquee(deck);
          stack();
          if (other) { other.root.hidden = false; other.root.classList.remove("is-ecosystem-deck-hidden"); gsap.set(other.root, { clearProps: "opacity,scale" }); stackDeck(other); }
          root.hidden = false;
          instance.active = null;
          setGroupState("stacked");
          folder.focus();
          return;
        }
        stack(false);
        if (panel) gsap.to(panel, { opacity: 1, duration: 0.35, ease: "power2.out" });
        deck.tween = Flip.from(state, {
          absolute: true, scale: true, duration: 0.65,
          stagger: { amount: Math.min(0.3, cards.length * 0.06) }, ease: "power2.inOut",
          onComplete: () => {
            stack();
            if (other) {
              // Mirror of the expand compensation: un-hiding the other deck
              // re-centres the row, so slide this deck from where it was
              // instead of letting it snap.
              const centredLeft = root.getBoundingClientRect().left;
              other.root.hidden = false;
              other.root.classList.remove("is-ecosystem-deck-hidden");
              const layoutShift = centredLeft - root.getBoundingClientRect().left;
              if (layoutShift) gsap.fromTo(root, { x: layoutShift }, { x: 0, duration: 0.25, ease: "power1.inOut", clearProps: "x" });
              gsap.fromTo(other.root, { opacity: 0, scale: 0.92 }, { opacity: 1, scale: 1, duration: 0.35, onComplete: () => { stackDeck(other); } });
            }
            instance.active = null;
            setGroupState("stacked");
            folder.focus();
          },
        });
      };
      deck._collapse = collapseDeck;
      deck.collapseDeck = collapseDeck;
      if (window.matchMedia?.("(hover: hover)").matches) {
        localListen(folder, "pointerenter", () => {
          if (root.dataset.deckState !== "stacked") return;
          deck.hoverTween?.kill();
          deck.hoverTween = gsap.timeline().to(root, { y: -6, duration: 0.3, ease: "power2.out" })
            .to(panel, { yPercent: 6, duration: 0.3, ease: "power2.out" }, 0)
            .to(cards, { y: "-=40", x: (index) => (index % 2 ? 1 : -1) * Math.min(index * 7, 42), rotation: (index) => (index % 2 ? 1 : -1) * Math.min(8, index + 1), duration: 0.45, stagger: 0.025, ease: "power3.out" }, 0);
        });
        localListen(folder, "pointerleave", () => {
          deck.hoverTween?.reverse();
        });
      }
      localListen(folder, "click", (event) => { event.preventDefault(); expand(); });
      localListen(folder, "keydown", (event) => {
        if (["Enter", " "].includes(event.key)) { event.preventDefault(); expand(); }
      });
      localListen(collapse, "click", () => collapseDeck());
      localListen(viewport, "pointerenter", () => { deck.paused = true; });
      localListen(viewport, "pointerleave", () => { deck.paused = false; });
      localListen(viewport, "focusin", () => { deck.paused = true; });
      localListen(viewport, "focusout", (event) => { if (!viewport.contains(event.relatedTarget)) deck.paused = false; });
      deck.stack = stack;
      stack();
    });

    listen(document, "keydown", (event) => {
      if (event.key === "Escape" && instance.active) instance.active.collapseDeck?.();
    });
    instance.decks.forEach((deck) => {
      deck.collapse = deck.collapse || null;
      deck.folder?.setAttribute("aria-controls", `${group.id || "ecosystem-folders"}-${deck.root.dataset.deckInit}`);
    });
    // The closure above owns the normal collapse path; expose it for Escape and teardown.
    instance.decks.forEach((deck) => { deck.collapse = deck.root.querySelector("[data-deck-collapse]"); });
    const activeCollapse = () => instance.active?.collapseDeck?.();
    instance.activeCollapse = activeCollapse;
    setGroupState("stacked");
  });

  initEcosystemFolders._resize?.remove();
  let lastWidth = window.innerWidth;
  let timer;
  const onResize = () => {
    if (window.innerWidth === lastWidth) return;
    lastWidth = window.innerWidth;
    clearTimeout(timer);
    timer = setTimeout(() => {
      document.querySelectorAll("[data-folders-init]").forEach((group) => {
        const instance = group._ecosystemFoldersInstance;
        instance?.decks.forEach((deck) => {
          if (deck.root.dataset.deckState === "stacked") deck.stack?.();
          else if (deck.root.dataset.deckState === "expanded") { stopMarquee(deck); if (!instance.reduced) startMarquee(deck); }
        });
      });
    }, 120);
  };
  window.addEventListener("resize", onResize);
  initEcosystemFolders._resize = { remove() { clearTimeout(timer); window.removeEventListener("resize", onResize); } };
}

function stackDeck(deck) { deck.stack?.(); }

function startMarquee(deck) {
  if (deck.reduced) return;
  removeClones(deck.root);
  const speed = number(getComputedStyle(deck.root).getPropertyValue("--deck-speed"), DEFAULT_SPEED);
  const originalsWidth = deck.cards.reduce((total, card) => total + card.getBoundingClientRect().width, 0) + Math.max(0, deck.cards.length - 1) * gap(deck.track);
  const fragment = document.createDocumentFragment();
  let width = originalsWidth;
  do {
    deck.cards.forEach((card) => { const clone = card.cloneNode(true); clone.dataset.deckClone = ""; clone.setAttribute("aria-hidden", "true"); clone.tabIndex = -1; fragment.appendChild(clone); });
    width += originalsWidth;
  } while (width < deck.viewport.clientWidth * 2);
  deck.track.appendChild(fragment);
  deck.setWidth = originalsWidth;
  deck.offset = 0;
  deck.ticker = () => {
    if (deck.paused || !deck.setWidth) return;
    deck.offset = (deck.offset - speed * gsap.ticker.deltaRatio(60) / 60) % deck.setWidth;
    gsap.set(deck.track, { x: deck.offset });
  };
  gsap.ticker.add(deck.ticker, false, true);
}

function stopMarquee(deck) {
  if (deck.ticker) gsap.ticker.remove(deck.ticker);
  deck.ticker = null;
  deck.setWidth = 0;
  gsap.set(deck.track, { clearProps: "x" });
  removeClones(deck.root);
}

function removeClones(root) { root.querySelectorAll("[data-deck-clone]").forEach((clone) => clone.remove()); }
function number(value, fallback) { const parsed = Number.parseFloat(value); return Number.isFinite(parsed) ? parsed : fallback; }
function gap(track) { const styles = getComputedStyle(track); return number(styles.columnGap || styles.gap, 24); }
function teardown(group) {
  const instance = group._ecosystemFoldersInstance;
  if (!instance) return;
  instance.listeners?.forEach((remove) => remove());
  instance.decks?.forEach((deck) => { deck.tween?.kill(); stopMarquee(deck); deck.listeners?.forEach((remove) => remove()); });
  group._ecosystemFoldersInstance = null;
}
