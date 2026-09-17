import createGlobe from "cobe";
import { ScrollTrigger } from "../lib/gsap.js";

const PHI_START = 0;
const PHI_TURNS = Math.PI * 1.5;
const THETA = 0.2;
const MAX_DPR = 1.5;
const RENDER_TAIL_MS = 200;
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

    const pause = () => {
      if (!globe || !rendering) return;
      rendering = false;
      globe.toggle(false);
    };
    const requestFrame = () => {
      if (destroyed) return;
      renderUntil = performance.now() + RENDER_TAIL_MS;
      if (!globe || rendering) return;
      rendering = true;
      globe.toggle(true);
    };

    const cleanup = (killTrigger = true) => {
      if (destroyed) return;
      destroyed = true;
      if (killTrigger) trigger?.kill();
      observer?.disconnect();
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
      if (globe) {
        globe.resize();
        requestFrame();
        return;
      }
      globe = createGlobe(canvas, {
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
          state.phi = phi;
          state.width = size * dpr;
          state.height = size * dpr;
          if (!ready) {
            ready = true;
            canvas.classList.add("is-ready");
          }
          if (performance.now() > renderUntil) pause();
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
        start: "top top",
        end: "bottom bottom",
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

    mount._membersGlobeInstance = { destroy };
  });
}
