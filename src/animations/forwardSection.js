import { gsap, ScrollTrigger } from "../lib/gsap.js";

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

    if (reducedMotion) {
      section._forwardInstance = { timeline: null, elements };
      return;
    }

    const zoom = readNumber(section, "data-forward-zoom", DEFAULT_ZOOM, "--forward-zoom");
    const columnPush = readNumber(section, "data-forward-column-push", DEFAULT_COLUMN_PUSH, "--forward-column-push");
    const stagger = readNumber(section, "data-forward-stagger", DEFAULT_STAGGER, "--forward-stagger");
    const contentDwell = readNumber(section, "data-forward-content-dwell", DEFAULT_CONTENT_DWELL, "--forward-content-dwell");
    const middleShifts = readList(section, "data-forward-middle-shift", DEFAULT_MIDDLE_SHIFTS, "--forward-middle-shift");
    const viewportHeight = window.innerHeight;
    const gridHeight = grid.getBoundingClientRect().height;
    const entranceDistance = viewportHeight - (viewportHeight - gridHeight) / 2;
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
    panels.slice(0, 2).forEach((panel, index) => {
      const media = panel.querySelector("[data-forward-media]");
      const image = panel.querySelector("[data-forward-media] img");
      const body = panel.querySelector("[data-forward-body]");
      const scroll = panel.querySelector("[data-forward-scroll]");
      if (!media || !body || !scroll) return;

      const overflow = Math.max(0, scroll.scrollHeight - body.clientHeight);
      const panelLabel = `panel${index + 1}`;
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
      if (overflow > 0) {
        timeline.to(scroll, { y: -overflow, duration: 1, ease: "none" }, cursor);
        cursor += 1;
      }
    });

    section._forwardInstance = { timeline, elements, entranceDistance, runway: section.getBoundingClientRect().height };
  });

  if (sections.length && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    ScrollTrigger.refresh();
  }

  installResizeHandler();
}

function readNumber(section, attribute, fallback, customProperty) {
  const cssValue = readCustomProperty(section, customProperty);
  const cssNumber = Number.parseFloat(cssValue);
  if (Number.isFinite(cssNumber)) return cssNumber;

  const attributeNumber = Number.parseFloat(section.getAttribute(attribute));
  return Number.isFinite(attributeNumber) ? attributeNumber : fallback;
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
