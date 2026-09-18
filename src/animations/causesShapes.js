import { gsap, ScrollTrigger } from "../lib/gsap.js";

/**
 * Morph one square Social Causes tile at a time by tweening its four
 * border-radius values. Border-radius preserves the tile's layout and text
 * position while expressing all eight authored shapes without SVG morphing or
 * a crossfade. The repeating timeline follows the Osmo Logo Wall Cycle:
 * repeatDelay spaces swaps by four seconds and a shuffled tile pattern makes
 * every tile morph once per round. The shared "smooth" ease comes from
 * lib/gsap.js; ScrollTrigger and visibilitychange keep the cycle active only
 * while the section is visible and the document is visible. Reduced-motion
 * users keep the static authored shapes.
 *
 * Webflow's contract is [data-causes-init] containing
 * [data-causes-tile][data-causes-shape] elements. The data-causes-shape value
 * selects the start shape and is written back when each tween completes so
 * the CSS and JavaScript state remain aligned.
 */
const SHAPES = Object.freeze({
  square: "15% 15% 15% 15%",
  circle: "50% 50% 50% 50%",
  "leaf-a": "25% 0% 25% 0%",
  "leaf-b": "0% 25% 0% 25%",
  "quarter-tl": "100% 0% 0% 0%",
  "quarter-tr": "0% 100% 0% 0%",
  "quarter-br": "0% 0% 100% 0%",
  "quarter-bl": "0% 0% 0% 100%",
});

const SHAPE_NAMES = Object.keys(SHAPES);

export function initCausesShapes() {
  document.querySelectorAll("[data-causes-init]").forEach((section) => {
    teardown(section);

    const tiles = [...section.querySelectorAll("[data-causes-tile]")];
    if (tiles.length === 0) return;

    const reducedMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reducedMotion) return;

    const pattern = shuffleArray(tiles.map((_, index) => index));
    const instance = {
      section,
      tiles,
      pattern,
      patternIndex: 0,
      currentTween: null,
      timeline: null,
      trigger: null,
      visibilityHandler: null,
      swapNext: null,
    };

    tiles.forEach((tile) => {
      const shape = tile.dataset.causesShape;
      gsap.set(tile, { borderRadius: SHAPES[shape] || SHAPES.square });
    });

    instance.swapNext = () => swapNext(instance);
    instance.timeline = gsap.timeline({
      repeat: -1,
      repeatDelay: 4,
      delay: 4,
      paused: true,
    }).call(instance.swapNext);

    const play = () => {
      if (!document.hidden) instance.timeline.play();
    };
    const pause = () => instance.timeline.pause();
    instance.trigger = ScrollTrigger.create({
      trigger: section,
      start: "top bottom",
      end: "bottom top",
      onEnter: play,
      onEnterBack: play,
      onLeave: pause,
      onLeaveBack: pause,
    });
    instance.visibilityHandler = () => {
      if (document.hidden) pause();
      else if (instance.trigger.isActive) play();
    };
    document.addEventListener("visibilitychange", instance.visibilityHandler);
    section._causesShapes = instance;
  });
}

function swapNext(instance) {
  if (instance.patternIndex >= instance.pattern.length) {
    instance.pattern = shuffleArray(instance.tiles.map((_, index) => index));
    instance.patternIndex = 0;
  }

  const tile = instance.tiles[instance.pattern[instance.patternIndex]];
  instance.patternIndex += 1;
  const currentShape = tile.dataset.causesShape;
  const choices = SHAPE_NAMES.filter((shape) => shape !== currentShape);
  const targetShape = choices[Math.floor(Math.random() * choices.length)];

  instance.currentTween = gsap.to(tile, {
    borderRadius: SHAPES[targetShape],
    duration: 0.9,
    ease: "smooth",
    overwrite: "auto",
    onComplete: () => {
      if (tile.dataset.causesShape === currentShape) {
        tile.dataset.causesShape = targetShape;
      }
    },
  });
}

function shuffleArray(values) {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }
  return values;
}

function teardown(section) {
  const previous = section._causesShapes;
  if (!previous) return;

  previous.currentTween?.kill();
  previous.timeline?.kill();
  previous.trigger?.kill();
  if (previous.visibilityHandler) {
    document.removeEventListener("visibilitychange", previous.visibilityHandler);
  }
  gsap.set(previous.tiles, { clearProps: "borderRadius" });
  section._causesShapes = null;
}
