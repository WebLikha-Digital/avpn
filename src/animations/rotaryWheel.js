import { gsap, ScrollTrigger } from "../lib/gsap.js";
import { horizontalScrollerFor } from "./horizontalScroller.js";

// The wheel's geometry, all three measured off days.christou1910.com.
//
// Two numbers define the path a card travels: the chord between neighbouring
// slots (how far apart cards sit vertically) and the drift (how far right a
// card swings as it leaves the slot). The reference runs 14° apart on a 3159px
// rim, which works out to a 770px chord and 93.8px of drift per step. Against
// its ~989px frame that is 0.78 and 0.095 of the stage height, so both are
// expressed as ratios here and survive a change of viewport:
//
//   chord = 2 · RADIUS_RATIO · sin(STEP_DEGREES / 2) = 0.78 × stage height
//   drift = RADIUS_RATIO · (1 − cos STEP_DEGREES)    = 0.095 × stage height
//
// RADIUS_RATIO 3.2 at 14° reproduces both at once. The radius is what sets the
// curvature: a larger one flattens the arc toward a straight vertical line,
// a smaller one makes cards visibly swing in from the side. An earlier version
// of this file took 8.8° on a 5× rim from the Figma file, which matched the
// reference's spacing but only half its sideways swing — the cards travelled
// too straight, and the wheel read as a vertical slider rather than a wheel.
//
// The chord is also a hard ceiling on card height: a card taller than
// 0.78 × stage height overlaps the one queued behind it.
//
// SCALE_FALLOFF is the third: the queued card's bounding box only resolves to
// the card's own proportions if it is scaled to 0.85 as well as turned, so a
// card shrinks by that factor for each step it sits away from the slot. It is
// the depth cue that stops the rim from looking flat.
const STEP_DEGREES = 14;
const RADIUS_RATIO = 3.2;
const SCALE_FALLOFF = 0.85;

/**
 * A wheel of cards that turns while the horizontal band it lives in is parked.
 *
 * The panel is pinned inside [data-hscroll-init], so horizontal motion stops,
 * the wheel rotates through its cards, and horizontal motion resumes — a
 * vertical sequence nested inside a horizontal one. The pin is an ordinary
 * ScrollTrigger `pin` aimed at the band's viewport with `horizontal: true`,
 * which is only possible because the band is a real scroll container.
 *
 * Geometry is two rotations sharing one origin. Every card sits stacked at the
 * same point — the slot where the active card belongs — and is rotated about a
 * centre `radius` to its right, which flings card *i* down and slightly right
 * along the rim. The hub then rotates the whole set the other way, lifting each
 * card in turn through the slot. Because the cards and the hub share that
 * origin, no card needs its own offset: `rotation` is the only property written.
 *
 * Card count comes from the DOM, so cards can be added or removed in the
 * Designer without touching this file.
 *
 * Webflow contract:
 *   [data-rotary-wheel-init]   panel inside the track; its width beyond the
 *                              stage is the pin distance, so a wider panel
 *                              means a slower wheel
 *   [data-rotary-wheel-stage]  the pinned, viewport-sized box; it has to sit at
 *                              the panel's leading edge, so the panel must not
 *                              centre it — once pinned, the pin-spacer's
 *                              padding is what supplies the remaining width
 *   [data-rotary-wheel-hub]    positioned at the active card's slot; rotated
 *   [data-rotary-wheel-item]   one per card, all stacked on the hub's origin
 *   [data-rotary-wheel-count]  optional, text set to the number of cards
 *
 * Required CSS — the stacking is structural:
 *
 *   [data-rotary-wheel-stage] { position: relative; overflow: hidden; }
 *   [data-rotary-wheel-hub]   { position: absolute; left: 50%; top: 50%;
 *                               width: 0; height: 0; }
 *   [data-rotary-wheel-item]  { position: absolute; left: 0; top: 0; }
 *
 * Tunables live on the panel as CSS custom properties so the Designer owns
 * them: --rotary-wheel-step (degrees between cards), --rotary-wheel-radius
 * (rim distance in px; defaults to a multiple of the stage height) and
 * --rotary-wheel-scale (size a card keeps per step away from the slot; 1
 * disables the depth cue), and --rotary-wheel-hold (extra parked card steps
 * after the last card; defaults to 0). A hold keeps the panel's pin distance
 * unchanged and consumes the final hold/(lastIndex + hold) share of it.
 * Draw-path wrappers inside this panel may opt into that phase with
 * data-draw-scroll-wheel-hold; the panel exposes the live mapping on
 * _rotaryWheelState for that component.
 * The card nearest the slot carries [data-rotary-wheel-state="active"], so CSS
 * owns how the focused card differs from the ones queued behind it.
 */
export function initRotaryWheel() {
  document.querySelectorAll("[data-rotary-wheel-init]").forEach((panel) => {
    // Idempotent re-init: the pin has to go before anything is measured, since
    // a live pin-spacer is part of the width this reads back.
    panel._rotaryWheelTrigger?.kill();
    panel._rotaryWheelTrigger = null;
    panel._rotaryWheelState = null;

    const stage = panel.querySelector("[data-rotary-wheel-stage]");
    const hub = panel.querySelector("[data-rotary-wheel-hub]");
    const items = [...panel.querySelectorAll("[data-rotary-wheel-item]")];
    const count = panel.querySelector("[data-rotary-wheel-count]");

    gsap.set([hub, ...items].filter(Boolean), {
      clearProps: "transform,transformOrigin,scale",
    });

    if (!stage || !hub || items.length < 2) return;

    // No band means no horizontal scroll position to pin against — the mobile
    // breakpoint, or a page where the band opted out. The cards stay where the
    // Designer's stacked layout puts them.
    const scroller = horizontalScrollerFor(panel);
    if (!scroller) return;

    const styles = getComputedStyle(panel);
    const step =
      Number.parseFloat(styles.getPropertyValue("--rotary-wheel-step")) ||
      STEP_DEGREES;
    const radius =
      Number.parseFloat(styles.getPropertyValue("--rotary-wheel-radius")) ||
      stage.offsetHeight * RADIUS_RATIO;
    // Not `||`: a scale of 0 is meaningless but 1 is a legitimate "no depth
    // cue", and `||` would silently swap it for the default.
    const authoredScale = Number.parseFloat(
      styles.getPropertyValue("--rotary-wheel-scale"),
    );
    const scaleFalloff = Number.isFinite(authoredScale)
      ? authoredScale
      : SCALE_FALLOFF;
    const authoredHold = Number.parseFloat(
      styles.getPropertyValue("--rotary-wheel-hold"),
    );
    const hold = Number.isFinite(authoredHold) ? Math.max(0, authoredHold) : 0;

    const origin = `${radius}px 0px`;
    const lastIndex = items.length - 1;
    const totalSteps = lastIndex + hold;
    const turnProgress = totalSteps ? lastIndex / totalSteps : 1;

    gsap.set(hub, { transformOrigin: origin, rotation: 0 });
    items.forEach((item, i) => {
      gsap.set(item, { transformOrigin: origin, rotation: -i * step });
    });

    if (count) count.textContent = String(items.length);

    let activeIndex = -1;
    const setActive = (index) => {
      if (index === activeIndex) return;
      activeIndex = index;
      items.forEach((item, i) =>
        item.setAttribute("data-rotary-wheel-state", i === index ? "active" : ""),
      );
    };

    // quickSetter skips GSAP's per-call property parsing; this runs on every
    // scroll frame the panel is pinned for — once for the hub, once per card.
    const setRotation = gsap.quickSetter(hub, "rotation", "deg");
    // "css" rather than a "scale" quickSetter: `scale` is a CSSPlugin
    // shorthand, not a transform-cache property, so quickSetter(item, "scale")
    // resolves to nothing and writes silently. Rotation has no such problem,
    // which is exactly what makes the failure easy to miss.
    const setScales = items.map((item) => gsap.quickSetter(item, "css"));

    const render = (progress) => {
      // Position on the rim, in card units: 0 parks the first card in the
      // slot, lastIndex parks the last one there. When a hold is authored,
      // progress reaches lastIndex at the start of the parked tail and stays
      // there for its remainder.
      const position =
        hold > 0
          ? progress > turnProgress
            ? lastIndex
            : (progress / turnProgress) * lastIndex
          : progress * lastIndex;
      setRotation(position * step);

      // Continuous, not stepped. A card is only full size at the exact moment
      // it occupies the slot, so the growing and shrinking track the scroll
      // rather than snapping as the active index flips.
      items.forEach((_, i) => {
        setScales[i]({ scale: scaleFalloff ** Math.abs(i - position) });
      });

      setActive(Math.min(lastIndex, Math.max(0, Math.round(position))));
    };

    const trigger = ScrollTrigger.create({
      trigger: panel,
      scroller,
      horizontal: true,
      start: "left left",
      // The panel's own width, minus the one stage it shows at a time. Authoring
      // the duration as panel width is what keeps the track's total width
      // unchanged once the pin-spacer replaces it — the band's height stays
      // correct without knowing this trigger exists. Read as a function so it
      // re-measures on refresh rather than baking in a first-paint width.
      end: () => `+=${Math.max(1, panel.offsetWidth - stage.offsetWidth)}`,
      pin: stage,
      pinType: "transform",
      anticipatePin: 1,
      scrub: true,
      onUpdate: (self) => render(self.progress),
      onRefresh: (self) => render(self.progress),
    });

    panel._rotaryWheelTrigger = trigger;
    panel._rotaryWheelState = { trigger, hold, turnProgress };
    render(trigger.progress);
  });
}
