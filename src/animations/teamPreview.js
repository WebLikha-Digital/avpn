import { gsap } from "../lib/gsap.js";

const OFFSET = 100;
const DURATION = 0.5;
const EASE = "power2.inOut";
const FOLLOW_DURATION = 0.5;
const FOLLOW_EASE = "power3";

/**
 * Shared row preview for each team list. The preview is anchored in the list's
 * middle slot; only its vertical position is animated by JS.
 */
export function initTeamPreview() {
  const hoverable = window.matchMedia("(hover: hover) and (pointer: fine)");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  document.querySelectorAll("[data-team-list]").forEach((list) => {
    list._teamPreviewInstance?.destroy();

    const rows = [...list.querySelectorAll("[data-team-row]")];
    const preview = list.querySelector("[data-team-preview]");
    const inner = list.querySelector("[data-team-preview-inner]");
    if (!hoverable.matches || !rows.length || !preview || !inner) return;

    const duration = reducedMotion.matches ? 0 : FOLLOW_DURATION;
    const swapDuration = reducedMotion.matches ? 0 : DURATION;
    const yTo = gsap.quickTo(preview, "y", { duration, ease: FOLLOW_EASE });
    let previousIndex = null;
    let firstEntry = true;
    let leaving = false;

    const removeVisuals = () => {
      inner.querySelectorAll("img").forEach((visual) => {
        gsap.killTweensOf(visual);
        visual.remove();
      });
    };

    const clearVisuals = (forward) => {
      inner.querySelectorAll("img").forEach((visual) => {
        gsap.killTweensOf(visual);
        gsap.to(visual, {
          yPercent: forward ? -OFFSET : OFFSET,
          duration: swapDuration,
          ease: EASE,
          overwrite: "auto",
          onComplete: () => visual.remove(),
        });
      });
    };

    const onEnter = (event) => {
      if (leaving) {
        gsap.killTweensOf(preview);
        removeVisuals();
        previousIndex = null;
        firstEntry = true;
        leaving = false;
      }

      const row = event.currentTarget;
      const index = rows.indexOf(row);
      const targetY = row.offsetTop + row.offsetHeight - preview.offsetHeight + 1;
      const forward = previousIndex === null || index > previousIndex;
      previousIndex = index;

      if (firstEntry) gsap.set(preview, { y: targetY });
      else yTo(targetY);
      gsap.to(preview, { autoAlpha: 1, duration: reducedMotion.matches ? 0 : 0.3, overwrite: "auto" });

      clearVisuals(forward);
      const visual = row.querySelector("img");
      if (!visual) return;

      const clone = visual.cloneNode(true);
      inner.appendChild(clone);
      if (firstEntry) {
        firstEntry = false;
        return;
      }

      gsap.fromTo(
        clone,
        { yPercent: forward ? OFFSET : -OFFSET },
        { yPercent: 0, duration: swapDuration, ease: EASE, overwrite: "auto" },
      );
    };

    const onListLeave = () => {
      leaving = true;
      gsap.to(preview, {
        autoAlpha: 0,
        duration: reducedMotion.matches ? 0 : 0.3,
        overwrite: "auto",
        onComplete: () => {
          removeVisuals();
          previousIndex = null;
          firstEntry = true;
          leaving = false;
        },
      });
    };

    rows.forEach((row) => row.addEventListener("mouseenter", onEnter));
    list.addEventListener("mouseleave", onListLeave);
    list._teamPreviewInstance = {
      destroy() {
        rows.forEach((row) => row.removeEventListener("mouseenter", onEnter));
        list.removeEventListener("mouseleave", onListLeave);
        gsap.killTweensOf(preview);
        inner.querySelectorAll("img").forEach((visual) => {
          gsap.killTweensOf(visual);
          visual.remove();
        });
        gsap.set(preview, { clearProps: "transform,opacity,visibility" });
        list._teamPreviewInstance = null;
      },
    };
  });
}
