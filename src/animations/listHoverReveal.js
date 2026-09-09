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
 *   [data-hover-bar]         one shared fill, a SIBLING of the list, moved to
 *                            whichever row is hovered
 *   [data-hover-bg]          per-row fill, used only when there is no shared bar
 *   [data-hover-thumb]       the image that slides in
 *
 * The shared bar exists because of stacking, not tidiness. Anything that has to
 * paint *under* a floating element while the row's text paints *over* it cannot
 * live inside the list: a scroll reveal puts a transform on the list and on each
 * row's inner wrapper, every transform opens a stacking context, and everything
 * inside one paints as a single layer. A per-row fill is therefore stuck on the
 * same side of the cursor follower as the label. One bar beside the list is not.
 *
 * The bar is positioned against its offset parent on hover, so it tracks the
 * row's real on-screen box however the list has been transformed. It is placed
 * once per enter rather than per frame, so hovering *while* scrolling can leave
 * it a frame behind the row.
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

    // Beside the list, not inside it — see the note on stacking above.
    const bar = list.parentElement?.querySelector("[data-hover-bar]") || null;

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
      // With a shared bar the row owns no fill of its own; the thumb tween is
      // all that is left, and on a list that hands its image to the cursor
      // follower there is not even that.
      row._hoverRevealTimeline = still
        ? null
        : buildTimeline(row, duration, shift, { skipBg: Boolean(bar) });
    });

    const barTimeline = bar && !still ? buildBarTimeline(bar, duration) : null;

    // The bar is absolutely positioned against its offset parent, so the row's
    // viewport box has to be translated into that parent's coordinates.
    const placeBar = (row) => {
      const parent = bar.offsetParent || bar.parentElement;
      if (!parent) return;

      const rowBox = row.getBoundingClientRect();
      const parentBox = parent.getBoundingClientRect();

      gsap.set(bar, {
        top: rowBox.top - parentBox.top,
        height: rowBox.height,
      });
    };

    let active = null;

    const activate = (row) => {
      if (row === active) return;
      if (active) active.setAttribute("data-hover-state", "idle");

      active?._hoverRevealTimeline?.reverse();
      active = row;

      row.setAttribute("data-hover-state", "active");
      list.setAttribute("data-hover-state", "active");
      row._hoverRevealTimeline?.play();

      if (bar) {
        placeBar(row);
        barTimeline?.play();
      }
    };

    const clear = () => {
      if (!active) return;
      active.setAttribute("data-hover-state", "idle");
      active._hoverRevealTimeline?.reverse();
      active = null;
      list.setAttribute("data-hover-state", "idle");
      barTimeline?.reverse();
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
    list._hoverReveal = { onOver, onOut, onFocus, onBlur, rows, bar, barTimeline };
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
function buildTimeline(row, duration, shift, { skipBg = false } = {}) {
  const bg = skipBg ? null : row.querySelector("[data-hover-bg]");
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

/**
 * The shared bar's wipe. Same shape as a row's own fill, built once because
 * there is only ever one bar — moving it between rows is a position change, not
 * a new animation.
 */
function buildBarTimeline(bar, duration) {
  return gsap.timeline({ paused: true }).fromTo(
    bar,
    { scaleY: 0 },
    { scaleY: 1, duration, ease: "power3.out" }
  );
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

  if (previous.bar) {
    previous.barTimeline?.kill();
    gsap.set(previous.bar, { clearProps: "top,height,transform" });
  }

  list.removeAttribute("data-hover-state");
  list._hoverReveal = null;
}
