import createGlobe from "cobe";
import { ScrollTrigger } from "../lib/gsap.js";

const PHI_START = 0;
const PHI_TURNS = Math.PI * 1.5;
const THETA = 0.2;
const MAX_DPR = 1.5;
const RENDER_TAIL_MS = 200;
const RENDER_INTERVAL_MS = 33;
// cobe renders white dots on a near-black sphere; CSS tints the canvas via
// #members-globe-tint so the ocean becomes cream and the dots become orange.
const DARK = 1;
const DIFFUSE = 1.2;
const MAP_SAMPLES = 16000;
const MAP_BRIGHTNESS = 6;
const BASE_COLOR = [1, 1, 1];
const MARKER_COLOR = [1, 1, 1];
const GLOW_COLOR = [0.1, 0.1, 0.1];
const OPACITY = 1;
const MARKERS = [];

export function initMembersGlobe() {
  document.querySelectorAll("[data-members-globe]").forEach((mount) => {
    mount._membersGlobeInstance?.destroy();

    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    mount.append(canvas);
    const ctx2d = canvas.getContext("2d");
    const webglCanvas = document.createElement("canvas");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const section = mount.closest("[data-members-init]");
    let globe;
    let observer;
    let trigger;
    let destroyed = false;
    let ready = false;
    let size = 0;
    let dpr = 1;
    let phi = PHI_START;
    let renderUntil = 0;
    let rendering = false;
    let renderTimer;
    let resumeFrame;
    let renderRequestedAt = 0;
    let lastRenderEndedAt = -Infinity;
    let lastRenderDuration = 0;
    let renderCount = 0;
    // Safari drops the SVG tint filter on a WebGL canvas, so cobe draws into a
    // detached canvas and each frame is copied into the visible 2D one, where
    // the filter applies. Phenomenon sizes its canvas from clientWidth/Height,
    // which are 0 off-DOM, so report the mount size instead.
    Object.defineProperties(webglCanvas, {
      clientWidth: { configurable: true, get: () => size },
      clientHeight: { configurable: true, get: () => size },
    });

    const copyFrame = () => {
      queueMicrotask(() => {
        if (destroyed) return;
        ctx2d.drawImage(webglCanvas, 0, 0);
        if (!ready) {
          ready = true;
          canvas.classList.add("is-ready");
        }
      });
    };

    const cancelRenderTimer = () => {
      if (renderTimer === undefined) return;
      clearTimeout(renderTimer);
      renderTimer = undefined;
    };
    const cancelResumeFrame = () => {
      if (resumeFrame === undefined) return;
      cancelAnimationFrame(resumeFrame);
      resumeFrame = undefined;
    };
    const pause = () => {
      cancelRenderTimer();
      cancelResumeFrame();
      if (!globe || !rendering) return;
      rendering = false;
      globe.toggle(false);
    };
    const scheduleRender = () => {
      if (destroyed || !globe || rendering || renderTimer !== undefined || resumeFrame !== undefined) return;
      const interval = Math.max(RENDER_INTERVAL_MS, lastRenderDuration * 2);
      const delay = Math.max(0, lastRenderEndedAt + interval - performance.now());
      // Leave one rAF idle after each cobe frame. This keeps the expensive draw
      // from occupying consecutive browser frames, even when it takes longer
      // than RENDER_INTERVAL_MS.
      resumeFrame = requestAnimationFrame(() => {
        resumeFrame = undefined;
        if (destroyed || !globe) return;
        renderTimer = window.setTimeout(() => {
          renderTimer = undefined;
          if (destroyed || !globe) return;
          rendering = true;
          renderRequestedAt = performance.now();
          globe.toggle(true);
        }, delay);
      });
    };
    const requestFrame = () => {
      if (destroyed) return;
      renderUntil = performance.now() + RENDER_TAIL_MS;
      scheduleRender();
    };

    const cleanup = (killTrigger = true) => {
      if (destroyed) return;
      destroyed = true;
      if (killTrigger) trigger?.kill();
      observer?.disconnect();
      cancelRenderTimer();
      cancelResumeFrame();
      globe?.destroy();
      canvas.remove();
      if (mount._membersGlobeInstance?.destroy === destroy) {
        delete mount._membersGlobeInstance;
      }
    };
    const destroy = () => cleanup(true);
    const render = () => {
      if (destroyed) return;
      const width = mount.getBoundingClientRect().width;
      if (width <= 0) return;
      const nextDpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const nextSize = Math.round(width);
      if (globe && nextSize === size && nextDpr === dpr) return;
      dpr = nextDpr;
      size = nextSize;
      canvas.width = Math.round(size * dpr);
      canvas.height = Math.round(size * dpr);
      webglCanvas.width = canvas.width;
      webglCanvas.height = canvas.height;
      if (globe) {
        globe.resize();
        requestFrame();
        return;
      }
      globe = createGlobe(webglCanvas, {
        phi: PHI_START,
        theta: THETA,
        dark: DARK,
        diffuse: DIFFUSE,
        mapSamples: MAP_SAMPLES,
        mapBrightness: MAP_BRIGHTNESS,
        baseColor: BASE_COLOR,
        markerColor: MARKER_COLOR,
        glowColor: GLOW_COLOR,
        opacity: OPACITY,
        markers: MARKERS,
        width: size * dpr,
        height: size * dpr,
        devicePixelRatio: dpr,
        onRender: (state) => {
          const endedAt = performance.now();
          renderCount += 1;
          if (renderRequestedAt) lastRenderDuration = endedAt - renderRequestedAt;
          lastRenderEndedAt = endedAt;
          state.phi = phi;
          state.width = size * dpr;
          state.height = size * dpr;
          copyFrame();
          pause();
          if (endedAt <= renderUntil) scheduleRender();
        },
      });
      rendering = true;
      if (ready && performance.now() > renderUntil) pause();
    };

    observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(render);
    observer?.observe(mount);
    render();

    if (section && !reduced) {
      trigger = ScrollTrigger.create({
        trigger: section,
        start: "top bottom",
        end: "bottom top",
        scrub: true,
        onUpdate: (self) => {
          const nextPhi = PHI_START + self.progress * PHI_TURNS;
          if (nextPhi === phi) return;
          phi = nextPhi;
          mount.setAttribute("data-members-globe-phi", phi.toFixed(3));
          requestFrame();
        },
        onEnter: requestFrame,
        onEnterBack: requestFrame,
        onToggle: (self) => {
          if (!self.isActive) pause();
        },
        onKill: () => cleanup(false),
      });
    } else {
      mount.setAttribute("data-members-globe-phi", PHI_START.toFixed(3));
    }

    mount._membersGlobeInstance = {
      destroy,
      get renderCount() {
        return renderCount;
      },
      get lastRenderDuration() {
        return lastRenderDuration;
      },
    };
  });
}
