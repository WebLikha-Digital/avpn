import { gsap, ScrollTrigger } from "../lib/gsap.js";

// The dial's geometry. STEP_ROTATION is the angle between neighbouring numbers
// on the drum's face. SHIFT_PER_DEGREE converts a number's rotation into its
// vertical offset, as a percentage of its own height — so a number turned -30
// degrees also sits 75% of its height below centre. Tying the two together is
// what makes the type read as printed on a cylinder rather than sliding on a
// flat plane: too little shift and the numbers pile up at the pill's centre,
// too much and they escape the arc before they've turned. The negative sign is
// what puts the incoming number below the outgoing one, so the dial turns
// towards you as you scroll down.
//
// OPACITY_FALLOFF fades a number out over ~1.43 steps, so at any scroll position
// the outgoing and incoming numbers are both faintly present and the active one
// is never quite alone.
const STEP_ROTATION = 30;
const SHIFT_PER_DEGREE = -2.5;
const OPACITY_FALLOFF = 0.7;

/**
 * Scroll-driven number drum for the Key Highlights section.
 *
 * [data-highlight-drum-init] marks the tall scroll track — the section's own
 * height is the scrub distance, and a `position: sticky` child does the pinning,
 * so there is no ScrollTrigger pin here and nothing to fight Locomotive over.
 *
 * Inside it:
 *   [data-highlight-drum-track]   the pill; owns the perspective and the mask
 *   [data-highlight-drum-item]    one stacked number per stat, in DOM order
 *   [data-highlight-drum-title]   one caption per stat, same order and count
 *   [data-highlight-drum-counter] text set to the 1-based active index
 *   [data-highlight-drum-total]   text set to the number of stats
 *
 * Each item may also carry [data-highlight-drum-gradient="<from>,<to>"] — the
 * two colour stops of the section's background for that stat, bottom stop
 * first. When every item has one, the section's gradient scrubs between
 * neighbouring pairs on the same progress that turns the drum, so the colour
 * is mid-blend exactly while the numbers are. Miss the attribute on any item
 * and the whole gradient is left alone, so the section keeps whatever the
 * Designer gave it.
 *
 * Item count comes from the DOM, so stats can be added or removed in the
 * Designer without touching this file.
 *
 * The numbers are scrubbed continuously while the captions are stepped: JS
 * writes transforms every frame for the drum, but only flips one attribute per
 * caption when the active index changes, letting the CSS transition carry it.
 * That split is deliberate — a dial that tracks your scroll 1:1 next to copy
 * that snaps is what sells the thing as physical. Scrubbing the captions too
 * makes the whole section feel like it is being dragged.
 *
 * Tunables live on the container as CSS custom properties so the Designer owns
 * them: --highlight-drum-rotation (degrees between numbers) and
 * --highlight-drum-falloff (opacity lost per step away from centre).
 */
export function initHighlightDrum() {
  document.querySelectorAll("[data-highlight-drum-init]").forEach((section) => {
    // Idempotent re-init: drop the previous trigger and any transforms it left
    // behind before measuring again, so a resize rebuild starts from the CSS
    // resting state rather than from mid-scroll values.
    section._highlightDrumTrigger?.kill();
    section._highlightDrumTrigger = null;
    section.style.removeProperty("--highlight-drum-grad-from");
    section.style.removeProperty("--highlight-drum-grad-to");

    const items = [...section.querySelectorAll("[data-highlight-drum-item]")];
    const titles = [...section.querySelectorAll("[data-highlight-drum-title]")];
    const counter = section.querySelector("[data-highlight-drum-counter]");
    const total = section.querySelector("[data-highlight-drum-total]");

    if (items.length < 2) return;

    gsap.set(items, { clearProps: "transform,opacity" });
    // rotationX already puts every item on a 3D matrix, so they are composited
    // layers from the first frame — force3D would add nothing here.

    const styles = getComputedStyle(section);
    const rotation =
      parseFloat(styles.getPropertyValue("--highlight-drum-rotation")) ||
      STEP_ROTATION;
    const falloff =
      parseFloat(styles.getPropertyValue("--highlight-drum-falloff")) ||
      OPACITY_FALLOFF;

    // quickSetter skips GSAP's per-call property parsing — this runs on every
    // one of the section's scroll frames, once per number.
    const setters = items.map((item) => ({
      transform: gsap.quickSetter(item, "css"),
    }));

    // [[from, to], ...] in item order, or null if any item is missing its pair.
    const palette = readPalette(items);
    if (palette) {
      section.style.setProperty("--highlight-drum-grad-from", palette[0][0]);
      section.style.setProperty("--highlight-drum-grad-to", palette[0][1]);
    }

    const lastIndex = items.length - 1;
    if (total) total.textContent = pad(items.length);

    // Reduced motion keeps the stepping but drops the dial: the CSS flattens
    // every number onto the pill's face, so all this has to do is show one.
    const flat = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let activeIndex = -1;

    const setActive = (index) => {
      if (index === activeIndex) return;
      activeIndex = index;

      titles.forEach((title, i) => {
        // "prev" and the unset state are both invisible, but they sit on
        // opposite sides of the caption slot, so a caption always leaves in the
        // direction the drum is turning.
        const state = i === index ? "active" : i < index ? "prev" : "next";
        title.setAttribute("data-highlight-drum-state", state);
      });

      if (counter) counter.textContent = pad(index + 1);
    };

    const render = (progress) => {
      // Position on the drum, in item units: 0 parks the first number at the
      // centre, lastIndex parks the last one there.
      const position = progress * lastIndex;

      items.forEach((item, i) => {
        const distance = i - position;
        const opacity = clamp(1 - Math.abs(distance) * falloff);

        if (flat) {
          setters[i].transform({ opacity: i === Math.round(position) ? 1 : 0 });
          return;
        }

        const rotationX = -rotation * distance;

        setters[i].transform({
          rotationX,
          yPercent: SHIFT_PER_DEGREE * rotationX,
          opacity,
        });
      });

      setActive(clampIndex(Math.round(position), lastIndex));

      if (!palette) return;

      // Flat colour per stat under reduced motion — the same snap the drum
      // makes — otherwise blend across the segment the drum is turning
      // through, so gradient and numbers are mid-transition together.
      const segment = flat
        ? clampIndex(Math.round(position), lastIndex)
        : clampIndex(Math.floor(position), lastIndex - 1);
      const t = flat ? 0 : clamp(position - segment);
      const next = palette[Math.min(segment + 1, lastIndex)];

      section.style.setProperty(
        "--highlight-drum-grad-from",
        gsap.utils.interpolate(palette[segment][0], next[0], t),
      );
      section.style.setProperty(
        "--highlight-drum-grad-to",
        gsap.utils.interpolate(palette[segment][1], next[1], t),
      );
    };

    const trigger = ScrollTrigger.create({
      trigger: section,
      start: "top top",
      end: "bottom bottom",
      scrub: true,
      onUpdate: (self) => render(self.progress),
      onRefresh: (self) => render(self.progress),
    });

    section._highlightDrumTrigger = trigger;
    render(trigger.progress);
  });
}

function readPalette(items) {
  const palette = items.map((item) =>
    (item.getAttribute("data-highlight-drum-gradient") || "")
      .split(",")
      .map((color) => color.trim())
      .filter(Boolean),
  );

  return palette.every((pair) => pair.length === 2) ? palette : null;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function clamp(value) {
  return Math.min(1, Math.max(0, value));
}

function clampIndex(value, max) {
  return Math.min(max, Math.max(0, value));
}
