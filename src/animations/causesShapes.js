import { gsap, ScrollTrigger } from "../lib/gsap.js";

/**
 * Morph one square Social Causes tile at a time by tweening its four
 * border-radius values. Border-radius preserves the tile's layout and text
 * position while expressing all four authored shapes without SVG morphing or
 * a crossfade. The repeating timeline follows the Osmo Logo Wall Cycle:
 * repeatDelay spaces swaps by two seconds and a shuffled tile pattern makes
 * every tile morph once per round. The shared "smooth" ease comes from
 * lib/gsap.js; ScrollTrigger and visibilitychange keep the cycle active only
 * while the section is visible and the document is visible. Reduced-motion
 * users keep the static authored shapes. Text stays centred and does not move,
 * so a tile only morphs into a shape whose rounded corners still contain its
 * text. The
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
const REVEAL_DURATION = 0.6;
const REVEAL_STAGGER = 0.04;
const REVEAL_DISTANCE = "2em";
const REVEAL_EASE = "power4.inOut";
const MOBILE_REVEAL_START = "top 95%";
const MOBILE_REVEAL_END = "top 70%";
const MOBILE_REVEAL_SCRUB = 0.5;

export function initCausesShapes() {
  document.querySelectorAll("[data-causes-init]").forEach((section) => {
    teardown(section);

    const tiles = [...section.querySelectorAll("[data-causes-tile]")];
    if (tiles.length === 0) return;
    const grid = section.querySelector("[data-causes-grid]") || section;

    const matchMedia = gsap.matchMedia();
    section._causesShapesMatchMedia = matchMedia;
    matchMedia.add(
      {
        isMobile: "(max-width: 767px)",
        isDesktop: "(min-width: 768px)",
        reduceMotion: "(prefers-reduced-motion: reduce)",
      },
      (context) => {
        const { isMobile, reduceMotion } = context.conditions;
        if (reduceMotion) {
          gsap.set(tiles, { clearProps: "y,autoAlpha,borderRadius" });
          section._causesShapes = null;
          return;
        }

        const instance = createInstance(section, tiles, grid, isMobile);
        instance.matchMedia = matchMedia;
        section._causesShapes = instance;
        buildReveal(instance);
        buildMorph(instance);

        return () => {
          destroyInstance(instance);
          if (section._causesShapes === instance) section._causesShapes = null;
        };
      },
    );
  });
}

function createInstance(section, tiles, grid, isMobile) {
  const instance = {
    section,
    tiles,
    grid,
    isMobile,
    pattern: shuffleArray(tiles.map((_, index) => index)),
    patternIndex: 0,
    currentTween: null,
    timeline: null,
    revealTimeline: null,
    revealTrigger: null,
    revealTriggers: [],
    revealTweens: [],
    visibleTiles: [],
    revealed: false,
    trigger: null,
    visibilityHandler: null,
    swapNext: null,
    fitsShape: null,
    matchMedia: null,
  };

  tiles.forEach((tile) => {
    const shape = tile.dataset.causesShape;
    gsap.set(tile, { borderRadius: SHAPES[shape] || SHAPES.square });
    gsap.set(tile, { y: REVEAL_DISTANCE, autoAlpha: 0 });
  });

  instance.swapNext = () => swapNext(instance);
  instance.fitsShape = (tileIndex, shapeName) =>
    fitsShape(instance.tiles[tileIndex], shapeName);
  return instance;
}

function buildReveal(instance) {
  if (instance.isMobile) {
    instance.visibleTiles = instance.tiles.filter((tile) => tile.offsetParent !== null);
    instance.revealTweens = instance.visibleTiles.map((tile) => {
      const tween = gsap.to(tile, {
        y: 0,
        autoAlpha: 1,
        ease: "none",
        scrollTrigger: {
          trigger: tile,
          start: MOBILE_REVEAL_START,
          end: MOBILE_REVEAL_END,
          scrub: MOBILE_REVEAL_SCRUB,
          invalidateOnRefresh: true,
          onUpdate: () => updateMobileRevealState(instance),
          onRefresh: () => updateMobileRevealState(instance),
        },
      });
      instance.revealTriggers.push(tween.scrollTrigger);
      return tween;
    });
    instance.revealTrigger = instance.revealTriggers[0] || null;
    updateMobileRevealState(instance);
    return;
  }

  instance.revealTimeline = gsap.timeline({
    paused: true,
    onComplete: () => {
      setRevealState(instance, true);
      if (instance.trigger?.isActive) instance.playMorph();
    },
  });
  instance.tiles.forEach((tile, index) => {
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
    trigger: instance.grid,
    start: "top 80%",
    once: true,
    onEnter: () => instance.revealTimeline.play(),
  });
}

function updateMobileRevealState(instance) {
  const complete = instance.revealTriggers.length > 0 &&
    instance.revealTriggers.every((trigger) => trigger.progress >= 0.9999);
  setRevealState(instance, complete);
}

function setRevealState(instance, complete) {
  instance.revealed = complete;
  if (complete) {
    if (instance.trigger?.isActive) instance.playMorph?.();
  } else if (instance.isMobile) {
    instance.pauseMorph?.(true);
  }
}

function buildMorph(instance) {
  instance.timeline = gsap.timeline({
    repeat: -1,
    repeatDelay: 2,
    delay: 2,
    paused: true,
  }).call(instance.swapNext);

  instance.playMorph = () => {
    if (!document.hidden && instance.revealed) instance.timeline.play();
  };
  instance.pauseMorph = (cancelTween = false) => {
    instance.timeline.pause();
    if (cancelTween) {
      instance.currentTween?.kill();
      instance.currentTween = null;
    }
  };
  instance.trigger = ScrollTrigger.create({
    trigger: instance.section,
    start: "top bottom",
    end: "bottom top",
    onEnter: instance.playMorph,
    onEnterBack: instance.playMorph,
    onLeave: instance.pauseMorph,
    onLeaveBack: instance.pauseMorph,
  });
  instance.visibilityHandler = () => {
    if (document.hidden) {
      instance.pauseMorph();
    } else if (instance.trigger.isActive) {
      instance.playMorph();
    }
  };
  document.addEventListener("visibilitychange", instance.visibilityHandler);
  if (instance.revealed && instance.trigger.isActive) instance.playMorph();
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
  const matchMedia = previous?.matchMedia || section._causesShapesMatchMedia;
  section._causesShapesMatchMedia = null;
  matchMedia?.revert();
  if (!previous || matchMedia) {
    section._causesShapes = null;
    return;
  }

  destroyInstance(previous);
  section._causesShapes = null;
}

function destroyInstance(instance) {
  instance.currentTween?.kill();
  instance.timeline?.kill();
  instance.revealTriggers?.forEach((trigger) => trigger.kill());
  instance.revealTweens?.forEach((tween) => tween.kill());
  instance.revealTrigger?.kill();
  instance.revealTimeline?.revert();
  instance.revealTimeline?.kill();
  instance.trigger?.kill();
  if (instance.visibilityHandler) {
    document.removeEventListener("visibilitychange", instance.visibilityHandler);
  }
  gsap.set(instance.tiles, { clearProps: "y,autoAlpha,borderRadius" });
}
