import { gsap, ScrollTrigger, SplitText } from "../lib/gsap.js";

gsap.registerPlugin(ScrollTrigger);

const DEFAULT_ZOOM = 1.5;
const DEFAULT_COLUMN_PUSH = 30;
const DEFAULT_MIDDLE_SHIFTS = [-60, -95, -28];
const DEFAULT_STAGGER = 0.06;
const DEFAULT_REVEAL_DURATION = 1;
const DEFAULT_ZOOM_DURATION = 1;
const DEFAULT_PANEL_DURATION = 1;
const DEFAULT_DWELL = 0.35;
const DEFAULT_CONTENT_DWELL = 0.9;
const DEFAULT_PANEL_TOP_GAP = 80;
const PANEL_REVEAL_PLAY_AT = 0.7;
const PANEL_REVEAL_RESET_AT = 0.3;
const PANEL_ITEM_REST_DELAY = 0.7;
// Keeps scaled tile images and subpixel compositing clear of the stage clip.
const ENTRANCE_CLEARANCE = 24;
const RESIZE_DEBOUNCE = 150;

/**
 * Runs the 15&Forward sticky-stage sequence.
 *
 * Webflow contract:
 *   [data-forward-init]       the section / scroll runway
 *   [data-forward-stage]      the sticky viewport
 *   [data-forward-grid]       the three-column image grid
 *   [data-forward-col]        one grid column
 *   [data-forward-tile]       one tile in a column
 *   [data-forward-content]    title and copy wrapper
 *   [data-forward-title]      title
 *   [data-forward-copy]       copy
 *   [data-forward-panel]      a covering split panel
 *   [data-forward-media]      panel media wrapper
 *   [data-forward-body]       panel copy viewport
 *   [data-forward-scroll]     panel copy column
 *
 * Tunables may be overridden per section with the CSS custom properties
 * --forward-zoom, --forward-column-push, --forward-stagger,
 * --forward-middle-shift (a comma-separated yPercent list), and
 * --forward-content-dwell. Matching data-forward-* attributes are used when
 * the CSS custom properties are empty.
 */
export function initForwardSection() {
  const sections = [...document.querySelectorAll("[data-forward-init]")];

  sections.forEach((section) => {
    teardown(section);

    const stage = section.querySelector("[data-forward-stage]");
    const grid = section.querySelector("[data-forward-grid]");
    const content = section.querySelector("[data-forward-content]");
    const title = section.querySelector("[data-forward-title]");
    const copy = section.querySelector("[data-forward-copy]");
    const columns = [...section.querySelectorAll("[data-forward-col]")];
    const panels = [...section.querySelectorAll("[data-forward-panel]")];

    if (!stage || !grid || !content || !title || !copy || columns.length !== 3 || panels.length < 2) {
      return;
    }

    const tiles = columns.map((column) => [...column.querySelectorAll("[data-forward-tile]")]);
    if (tiles.some((columnTiles) => !columnTiles.length)) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const elements = [
      grid,
      content,
      title,
      copy,
      ...columns,
      ...tiles.flat(),
      ...panels,
      ...panels.flatMap((panel) => [
        panel.querySelector("[data-forward-media]"),
        panel.querySelector("[data-forward-media] img"),
        panel.querySelector("[data-forward-scroll]"),
      ]),
    ].filter(Boolean);

    const panelReveals = panels.slice(0, 2).map((panel) => createPanelReveal(panel, reducedMotion));

    if (reducedMotion) {
      panelReveals.forEach((reveal) => reveal?.showEndState());
      section._forwardInstance = { timeline: null, elements };
      return;
    }

    const zoom = readNumber(section, "data-forward-zoom", DEFAULT_ZOOM, "--forward-zoom");
    const columnPush = readNumber(section, "data-forward-column-push", DEFAULT_COLUMN_PUSH, "--forward-column-push");
    const stagger = readNumber(section, "data-forward-stagger", DEFAULT_STAGGER, "--forward-stagger");
    const contentDwell = readNumber(section, "data-forward-content-dwell", DEFAULT_CONTENT_DWELL, "--forward-content-dwell");
    const configuredPanelTopGap = readLength(
      section,
      "data-forward-panel-top-gap",
      DEFAULT_PANEL_TOP_GAP,
      "--forward-panel-top-gap",
    );
    const middleShifts = readList(section, "data-forward-middle-shift", DEFAULT_MIDDLE_SHIFTS, "--forward-middle-shift");
    const viewportHeight = window.innerHeight;
    const gridHeight = grid.getBoundingClientRect().height;
    const entranceDistance = viewportHeight - (viewportHeight - gridHeight) / 2 + ENTRANCE_CLEARANCE;
    const contentHeight = content.getBoundingClientRect().height;
    const titleHeight = title.getBoundingClientRect().height;
    const titleOffset = contentHeight
      ? ((contentHeight - titleHeight) / 2 / contentHeight) * 100
      : 0;

    gsap.set(columns[0], { y: -entranceDistance });
    gsap.set(columns[1], { y: entranceDistance });
    gsap.set(columns[2], { y: -entranceDistance });
    const tileStaggerOffset = Math.min(32, gridHeight * 0.04);
    tiles.forEach((columnTiles, columnIndex) => {
      const direction = columnIndex === 1 ? 1 : -1;
      columnTiles.forEach((tile, tileIndex) => {
        const order = columnIndex === 1 ? tileIndex : columnTiles.length - tileIndex - 1;
        gsap.set(tile, { y: direction * order * tileStaggerOffset });
      });
    });
    gsap.set(content, { yPercent: titleOffset });
    gsap.set(title, { opacity: 0 });
    gsap.set(copy, { opacity: 0, pointerEvents: "none" });
    gsap.set(panels, { y: 0, yPercent: 100 });
    gsap.set(grid, { scale: 1, transformOrigin: "50% 50%" });

    const timeline = gsap.timeline({
      defaults: { ease: "none" },
      scrollTrigger: {
        trigger: section,
        start: "top top",
        end: "bottom bottom",
        scrub: true,
        invalidateOnRefresh: true,
      },
    });

    const revealLabel = "reveal";
    const zoomLabel = "zoom";
    timeline.addLabel(revealLabel, 0);
    columns.forEach((column, index) => {
      timeline.to(
        column,
        { y: 0, duration: DEFAULT_REVEAL_DURATION, ease: "power1.inOut" },
        revealLabel,
      );
      timeline.to(
        tiles[index],
        {
          y: 0,
          duration: DEFAULT_REVEAL_DURATION,
          stagger: { each: stagger, from: index === 1 ? "start" : "end" },
          ease: "power1.inOut",
        },
        revealLabel,
      );
    });
    timeline.to(copy, { opacity: 0, duration: 0.01 }, `${revealLabel}+=0.02`);
    timeline.to(title, { opacity: 1, duration: 0.35, ease: "power1.out" }, `${revealLabel}+=0.05`);

    timeline.addLabel(zoomLabel, `${revealLabel}+=${DEFAULT_REVEAL_DURATION * 0.72}`);
    timeline.to(
      grid,
      { scale: zoom, duration: DEFAULT_ZOOM_DURATION, ease: "power3.inOut" },
      zoomLabel,
    );
    timeline.to(columns[0], { xPercent: -columnPush, duration: DEFAULT_ZOOM_DURATION, ease: "power1.inOut" }, zoomLabel);
    timeline.to(columns[2], { xPercent: columnPush, duration: DEFAULT_ZOOM_DURATION, ease: "power1.inOut" }, zoomLabel);

    columns[1].querySelectorAll("[data-forward-tile]").forEach((tile, index) => {
      const shift = middleShifts[Math.min(index, middleShifts.length - 1)];
      timeline.to(tile, { yPercent: shift, duration: DEFAULT_ZOOM_DURATION, ease: "power1.inOut" }, zoomLabel);
    });
    timeline.to(content, { yPercent: 0, duration: DEFAULT_ZOOM_DURATION, ease: "power1.inOut" }, `${zoomLabel}+=0.65`);
    timeline.to(copy, { opacity: 1, pointerEvents: "auto", duration: 0.3, ease: "power1.out" }, `${zoomLabel}+=0.68`);

    let cursor = DEFAULT_REVEAL_DURATION * 0.72 + DEFAULT_ZOOM_DURATION;
    timeline.to({}, { duration: contentDwell }, cursor);
    cursor += contentDwell;
    const isStackedPanel = window.matchMedia("(max-width: 991px)").matches;
    panels.slice(0, 2).forEach((panel, index) => {
      const media = panel.querySelector("[data-forward-media]");
      const image = panel.querySelector("[data-forward-media] img");
      const body = panel.querySelector("[data-forward-body]");
      const scroll = panel.querySelector("[data-forward-scroll]");
      if (!media || !body || !scroll) return;

      // The card stops --forward-panel-top-gap below the panel top so the fixed
      // nav never covers its heading; a taller card keeps going until its
      // bottom meets the panel bottom.
      const measureStackedPanelTravel = () => {
        const mediaHeight = media.getBoundingClientRect().height;
        const bodyHeight = body.getBoundingClientRect().height;
        const panelHeight = panel.getBoundingClientRect().height;
        return Math.max(
          0,
          mediaHeight - configuredPanelTopGap,
          mediaHeight + bodyHeight - panelHeight,
        );
      };
      const measureOverflow = () => Math.max(0, scroll.scrollHeight - body.clientHeight);
      const overflow = measureOverflow();
      const panelLabel = `panel${index + 1}`;
      panelReveals[index]?.setPhase(cursor, DEFAULT_PANEL_DURATION);
      gsap.set(image || media, { scale: 1.3, transformOrigin: "50% 50%" });
      timeline.addLabel(panelLabel, cursor);
      timeline.to(panel, { yPercent: 0, duration: DEFAULT_PANEL_DURATION, ease: "power2.inOut" }, panelLabel);
      timeline.to(
        image || media,
        { scale: 1, duration: DEFAULT_PANEL_DURATION, ease: "power2.inOut" },
        panelLabel,
      );
      cursor += DEFAULT_PANEL_DURATION;
      timeline.to({}, { duration: DEFAULT_DWELL }, cursor);
      cursor += DEFAULT_DWELL;
      // Keep the stacked phase in the timeline so a later refresh can
      // re-measure after fonts or layout settle.
      if (isStackedPanel) {
        timeline.to(body, { y: () => -measureStackedPanelTravel(), duration: 1, ease: "none" }, cursor);
        cursor += 1;
      } else if (overflow > 0) {
        timeline.to(scroll, { y: () => -measureOverflow(), duration: 1, ease: "none" }, cursor);
        cursor += 1;
      }
    });

    const updatePanelReveals = () => {
      const timelineTime = timeline.time();
      panelReveals.forEach((reveal) => reveal?.update(timelineTime));
    };
    timeline.eventCallback("onUpdate", updatePanelReveals);
    const syncPanelReveals = () => {
      const timelineTime = timeline.time();
      panelReveals.forEach((reveal) => reveal?.sync(timelineTime));
    };
    ScrollTrigger.addEventListener("refresh", syncPanelReveals);

    section._forwardInstance = {
      timeline,
      elements,
      panelReveals,
      refreshHandler: syncPanelReveals,
      entranceDistance,
      runway: section.getBoundingClientRect().height,
    };
  });

  if (sections.length && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    ScrollTrigger.refresh();
  }

  installAnchorHandler();
  installResizeHandler();
}

function installAnchorHandler() {
  initForwardSection._anchorHandler?.();
  const ownedClicks = new WeakSet();
  const onClick = (event) => {
    const link = event.target.closest?.("[data-scroll-to]");
    if (!link) return;
    const codeOwned = link.hasAttribute("data-forward-anchor-offset");
    if (!codeOwned && link.hasAttribute("data-scroll-to-offset")) return;
    const href = link.getAttribute("data-scroll-to-href") || link.getAttribute("href");
    const section = href?.startsWith("#") ? document.getElementById(href.slice(1)) : null;
    const trigger = section?._forwardInstance?.timeline?.scrollTrigger;
    const duration = section?._forwardInstance?.timeline?.duration();
    if (!trigger || !Number.isFinite(duration) || !duration) return;

    const offset = (trigger.end - trigger.start) * DEFAULT_REVEAL_DURATION / duration;
    if (!Number.isFinite(offset)) return;
    link.setAttribute("data-scroll-to-offset", String(offset));
    link.setAttribute("data-forward-anchor-offset", "");
    ownedClicks.add(event);
  };
  const stopDelegatedScroll = (event) => {
    if (ownedClicks.has(event)) {
      ownedClicks.delete(event);
      event.stopPropagation();
    }
  };
  document.addEventListener("click", onClick, true);
  document.documentElement.addEventListener("click", stopDelegatedScroll);
  initForwardSection._anchorHandler = () => {
    document.removeEventListener("click", onClick, true);
    document.documentElement.removeEventListener("click", stopDelegatedScroll);
  };
}

function readNumber(section, attribute, fallback, customProperty) {
  const cssValue = readCustomProperty(section, customProperty);
  const cssNumber = Number.parseFloat(cssValue);
  if (Number.isFinite(cssNumber)) return cssNumber;

  const attributeNumber = Number.parseFloat(section.getAttribute(attribute));
  return Number.isFinite(attributeNumber) ? attributeNumber : fallback;
}

function readLength(section, attribute, fallback, customProperty) {
  const cssValue = readCustomProperty(section, customProperty);
  const cssLength = parseLength(cssValue, section);
  if (Number.isFinite(cssLength)) return cssLength;

  const attributeLength = parseLength(section.getAttribute(attribute), section);
  return Number.isFinite(attributeLength) ? attributeLength : fallback;
}

function parseLength(value, element) {
  if (!value) return NaN;

  const match = String(value).trim().match(/^(-?\d*\.?\d+)(px|rem|em)?$/);
  if (!match) return NaN;

  const amount = Number.parseFloat(match[1]);
  if (match[2] === "rem") return amount * Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
  if (match[2] === "em") return amount * Number.parseFloat(getComputedStyle(element).fontSize);
  return amount;
}

function readList(section, attribute, fallback, customProperty) {
  const cssList = parseList(readCustomProperty(section, customProperty));
  if (cssList) return cssList;

  return parseList(section.getAttribute(attribute)) || fallback;
}

function parseList(value) {
  if (!value) return null;

  const parsed = value.split(",").map((item) => Number.parseFloat(item.trim()));
  return parsed.length && parsed.every(Number.isFinite) ? parsed : null;
}

function readCustomProperty(section, property) {
  if (!property) return null;
  const value = getComputedStyle(section).getPropertyValue(property).trim();
  return value || null;
}

function teardown(section) {
  const previous = section._forwardInstance;
  previous?.panelReveals?.forEach((reveal) => reveal?.cleanup());
  if (previous?.refreshHandler) ScrollTrigger.removeEventListener("refresh", previous.refreshHandler);
  previous?.timeline?.scrollTrigger?.kill();
  previous?.timeline?.kill();

  const elements = previous?.elements || [
    ...section.querySelectorAll("[data-forward-grid], [data-forward-content], [data-forward-title], [data-forward-copy], [data-forward-col], [data-forward-tile], [data-forward-panel], [data-forward-media], [data-forward-scroll]"),
  ];
  if (elements.length) {
    gsap.set(elements, { clearProps: "transform,transformOrigin,opacity,pointerEvents" });
  }
  section._forwardInstance = null;
}

function createPanelReveal(panel, reducedMotion = false) {
  const heading = panel.querySelector('[data-forward-reveal="heading"]');
  const copy = panel.querySelector('[data-forward-reveal="copy"]');
  const items = [...panel.querySelectorAll('[data-forward-reveal="item"]')];
  const itemsContainer = panel.querySelector('[data-forward-reveal="items"]');

  if (!heading && !copy && !items.length && !itemsContainer) return null;

  let panelReveal;
  let revealTween;
  let headingTween;
  const split = heading && !reducedMotion
    ? SplitText.create(heading, {
      type: "lines",
      mask: "lines",
      autoSplit: true,
      linesClass: "line",
      onSplit(instance) {
        if (panelReveal && panelReveal.state !== "hidden") {
          headingTween?.kill();
          gsap.set(instance.lines, { yPercent: 0 });
        } else {
          gsap.set(instance.lines, { yPercent: 120 });
        }
      },
    })
    : null;
  const itemParts = items.map((item) => ({
    item,
    icon: item.querySelector(".forward_item-icon"),
    title: item.querySelector(".forward_item-title"),
    copy: item.querySelector(".forward_panel-copy"),
  }));
  const buttons = itemsContainer ? [...itemsContainer.children] : [];
  let restCalls = [];
  let pendingRestCount = 0;
  let revealCompleted = false;
  panelReveal = {
    state: "hidden",
    hasObservedUpdate: false,
    showEndState,
    update,
    sync,
    cleanup,
  };

  if (heading) gsap.set(heading, { opacity: 0 });
  if (copy) gsap.set(copy, { opacity: 0, y: "1.5rem", pointerEvents: "none" });
  itemParts.forEach(({ icon, title, copy: itemCopy }) => {
    gsap.set([icon, title, itemCopy].filter(Boolean), { opacity: 0, y: "1.5rem" });
  });
  if (buttons.length) gsap.set(buttons, { opacity: 0, y: "1.5rem" });

  function update(timelineTime) {
    if (ScrollTrigger.isRefreshing) return;
    if (timelineTime <= resetTime || timelineTime < panelStart) {
      if (panelReveal.state !== "hidden") reset();
      panelReveal.hasObservedUpdate = true;
      return;
    }
    if (timelineTime >= playTime && panelReveal.state === "hidden") {
      if (panelReveal.hasObservedUpdate) play();
      else showEndState();
    }
    panelReveal.hasObservedUpdate = true;
  }

  function sync(timelineTime) {
    if (timelineTime <= resetTime || timelineTime < panelStart) {
      if (panelReveal.state !== "hidden") reset();
      return;
    }
    if (timelineTime >= playTime) {
      if (panelReveal.state === "hidden") {
        showEndState();
      } else if (panelReveal.state === "revealed") {
        showEndState();
      }
    }
  }

  let panelStart = 0;
  let playTime = 0;
  let resetTime = 0;

  panelReveal.setPhase = (start, duration) => {
    panelStart = start;
    playTime = start + duration * PANEL_REVEAL_PLAY_AT;
    resetTime = start + duration * PANEL_REVEAL_RESET_AT;
  };

  function play() {
    if (panelReveal.state !== "hidden") return;
    panelReveal.state = "revealing";
    pendingRestCount = 0;
    revealCompleted = false;
    revealTween?.kill();
    restCalls.forEach((call) => call.kill());
    restCalls = [];
    revealTween = gsap.timeline({ onComplete: () => {
      revealCompleted = true;
      finishReveal();
    } });
    headingTween?.kill();
    headingTween = gsap.timeline();
    if (heading) headingTween.set(heading, { opacity: 1 }, 0);
    if (split) headingTween.to(split.lines, { yPercent: 0, duration: 0.8, stagger: 0.08, ease: "smooth" }, 0);
    if (copy) revealTween.to(copy, { opacity: 1, y: 0, pointerEvents: "auto", duration: 0.55, ease: "smooth" }, 0.22);
    itemParts.forEach(({ item, icon, title, copy: itemCopy }, index) => {
      const start = 0.9 + index * 0.16;
      const parts = [icon, title, itemCopy].filter(Boolean);
      if (icon) revealTween.to(icon, { opacity: 1, y: 0, duration: 0.4, ease: "smooth" }, start);
      if (title || itemCopy) revealTween.to([title, itemCopy].filter(Boolean), { opacity: 1, y: 0, duration: 0.5, stagger: 0.06, ease: "smooth" }, start + 0.1);
      if (parts.length) {
        revealTween.call(() => {
          item.setAttribute("data-forward-item-state", "hint");
          pendingRestCount += 1;
          const restCall = gsap.delayedCall(PANEL_ITEM_REST_DELAY, () => {
            item.setAttribute("data-forward-item-state", "rest");
            pendingRestCount -= 1;
            finishReveal();
          });
          restCalls.push(restCall);
        }, [], start + 0.6);
      }
    });
    buttons.forEach((button, index) => {
      revealTween.to(button, { opacity: 1, y: 0, duration: 0.5, ease: "smooth" }, 0.9 + index * 0.1);
    });
  }

  function finishReveal() {
    if (revealCompleted && pendingRestCount === 0) panelReveal.state = "revealed";
  }

  function showEndState() {
    revealTween?.kill();
    headingTween?.kill();
    restCalls.forEach((call) => call.kill());
    restCalls = [];
    pendingRestCount = 0;
    revealCompleted = true;
    panelReveal.state = "revealed";
    if (heading) gsap.set(heading, { clearProps: "opacity" });
    if (split) gsap.set(split.lines, { yPercent: 0 });
    if (copy) gsap.set(copy, { clearProps: "transform,opacity,pointerEvents" });
    itemParts.forEach(({ item, icon, title, copy: itemCopy }) => {
      gsap.set([icon, title, itemCopy].filter(Boolean), { clearProps: "transform,opacity" });
      item.setAttribute("data-forward-item-state", "rest");
    });
    if (buttons.length) gsap.set(buttons, { clearProps: "transform,opacity" });
  }

  function reset() {
    revealTween?.kill();
    headingTween?.kill();
    restCalls.forEach((call) => call.kill());
    restCalls = [];
    pendingRestCount = 0;
    revealCompleted = false;
    panelReveal.state = "hidden";
    if (heading) gsap.set(heading, { opacity: 0 });
    if (split) gsap.set(split.lines, { yPercent: 120 });
    if (copy) gsap.set(copy, { opacity: 0, y: "1.5rem", pointerEvents: "none" });
    itemParts.forEach(({ item, icon, title, copy: itemCopy }) => {
      gsap.set([icon, title, itemCopy].filter(Boolean), { opacity: 0, y: "1.5rem" });
      item.removeAttribute("data-forward-item-state");
    });
    if (buttons.length) gsap.set(buttons, { opacity: 0, y: "1.5rem" });
  }

  function cleanup() {
    revealTween?.kill();
    headingTween?.kill();
    restCalls.forEach((call) => call.kill());
    pendingRestCount = 0;
    revealCompleted = false;
    if (split) split.revert();
    gsap.set([heading, copy, ...itemParts.flatMap(({ icon, title, copy: itemCopy }) => [icon, title, itemCopy]), ...buttons].filter(Boolean), {
      clearProps: "transform,opacity,pointerEvents",
    });
    items.forEach((item) => item.removeAttribute("data-forward-item-state"));
  }

  return panelReveal;
}

function installResizeHandler() {
  initForwardSection._resize?.();
  let lastWidth = window.innerWidth;
  let timer;
  const onResize = () => {
    if (window.innerWidth === lastWidth) return;
    lastWidth = window.innerWidth;
    clearTimeout(timer);
    timer = setTimeout(() => initForwardSection(), RESIZE_DEBOUNCE);
  };
  initForwardSection._resize = () => {
    clearTimeout(timer);
    window.removeEventListener("resize", onResize);
    initForwardSection._resize = null;
  };
  window.addEventListener("resize", onResize);
}
