import { gsap, ScrollTrigger } from "../lib/gsap.js";

// Every travel below is a fraction of the viewport height, read off the two
// Figma states (a 1438x879 frame) and divided by 879 so the section behaves the
// same on a laptop and a 27" display. Raw pixels would leave the intro halfway
// up a tall screen at the point the rows are meant to own it.
//
//   intro     y  226 -> -673.5   =>  -899.5 / 879
//   dashed    y    0 -> -916     =>  -916   / 879
//   blobs   cy  540.3 -> 137.4   =>  -402.9 / 879
//   list      y  604 -> 80       =>  -524   / 879
const INTRO_TRAVEL = 1.023;
const PATH_TRAVEL = 1.042;
const BG_TRAVEL = 0.458;
const LIST_TRAVEL = 0.596;

// The blob group's children grow 1.55x (ellipse) to 1.75x (vector) between the
// two states. One uniform scale for the group reads the same and keeps the
// gradient from tearing at the seam between them.
const BG_SCALE = 1.55;

// Rows rise this far, in pixels — an entrance offset, not a layout distance, so
// it does not scale with the viewport.
const ROW_RISE = 40;

/**
 * Programmes Overview: the intro heading travels up and out while the
 * programme list rises into the space it leaves, over one scrubbed timeline.
 *
 * [data-prog-overview-init] marks the tall scroll track — the section's own
 * height is the scrub distance and a `position: sticky` child does the pinning,
 * the same arrangement as the Key Highlights drum. No ScrollTrigger pin, so
 * there is no pin-spacer for Locomotive to fight over.
 *
 * That makes the pin length a CSS number rather than a JS one: the section is
 * `calc(100vh + var(--prog-overview-pin))` tall, so whoever owns the Designer
 * changes how long the sequence holds without touching this file.
 *
 * One timeline rather than a trigger per part. The heading's exit, the list's
 * arrival and the background's drift are the same gesture seen in three places
 * — given separate triggers they drift apart under a fast flick, which is
 * exactly when the section is most visible.
 *
 * Webflow contract:
 *   [data-prog-overview-init]     the section; its height is the scrub distance
 *   [data-prog-overview-sticky]   the sticky child that stays on screen
 *   [data-prog-overview-intro]    heading + paragraph; exits upward
 *   [data-prog-overview-line]     optional: a heading line whose indent
 *                                 collapses as it leaves
 *   [data-prog-overview-bg]       the blob group; grows and drifts up
 *   [data-prog-overview-path]     the dashed path; drifts up
 *   [data-prog-overview-warp]     optional: the warped shape; fades out early
 *   [data-prog-overview-list]     the programme list; rises into place
 *   [data-prog-overview-row]      one row of that list; staggered in
 *
 * [data-prog-overview-row] goes on a wrapper *inside* the row, not on the row
 * itself, wherever the row is also a [data-hover-row]. This reveal writes an
 * inline opacity, and an inline opacity beats the stylesheet rule the hover
 * component dims the other rows with — one element for both hooks means the
 * dimming quietly never happens.
 *
 * Required CSS — the sticky and the resting positions are structural:
 *
 *   [data-prog-overview-init]   { min-height: calc(100vh + var(--prog-overview-pin, 120vh)); }
 *   [data-prog-overview-sticky] { position: sticky; top: 0; height: 100vh; overflow: hidden; }
 *
 * The clipping goes on the sticky child, never on the section. `overflow:
 * hidden` on the section makes it the sticky element's nearest scroll
 * container, and a container that never scrolls means the child never sticks —
 * the whole sequence then rides up the page and leaves an empty gradient.
 * Everything here bleeds past the frame, so the temptation is real.
 *
 * A heading line's indent is whatever `margin-left` the Designer gives it; this
 * reads that and animates the line back to flush, so the two lines can be
 * re-indented in Webflow with no code change.
 */
export function initProgrammesOverview() {
  document.querySelectorAll("[data-prog-overview-init]").forEach((section) => {
    // Idempotent re-init: a resize rebuilds the band elsewhere on the page and
    // re-runs init, so drop the previous timeline and the transforms it wrote
    // before measuring again.
    teardown(section);

    const parts = {
      intro: section.querySelector("[data-prog-overview-intro]"),
      lines: [...section.querySelectorAll("[data-prog-overview-line]")],
      bg: section.querySelector("[data-prog-overview-bg]"),
      path: section.querySelector("[data-prog-overview-path]"),
      warp: section.querySelector("[data-prog-overview-warp]"),
      list: section.querySelector("[data-prog-overview-list]"),
      rows: [...section.querySelectorAll("[data-prog-overview-row]")],
    };

    // The intro leaving and the list arriving are the section; without both
    // there is nothing to scrub and the static layout is the honest fallback.
    if (!parts.intro || !parts.list) return;

    // Reduced motion keeps the layout and drops the travel. The list sits in
    // its final position from the start, which is what the section reads as
    // once the sequence has played anyway.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const vh = () => window.innerHeight;

    const timeline = gsap.timeline({
      defaults: { ease: "none" },
      scrollTrigger: {
        trigger: section,
        start: "top top",
        end: "bottom bottom",
        scrub: true,
        // Every value below is a function of viewport height, so a resize has
        // to re-run them rather than keep the widths it measured on load.
        invalidateOnRefresh: true,
      },
    });

    timeline.to(parts.intro, { y: () => -INTRO_TRAVEL * vh(), duration: 0.45 }, 0);

    // Each line slides back by its own indent, so the two lines converge on the
    // left edge as the block leaves rather than travelling as one rigid slab.
    parts.lines.forEach((line) => {
      const indent = parseFloat(getComputedStyle(line).marginLeft) || 0;
      if (!indent) return;
      timeline.to(line, { x: () => -indent, duration: 0.45 }, 0);
    });

    if (parts.bg) {
      timeline.to(
        parts.bg,
        { scale: BG_SCALE, y: () => -BG_TRAVEL * vh(), duration: 1 },
        0
      );
    }

    if (parts.path) {
      timeline.to(parts.path, { y: () => -PATH_TRAVEL * vh(), duration: 1 }, 0);
    }

    if (parts.warp) {
      timeline.to(parts.warp, { autoAlpha: 0, duration: 0.3 }, 0);
    }

    timeline.fromTo(
      parts.list,
      { y: () => LIST_TRAVEL * vh() },
      { y: 0, duration: 0.65 },
      0.35
    );

    // The hidden state is written once, up front, and the tween is told not to
    // render on creation. A staggered tween's immediateRender only reaches the
    // first target, so leaving it on means six of the seven rows sit fully
    // visible over the heading at progress 0 — and the one that does hold
    // never gets written back at the end. gsap.set covers all of them.
    //
    // Stating both ends rather than using .from() also survives
    // invalidateOnRefresh: a resize re-reads a .to()'s start values from
    // wherever the row happens to be at that moment, which mid-scroll is not
    // the resting state.
    //
    // The last row lands before the scrub does: 0.35 + 0.3 + six steps of 0.05
    // is 0.95, just inside the section rather than cut off at its bottom edge.
    if (parts.rows.length) {
      gsap.set(parts.rows, { autoAlpha: 0, y: ROW_RISE });

      timeline.fromTo(
        parts.rows,
        { autoAlpha: 0, y: ROW_RISE },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.3,
          stagger: 0.05,
          ease: "power2.out",
          immediateRender: false,
        },
        0.35
      );
    }

    section._progOverviewTimeline = timeline;
  });
}

function teardown(section) {
  const previous = section._progOverviewTimeline;
  if (!previous) return;

  previous.scrollTrigger?.kill();
  previous.kill();
  section._progOverviewTimeline = null;

  const targets = section.querySelectorAll(
    "[data-prog-overview-intro], [data-prog-overview-line], " +
      "[data-prog-overview-bg], [data-prog-overview-path], " +
      "[data-prog-overview-warp], [data-prog-overview-list], " +
      "[data-prog-overview-row]"
  );
  gsap.set(targets, { clearProps: "opacity,visibility,transform" });
}
