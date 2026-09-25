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
 * users keep the static authored shapes. Text stays centred and does not move,
 * so a tile only morphs into a shape whose rounded corners still contain its
 * text; quarter shapes are used only when their arcs fit. The
 * data-causes-shape start shape authored in Webflow should itself fit the
 * tile's text, though authored starts are not validated by this morph rule.
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

const SHAPE_RADII = Object.freeze(
  Object.fromEntries(
    Object.entries(SHAPES).map(([name, value]) => [
      name,
      Object.freeze(value.split(" ").map((radius) => parseFloat(radius) / 100)),
    ]),
  ),
);
const SHAPE_NAMES = Object.keys(SHAPES);
// A 2% slack is the measured line between ink clearly inside and ink touching
// the arc on published tiles. Authored start shapes are not validated by this
// morph-decision rule.
const FIT_TOLERANCE = 0.02;
const REVEAL_DURATION = 0.8;
const REVEAL_STAGGER = 0.06;
const REVEAL_DISTANCE = "2em";
const REVEAL_EASE = "power4.inOut";

export function initCausesShapes() {
  document.querySelectorAll("[data-causes-init]").forEach((section) => {
    teardown(section);

    const tiles = [...section.querySelectorAll("[data-causes-tile]")];
    if (tiles.length === 0) return;
    const grid = section.querySelector("[data-causes-grid]") || section;

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
      revealTimeline: null,
      revealTrigger: null,
      revealed: false,
      trigger: null,
      visibilityHandler: null,
      swapNext: null,
      fitsShape: null,
    };

    tiles.forEach((tile) => {
      const shape = tile.dataset.causesShape;
      gsap.set(tile, { borderRadius: SHAPES[shape] || SHAPES.square });
      gsap.set(tile, { y: REVEAL_DISTANCE, autoAlpha: 0 });
    });

    instance.swapNext = () => swapNext(instance);
    instance.fitsShape = (tileIndex, shapeName) =>
      fitsShape(instance.tiles[tileIndex], shapeName);
    instance.revealTimeline = gsap.timeline({
      paused: true,
      onComplete: () => {
        instance.revealed = true;
        if (instance.trigger?.isActive) play();
      },
    });
    tiles.forEach((tile, index) => {
      instance.revealTimeline.to(
        tile,
        {
          y: 0,
          autoAlpha: 1,
          duration: REVEAL_DURATION,
          ease: REVEAL_EASE,
          clearProps: "y,autoAlpha",
        },
        index * REVEAL_STAGGER,
      );
    });
    instance.revealTrigger = ScrollTrigger.create({
      trigger: grid,
      start: "top 80%",
      once: true,
      onEnter: () => {
        instance.revealTimeline.play();
      },
    });

    instance.timeline = gsap.timeline({
      repeat: -1,
      repeatDelay: 4,
      delay: 4,
      paused: true,
    }).call(instance.swapNext);

    const play = () => {
      if (!document.hidden && instance.revealed) instance.timeline.play();
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
      if (document.hidden) {
        pause();
      } else if (instance.trigger.isActive) {
        play();
      }
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
  const choices = SHAPE_NAMES.filter(
    (shape) => shape !== currentShape && fitsShape(tile, shape),
  );
  if (choices.length === 0) {
    instance.currentTween = null;
    return;
  }
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

function fitsShape(tile, shapeName) {
  const tileRect = tile?.getBoundingClientRect();
  const radii = SHAPE_RADII[shapeName];
  if (!tileRect || !radii || tileRect.width <= 0) return false;

  const textBoxes = getTextBoxes(tile);
  return textBoxes.length > 0 && textBoxes.every((box) =>
    [
      [box.left, box.top],
      [box.right, box.top],
      [box.right, box.bottom],
      [box.left, box.bottom],
    ].every(([x, y]) => {
      const point = [
        (x - tileRect.left) / tileRect.width,
        (y - tileRect.top) / tileRect.width,
      ];
      return radii.every((radius, cornerIndex) => {
        if (radius <= 0) return true;
        const inCornerSquare = [
          point[0] <= radius && point[1] <= radius,
          point[0] >= 1 - radius && point[1] <= radius,
          point[0] >= 1 - radius && point[1] >= 1 - radius,
          point[0] <= radius && point[1] >= 1 - radius,
        ][cornerIndex];
        if (!inCornerSquare) return true;

        const centers = [
          [radius, radius],
          [1 - radius, radius],
          [1 - radius, 1 - radius],
          [radius, 1 - radius],
        ];
        const [centerX, centerY] = centers[cornerIndex];
        return (
          Math.hypot(point[0] - centerX, point[1] - centerY) <=
          radius * (1 + FIT_TOLERANCE)
        );
      });
    }),
  );
}

function getTextBoxes(tile) {
  const boxes = [];
  tile.querySelectorAll("p").forEach((paragraph) => {
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    const styles = getComputedStyle(paragraph);
    const lineHeight = parseFloat(styles.lineHeight);
    const fontSize = parseFloat(styles.fontSize);
    const inset = Number.isFinite(lineHeight) && Number.isFinite(fontSize)
      ? (lineHeight - fontSize) / 2
      : 0;

    [...range.getClientRects()].forEach((rect) => {
      if (rect.width === 0 || rect.height === 0) return;
      boxes.push({
        left: rect.left,
        top: rect.top + inset,
        right: rect.right,
        bottom: rect.bottom - inset,
      });
    });
  });
  return boxes;
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
  previous.revealTrigger?.kill();
  previous.revealTimeline?.revert();
  previous.revealTimeline?.kill();
  previous.trigger?.kill();
  if (previous.visibilityHandler) {
    document.removeEventListener("visibilitychange", previous.visibilityHandler);
  }
  gsap.set(previous.tiles, { clearProps: "y,autoAlpha,borderRadius" });
  section._causesShapes = null;
}
