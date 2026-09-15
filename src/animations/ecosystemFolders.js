import { gsap, Flip, Draggable, InertiaPlugin } from "../lib/gsap.js";

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
    const dispatchCollapsed = (id) => {
      group.dispatchEvent(new CustomEvent("ecosystemfolders:collapsed", {
        bubbles: true,
        detail: { id },
      }));
    };

    roots.forEach((root) => {
      const folder = root.querySelector("[data-deck-folder]");
      const panel = root.querySelector("[data-deck-panel]");
      const bezel = root.querySelector("[data-deck-bezel]");
      // Everything that reads as the folder face: shell + panel, faded and pinned as one.
      const face = [bezel, panel].filter(Boolean);
      const viewport = root.querySelector("[data-deck-viewport]");
      const track = root.querySelector("[data-deck-track]");
      const collapse = root.querySelector("[data-deck-collapse]");
      const hint = root.querySelector("[data-deck-hint]");
      const cards = [...root.querySelectorAll(":scope [data-deck-card]")];
      if (!folder || !viewport || !track || !cards.length) return;

      const deck = {
        root, folder, panel, viewport, track, collapse, hint, cards,
        reduced, paused: false, offset: 0, setWidth: 0, ticker: null,
        tween: null, hoverTween: null, listeners: [], draggable: null,
        proxy: null, throwActive: false, dragPaused: false,
        movedSincePress: false, proxyX: 0, footerFadeTween: null,
      };
      deck.footer = [
        root.querySelector("[data-deck-title]"),
        hint,
        collapse,
      ].filter(Boolean);
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
      // Resting pose of a card in the stack; the hover fan and the collapse
      // settle both return to it with an ease-out of their own rather than a
      // reversed ease-out, which would read as ease-in.
      const stackPose = (index, fan) => {
        const depth = Math.min(index, 6);
        const side = depth % 2 ? 1 : -1;
        return { x: side * Math.min(6 * depth, 42), y: depth * 3, rotation: depth ? side * Math.min(fan, 8) * (depth / 6) : 0 };
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
          gsap.set(card, {
            position: "absolute", left: "50%", top: "50%", xPercent: -50, yPercent: -50,
            ...stackPose(index, fan),
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
        viewport.removeAttribute("data-deck-drag-status");
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
        if (face.length) gsap.set(face, { clearProps: "left,top,width,height,right,bottom" });
        folder.setAttribute("aria-expanded", "true");
        folder.removeAttribute("tabindex");
        folder.removeAttribute("role");
        cards.forEach((card) => card.removeAttribute("tabindex"));
        setHint("expanded");
        if (collapse) collapse.hidden = false;
        viewport.style.overflowX = deck.reduced ? "auto" : "hidden";
        if (!deck.reduced) {
          startMarquee(deck);
          createDrag(deck);
          viewport.setAttribute("data-deck-drag-status", "grab");
        }
      };
      const expand = () => {
        killFooterFade(deck);
        if (group.dataset.foldersState !== "stacked" || root.dataset.deckState !== "stacked") return;
        const other = instance.decks.find((candidate) => candidate !== deck);
        setGroupState("expanding", root.dataset.deckInit);
        instance.active = deck;
        deck.hoverTween?.kill();
        deck.hoverTween = null;
        // Settle the hover lift over the same beat as the other folder's fade
        // instead of snapping it away on click.
        gsap.to(root, { y: 0, duration: 0.25, ease: "power2.out", clearProps: "y" });
        if (panel) gsap.to(panel, { yPercent: 0, duration: 0.25, ease: "power2.out", clearProps: "yPercent" });
        other?.root.setAttribute("data-deck-state", "inactive");
        other?.root.classList.add("is-ecosystem-deck-hidden");
        if (other && !deck.reduced) {
          const currentLeft = root.getBoundingClientRect().left;
          other.root.hidden = true;
          const singleDeckLeft = root.getBoundingClientRect().left;
          other.root.hidden = false;
          const layoutShift = singleDeckLeft - currentLeft;
          if (layoutShift) gsap.to(root, { x: layoutShift, duration: 0.25, ease: "power2.out" });
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
          // Pin the folder face where it stood: the deck goes full width for
          // the row, and the panel must not stretch with it while it fades.
          const faceRects = face.map((layer) => layer.getBoundingClientRect());
          root.dataset.deckState = "expanding";
          const folderRect = folder.getBoundingClientRect();
          face.forEach((layer, index) => {
            const rect = faceRects[index];
            gsap.set(layer, {
              left: rect.left - folderRect.left, top: rect.top - folderRect.top,
              width: rect.width, height: rect.height, right: "auto", bottom: "auto",
            });
          });
          row();
          if (face.length) gsap.to(face, { opacity: 0, duration: 0.3, ease: "power2.out" });
          deck.tween = Flip.from(state, {
            absolute: true, scale: true,
            duration: 0.6,
            stagger: { amount: Math.min(0.15, cards.length * 0.03) },
            ease: "power3.inOut",
            onComplete: () => {
              gsap.set(root, { clearProps: "transform" });
              gsap.set([deck.folder, ...face], { clearProps: "opacity,scale" });
              finishExpand();
              setGroupState("expanded", root.dataset.deckInit);
            },
          });
        };
        if (!other || deck.reduced) {
          beginExpand();
          return;
        }
        gsap.to(other.root, { opacity: 0, scale: 0.92, duration: 0.25, ease: "power2.out", onComplete: beginExpand });
      };
      const collapseDeck = (instant = false) => {
        if (instance.active !== deck || !["expanded", "expanding", "collapsing"].includes(root.dataset.deckState)) return;
        if (deck.footerFadeTween && !instant && !deck.reduced) return;
        if (instant || deck.reduced) killFooterFade(deck);
        deck.tween?.kill();
        deck.hoverTween?.kill();
        killDrag(deck);
        const other = instance.decks.find((candidate) => candidate !== deck);
        if (instant || deck.reduced) {
          gsap.set([root, panel], { clearProps: "y,yPercent" });
          if (face.length) gsap.set(face, { clearProps: "opacity" });
          stopMarquee(deck);
          stack();
          if (other) { other.root.hidden = false; other.root.classList.remove("is-ecosystem-deck-hidden"); gsap.set(other.root, { clearProps: "opacity,scale" }); stackDeck(other); }
          root.hidden = false;
          instance.active = null;
          setGroupState("stacked");
          folder.focus();
          dispatchCollapsed(root.dataset.deckInit);
          return;
        }

        deck.footerFadeTween = gsap.to(deck.footer, {
          opacity: 0,
          duration: 0.2,
          ease: "power2.out",
          onComplete: () => {
            deck.footerFadeTween = null;
            // Esc during the fly-out is allowed: the expand tween was killed above, so the deck is still "expanding".
            if (instance.active !== deck || !["expanded", "expanding"].includes(root.dataset.deckState)) return;
            continueCollapse();
          },
        });

        function continueCollapse() {
        gsap.set([root, panel], { clearProps: "y,yPercent" });
        alignOriginalsToView(deck);
        const state = Flip.getState(cards);
        root.dataset.deckState = "collapsing";
        setGroupState("collapsing", root.dataset.deckInit);
        // Two phases: the row flies back into the raised fan (the hover pose,
        // held above the folder), then the fan settles into the folder as the
        // panel fades in — the reverse of hover → click → fly out.
        stack(false);
        viewport.style.overflowX = "";
        gsap.set(cards, { y: "-=40", x: (index) => (index % 2 ? 1 : -1) * Math.min(index * 7, 42), rotation: (index) => (index % 2 ? 1 : -1) * Math.min(8, index + 1) });
        if (face.length) gsap.set(face, { opacity: 0 });
        const settle = () => {
          if (root.dataset.deckState !== "collapsing") return;
          const fanState = Flip.getState(cards);
          stack(false);
          if (face.length) gsap.to(face, { opacity: 1, duration: 0.35, ease: "power3.out" });
          deck.tween = Flip.from(fanState, {
            absolute: true, scale: true, duration: 0.35, stagger: 0.015, ease: "power3.out",
            onComplete: finishCollapse,
          });
        };
        deck.tween = Flip.from(state, {
          absolute: true, scale: true, duration: 0.55,
          stagger: { amount: Math.min(0.25, cards.length * 0.05), from: "end" }, ease: "power3.inOut",
          onComplete: settle,
        });
        function finishCollapse() {
            stack();
            if (other) {
              // Mirror of the expand compensation: un-hiding the other deck
              // re-centres the row, so slide this deck from where it was
              // instead of letting it snap.
              const centredLeft = root.getBoundingClientRect().left;
              other.root.hidden = false;
              other.root.classList.remove("is-ecosystem-deck-hidden");
              const layoutShift = centredLeft - root.getBoundingClientRect().left;
              if (layoutShift) gsap.fromTo(root, { x: layoutShift }, { x: 0, duration: 0.3, ease: "power2.out", clearProps: "x" });
              gsap.fromTo(other.root, { opacity: 0, scale: 0.92 }, { opacity: 1, scale: 1, duration: 0.3, ease: "power2.out", onComplete: () => { stackDeck(other); } });
            }
            instance.active = null;
            setGroupState("stacked");
            folder.focus();
            gsap.set(deck.footer, { clearProps: "opacity" });
            dispatchCollapsed(root.dataset.deckInit);
        }
        }
      };
      deck._collapse = collapseDeck;
      deck.collapseDeck = collapseDeck;
      if (window.matchMedia?.("(hover: hover)").matches) {
        localListen(folder, "pointerenter", () => {
          if (root.dataset.deckState !== "stacked" || group.dataset.foldersState !== "stacked") return;
          deck.hoverTween?.kill();
          deck.hoverTween = gsap.timeline().to(root, { y: -6, duration: 0.35, ease: "power3.out" })
            .to(panel, { yPercent: 6, duration: 0.35, ease: "power3.out" }, 0)
            .to(cards, { y: (index) => stackPose(index, DEFAULT_FAN).y - 40, x: (index) => (index % 2 ? 1 : -1) * Math.min(index * 7, 42), rotation: (index) => (index % 2 ? 1 : -1) * Math.min(8, index + 1), duration: 0.35, stagger: 0.02, ease: "power3.out" }, 0);
        });
        localListen(folder, "pointerleave", () => {
          if (root.dataset.deckState !== "stacked" || group.dataset.foldersState !== "stacked") return;
          deck.hoverTween?.kill();
          const fan = number(getComputedStyle(root).getPropertyValue("--deck-fan"), DEFAULT_FAN);
          deck.hoverTween = gsap.timeline().to(root, { y: 0, duration: 0.3, ease: "power3.out" })
            .to(panel, { yPercent: 0, duration: 0.3, ease: "power3.out" }, 0)
            .to(cards, { x: (index) => stackPose(index, fan).x, y: (index) => stackPose(index, fan).y, rotation: (index) => stackPose(index, fan).rotation, duration: 0.3, stagger: 0.015, ease: "power3.out" }, 0);
        });
      }
      localListen(folder, "click", (event) => {
        // The folder wraps the open row too; only the stacked folder is the button.
        if (root.dataset.deckState !== "stacked") return;
        event.preventDefault();
        expand();
      });
      localListen(folder, "keydown", (event) => {
        if (["Enter", " "].includes(event.key)) { event.preventDefault(); expand(); }
      });
      localListen(collapse, "click", () => collapseDeck());
      localListen(viewport, "pointerenter", () => { deck.paused = true; });
      localListen(viewport, "pointerleave", () => { deck.paused = false; });
      localListen(viewport, "focusin", () => { deck.paused = true; });
      localListen(viewport, "focusout", (event) => { if (!viewport.contains(event.relatedTarget)) deck.paused = false; });
      localListen(track, "click", (event) => {
        if (!deck.movedSincePress) return;
        event.preventDefault();
        event.stopPropagation();
      }, true);
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
          else if (deck.root.dataset.deckState === "expanded") {
            killDrag(deck);
            stopMarquee(deck);
            if (!instance.reduced) {
              startMarquee(deck);
              createDrag(deck);
              deck.viewport.setAttribute("data-deck-drag-status", "grab");
            }
          }
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
    if (deck.paused || deck.dragPaused || deck.throwActive || !deck.setWidth) return;
    deck.offset = (deck.offset - speed * gsap.ticker.deltaRatio(60) / 60) % deck.setWidth;
    gsap.set(deck.track, { x: deck.offset });
  };
  gsap.ticker.add(deck.ticker, false, true);
}

function createDrag(deck) {
  if (deck.reduced || deck.draggable || deck.root.dataset.deckState !== "expanded") return;
  const proxy = document.createElement("div");
  proxy.setAttribute("aria-hidden", "true");
  proxy.dataset.deckDragProxy = "";
  proxy.style.cssText = "position:absolute; width:1px; height:1px; pointer-events:none; opacity:0;";
  deck.viewport.appendChild(proxy);
  deck.proxy = proxy;
  deck.proxyX = 0;
  const render = (x) => {
    if (!deck.setWidth) return;
    const delta = x - deck.proxyX;
    if (delta) {
      deck.offset = wrapOffset(deck.offset + delta, deck.setWidth);
      gsap.set(deck.track, { x: deck.offset });
    }
    deck.proxyX = x;
  };
  deck.draggable = Draggable.create(proxy, {
    type: "x",
    trigger: deck.viewport,
    inertia: Boolean(InertiaPlugin),
    allowEventDefault: true,
    minimumMovement: 4,
    bounds: false,
    onPress() {
      deck.movedSincePress = false;
      deck.dragPaused = true;
      deck.throwActive = false;
      this.tween?.kill();
      gsap.killTweensOf(proxy);
      gsap.set(proxy, { x: 0 });
      deck.proxyX = 0;
      deck.viewport.setAttribute("data-deck-drag-status", "grabbing");
    },
    onDragStart() {
      deck.movedSincePress = true;
    },
    onDrag() { render(this.x); },
    onThrowUpdate() { render(this.x); },
    onRelease() {
      deck.viewport.setAttribute("data-deck-drag-status", "grab");
      deck.throwActive = Boolean(this.tween);
      if (!deck.throwActive) deck.dragPaused = false;
    },
    onDragEnd() {
      deck.viewport.setAttribute("data-deck-drag-status", "grab");
    },
    onThrowComplete() {
      deck.throwActive = false;
      deck.dragPaused = false;
      deck.proxyX = 0;
      gsap.set(proxy, { x: 0 });
      deck.viewport.setAttribute("data-deck-drag-status", "grab");
    },
  })[0];
}

function killDrag(deck) {
  deck.throwActive = false;
  deck.dragPaused = false;
  deck.movedSincePress = false;
  deck.proxyX = 0;
  if (deck.proxy) gsap.killTweensOf(deck.proxy);
  deck.draggable?.tween?.kill();
  deck.draggable?.kill();
  deck.draggable = null;
  deck.proxy?.remove();
  deck.proxy = null;
  deck.viewport?.removeAttribute("data-deck-drag-status");
}

function killFooterFade(deck) {
  deck.footerFadeTween?.kill();
  deck.footerFadeTween = null;
  if (deck.footer?.length) gsap.set(deck.footer, { clearProps: "opacity" });
}

/**
 * The marquee scrolls the originals off screen and shows their clones. Before
 * collapsing, shift the track by whole set widths so the originals sit exactly
 * where the visible clones are; the clones can then be removed with no visual
 * change and the originals fly back from where the user sees them.
 */
function alignOriginalsToView(deck) {
  if (!deck.ticker || !deck.setWidth) return;
  const viewport = deck.viewport.getBoundingClientRect();
  const originLeft = deck.track.getBoundingClientRect().left - deck.offset;
  const viewCentre = viewport.left + viewport.width / 2;
  const setCentre = originLeft + deck.offset + deck.setWidth / 2;
  const sets = Math.round((viewCentre - setCentre) / deck.setWidth);
  if (sets) {
    deck.offset += sets * deck.setWidth;
    gsap.set(deck.track, { x: deck.offset });
  }
}

function stopMarquee(deck) {
  if (deck.ticker) gsap.ticker.remove(deck.ticker);
  deck.ticker = null;
  deck.setWidth = 0;
  gsap.set(deck.track, { clearProps: "x" });
  removeClones(deck.root);
}

function wrapOffset(value, width) {
  if (!width) return value;
  let next = value;
  while (next <= -width) next += width;
  while (next >= width) next -= width;
  return next;
}

function removeClones(root) { root.querySelectorAll("[data-deck-clone]").forEach((clone) => clone.remove()); }
function number(value, fallback) { const parsed = Number.parseFloat(value); return Number.isFinite(parsed) ? parsed : fallback; }
function gap(track) { const styles = getComputedStyle(track); return number(styles.columnGap || styles.gap, 24); }
function teardown(group) {
  const instance = group._ecosystemFoldersInstance;
  if (!instance) return;
  instance.listeners?.forEach((remove) => remove());
  instance.decks?.forEach((deck) => { deck.tween?.kill(); killFooterFade(deck); stopMarquee(deck); deck.listeners?.forEach((remove) => remove()); });
  instance.decks?.forEach((deck) => killDrag(deck));
  group._ecosystemFoldersInstance = null;
}
