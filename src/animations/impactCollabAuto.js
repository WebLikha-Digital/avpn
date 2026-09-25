import { ScrollTrigger } from "../lib/gsap.js";

const DEFAULTS = Object.freeze({
  interval: 4000,
  hold: 1400,
  duration: 400,
});
const REVEAL_STATE_EVENT = "impact:reveal-state";

/**
 * Auto-morph the ImpactCollab stat tiles while their grid is in view.
 *
 * Webflow contract:
 *   [data-impact-auto]              the grid; its direct children are tiles
 *   [data-impact-auto-interval]     delay between picks, in milliseconds
 *   [data-impact-auto-hold]         time a picked tile stays morphed
 *   [data-impact-auto-duration]     border-radius transition duration
 *
 * Hover is always authoritative: entering a tile cancels its automatic state
 * and postpones the next pick. Reduced-motion users keep the authored CSS
 * shapes and do not get an automatic cycle.
 */
export function initImpactCollabAuto() {
  document.querySelectorAll("[data-impact-auto]").forEach((grid) => {
    teardown(grid);

    const tiles = [...grid.children];
    const instance = createInstance(grid, tiles);
    grid._impactCollabAuto = instance;

    if (tiles.length === 0) return;

    instance.trigger = ScrollTrigger.create({
      trigger: grid,
      start: "top bottom",
      end: "bottom top",
      onToggle: (self) => setActive(instance, self.isActive),
    });

    instance.visibilityHandler = () => {
      if (document.hidden) stopCycle(instance);
      else setActive(instance, instance.trigger?.isActive === true);
    };
    document.addEventListener("visibilitychange", instance.visibilityHandler);

    instance.revealHandler = () => {
      setActive(instance, instance.trigger?.isActive === true);
    };
    grid.addEventListener(REVEAL_STATE_EVENT, instance.revealHandler);

    tiles.forEach((tile) => {
      const onEnter = () => {
        instance.hovered.add(tile);
        cancelTile(instance, tile);
        if (instance.active) scheduleNext(instance, instance.interval);
      };
      const onLeave = () => instance.hovered.delete(tile);

      tile.addEventListener("pointerenter", onEnter, { passive: true });
      tile.addEventListener("pointerleave", onLeave, { passive: true });
      instance.listeners.push({ tile, onEnter, onLeave });
    });

    // ScrollTrigger may already be active when initialization happens after a
    // refresh, so do not wait for a later toggle to start the first schedule.
    if (instance.trigger.isActive) setActive(instance, true);
  });
}

function createInstance(grid, tiles) {
  const instance = {
    grid,
    tiles,
    interval: readDelay(grid, "data-impact-auto-interval", DEFAULTS.interval),
    hold: readDelay(grid, "data-impact-auto-hold", DEFAULTS.hold),
    duration: readDelay(grid, "data-impact-auto-duration", DEFAULTS.duration),
    reducedMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
    active: false,
    timer: null,
    trigger: null,
    visibilityHandler: null,
    revealHandler: null,
    listeners: [],
    hovered: new Set(),
    cleanupTimers: new Map(),
    lastTile: null,
    pickHistory: [],
    initialized: true,
    destroy() {
      teardown(grid);
    },
  };

  return instance;
}

function readDelay(grid, attribute, fallback) {
  // getAttribute returns null when the override is absent, and Number(null) is
  // 0 — a finite, non-negative number that would silently replace the default
  // with a zero delay.
  const raw = grid.getAttribute(attribute);
  if (raw === null || raw.trim() === "") return fallback;

  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function setActive(instance, active) {
  const revealComplete =
    !instance.grid.hasAttribute("data-impact-reveal") ||
    instance.grid.hasAttribute("data-impact-reveal-complete");

  if (active && revealComplete && !instance.reducedMotion && !document.hidden) {
    if (instance.active) return;
    instance.active = true;
    scheduleNext(instance, instance.interval);
    return;
  }

  stopCycle(instance);
}

function startNext(instance) {
  instance.timer = null;
  if (!instance.active || document.hidden || instance.reducedMotion) return;

  const candidates = instance.tiles.filter((tile) => (
    !instance.hovered.has(tile) &&
    (instance.tiles.length <= 1 || tile !== instance.lastTile)
  ));

  if (candidates.length === 0) {
    scheduleNext(instance, instance.interval);
    return;
  }

  const tile = candidates[Math.floor(Math.random() * candidates.length)];
  instance.lastTile = tile;
  instance.pickHistory.push(instance.tiles.indexOf(tile));
  tile.style.setProperty("--impact-tile-morph", `${instance.duration}ms`);
  tile.classList.add("is-auto");

  const holdTimer = setTimeout(() => {
    instance.cleanupTimers.delete(tile);
    if (!instance.active || instance.hovered.has(tile)) return;

    tile.classList.remove("is-auto");
    const cleanupTimer = setTimeout(() => {
      instance.cleanupTimers.delete(tile);
      if (!tile.classList.contains("is-auto")) {
        tile.style.removeProperty("--impact-tile-morph");
      }
    }, instance.duration);
    instance.cleanupTimers.set(tile, cleanupTimer);
  }, instance.hold);
  instance.cleanupTimers.set(tile, holdTimer);

  scheduleNext(instance, instance.interval);
}

function scheduleNext(instance, delay) {
  clearTimeout(instance.timer);
  if (!instance.active || document.hidden || instance.reducedMotion) return;
  instance.timer = setTimeout(() => startNext(instance), delay);
}

function cancelTile(instance, tile) {
  clearTimeout(instance.cleanupTimers.get(tile));
  instance.cleanupTimers.delete(tile);
  tile.classList.remove("is-auto");
  tile.style.removeProperty("--impact-tile-morph");
}

function stopCycle(instance) {
  instance.active = false;
  clearTimeout(instance.timer);
  instance.timer = null;
  instance.cleanupTimers.forEach((timer) => clearTimeout(timer));
  instance.cleanupTimers.clear();
  instance.tiles.forEach((tile) => cancelTile(instance, tile));
  instance.lastTile = null;
}

function teardown(grid) {
  const previous = grid._impactCollabAuto;
  if (!previous) return;

  stopCycle(previous);
  previous.trigger?.kill();
  previous.trigger = null;
  if (previous.visibilityHandler) {
    document.removeEventListener("visibilitychange", previous.visibilityHandler);
  }
  if (previous.revealHandler) {
    grid.removeEventListener(REVEAL_STATE_EVENT, previous.revealHandler);
  }
  previous.listeners.forEach(({ tile, onEnter, onLeave }) => {
    tile.removeEventListener("pointerenter", onEnter);
    tile.removeEventListener("pointerleave", onLeave);
  });
  previous.listeners = [];
  previous.hovered.clear();
  previous.tiles.forEach((tile) => {
    tile.classList.remove("is-auto");
    tile.style.removeProperty("--impact-tile-morph");
  });
  grid._impactCollabAuto = null;
}
