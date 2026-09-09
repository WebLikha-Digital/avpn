import { gsap } from "../lib/gsap.js";

// Osmo's numbers, unchanged: the visual travels a full height in or out, so the
// swap reads as one image pushing the last one out of a window rather than two
// images crossfading.
const OFFSET = 100;
const DURATION = 0.5;
const EASE = "power2.inOut";

// How closely the follower chases the pointer. Longer than the swap, so the
// image is still settling as you arrive at the next row.
const FOLLOW_DURATION = 0.6;
const FOLLOW_EASE = "power3";

/**
 * Image preview that follows the cursor over a list — the Osmo Supply resource
 * "Image Preview Cursor Follower", wired into this repo's build.
 *
 * Hovering a row clones that row's visual into a fixed element tracking the
 * pointer. Moving down the list pushes the outgoing image up and brings the new
 * one in from below; moving up reverses it, so the direction of travel matches
 * the direction you are reading.
 *
 * Separate from listHoverReveal on purpose. That component owns the row itself
 * — the bar wiping open, the label going white, the other rows dropping back —
 * and this one owns the floating image. They key off different attributes and
 * neither reads the other's state, so a list can have the highlight without the
 * follower, or the reverse.
 *
 * Osmo contract, kept verbatim from the resource:
 *   [data-follower-wrap]         holds one collection and one cursor
 *     [data-follower-collection] the rows' parent; leaving it clears the image
 *       [data-follower-item]     one row
 *         [data-follower-visual] the artwork cloned into the cursor
 *     [data-follower-cursor]     the element that tracks the pointer
 *       [data-follower-cursor-inner]  clones are appended here
 *
 * Required CSS — the resource's, condensed to what the behaviour depends on:
 *
 *   [data-follower-cursor]  { position: fixed; inset: 0 auto auto 0;
 *                             pointer-events: none; overflow: hidden; }
 *   [data-follower-item] [data-follower-visual]     { display: none; }
 *   [data-follower-cursor] [data-follower-visual]   { display: block;
 *                                                     width: 100%; height: 100%; }
 *
 * The visual is hidden in the row and only shown inside the cursor: the row
 * copy is the source the clone is taken from, never something the reader sees.
 *
 * Changes from the resource as published, all to fit this repo:
 *
 *   - GSAP comes from `src/lib/gsap.js` (npm) instead of a CDN script tag.
 *   - Exported and called from `src/index.js` instead of self-invoking on
 *     DOMContentLoaded, matching every other component here.
 *   - Idempotent: listeners and clones are stashed on the wrap and torn down
 *     before a re-init, so calling it twice replaces its work rather than
 *     stacking a second set on the same rows.
 *   - Pointer and reduced-motion guards in JS rather than a CSS media query,
 *     because the listeners themselves should not exist on a touch device.
 *
 * The animation, the offsets and the clone-per-enter approach are unchanged.
 */
export function initListPreviewFollower() {
  const hoverable = window.matchMedia("(hover: hover) and (pointer: fine)");
  const still = window.matchMedia("(prefers-reduced-motion: reduce)");

  document.querySelectorAll("[data-follower-wrap]").forEach((wrap) => {
    // Idempotent re-init: drop the previous listeners and any clone left in the
    // cursor before wiring a new set.
    teardown(wrap);

    // An image chasing the pointer has no meaning without a pointer, and under
    // reduced motion it is the one element on the page that never stops moving.
    if (!hoverable.matches || still.matches) return;

    const collection = wrap.querySelector("[data-follower-collection]");
    const cursor = wrap.querySelector("[data-follower-cursor]");
    const inner = wrap.querySelector("[data-follower-cursor-inner]");
    const items = [...wrap.querySelectorAll("[data-follower-item]")];

    if (!collection || !cursor || !inner || !items.length) return;

    gsap.set(cursor, { xPercent: -50, yPercent: -50 });

    const xTo = gsap.quickTo(cursor, "x", {
      duration: FOLLOW_DURATION,
      ease: FOLLOW_EASE,
    });
    const yTo = gsap.quickTo(cursor, "y", {
      duration: FOLLOW_DURATION,
      ease: FOLLOW_EASE,
    });

    const onMouseMove = (event) => {
      xTo(event.clientX);
      yTo(event.clientY);
    };

    let previousIndex = null;
    let firstEntry = true;

    // Whatever is in the cursor right now leaves in the direction of travel.
    const clearVisuals = (forward) => {
      cursor.querySelectorAll("[data-follower-visual]").forEach((visual) => {
        gsap.killTweensOf(visual);
        gsap.to(visual, {
          yPercent: forward ? -OFFSET : OFFSET,
          duration: DURATION,
          ease: EASE,
          overwrite: "auto",
          onComplete: () => visual.remove(),
        });
      });
    };

    const onEnter = (event) => {
      const item = event.currentTarget;
      const index = items.indexOf(item);
      const forward = previousIndex === null || index > previousIndex;
      previousIndex = index;

      clearVisuals(forward);

      const visual = item.querySelector("[data-follower-visual]");
      if (!visual) return;

      const clone = visual.cloneNode(true);
      inner.appendChild(clone);

      // The first image of a pass has nothing to push out, so it appears where
      // it lands instead of sliding in from off-screen.
      if (firstEntry) {
        firstEntry = false;
        return;
      }

      gsap.fromTo(
        clone,
        { yPercent: forward ? OFFSET : -OFFSET },
        { yPercent: 0, duration: DURATION, ease: EASE, overwrite: "auto" }
      );
    };

    const onItemLeave = () => clearVisuals(true);

    const onCollectionLeave = () => {
      clearVisuals(true);
      previousIndex = null;
      firstEntry = true;
    };

    window.addEventListener("mousemove", onMouseMove);
    items.forEach((item) => item.addEventListener("mouseenter", onEnter));
    items.forEach((item) => item.addEventListener("mouseleave", onItemLeave));
    collection.addEventListener("mouseleave", onCollectionLeave);

    wrap._previewFollower = {
      onMouseMove,
      onEnter,
      onItemLeave,
      onCollectionLeave,
      collection,
      cursor,
      items,
    };
  });
}

function teardown(wrap) {
  const previous = wrap._previewFollower;
  if (!previous) return;

  window.removeEventListener("mousemove", previous.onMouseMove);
  previous.items.forEach((item) => {
    item.removeEventListener("mouseenter", previous.onEnter);
    item.removeEventListener("mouseleave", previous.onItemLeave);
  });
  previous.collection.removeEventListener("mouseleave", previous.onCollectionLeave);

  // Clones are this component's own DOM, so a re-init has to take them with it.
  previous.cursor.querySelectorAll("[data-follower-visual]").forEach((visual) => {
    gsap.killTweensOf(visual);
    visual.remove();
  });
  gsap.set(previous.cursor, { clearProps: "transform" });

  wrap._previewFollower = null;
}
