import { gsap } from "../lib/gsap.js";

const DEFAULT_DURATION = 0.4;
// How far the thumbnail travels in from the left before it settles. Small
// enough that the image is already legible as it arrives.
const DEFAULT_SHIFT = 40;
const ENTER_SCALE = 0.7;

/**
 * A list where hovering a row fills it edge to edge and slides a thumbnail in
 * from the left, while the rows around it drop back.
 *
 * Used by Programmes Overview and the Goals list, so nothing here knows either
 * section's class names — the whole contract is `data-hover-*`.
 *
 * The split between JS and CSS is deliberate, and matches the drum: JS owns the
 * two things that have to move (the bar wiping open, the thumbnail arriving),
 * and flips one attribute for everything else. Colour, the arrow filling, and
 * the dimming of the other rows are CSS transitions keyed off
 * [data-hover-state] — cheaper than tweening every sibling on every pointer
 * move, and it puts those values where the Designer can see them.
 *
 * Webflow contract:
 *   [data-hover-list-init]   the list
 *   [data-hover-row]         one row; gets data-hover-state="active"|"idle"
 *   [data-hover-bg]          the fill that wipes open behind the row
 *   [data-hover-thumb]       the image that slides in
 *
 * The list itself also carries data-hover-state="active" while any row is
 * hovered, which is what CSS hangs the sibling dimming off.
 *
 * Required CSS — the resting state has to hold with no JS, or a failed bundle
 * leaves every row wearing its own fill:
 *
 *   [data-hover-bg]    { transform: scaleY(0); transform-origin: center; }
 *   [data-hover-thumb] { opacity: 0; }
 *
 * Tunables on the list: --hover-reveal-duration (seconds),
 * --hover-reveal-shift (pixels the thumbnail travels).
 *
 * Touch devices get the static list. A row fill triggered by a tap would fire
 * on the same gesture that follows the link, so it reads as a stutter on the
 * way out of the page.
 */
export function initListHoverReveal() {
  const hoverable = window.matchMedia("(hover: hover) and (pointer: fine)");

  document.querySelectorAll("[data-hover-list-init]").forEach((list) => {
    // Idempotent re-init: listeners are stashed on the node, so a re-run
    // removes the previous set instead of stacking a second one on top.
    teardown(list);

    if (!hoverable.matches) return;

    const rows = [...list.querySelectorAll("[data-hover-row]")];
    if (!rows.length) return;

    const styles = getComputedStyle(list);
    const duration =
      parseFloat(styles.getPropertyValue("--hover-reveal-duration")) ||
      DEFAULT_DURATION;
    const shift =
      parseFloat(styles.getPropertyValue("--hover-reveal-shift")) ||
      DEFAULT_SHIFT;

    // Reduced motion keeps the state change and drops the movement: the row
    // still says which one you are on, it just does not wipe or slide.
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    rows.forEach((row) => {
      row.setAttribute("data-hover-state", "idle");
      row._hoverRevealTimeline = still
        ? null
        : buildTimeline(row, duration, shift);
    });

    let active = null;

    const activate = (row) => {
      if (row === active) return;
      if (active) active.setAttribute("data-hover-state", "idle");

      active?._hoverRevealTimeline?.reverse();
      active = row;

      row.setAttribute("data-hover-state", "active");
      list.setAttribute("data-hover-state", "active");
      row._hoverRevealTimeline?.play();
    };

    const clear = () => {
      if (!active) return;
      active.setAttribute("data-hover-state", "idle");
      active._hoverRevealTimeline?.reverse();
      active = null;
      list.setAttribute("data-hover-state", "idle");
    };

    // pointerover/pointerout rather than enter/leave: these bubble, so one pair
    // of listeners covers a list of any length and survives rows being added.
    const onOver = (event) => {
      const row = event.target.closest?.("[data-hover-row]");
      if (row && list.contains(row)) activate(row);
    };

    // Fires on every move between a row's own children too, so only act when
    // the pointer has actually left the list.
    const onOut = (event) => {
      const next = event.relatedTarget;
      if (next instanceof Node && list.contains(next)) return;
      clear();
    };

    // Keyboard parity: the rows are links, so tabbing through them has to light
    // the same states the pointer does.
    const onFocus = (event) => {
      const row = event.target.closest?.("[data-hover-row]");
      if (row && list.contains(row)) activate(row);
    };

    const onBlur = (event) => {
      const next = event.relatedTarget;
      if (next instanceof Node && list.contains(next)) return;
      clear();
    };

    list.addEventListener("pointerover", onOver);
    list.addEventListener("pointerout", onOut);
    list.addEventListener("focusin", onFocus);
    list.addEventListener("focusout", onBlur);

    list.setAttribute("data-hover-state", "idle");
    list._hoverReveal = { onOver, onOut, onFocus, onBlur, rows };
  });
}

/**
 * One paused timeline per row, played forward on enter and reversed on leave.
 * Building it once means a pointer sweeping down the list plays existing
 * timelines instead of creating a tween per row per pass.
 *
 * fromTo, not from: the start values are the resting CSS state, and stating
 * them here keeps the reverse landing exactly back on it rather than on
 * whatever the row happened to be showing when the timeline was built.
 */
function buildTimeline(row, duration, shift) {
  const bg = row.querySelector("[data-hover-bg]");
  const thumb = row.querySelector("[data-hover-thumb]");
  if (!bg && !thumb) return null;

  const timeline = gsap.timeline({
    paused: true,
    defaults: { duration, ease: "power3.out" },
  });

  if (bg) timeline.fromTo(bg, { scaleY: 0 }, { scaleY: 1 }, 0);

  if (thumb) {
    timeline.fromTo(
      thumb,
      { autoAlpha: 0, x: -shift, scale: ENTER_SCALE },
      { autoAlpha: 1, x: 0, scale: 1, duration: duration * 1.15 },
      0
    );
  }

  return timeline;
}

function teardown(list) {
  const previous = list._hoverReveal;
  if (!previous) return;

  list.removeEventListener("pointerover", previous.onOver);
  list.removeEventListener("pointerout", previous.onOut);
  list.removeEventListener("focusin", previous.onFocus);
  list.removeEventListener("focusout", previous.onBlur);

  previous.rows.forEach((row) => {
    row._hoverRevealTimeline?.kill();
    row._hoverRevealTimeline = null;
    row.removeAttribute("data-hover-state");
    gsap.set(row.querySelectorAll("[data-hover-bg], [data-hover-thumb]"), {
      clearProps: "opacity,visibility,transform",
    });
  });

  list.removeAttribute("data-hover-state");
  list._hoverReveal = null;
}
