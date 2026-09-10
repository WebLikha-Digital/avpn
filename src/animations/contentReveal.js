import { gsap, ScrollTrigger } from "../lib/gsap.js";

const DURATION = 0.8;
const EASE = "power4.inOut";
const DEFAULT_STAGGER = 100;
const DEFAULT_DISTANCE = "2em";
const DEFAULT_START = "top 80%";

/**
 * Elements Reveal on Scroll — the Osmo Supply staggered content reveal,
 * ported onto this repo's shared GSAP and ScrollTrigger instance.
 *
 * A group's direct element children fade and rise into place in DOM order. A
 * nested group can replace one direct child's main-sequence tween with its own
 * child sequence, starting at that direct child's slot. All reveals play once.
 *
 * gsap.from() keeps the authored state visible when JavaScript is unavailable.
 * Reduced motion likewise leaves that resting state untouched.
 *
 * Webflow contract:
 *   [data-reveal-group]          the group; direct element children reveal
 *   [data-reveal-group-nested]   nested sequence inside a direct child (or on
 *                                that child); its own children reveal
 *   [data-stagger]               milliseconds between items (default 100),
 *                                configured independently per group
 *   [data-distance]              starting y offset (default 2em), configurable
 *                                on a group, item, or nested group
 *   [data-start]                 ScrollTrigger start (default "top 80%")
 *   [data-ignore="true"]         exclude a direct or nested child
 *   [data-ignore="false"]        on a nested group or its direct-child parent,
 *                                include that parent in the main sequence
 *
 * When a group has no element children, the group itself is the reveal target.
 * A nested parent included in the main sequence uses the outer group's
 * distance, as does a direct child that is itself the nested group.
 */
export function initContentReveal() {
  document.querySelectorAll("[data-reveal-group]").forEach((group) => {
    // Idempotent re-init: revert both the old trigger and every inline start
    // state before measuring and building the replacement sequence.
    teardown(group);

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const groupDistance = readDistance(group, DEFAULT_DISTANCE);
    const groupStagger = readStagger(group);
    const items = group.children.length ? [...group.children] : [group];
    const sequence = items.filter((item) => item.getAttribute("data-ignore") !== "true");
    const timeline = gsap.timeline({ paused: true });

    sequence.forEach((item, index) => {
      const position = index * groupStagger;
      const nested = resolveNestedGroup(item);

      if (!nested) {
        addReveal(timeline, item, readDistance(item, groupDistance), position);
        return;
      }

      const includeParent =
        item.getAttribute("data-ignore") === "false" ||
        nested.getAttribute("data-ignore") === "false";

      if (includeParent) {
        addReveal(timeline, item, groupDistance, position);
      }

      const nestedDistance = readDistance(nested, groupDistance);
      const nestedStagger = readStagger(nested);
      [...nested.children]
        .filter((child) => child.getAttribute("data-ignore") !== "true")
        .forEach((child, nestedIndex) => {
          addReveal(
            timeline,
            child,
            readDistance(child, nestedDistance),
            position + nestedIndex * nestedStagger,
          );
        });
    });

    if (!timeline.getChildren().length) {
      timeline.kill();
      return;
    }

    const trigger = ScrollTrigger.create({
      trigger: group,
      start: group.getAttribute("data-start") || DEFAULT_START,
      once: true,
      animation: timeline,
    });

    group._contentRevealInstance = { timeline, trigger };
  });
}

function addReveal(timeline, target, distance, position) {
  timeline.from(
    target,
    {
      y: distance,
      autoAlpha: 0,
      duration: DURATION,
      ease: EASE,
      clearProps: "all",
    },
    position,
  );
}

function resolveNestedGroup(item) {
  if (item.matches("[data-reveal-group-nested]")) return item;
  return item.querySelector("[data-reveal-group-nested]");
}

function readStagger(element) {
  const value = Number.parseFloat(element.getAttribute("data-stagger"));
  const milliseconds = Number.isFinite(value) ? Math.max(0, value) : DEFAULT_STAGGER;
  return milliseconds / 1000;
}

function readDistance(element, fallback) {
  return element.getAttribute("data-distance") || fallback;
}

function teardown(group) {
  const previous = group._contentRevealInstance;
  if (!previous) return;

  previous.trigger.kill();
  previous.timeline.revert();
  group._contentRevealInstance = null;
}
